using Dapper;
using EvoFlow.Api.Data;
using Microsoft.AspNetCore.Mvc;

namespace EvoFlow.Api.Controllers;

public class DomsInfoRow
{
    public DateOnly DomsDate { get; set; }
    public string SiteId { get; set; } = "";
    public string Name { get; set; } = "";
    public string Device { get; set; } = "";
    public string DeviceStatus { get; set; } = "";
    public int DeviceOfflineCount { get; set; }
    public string? DeviceErrorType { get; set; }
    public string? DeviceErrorText { get; set; }
    public DateTime? DeviceErrorDate { get; set; }
    public decimal? DeviceLifetimeVolume { get; set; }
    public int GradeOption { get; set; }
    public string? GradeId { get; set; }
    public string? GradeDescription { get; set; }
    public int Transactions { get; set; }
    public decimal? PeakFlow { get; set; }
    public int Uptime { get; set; }
    public int NumberZeroTransactions { get; set; }
    public string? TankId { get; set; }
}

[ApiController]
[Route("api/[controller]")]
public class DomsInfoController(IDapperConnectionFactory connectionFactory) : ControllerBase
{
    private const string Sql = @"
        SELECT TOP 10000
            pm.BusinessDate                                                         AS DomsDate,
            s.SiteId,
            s.SiteName                                                              AS [Name],
            pd.DeviceId                                                             AS Device,
            CASE WHEN pd.Online = 1 THEN 'Online' ELSE 'Offline' END               AS DeviceStatus,
            pd.OfflineCount                                                         AS DeviceOfflineCount,
            ps.SubStateBits                                                         AS DeviceErrorType,
            ps.State                                                                AS DeviceErrorText,
            ps.SnapshotUtc                                                          AS DeviceErrorDate,
            pt.VolumeTotal                                                          AS DeviceLifetimeVolume,
            pmg.GradeOption,
            pgt.GradeId,
            ft.Name                                                                 AS GradeDescription,
            pmg.TotalPumpTrans                                                      AS Transactions,
            pfi.PeakFlowRate                                                        AS PeakFlow,
            pmg.UptimeMinutes                                                       AS Uptime,
            pmg.ZeroTrans                                                           AS NumberZeroTransactions,
            STRING_AGG(ptc.TankId, ', ') WITHIN GROUP (ORDER BY ptc.TankId)        AS TankId
        FROM PumpMonitoring pm
        JOIN PumpMonitoringGrade pmg ON pmg.PumpMonitoringId = pm.PumpMonitoringId
        JOIN PumpDevices pd ON pd.PumpDeviceId = pm.PumpDeviceId
        JOIN Sites s ON s.SiteId = pd.SiteId
        LEFT JOIN PumpFlowInfo pfi
            ON pfi.PumpMonitoringGradeId = pmg.PumpMonitoringGradeId
           AND pfi.FlowType = 'high_speed'
        LEFT JOIN PumpStatus ps
            ON ps.PumpDeviceId = pm.PumpDeviceId
           AND ps.BusinessDate = pm.BusinessDate
        LEFT JOIN PumpTotals pt
            ON pt.PumpDeviceId = pm.PumpDeviceId
           AND pt.BusinessDate = pm.BusinessDate
           AND pt.TotType = 'pump'
        LEFT JOIN PumpGradeTotals pgt
            ON pgt.PumpTotalsId = pt.PumpTotalsId
           AND pgt.GradeOption = pmg.GradeOption
        LEFT JOIN PumpTankConsumption ptc
            ON ptc.PumpGradeTotalsId = pgt.PumpGradeTotalsId
        LEFT JOIN FuelTypes ft ON ft.FuelTypeId = pgt.GradeId
        WHERE (@SiteId IS NULL OR s.SiteId = @SiteId)
          AND (@DateFrom IS NULL OR pm.BusinessDate >= @DateFrom)
          AND (@DateTo   IS NULL OR pm.BusinessDate <= @DateTo)
        GROUP BY
            pm.BusinessDate, s.SiteId, s.SiteName, pd.DeviceId, pd.Online, pd.OfflineCount,
            ps.SubStateBits, ps.State, ps.SnapshotUtc, pt.VolumeTotal,
            pmg.GradeOption, pgt.GradeId, ft.Name, pmg.TotalPumpTrans,
            pfi.PeakFlowRate, pmg.UptimeMinutes, pmg.ZeroTrans
        ORDER BY pm.BusinessDate DESC, s.SiteId, pd.DeviceId, pmg.GradeOption";

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? siteId = null,
        [FromQuery] DateOnly? dateFrom = null,
        [FromQuery] DateOnly? dateTo = null)
    {
        using var conn = connectionFactory.CreateConnection();
        var cmd = new CommandDefinition(Sql, new { SiteId = siteId, DateFrom = dateFrom, DateTo = dateTo }, commandTimeout: 300);
        var rows = await conn.QueryAsync<DomsInfoRow>(cmd);
        return Ok(rows);
    }
}
