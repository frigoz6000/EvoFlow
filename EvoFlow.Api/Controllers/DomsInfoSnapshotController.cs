using Dapper;
using EvoFlow.Api.Data;
using Microsoft.AspNetCore.Mvc;

namespace EvoFlow.Api.Controllers;

[ApiController]
[Route("api/domsinfosnapshot")]
public class DomsInfoSnapshotController(IDapperConnectionFactory connectionFactory) : ControllerBase
{
    private const string SourceSql = @"
        SELECT
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
           AND pfi.FlowType = 'normal_speed'
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
        GROUP BY
            pm.BusinessDate, s.SiteId, s.SiteName, pd.DeviceId, pd.Online, pd.OfflineCount,
            ps.SubStateBits, ps.State, ps.SnapshotUtc, pt.VolumeTotal,
            pmg.GradeOption, pgt.GradeId, ft.Name, pmg.TotalPumpTrans,
            pfi.PeakFlowRate, pmg.UptimeMinutes, pmg.ZeroTrans
        ORDER BY pm.BusinessDate DESC, s.SiteId, pd.DeviceId, pmg.GradeOption";

    private const string InsertSql = @"
        INSERT INTO DomsInfoSnapshot
            (DomsDate, SiteId, [Name], Device, DeviceStatus, DeviceOfflineCount,
             DeviceErrorType, DeviceErrorText, DeviceErrorDate, DeviceLifetimeVolume,
             GradeOption, GradeId, GradeDescription, Transactions, PeakFlow, Uptime,
             NumberZeroTransactions, TankId, CreatedUtc)
        VALUES
            (@DomsDate, @SiteId, @Name, @Device, @DeviceStatus, @DeviceOfflineCount,
             @DeviceErrorType, @DeviceErrorText, @DeviceErrorDate, @DeviceLifetimeVolume,
             @GradeOption, @GradeId, @GradeDescription, @Transactions, @PeakFlow, @Uptime,
             @NumberZeroTransactions, @TankId, @CreatedUtc)";

    private const string ReadSql = @"
        SELECT Id, DomsDate, SiteId, [Name], Device, DeviceStatus, DeviceOfflineCount,
               DeviceErrorType, DeviceErrorText, DeviceErrorDate, DeviceLifetimeVolume,
               GradeOption, GradeId, GradeDescription, Transactions, PeakFlow, Uptime,
               NumberZeroTransactions, TankId, CreatedUtc
        FROM DomsInfoSnapshot
        WHERE (@SiteId   IS NULL OR SiteId   = @SiteId)
          AND (@DateFrom IS NULL OR DomsDate >= @DateFrom)
          AND (@DateTo   IS NULL OR DomsDate <= @DateTo)
        ORDER BY DomsDate DESC, SiteId, Device, GradeOption";

    /// <summary>
    /// Truncates DomsInfoSnapshot and repopulates it from the live source tables.
    /// </summary>
    [HttpPost("populate")]
    public async Task<IActionResult> Populate()
    {
        using var conn = connectionFactory.CreateConnection();

        await conn.ExecuteAsync("TRUNCATE TABLE DomsInfoSnapshot");

        var rows = await conn.QueryAsync<DomsInfoRow>(
            new CommandDefinition(SourceSql, commandTimeout: 300));

        var now = DateTime.UtcNow;
        var list = rows.Select(r => new
        {
            r.DomsDate,
            r.SiteId,
            r.Name,
            r.Device,
            r.DeviceStatus,
            r.DeviceOfflineCount,
            r.DeviceErrorType,
            r.DeviceErrorText,
            r.DeviceErrorDate,
            r.DeviceLifetimeVolume,
            r.GradeOption,
            r.GradeId,
            r.GradeDescription,
            r.Transactions,
            r.PeakFlow,
            r.Uptime,
            r.NumberZeroTransactions,
            r.TankId,
            CreatedUtc = now
        }).ToList();

        await conn.ExecuteAsync(InsertSql, list, commandTimeout: 300);

        return Ok(new { rowsInserted = list.Count, populatedAt = now });
    }

    /// <summary>
    /// Reads from the DomsInfoSnapshot table with optional filters.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? siteId = null,
        [FromQuery] DateOnly? dateFrom = null,
        [FromQuery] DateOnly? dateTo = null)
    {
        using var conn = connectionFactory.CreateConnection();
        var rows = await conn.QueryAsync<DomsInfoSnapshotRow>(
            new CommandDefinition(ReadSql, new { SiteId = siteId, DateFrom = dateFrom, DateTo = dateTo }, commandTimeout: 60));
        return Ok(rows);
    }
}

public class DomsInfoSnapshotRow : DomsInfoRow
{
    public int Id { get; set; }
    public DateTime CreatedUtc { get; set; }
}
