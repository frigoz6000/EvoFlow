using Dapper;
using EvoFlow.Api.Data;
using Microsoft.AspNetCore.Mvc;

namespace EvoFlow.Api.Controllers;

public class FlowRateRow
{
    public DateOnly BusinessDate { get; set; }
    public string SiteId { get; set; } = "";
    public string SiteName { get; set; } = "";
    public string DeviceId { get; set; } = "";
    public int GradeOption { get; set; }
    public string? GradeId { get; set; }
    public string? GradeDescription { get; set; }
    public string FlowType { get; set; } = "";
    public int TotalPumpTrans { get; set; }
    public decimal NominalFlowRate { get; set; }
    public decimal? AvgFlowRate { get; set; }
    public decimal? PeakFlowRate { get; set; }
    public int? AvgTimeToFlow { get; set; }
    public int? MaxTimeToFlow { get; set; }
    public int? AvgTimeToPeakFlow { get; set; }
    public int? MaxTimeToPeakFlow { get; set; }
}

[ApiController]
[Route("api/flowrates")]
public class FlowRatesController(IDapperConnectionFactory connectionFactory) : ControllerBase
{
    private const string Sql = @"
        SELECT TOP 10000
            pm.BusinessDate,
            s.SiteId,
            s.SiteName,
            pd.DeviceId,
            pmg.GradeOption,
            pgt.GradeId,
            ft.Name                 AS GradeDescription,
            pfi.FlowType,
            pfi.TotalPumpTrans,
            pfi.NominalFlowRate,
            pfi.AvgFlowRate,
            pfi.PeakFlowRate,
            pfi.AvgTimeToFlow,
            pfi.MaxTimeToFlow,
            pfi.AvgTimeToPeakFlow,
            pfi.MaxTimeToPeakFlow
        FROM PumpFlowInfo pfi
        JOIN PumpMonitoringGrade pmg ON pmg.PumpMonitoringGradeId = pfi.PumpMonitoringGradeId
        JOIN PumpMonitoring pm       ON pm.PumpMonitoringId       = pmg.PumpMonitoringId
        JOIN PumpDevices pd          ON pd.PumpDeviceId           = pm.PumpDeviceId
        JOIN Sites s                 ON s.SiteId                  = pd.SiteId
        LEFT JOIN PumpTotals pt      ON pt.PumpDeviceId = pm.PumpDeviceId
                                    AND pt.BusinessDate = pm.BusinessDate
                                    AND pt.TotType      = 'pump'
        LEFT JOIN PumpGradeTotals pgt ON pgt.PumpTotalsId = pt.PumpTotalsId
                                     AND pgt.GradeOption  = pmg.GradeOption
        LEFT JOIN FuelTypes ft       ON ft.FuelTypeId = pgt.GradeId
        WHERE pfi.FlowType != 'high_speed'
          AND (@SiteId   IS NULL OR s.SiteId      = @SiteId)
          AND (@DateFrom IS NULL OR pm.BusinessDate >= @DateFrom)
          AND (@DateTo   IS NULL OR pm.BusinessDate <= @DateTo)
        ORDER BY pm.BusinessDate DESC, s.SiteId, pd.DeviceId, pmg.GradeOption, pfi.FlowType";

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? siteId = null,
        [FromQuery] DateOnly? dateFrom = null,
        [FromQuery] DateOnly? dateTo = null)
    {
        using var conn = connectionFactory.CreateConnection();
        var rows = await conn.QueryAsync<FlowRateRow>(
            new CommandDefinition(Sql, new { SiteId = siteId, DateFrom = dateFrom, DateTo = dateTo }, commandTimeout: 120));
        return Ok(rows);
    }
}
