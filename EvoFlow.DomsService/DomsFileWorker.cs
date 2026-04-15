using log4net;
using Microsoft.Extensions.Options;
using System.Net.Http.Json;

namespace EvoFlow.DomsService;

public class DomsFileWorker(IOptions<DomsServiceSettings> options, IHttpClientFactory httpClientFactory) : BackgroundService
{
    private static readonly ILog Log = LogManager.GetLogger(typeof(DomsFileWorker));

    private readonly DomsServiceSettings _settings = options.Value;
    private FileSystemWatcher? _watcher;

    // Queue to serialize processing (watcher events can fire concurrently)
    private readonly SemaphoreSlim _semaphore = new(1, 1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        EnsureFolders();

        Log.Info($"DOMS File Worker starting. Watching: {_settings.WatchFolder}");

        // Process any XML files already in the folder on startup
        await ProcessExistingFilesAsync(stoppingToken);

        _watcher = new FileSystemWatcher(_settings.WatchFolder, "*.xml")
        {
            NotifyFilter = NotifyFilters.FileName | NotifyFilters.CreationTime,
            IncludeSubdirectories = false,
            EnableRaisingEvents = true
        };

        _watcher.Created += async (_, e) => await OnFileDetectedAsync(e.FullPath, stoppingToken);

        Log.Info("FileSystemWatcher active. Waiting for XML files...");

        await Task.Delay(Timeout.Infinite, stoppingToken);

        Log.Info("DOMS File Worker stopping.");
    }

    private async Task ProcessExistingFilesAsync(CancellationToken ct)
    {
        var files = Directory.GetFiles(_settings.WatchFolder, "*.xml");
        if (files.Length > 0)
            Log.Info($"Found {files.Length} existing XML file(s) on startup. Processing...");

        foreach (var file in files)
            await OnFileDetectedAsync(file, ct);
    }

    private async Task OnFileDetectedAsync(string fullPath, CancellationToken ct)
    {
        await _semaphore.WaitAsync(ct);
        try
        {
            if (!File.Exists(fullPath))
                return;

            var fileName = Path.GetFileName(fullPath);
            Log.Info($"Detected file: {fileName}");

            // Small delay to allow the file write to complete
            await Task.Delay(500, ct);

            var success = await TryUploadWithRetryAsync(fullPath, fileName, ct);

            if (success)
            {
                var dest = Path.Combine(_settings.SuccessFolder, fileName);
                dest = GetUniqueDestPath(dest);
                File.Move(fullPath, dest);
                Log.Info($"Archived to Success: {dest}");
            }
            else
            {
                var dest = Path.Combine(_settings.FailureFolder, fileName);
                dest = GetUniqueDestPath(dest);
                File.Copy(fullPath, dest, overwrite: true);
                File.Delete(fullPath);
                Log.Warn($"Moved to Failure: {dest}");
            }
        }
        catch (Exception ex)
        {
            Log.Error($"Unexpected error handling file {fullPath}: {ex.Message}", ex);
        }
        finally
        {
            _semaphore.Release();
        }
    }

    private async Task<bool> TryUploadWithRetryAsync(string fullPath, string fileName, CancellationToken ct)
    {
        // Total attempts = 1 initial + RetryCount retries
        var totalAttempts = 1 + _settings.RetryCount;
        string? lastError = null;

        for (int attempt = 1; attempt <= totalAttempts; attempt++)
        {
            try
            {
                Log.Info($"Uploading {fileName} (attempt {attempt}/{totalAttempts})...");

                using var http = httpClientFactory.CreateClient("EvoFlowApi");
                using var content = new MultipartFormDataContent();
                await using var stream = File.OpenRead(fullPath);
                content.Add(new StreamContent(stream), "file", fileName);

                var response = await http.PostAsync("api/import/doms-xml-upload", content, ct);

                if (response.IsSuccessStatusCode)
                {
                    Log.Info($"Upload successful: {fileName}");
                    return true;
                }

                var body = await response.Content.ReadAsStringAsync(ct);
                lastError = $"HTTP {(int)response.StatusCode}: {body}";
                Log.Warn($"Upload failed for {fileName}: {lastError}");
            }
            catch (Exception ex)
            {
                lastError = ex.Message;
                Log.Warn($"Upload error for {fileName} (attempt {attempt}): {ex.Message}");
            }

            if (attempt < totalAttempts)
            {
                Log.Info($"Waiting {_settings.RetryDelaySeconds}s before retry...");
                await Task.Delay(TimeSpan.FromSeconds(_settings.RetryDelaySeconds), ct);
            }
        }

        // All retries exhausted — notify the API
        await RecordFailureAsync(fileName, lastError ?? "Unknown error");
        return false;
    }

    private async Task RecordFailureAsync(string fileName, string message)
    {
        try
        {
            using var http = httpClientFactory.CreateClient("EvoFlowApi");
            var payload = new { fileName, message };
            var response = await http.PostAsJsonAsync("api/import/failed-upload", payload);
            if (response.IsSuccessStatusCode)
                Log.Info($"Failure recorded in API for {fileName}.");
            else
                Log.Warn($"Could not record failure in API (HTTP {(int)response.StatusCode}).");
        }
        catch (Exception ex)
        {
            Log.Error($"Failed to call failed-upload API: {ex.Message}", ex);
        }
    }

    private void EnsureFolders()
    {
        Directory.CreateDirectory(_settings.WatchFolder);
        Directory.CreateDirectory(_settings.SuccessFolder);
        Directory.CreateDirectory(_settings.FailureFolder);
    }

    private static string GetUniqueDestPath(string dest)
    {
        if (!File.Exists(dest)) return dest;
        var dir = Path.GetDirectoryName(dest)!;
        var nameNoExt = Path.GetFileNameWithoutExtension(dest);
        var ext = Path.GetExtension(dest);
        return Path.Combine(dir, $"{nameNoExt}_{DateTime.UtcNow:yyyyMMddHHmmss}{ext}");
    }

    public override void Dispose()
    {
        _watcher?.Dispose();
        _semaphore.Dispose();
        base.Dispose();
    }
}
