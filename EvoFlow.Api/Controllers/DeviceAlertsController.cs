using Dapper;
using EvoFlow.Api.Data;
using Microsoft.AspNetCore.Mvc;

namespace EvoFlow.Api.Controllers;

public class DeviceAlertRow
{
    public DateOnly BusinessDate { get; set; }
    public string SiteId { get; set; } = "";
    public string SiteName { get; set; } = "";
    public string DeviceId { get; set; } = "";
    public bool Online { get; set; }
    public int OfflineCount { get; set; }
    public DateTime SnapshotUtc { get; set; }
    public string State { get; set; } = "";
    public string? SubStateBits { get; set; }
    public string? SubState2Bits { get; set; }
}

[ApiController]
[Route("api/devicealerts")]
public class DeviceAlertsController(IDapperConnectionFactory connectionFactory) : ControllerBase
{
    private const string Sql = @"
        SELECT
            ps.BusinessDate,
            s.SiteId,
            s.SiteName,
            pd.DeviceId,
            pd.Online,
            pd.OfflineCount,
            ps.SnapshotUtc,
            ps.State,
            ps.SubStateBits,
            ps.SubState2Bits
        FROM PumpStatus ps
        JOIN PumpDevices pd ON pd.PumpDeviceId = ps.PumpDeviceId
        JOIN Sites s        ON s.SiteId        = pd.SiteId
        WHERE (@SiteId   IS NULL OR s.SiteId        = @SiteId)
          AND (@DateFrom IS NULL OR ps.BusinessDate >= @DateFrom)
          AND (@DateTo   IS NULL OR ps.BusinessDate <= @DateTo)
        ORDER BY ps.BusinessDate DESC, s.SiteId, pd.DeviceId";

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? siteId = null,
        [FromQuery] DateOnly? dateFrom = null,
        [FromQuery] DateOnly? dateTo = null)
    {
        using var conn = connectionFactory.CreateConnection();
        var rows = await conn.QueryAsync<DeviceAlertRow>(
            new CommandDefinition(Sql, new { SiteId = siteId, DateFrom = dateFrom, DateTo = dateTo }, commandTimeout: 120));
        return Ok(rows);
    }
}
