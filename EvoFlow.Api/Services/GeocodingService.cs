using System.Text.Json;
using Dapper;
using EvoFlow.Api.Data;

namespace EvoFlow.Api.Services;

public class GeocodingProgress
{
    public bool IsRunning { get; set; }
    public int Total { get; set; }
    public int Done { get; set; }
    public int Failed { get; set; }
    public string? CurrentPostcode { get; set; }
    public DateTime? StartedAt { get; set; }
    public DateTime? FinishedAt { get; set; }
}

public class GeocodingService(IServiceScopeFactory scopeFactory, ILogger<GeocodingService> logger)
{
    private static readonly GeocodingProgress _progress = new();
    private static CancellationTokenSource? _cts;
    private static readonly SemaphoreSlim _lock = new(1, 1);

    private static readonly HttpClient _http = new()
    {
        DefaultRequestHeaders = { { "User-Agent", "EvoFlow/1.0 geocoder" } },
        Timeout = TimeSpan.FromSeconds(10)
    };

    public GeocodingProgress GetProgress() => _progress;

    public async Task<bool> StartAsync()
    {
        if (!await _lock.WaitAsync(0)) return false; // already starting
        try
        {
            if (_progress.IsRunning) return false;
            _cts = new CancellationTokenSource();
            _progress.IsRunning = true;
            _progress.Done = 0;
            _progress.Failed = 0;
            _progress.StartedAt = DateTime.UtcNow;
            _progress.FinishedAt = null;

            _ = Task.Run(() => RunAsync(_cts.Token));
            return true;
        }
        finally
        {
            _lock.Release();
        }
    }

    public void Cancel() => _cts?.Cancel();

    private async Task RunAsync(CancellationToken ct)
    {
        try
        {
            List<(string SiteId, string? PostCode, string? Country)> sites;
            using (var scope = scopeFactory.CreateScope())
            {
                var factory = scope.ServiceProvider.GetRequiredService<IDapperConnectionFactory>();
                using var conn = factory.CreateConnection();
                sites = (await conn.QueryAsync<(string SiteId, string? PostCode, string? Country)>(
                    "SELECT SiteId, PostCode, Country FROM Sites WHERE PostCode IS NOT NULL AND Location IS NULL ORDER BY SiteId")).ToList();
            }

            _progress.Total = sites.Count;
            logger.LogInformation("Geocoding {Count} sites", sites.Count);

            foreach (var (siteId, postcode, country) in sites)
            {
                if (ct.IsCancellationRequested) break;
                if (string.IsNullOrWhiteSpace(postcode)) { _progress.Done++; continue; }

                _progress.CurrentPostcode = postcode;

                var coords = await GeocodeAsync(postcode, country, ct);
                if (coords is not null)
                {
                    using var scope = scopeFactory.CreateScope();
                    var factory = scope.ServiceProvider.GetRequiredService<IDapperConnectionFactory>();
                    using var writeConn = factory.CreateConnection();
                    await writeConn.ExecuteAsync(
                        "UPDATE Sites SET Location = geography::Point(@Lat, @Lng, 4326) WHERE SiteId = @SiteId",
                        new { coords.Value.Lat, coords.Value.Lng, SiteId = siteId });
                    logger.LogDebug("Geocoded {SiteId} ({Postcode}) → {Lat},{Lng}", siteId, postcode, coords.Value.Lat, coords.Value.Lng);
                }
                else
                {
                    _progress.Failed++;
                    logger.LogWarning("Could not geocode {SiteId} ({Postcode})", siteId, postcode);
                }

                _progress.Done++;

                // Respect Nominatim 1 req/sec policy
                await Task.Delay(1100, ct).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException) { /* cancelled */ }
        catch (Exception ex)
        {
            logger.LogError(ex, "Geocoding failed");
        }
        finally
        {
            _progress.IsRunning = false;
            _progress.FinishedAt = DateTime.UtcNow;
            _progress.CurrentPostcode = null;
        }
    }

    private async Task<(double Lat, double Lng)?> GeocodeAsync(string postcode, string? country, CancellationToken ct)
    {
        var cc = (country ?? "UK").Trim().ToUpperInvariant() == "UK" ? "gb" : "gb";
        var encoded = Uri.EscapeDataString(postcode);
        var url = $"https://nominatim.openstreetmap.org/search?q={encoded}&format=json&limit=1&countrycode={cc}";

        try
        {
            var response = await _http.GetStringAsync(url, ct);
            using var doc = JsonDocument.Parse(response);
            var arr = doc.RootElement;
            if (arr.GetArrayLength() > 0)
            {
                var first = arr[0];
                var lat = double.Parse(first.GetProperty("lat").GetString()!);
                var lng = double.Parse(first.GetProperty("lon").GetString()!);
                return (lat, lng);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Nominatim request failed for {Postcode}", postcode);
        }

        return null;
    }
}
