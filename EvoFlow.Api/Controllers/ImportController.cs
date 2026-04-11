using Dapper;
using EvoFlow.Api.Data;
using Microsoft.AspNetCore.Mvc;
using System.Diagnostics;

namespace EvoFlow.Api.Controllers;

[ApiController]
[Route("api/import")]
public class ImportController(IDapperConnectionFactory connectionFactory, ILogger<ImportController> logger) : ControllerBase
{
    private static readonly string ScriptPath = Path.GetFullPath(
        Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "import_xml.py"));

    private const string PopulateSql = @"
        TRUNCATE TABLE DomsInfoSnapshot;

        INSERT INTO DomsInfoSnapshot
            (DomsDate, SiteId, [Name], Device, DeviceStatus, DeviceOfflineCount,
             DeviceErrorType, DeviceErrorText, DeviceErrorDate, DeviceLifetimeVolume,
             GradeOption, GradeId, GradeDescription, Transactions, PeakFlow, Uptime,
             NumberZeroTransactions, TankId, CreatedUtc)
        SELECT
            pm.BusinessDate,
            s.SiteId,
            s.SiteName,
            pd.DeviceId,
            CASE WHEN pd.Online = 1 THEN 'Online' ELSE 'Offline' END,
            pd.OfflineCount,
            ps.SubStateBits,
            ps.State,
            ps.SnapshotUtc,
            pt.VolumeTotal,
            pmg.GradeOption,
            pgt.GradeId,
            ft.Name,
            pmg.TotalPumpTrans,
            pfi.PeakFlowRate,
            pmg.UptimeMinutes,
            pmg.ZeroTrans,
            STRING_AGG(ptc.TankId, ', ') WITHIN GROUP (ORDER BY ptc.TankId),
            GETUTCDATE()
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
            pfi.PeakFlowRate, pmg.UptimeMinutes, pmg.ZeroTrans;

        SELECT COUNT(*) FROM DomsInfoSnapshot;";

    /// <summary>
    /// Runs the XML import script then repopulates DomsInfoSnapshot.
    /// </summary>
    [HttpPost("doms-files")]
    public async Task<IActionResult> ImportDomsFiles()
    {
        var started = DateTime.UtcNow;

        // Step 1: run Python import script
        logger.LogInformation("Starting DOMS XML import. Script: {Path}", ScriptPath);

        if (!System.IO.File.Exists(ScriptPath))
            return StatusCode(500, new { error = $"Import script not found at: {ScriptPath}" });

        var (exitCode, stdout, stderr) = await RunProcess("python", ScriptPath, TimeSpan.FromMinutes(10));

        if (exitCode != 0)
        {
            logger.LogError("Import script failed (exit {Code}): {Err}", exitCode, stderr);
            return StatusCode(500, new { error = "Import script failed", detail = stderr.Trim() });
        }

        logger.LogInformation("Import script complete. Output: {Out}", stdout.TrimEnd());

        // Step 2: repopulate DomsInfoSnapshot
        using var conn = connectionFactory.CreateConnection();
        var snapshotRows = await conn.ExecuteScalarAsync<int>(PopulateSql, commandTimeout: 300);

        var elapsed = (DateTime.UtcNow - started).TotalSeconds;

        return Ok(new
        {
            message = "Import complete",
            snapshotRowsInserted = snapshotRows,
            elapsedSeconds = Math.Round(elapsed, 1),
            scriptOutput = stdout.TrimEnd()
        });
    }

    private static async Task<(int exitCode, string stdout, string stderr)> RunProcess(
        string executable, string arguments, TimeSpan timeout)
    {
        var psi = new ProcessStartInfo(executable, arguments)
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };

        using var proc = Process.Start(psi) ?? throw new InvalidOperationException("Failed to start process");

        var stdoutTask = proc.StandardOutput.ReadToEndAsync();
        var stderrTask = proc.StandardError.ReadToEndAsync();

        var completed = await Task.WhenAny(
            proc.WaitForExitAsync(),
            Task.Delay(timeout));

        if (!proc.HasExited)
        {
            proc.Kill(entireProcessTree: true);
            return (-1, "", "Process timed out");
        }

        return (proc.ExitCode, await stdoutTask, await stderrTask);
    }
}
