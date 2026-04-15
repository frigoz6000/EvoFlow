using Dapper;
using EvoFlow.Api.Data;
using Microsoft.AspNetCore.Mvc;
using System.Diagnostics;
using System.Xml.Linq;

namespace EvoFlow.Api.Controllers;

[ApiController]
[Route("api/import")]
public class ImportController(IDapperConnectionFactory connectionFactory, ILogger<ImportController> logger) : ControllerBase
{
    private static readonly string ScriptPath = @"C:\Users\roryj\.paperclip\instances\default\workspaces\0f171b86-1c9b-491f-b414-089c40818833\import_xml.py";

    private const string PopulateSql = @"
        TRUNCATE TABLE DomsInfoSnapshot;

        INSERT INTO DomsInfoSnapshot
            (DomsDate, SiteId, Device, DeviceStatus, DeviceOfflineCount,
             DeviceErrorType, DeviceErrorText, DeviceErrorDate, DeviceLifetimeVolume,
             GradeOption, GradeId, GradeDescription, Transactions, PeakFlow, Uptime,
             NumberZeroTransactions, TankId, CreatedUtc)
        SELECT
            pm.BusinessDate,
            s.SiteId,
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
            pm.BusinessDate, s.SiteId, pd.DeviceId, pd.Online, pd.OfflineCount,
            ps.SubStateBits, ps.State, ps.SnapshotUtc, pt.VolumeTotal,
            pmg.GradeOption, pgt.GradeId, ft.Name, pmg.TotalPumpTrans,
            pfi.PeakFlowRate, pmg.UptimeMinutes, pmg.ZeroTrans;

        SELECT COUNT(*) FROM DomsInfoSnapshot;";

    /// <summary>
    /// Runs the XML import script then repopulates DomsInfoSnapshot.
    /// Pass skipDelete=true to append without clearing existing data first.
    /// </summary>
    [HttpPost("doms-files")]
    public async Task<IActionResult> ImportDomsFiles([FromQuery] bool skipDelete = false)
    {
        var started = DateTime.UtcNow;

        // Step 1: run Python import script
        logger.LogInformation("Starting DOMS XML import (skipDelete={SkipDelete}). Script: {Path}", skipDelete, ScriptPath);

        if (!System.IO.File.Exists(ScriptPath))
            return StatusCode(500, new { error = $"Import script not found at: {ScriptPath}" });

        var scriptArgs = skipDelete ? $"{ScriptPath} --no-delete" : ScriptPath;
        var (exitCode, stdout, stderr) = await RunProcess("python", scriptArgs, TimeSpan.FromMinutes(10));

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

    private const string ImportLogInsertSql = @"
        INSERT INTO ImportLog (FileName, Status, Message, ImportedAtUtc)
        VALUES (@FileName, @Status, @Message, @ImportedAtUtc)";

    /// <summary>
    /// Accepts a DOMS XML file upload, processes it into the database, and records the result in ImportLog.
    /// </summary>
    [HttpPost("doms-xml-upload")]
    [RequestSizeLimit(50 * 1024 * 1024)]
    public async Task<IActionResult> UploadDomsXml(IFormFile file)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new { error = "No file uploaded." });

        var fileName = Path.GetFileName(file.FileName);
        var now = DateTime.UtcNow;

        string xmlContent;
        using (var reader = new StreamReader(file.OpenReadStream()))
            xmlContent = await reader.ReadToEndAsync();

