using System.Text.Json;
using Dapper;
using EvoFlow.Api.Data;

namespace EvoFlow.Api.Services;

public class GeocodingProgress
{
    public bool IsRunning { get; set; }
    public int Total { get; set; }
    public int Done { get; set; }
    public int Fixed { get; set; }   // invalid postcodes replaced with valid ones
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
        DefaultRequestHeaders = { { "User-Agent", "EvoFlow/1.0 postcode-validator" } },
        Timeout = TimeSpan.FromSeconds(15)
    };

    private static readonly JsonSerializerOptions _jsonOpts = new() { PropertyNameCaseInsensitive = true };

    public GeocodingProgress GetProgress() => _progress;

    public async Task<bool> StartAsync()
    {
        if (!await _lock.WaitAsync(0)) return false;
        try
        {
            if (_progress.IsRunning) return false;
            _cts = new CancellationTokenSource();
            _progress.IsRunning = true;
            _progress.Done = 0;
            _progress.Fixed = 0;
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
            List<(string SiteId, string? PostCode, string? City, string? County)> sites;
            using (var scope = scopeFactory.CreateScope())
            {
                var factory = scope.ServiceProvider.GetRequiredService<IDapperConnectionFactory>();
                using var conn = factory.CreateConnection();
                sites = (await conn.QueryAsync<(string SiteId, string? PostCode, string? City, string? County)>(
                    "SELECT SiteId, PostCode, City, County FROM Sites WHERE PostCode IS NOT NULL ORDER BY SiteId")).ToList();
            }

            _progress.Total = sites.Count;
            logger.LogInformation("Validating postcodes for {Count} sites via postcodes.io", sites.Count);

            // Process in batches of 100 (postcodes.io bulk limit)
            const int batchSize = 100;
            for (int i = 0; i < sites.Count; i += batchSize)
            {
                if (ct.IsCancellationRequested) break;

                var batch = sites.Skip(i).Take(batchSize).ToList();
                var postcodes = batch.Select(s => s.PostCode!).ToList();

                // Bulk validate
                var results = await BulkLookupAsync(postcodes, ct);

                foreach (var (siteId, postcode, city, county) in batch)
                {
                    if (ct.IsCancellationRequested) break;
                    _progress.CurrentPostcode = postcode;

                    var normalized = NormalizePostcode(postcode!);
                    if (results.TryGetValue(normalized, out var coords))
                    {
                        // Valid postcode — update Location
                        await UpdateSiteAsync(siteId, postcode!, coords.Lat, coords.Lng, ct);
                        logger.LogDebug("Valid: {SiteId} ({Postcode}) → {Lat},{Lng}", siteId, postcode, coords.Lat, coords.Lng);
                    }
                    else
                    {
                        // Invalid postcode — find a real one for this area
                        logger.LogWarning("Invalid postcode {Postcode} for site {SiteId} — finding replacement", postcode, siteId);
                        var replacement = await FindReplacementAsync(postcode!, city, county, ct);
                        if (replacement is not null)
                        {
                            await UpdateSiteAsync(siteId, replacement.Value.PostCode, replacement.Value.Lat, replacement.Value.Lng, ct);
                            _progress.Fixed++;
                            logger.LogInformation("Replaced {OldPostcode} → {NewPostcode} for {SiteId}", postcode, replacement.Value.PostCode, siteId);
                        }
                        else
                        {
                            _progress.Failed++;
                            logger.LogWarning("Could not find replacement for {Postcode} (site {SiteId})", postcode, siteId);
                        }
                    }

                    _progress.Done++;
                }
            }
        }
        catch (OperationCanceledException) { /* cancelled */ }
        catch (Exception ex)
        {
            logger.LogError(ex, "Postcode validation/geocoding failed");
        }
        finally
        {
            _progress.IsRunning = false;
            _progress.FinishedAt = DateTime.UtcNow;
            _progress.CurrentPostcode = null;
        }
    }

    private async Task UpdateSiteAsync(string siteId, string postcode, double lat, double lng, CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var factory = scope.ServiceProvider.GetRequiredService<IDapperConnectionFactory>();
        using var conn = factory.CreateConnection();
        await conn.ExecuteAsync(
            "UPDATE Sites SET PostCode = @PostCode, Location = geography::Point(@Lat, @Lng, 4326) WHERE SiteId = @SiteId",
            new { PostCode = postcode, Lat = lat, Lng = lng, SiteId = siteId });
    }

    /// <summary>Bulk lookup up to 100 postcodes via postcodes.io. Returns map of normalised postcode → (lat, lng).</summary>
    private async Task<Dictionary<string, (double Lat, double Lng)>> BulkLookupAsync(IEnumerable<string> postcodes, CancellationToken ct)
    {
        var result = new Dictionary<string, (double Lat, double Lng)>(StringComparer.OrdinalIgnoreCase);
        try
        {
            var body = JsonSerializer.Serialize(new { postcodes = postcodes.ToArray() });
            var response = await _http.PostAsync(
                "https://api.postcodes.io/postcodes",
                new StringContent(body, System.Text.Encoding.UTF8, "application/json"),
                ct);

            var json = await response.Content.ReadAsStringAsync(ct);
            using var doc = JsonDocument.Parse(json);

            foreach (var item in doc.RootElement.GetProperty("result").EnumerateArray())
            {
                var query = item.GetProperty("query").GetString() ?? "";
                if (item.TryGetProperty("result", out var res) && res.ValueKind == JsonValueKind.Object)
                {
                    var lat = res.GetProperty("latitude").GetDouble();
                    var lng = res.GetProperty("longitude").GetDouble();
                    result[NormalizePostcode(query)] = (lat, lng);
                }
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Bulk postcode lookup failed");
        }

        return result;
    }

    /// <summary>Find a valid replacement postcode by trying the outward code area, then city name.</summary>
    private async Task<(string PostCode, double Lat, double Lng)?> FindReplacementAsync(
        string invalidPostcode, string? city, string? county, CancellationToken ct)
    {
        // Extract area prefix from the invalid outward code (e.g. "CB" from "CB39 3AL")
        var outward = invalidPostcode.Split(' ')[0];
        var area = new string(outward.TakeWhile(char.IsLetter).ToArray());

        // Try autocomplete with area prefix
        var byArea = await AutocompletePostcodeAsync(area, ct);
        if (byArea is not null) return byArea;

        // Fall back: try city name via places API
        if (!string.IsNullOrWhiteSpace(city))
        {
            var byCity = await FindPostcodeByPlaceAsync(city, ct);
            if (byCity is not null) return byCity;
        }

        // Last resort: county
        if (!string.IsNullOrWhiteSpace(county))
        {
            var byCounty = await FindPostcodeByPlaceAsync(county, ct);
            if (byCounty is not null) return byCounty;
        }

        return null;
    }

    private async Task<(string PostCode, double Lat, double Lng)?> AutocompletePostcodeAsync(string prefix, CancellationToken ct)
    {
        try
        {
            var url = $"https://api.postcodes.io/postcodes?q={Uri.EscapeDataString(prefix)}&limit=1";
            var json = await _http.GetStringAsync(url, ct);
            using var doc = JsonDocument.Parse(json);
            var arr = doc.RootElement.GetProperty("result");
            if (arr.ValueKind == JsonValueKind.Array && arr.GetArrayLength() > 0)
            {
                var first = arr[0];
                return (
                    first.GetProperty("postcode").GetString()!,
                    first.GetProperty("latitude").GetDouble(),
                    first.GetProperty("longitude").GetDouble()
                );
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogDebug(ex, "Autocomplete failed for prefix {Prefix}", prefix);
        }

        return null;
    }

    private async Task<(string PostCode, double Lat, double Lng)?> FindPostcodeByPlaceAsync(string placeName, CancellationToken ct)
    {
        try
        {
            // Get centroid of the place
            var placeUrl = $"https://api.postcodes.io/places?q={Uri.EscapeDataString(placeName)}&limit=1";
            var placeJson = await _http.GetStringAsync(placeUrl, ct);
            using var placeDoc = JsonDocument.Parse(placeJson);
            var placeResult = placeDoc.RootElement.GetProperty("result");
            if (placeResult.ValueKind != JsonValueKind.Array || placeResult.GetArrayLength() == 0)
                return null;

            var place = placeResult[0];
            var lat = place.GetProperty("latitude").GetDouble();
            var lng = place.GetProperty("longitude").GetDouble();

            // Find nearest postcode to that point
            var nearUrl = $"https://api.postcodes.io/postcodes?lon={lng}&lat={lat}&limit=1";
            var nearJson = await _http.GetStringAsync(nearUrl, ct);
            using var nearDoc = JsonDocument.Parse(nearJson);
            var nearResult = nearDoc.RootElement.GetProperty("result");
            if (nearResult.ValueKind == JsonValueKind.Array && nearResult.GetArrayLength() > 0)
            {
                var nearest = nearResult[0];
                return (
                    nearest.GetProperty("postcode").GetString()!,
                    nearest.GetProperty("latitude").GetDouble(),
                    nearest.GetProperty("longitude").GetDouble()
                );
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogDebug(ex, "Place lookup failed for {PlaceName}", placeName);
        }

        return null;
    }

    private static string NormalizePostcode(string postcode) =>
        postcode.Replace(" ", "").ToUpperInvariant();
}
