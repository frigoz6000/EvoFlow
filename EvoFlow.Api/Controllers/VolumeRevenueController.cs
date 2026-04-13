using Dapper;
using EvoFlow.Api.Data;
using Microsoft.AspNetCore.Mvc;

namespace EvoFlow.Api.Controllers;

public class VolumeRevenueRow
{
    public DateOnly BusinessDate { get; set; }
    public string SiteId { get; set; } = "";
    public string SiteName { get; set; } = "";
    public string DeviceId { get; set; } = "";
    public string TotType { get; set; } = "";
    public decimal MoneyTotal { get; set; }
    public decimal MoneyDiff { get; set; }
    public decimal VolumeTotal { get; set; }
    public decimal VolumeDiff { get; set; }
}

[ApiController]
[Route("api/volumerevenue")]
public class VolumeRevenueController(IDapperConnectionFactory connectionFactory) : ControllerBase
{
    private const string Sql = @"
        SELECT
            pt.BusinessDate,
            s.SiteId,
            s.SiteName,
            pd.DeviceId,
            pt.TotType,
            pt.MoneyTotal,
            pt.MoneyDiff,
            pt.VolumeTotal,
            pt.VolumeDiff
        FROM PumpTotals pt
        JOIN PumpDevices pd ON pd.PumpDeviceId = pt.PumpDeviceId
        JOIN Sites s        ON s.SiteId        = pd.SiteId
        WHERE (@SiteId   IS NULL OR s.SiteId        = @SiteId)
          AND (@DateFrom IS NULL OR pt.BusinessDate >= @DateFrom)
          AND (@DateTo   IS NULL OR pt.BusinessDate <= @DateTo)
          AND (@TotType  IS NULL OR pt.TotType       = @TotType)
        ORDER BY pt.BusinessDate DESC, s.SiteId, pd.DeviceId, pt.TotType";

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? siteId = null,
        [FromQuery] DateOnly? dateFrom = null,
        [FromQuery] DateOnly? dateTo = null,
        [FromQuery] string? totType = null)
    {
        using var conn = connectionFactory.CreateConnection();
        var rows = await conn.QueryAsync<VolumeRevenueRow>(
            new CommandDefinition(Sql, new { SiteId = siteId, DateFrom = dateFrom, DateTo = dateTo, TotType = totType }, commandTimeout: 120));
        return Ok(rows);
    }
}