        try
        {
            var result = await ProcessDomsXmlAsync(xmlContent);
            using var conn = connectionFactory.CreateConnection();
            await conn.ExecuteAsync(ImportLogInsertSql, new
            {
                FileName = fileName,
                Status = "success",
                Message = $"Processed OK. Site: {result.SiteId}, Pumps: {result.PumpCount}, Tanks: {result.TankCount}",
                ImportedAtUtc = now
            });
            logger.LogInformation("DOMS XML import success: {File}, site={Site}", fileName, result.SiteId);
            return Ok(new { message = "Import successful", fileName, siteId = result.SiteId, pumpCount = result.PumpCount, tankCount = result.TankCount });
        }
        catch (Exception ex)
        {
            using var conn = connectionFactory.CreateConnection();
            await conn.ExecuteAsync(ImportLogInsertSql, new
            {
                FileName = fileName,
                Status = "failed",
                Message = ex.Message,
                ImportedAtUtc = now
            });
            logger.LogError(ex, "DOMS XML import failed: {File}", fileName);
            return StatusCode(500, new { error = ex.Message, fileName });
        }
    }

    private async Task<(string SiteId, int PumpCount, int TankCount)> ProcessDomsXmlAsync(string xmlContent)
    {
        var root = XElement.Parse(xmlContent);
        var pssInfo = root.Element("pss_info") ?? throw new InvalidOperationException("No pss_info element.");
        var systemEl = pssInfo.Element("system") ?? throw new InvalidOperationException("No system element.");

        var siteId = (string?)systemEl.Attribute("number") ?? throw new InvalidOperationException("No site id.");
        siteId = siteId.Trim();
        var siteName = ((string?)systemEl.Attribute("name") ?? "").Trim();

        var timeEl = pssInfo.Element("time");
        var businessDateStr = (string?)timeEl?.Attribute("date") ?? "00000000";
        var snapshotTimeStr = (string?)timeEl?.Attribute("time") ?? "000000";
        var businessDate = ParseDate(businessDateStr);
        var snapshotUtc = ParseDateTime(businessDateStr, snapshotTimeStr);

        using var conn = connectionFactory.CreateConnection();

        // Upsert site
        await conn.ExecuteAsync(@"
            IF NOT EXISTS (SELECT 1 FROM Sites WHERE SiteId = @SiteId)
                INSERT INTO Sites (SiteId, SiteName, OpeningHour, ClosingHour, CreatedUtc)
                VALUES (@SiteId, @SiteName, '00:00:00', '23:59:59', GETUTCDATE())
            ELSE
                UPDATE Sites SET SiteName = @SiteName WHERE SiteId = @SiteId",
            new { SiteId = siteId, SiteName = siteName });

        var forecourt = root.Element("devices")?.Element("forecourt") ?? root.Descendants("forecourt").FirstOrDefault();
        int pumpCount = 0, tankCount = 0;

        if (forecourt != null)
        {
            // Pumps
            var pumpsEl = forecourt.Element("pumps");
            if (pumpsEl != null)
            {
                foreach (var deviceEl in pumpsEl.Elements("device"))
                {
                    var devId = ((string?)deviceEl.Attribute("id") ?? "").Trim();
                    if (string.IsNullOrEmpty(devId)) continue;

                    var online = Bit((string?)deviceEl.Attribute("online"));
                    var offlineCount = Int32Val((string?)deviceEl.Attribute("offline_count")) ?? 0;
                    var protocol = (string?)deviceEl.Attribute("protocol");
                    var typeBitsGen = (string?)deviceEl.Attribute("type_bits_general");
                    var typeBitsProt = (string?)deviceEl.Attribute("type_bits_protocol");

                    await conn.ExecuteAsync(@"
                        IF NOT EXISTS (SELECT 1 FROM PumpDevices WHERE SiteId=@SiteId AND DeviceId=@DeviceId)
                            INSERT INTO PumpDevices (SiteId, DeviceId, Online, OfflineCount, Protocol, TypeBitsGeneral, TypeBitsProtocol, LastSeenUtc)
                            VALUES (@SiteId, @DeviceId, @Online, @OfflineCount, @Protocol, @TypeBitsGeneral, @TypeBitsProtocol, @LastSeenUtc)
                        ELSE
                            UPDATE PumpDevices SET Online=@Online, OfflineCount=@OfflineCount, Protocol=@Protocol,
                                TypeBitsGeneral=@TypeBitsGeneral, TypeBitsProtocol=@TypeBitsProtocol, LastSeenUtc=@LastSeenUtc
                            WHERE SiteId=@SiteId AND DeviceId=@DeviceId",
                        new { SiteId = siteId, DeviceId = devId, Online = online, OfflineCount = offlineCount,
                              Protocol = protocol, TypeBitsGeneral = typeBitsGen, TypeBitsProtocol = typeBitsProt, LastSeenUtc = snapshotUtc });

                    var pumpDeviceId = await conn.ExecuteScalarAsync<int>(
                        "SELECT PumpDeviceId FROM PumpDevices WHERE SiteId=@SiteId AND DeviceId=@DeviceId",
                        new { SiteId = siteId, DeviceId = devId });

                    // PumpStatus
                    var statusEl = deviceEl.Element("status");
                    if (statusEl != null && businessDate.HasValue)
                    {
                        await conn.ExecuteAsync(@"
                            IF NOT EXISTS (SELECT 1 FROM PumpStatus WHERE PumpDeviceId=@PumpDeviceId AND BusinessDate=@BusinessDate)
                                INSERT INTO PumpStatus (PumpDeviceId, BusinessDate, SnapshotUtc, State, SubStateBits, SubState2Bits)
                                VALUES (@PumpDeviceId, @BusinessDate, @SnapshotUtc, @State, @SubStateBits, @SubState2Bits)",
                            new { PumpDeviceId = pumpDeviceId, BusinessDate = businessDate, SnapshotUtc = snapshotUtc,
                                  State = (string?)statusEl.Attribute("state"),
                                  SubStateBits = (string?)statusEl.Attribute("sub_state_bits"),
                                  SubState2Bits = (string?)statusEl.Attribute("sub_state2_bits") });
                    }

                    // PumpTotals
                    foreach (var pumpTotsEl in deviceEl.Elements("pump_tots"))
                    {
                        if (!businessDate.HasValue) continue;
                        var totType = (string?)pumpTotsEl.Attribute("type");
                        var grandTot = pumpTotsEl.Element("grand_tot");
                        if (grandTot == null) continue;

                        await conn.ExecuteAsync(@"
                            IF NOT EXISTS (SELECT 1 FROM PumpTotals WHERE PumpDeviceId=@PumpDeviceId AND BusinessDate=@BusinessDate AND TotType=@TotType)
                                INSERT INTO PumpTotals (PumpDeviceId, BusinessDate, SnapshotUtc, TotType, MoneyTotal, MoneyDiff, VolumeTotal, VolumeDiff)
                                VALUES (@PumpDeviceId, @BusinessDate, @SnapshotUtc, @TotType, @MoneyTotal, @MoneyDiff, @VolumeTotal, @VolumeDiff)",
                            new { PumpDeviceId = pumpDeviceId, BusinessDate = businessDate, SnapshotUtc = snapshotUtc, TotType = totType,
                                  MoneyTotal = DecimalVal((string?)grandTot.Attribute("money_tot")),
                                  MoneyDiff = DecimalVal((string?)grandTot.Attribute("money_dif")),
                                  VolumeTotal = DecimalVal((string?)grandTot.Attribute("vol_tot")),
                                  VolumeDiff = DecimalVal((string?)grandTot.Attribute("vol_dif")) });

                        var pumpTotalsId = await conn.ExecuteScalarAsync<int>(
                            "SELECT PumpTotalsId FROM PumpTotals WHERE PumpDeviceId=@PumpDeviceId AND BusinessDate=@BusinessDate AND TotType=@TotType",
                            new { PumpDeviceId = pumpDeviceId, BusinessDate = businessDate, TotType = totType });

                        foreach (var groptEl in pumpTotsEl.Elements("gropt_tot"))
                        {
                            var gropt = Int32Val((string?)groptEl.Attribute("gropt"));
                            var grId = ((string?)groptEl.Attribute("gr_id") ?? "").Trim();

                            await conn.ExecuteAsync(@"
                                IF NOT EXISTS (SELECT 1 FROM PumpGradeTotals WHERE PumpTotalsId=@PumpTotalsId AND GradeOption=@GradeOption AND GradeId=@GradeId)
                                    INSERT INTO PumpGradeTotals (PumpTotalsId, VolumeTotal, VolumeDiff, GradeOption, GradeId)
                                    VALUES (@PumpTotalsId, @VolumeTotal, @VolumeDiff, @GradeOption, @GradeId)",
                                new { PumpTotalsId = pumpTotalsId, GradeOption = gropt, GradeId = grId,
                                      VolumeTotal = DecimalVal((string?)groptEl.Attribute("vol_total")),
                                      VolumeDiff = DecimalVal((string?)groptEl.Attribute("vol_dif")) });

                            var pumpGradeTotalsId = await conn.ExecuteScalarAsync<int>(
                                "SELECT PumpGradeTotalsId FROM PumpGradeTotals WHERE PumpTotalsId=@PumpTotalsId AND GradeOption=@GradeOption AND GradeId=@GradeId",
                                new { PumpTotalsId = pumpTotalsId, GradeOption = gropt, GradeId = grId });

                            foreach (var tcEl in groptEl.Elements("tank_consumption"))
                            {
                                var tankId = ((string?)tcEl.Attribute("tank_id") ?? "").Trim();
                                await conn.ExecuteAsync(@"
                                    IF NOT EXISTS (SELECT 1 FROM PumpTankConsumption WHERE PumpGradeTotalsId=@PumpGradeTotalsId AND TankId=@TankId)
                                        INSERT INTO PumpTankConsumption (PumpGradeTotalsId, TankId, VolumeTotal, VolumeDiff)
                                        VALUES (@PumpGradeTotalsId, @TankId, @VolumeTotal, @VolumeDiff)",
                                    new { PumpGradeTotalsId = pumpGradeTotalsId, TankId = tankId,
                                          VolumeTotal = DecimalVal((string?)tcEl.Attribute("vol_total")),
                                          VolumeDiff = DecimalVal((string?)tcEl.Attribute("vol_dif")) });
                            }
                        }
                    }

                    // PumpMonitoring
                    var monitoringEl = deviceEl.Element("monitoring");
                    if (monitoringEl != null && businessDate.HasValue)
                    {
                        var hiSpeedTrig = DecimalVal((string?)monitoringEl.Attribute("hi_speed_trig_flow_rate")) ?? 0m;

                        await conn.ExecuteAsync(@"
                            IF NOT EXISTS (SELECT 1 FROM PumpMonitoring WHERE PumpDeviceId=@PumpDeviceId AND BusinessDate=@BusinessDate)
                                INSERT INTO PumpMonitoring (PumpDeviceId, BusinessDate, SnapshotUtc, HiSpeedTrigFlow)
                                VALUES (@PumpDeviceId, @BusinessDate, @SnapshotUtc, @HiSpeedTrigFlow)",
                            new { PumpDeviceId = pumpDeviceId, BusinessDate = businessDate, SnapshotUtc = snapshotUtc, HiSpeedTrigFlow = hiSpeedTrig });

                        var pumpMonitoringId = await conn.ExecuteScalarAsync<int>(
                            "SELECT PumpMonitoringId FROM PumpMonitoring WHERE PumpDeviceId=@PumpDeviceId AND BusinessDate=@BusinessDate",
                            new { PumpDeviceId = pumpDeviceId, BusinessDate = businessDate });

                        foreach (var groptEl in monitoringEl.Elements("grade_option"))
                        {
                            var gropt = Int32Val((string?)groptEl.Attribute("gropt"));
                            var totalTrans = Int32Val((string?)groptEl.Attribute("total_no_pump_trans")) ?? 0;
                            var zeroTrans = Int32Val((string?)groptEl.Attribute("no_pump_zero_trans")) ?? 0;
                            var noPeakZero = Int32Val((string?)groptEl.Attribute("no_peak_hour_pump_zero_trans")) ?? 0;
                            var uptime = Int32Val((string?)groptEl.Attribute("uptime")) ?? 0;

                            await conn.ExecuteAsync(@"
                                IF NOT EXISTS (SELECT 1 FROM PumpMonitoringGrade WHERE PumpMonitoringId=@PumpMonitoringId AND GradeOption=@GradeOption)
                                    INSERT INTO PumpMonitoringGrade (PumpMonitoringId, GradeOption, TotalPumpTrans, ZeroTrans, NoPeakHourZeroTrans, UptimeMinutes)
                                    VALUES (@PumpMonitoringId, @GradeOption, @TotalPumpTrans, @ZeroTrans, @NoPeakHourZeroTrans, @UptimeMinutes)",
                                new { PumpMonitoringId = pumpMonitoringId, GradeOption = gropt,
                                      TotalPumpTrans = totalTrans, ZeroTrans = zeroTrans,
                                      NoPeakHourZeroTrans = noPeakZero, UptimeMinutes = uptime });

                            var pmgId = await conn.ExecuteScalarAsync<int>(
                                "SELECT PumpMonitoringGradeId FROM PumpMonitoringGrade WHERE PumpMonitoringId=@PumpMonitoringId AND GradeOption=@GradeOption",
                                new { PumpMonitoringId = pumpMonitoringId, GradeOption = gropt });

                            foreach (var flowEl in groptEl.Elements("flow_info"))
                            {
                                var flowType = (string?)flowEl.Attribute("flow_type");
                                var flowRateEl = flowEl.Element("flow_rate");
                                var ttfEl = flowEl.Element("time_to_flow");
                                var ttpfEl = flowEl.Element("time_to_trans_peak_flow");

                                await conn.ExecuteAsync(@"
                                    IF NOT EXISTS (SELECT 1 FROM PumpFlowInfo WHERE PumpMonitoringGradeId=@PumpMonitoringGradeId AND FlowType=@FlowType)
                                        INSERT INTO PumpFlowInfo (PumpMonitoringGradeId, FlowType, TotalPumpTrans, NominalFlowRate,
                                            AvgFlowRate, PeakFlowRate, AvgTimeToFlow, MaxTimeToFlow, AvgTimeToPeakFlow, MaxTimeToPeakFlow)
                                        VALUES (@PumpMonitoringGradeId, @FlowType, @TotalPumpTrans, @NominalFlowRate,
                                            @AvgFlowRate, @PeakFlowRate, @AvgTimeToFlow, @MaxTimeToFlow, @AvgTimeToPeakFlow, @MaxTimeToPeakFlow)",
                                    new { PumpMonitoringGradeId = pmgId, FlowType = flowType,
                                          TotalPumpTrans = Int32Val((string?)flowEl.Attribute("total_no_pump_trans")) ?? 0,
                                          NominalFlowRate = DecimalVal((string?)flowEl.Attribute("nominal_flow_rate")) ?? 0m,
                                          AvgFlowRate = DecimalVal((string?)flowRateEl?.Attribute("average")),
                                          PeakFlowRate = DecimalVal((string?)flowRateEl?.Attribute("peak")),
                                          AvgTimeToFlow = Int32Val((string?)ttfEl?.Attribute("average")),
                                          MaxTimeToFlow = Int32Val((string?)ttfEl?.Attribute("max")),
                                          AvgTimeToPeakFlow = Int32Val((string?)ttpfEl?.Attribute("average")),
                                          MaxTimeToPeakFlow = Int32Val((string?)ttpfEl?.Attribute("max")) });
                            }
                        }
                    }
                    pumpCount++;
                }
            }

            // Tank Gauges
            var tankGaugesEl = forecourt.Element("tank_gauges");
            if (tankGaugesEl != null)
            {
                foreach (var deviceEl in tankGaugesEl.Elements("device"))
                {
                    var devId = ((string?)deviceEl.Attribute("id") ?? "").Trim();
                    if (string.IsNullOrEmpty(devId)) continue;

                    var tankInfoEl = deviceEl.Element("tank_info");
                    if (tankInfoEl == null) continue;
                    var tankId = ((string?)tankInfoEl.Attribute("tank_id") ?? "").Trim();

                    var dataEl = tankInfoEl.Element("data");
                    if (dataEl == null) continue;

                    var dataDateStr = (string?)dataEl.Attribute("date") ?? "00000000";
                    var dataDate = ParseDate(dataDateStr) ?? businessDate;
                    var dataTime = ParseTimeOnly((string?)dataEl.Attribute("time") ?? "000000");
                    var monitoringEl = deviceEl.Element("monitoring");

                    await conn.ExecuteAsync(@"
                        IF NOT EXISTS (SELECT 1 FROM TankGauges WHERE SiteId=@SiteId AND DeviceId=@DeviceId AND TankId=@TankId AND BusinessDate=@BusinessDate)
                            INSERT INTO TankGauges (SiteId, DeviceId, Online, OfflineCount, Protocol, TypeBits, TankId,
                                Capacity, TankHeight, ShellCapacity, BusinessDate, DataTime, Gauged, GaugedDif,
                                Ullage, ProdHeight, Temp, TcCorrVol, WaterVol, WaterHeight, Uptime, CreatedUtc)
                            VALUES (@SiteId, @DeviceId, @Online, @OfflineCount, @Protocol, @TypeBits, @TankId,
                                @Capacity, @TankHeight, @ShellCapacity, @BusinessDate, @DataTime, @Gauged, @GaugedDif,
                                @Ullage, @ProdHeight, @Temp, @TcCorrVol, @WaterVol, @WaterHeight, @Uptime, GETUTCDATE())",
                        new { SiteId = siteId, DeviceId = devId,
                              Online = Bit((string?)deviceEl.Attribute("online")),
                              OfflineCount = Int32Val((string?)deviceEl.Attribute("offline_count")) ?? 0,
                              Protocol = (string?)deviceEl.Attribute("protocol") ?? "",
                              TypeBits = (string?)deviceEl.Attribute("type_bits") ?? "",
                              TankId = tankId,
                              Capacity = DecimalVal((string?)tankInfoEl.Attribute("capacity")) ?? 0m,
                              TankHeight = DecimalVal((string?)tankInfoEl.Attribute("tank_height")) ?? 0m,
                              ShellCapacity = DecimalVal((string?)tankInfoEl.Attribute("shell_capacity")) ?? 0m,
                              BusinessDate = dataDate,
                              DataTime = dataTime,
                              Gauged = DecimalVal((string?)dataEl.Attribute("gauged")) ?? 0m,
                              GaugedDif = DecimalVal((string?)dataEl.Attribute("gauged_dif")) ?? 0m,
                              Ullage = DecimalVal((string?)dataEl.Attribute("ullage")) ?? 0m,
                              ProdHeight = DecimalVal((string?)dataEl.Attribute("prod_height")) ?? 0m,
                              Temp = DecimalVal((string?)dataEl.Attribute("temp")) ?? 0m,
                              TcCorrVol = DecimalVal((string?)dataEl.Attribute("tc_corr_vol")) ?? 0m,
                              WaterVol = DecimalVal((string?)dataEl.Attribute("water_vol")) ?? 0m,
                              WaterHeight = DecimalVal((string?)dataEl.Attribute("water_height")) ?? 0m,
                              Uptime = Int32Val((string?)monitoringEl?.Attribute("uptime")) ?? 0 });
                    tankCount++;
                }
            }
        }

        return (siteId, pumpCount, tankCount);
    }

    private static DateOnly? ParseDate(string? s)
    {
        if (string.IsNullOrEmpty(s) || s == "00000000") return null;
        return new DateOnly(int.Parse(s[..4]), int.Parse(s[4..6]), int.Parse(s[6..8]));
    }

    private static TimeOnly ParseTimeOnly(string? s)
    {
        if (string.IsNullOrEmpty(s) || s == "000000") return new TimeOnly(0, 0, 0);
        return new TimeOnly(int.Parse(s[..2]), int.Parse(s[2..4]), int.Parse(s[4..6]));
    }

    private static DateTime? ParseDateTime(string? d, string? t)
    {
        var dt = ParseDate(d);
        if (dt == null) return null;
        var tm = ParseTimeOnly(t);
        return new DateTime(dt.Value.Year, dt.Value.Month, dt.Value.Day, tm.Hour, tm.Minute, tm.Second, DateTimeKind.Utc);
    }

    private static int Bit(string? val) => val?.ToLower() == "yes" ? 1 : 0;
    private static decimal? DecimalVal(string? s) => decimal.TryParse(s, out var v) ? v : null;
    private static int? Int32Val(string? s) => int.TryParse(s, out var v) ? v : null;

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
