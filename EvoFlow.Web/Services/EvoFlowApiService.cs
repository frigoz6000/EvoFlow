using System.Net.Http.Json;
using EvoFlow.Web.Models;

namespace EvoFlow.Web.Services;

public class EvoFlowApiService
{
    private readonly HttpClient _http;

    public EvoFlowApiService(HttpClient http)
    {
        _http = http;
    }

    public Task<List<Site>?> GetSitesAsync() =>
        _http.GetFromJsonAsync<List<Site>>("api/sites");

    public Task<List<PumpDevice>?> GetPumpDevicesAsync() =>
        _http.GetFromJsonAsync<List<PumpDevice>>("api/pumpdevices");

    public Task<List<FuelType>?> GetFuelTypesAsync() =>
        _http.GetFromJsonAsync<List<FuelType>>("api/fueltypes");

    public Task<List<PumpTotals>?> GetPumpTotalsAsync() =>
        _http.GetFromJsonAsync<List<PumpTotals>>("api/pumptotals");

    public Task<List<PumpStatus>?> GetPumpStatusesAsync() =>
        _http.GetFromJsonAsync<List<PumpStatus>>("api/pumpstatus");

    public Task<List<PumpMonitoring>?> GetPumpMonitoringsAsync() =>
        _http.GetFromJsonAsync<List<PumpMonitoring>>("api/pumpmonitoring");
}
