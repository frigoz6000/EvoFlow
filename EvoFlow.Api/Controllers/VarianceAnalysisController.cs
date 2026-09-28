using Dapper;
using EvoFlow.Api.Data;
using Microsoft.AspNetCore.Mvc;

namespace EvoFlow.Api.Controllers;

/// <summary>One day of reconciliation for one tank, straight out of SQL.</summary>
public class VarianceDayRow
{
    public string SiteId { get; set; } = "";
    public string SiteName { get; set; } = "";
    public string? TankId { get; set; }
    public string? GradeId { get; set; }
    public string? GradeName { get; set; }
    public DateTime BusinessDate { get; set; }
    public decimal Capacity { get; set; }
    public decimal Opening { get; set; }
    public decimal Closing { get; set; }
    public decimal Dispensed { get; set; }
    /// <summary>(closing - opening) + dispensed. ~0 on a quiet day, the delivery size on a delivery day.</summary>
    public decimal Residual { get; set; }
    public decimal MeanLevel { get; set; }
}

/// <summary>Alarms already recorded against a tank, used to corroborate a loss.</summary>
public class TankAlarmRow
{
    public string SiteId { get; set; } = "";
    public string? TankId { get; set; }
    public int SuddenLossCount { get; set; }
    public decimal? SuddenLossLitres { get; set; }
    public int GaugeAlarmCount { get; set; }
}

public class VarianceDayPoint
{
    public DateTime Date { get; set; }
    public decimal Opening { get; set; }
    public decimal Closing { get; set; }
    public decimal Dispensed { get; set; }
    public decimal Residual { get; set; }
    public decimal MeanLevel { get; set; }
    public bool IsDelivery { get; set; }
    /// <summary>Residual as a percentage of that day's throughput.</summary>
    public decimal? ResidualPct { get; set; }
}

public class VarianceRow
{
    public string SiteId { get; set; } = "";
    public string SiteName { get; set; } = "";
    public string TankId { get; set; } = "";
    public string? GradeId { get; set; }
    public string GradeName { get; set; } = "";

    public int Days { get; set; }
    public int QuietDays { get; set; }
    public int DeliveryDays { get; set; }

    /// <summary>Total unexplained litres across the window (quiet days only).</summary>
    public decimal TotalVarianceL { get; set; }
    public decimal MeanDailyVarianceL { get; set; }
    public decimal ThroughputL { get; set; }
    /// <summary>The headline number: unexplained litres as a percentage of throughput.</summary>
    public decimal? VariancePct { get; set; }
    public decimal? SdDailyL { get; set; }
    /// <summary>Standard errors from zero - how sure we are the bias is not noise.</summary>
    public decimal? TStat { get; set; }

    public decimal? SlopeVsThroughputPct { get; set; }
    public decimal? CorrWithLevel { get; set; }
    public decimal? PostDeliveryRatio { get; set; }

    /// <summary>Same reconciliation rolled up over every tank of this grade at the site.</summary>
    public decimal? GroupVariancePct { get; set; }
    public int GroupDays { get; set; }
    public string? GroupPeerTanks { get; set; }

    public int SuddenLossCount { get; set; }
    public decimal? SuddenLossLitres { get; set; }
    public int GaugeAlarmCount { get; set; }

    public decimal? WorstDayVarianceL { get; set; }
    public DateTime? WorstDayDate { get; set; }

    /// <summary>mapping | meter_drift | constant_loss | probe | delivery | sudden_loss | gauge_fault | ok | insufficient_data</summary>
    public string Cause { get; set; } = "insufficient_data";
    public string CauseLabel { get; set; } = "";
    /// <summary>critical | warning | info | ok | unknown</summary>
    public string Severity { get; set; } = "unknown";
    /// <summary>high | medium | low | none</summary>
    public string Confidence { get; set; } = "none";
    public string Explanation { get; set; } = "";
    public string Recommendation { get; set; } = "";
}

// Backs the Intelligent Variance Analysis page (/variance-analysis).
//
// Reconciliation, per tank per day:
//     residual = (closing gauge - opening gauge) + dispensed
// which is ~0 when everything is accounted for, and the delivery size on a day
// fuel arrived. Nothing records deliveries, so a large positive residual IS the
// delivery signal and those days are excluded from the variance maths.
//
// The point of the page is not the number but the cause, so each tank's quiet
// days are then tested for the signatures below (see Classify).
[ApiController]
[Route("api/varianceanalysis")]
public class VarianceAnalysisController(IDapperConnectionFactory connectionFactory) : ControllerBase
{
    private const decimal SentinelVolume = 100000m;

    // A residual above this is a delivery, not a variance. The residual
    // distribution is strongly bimodal - a tight cluster inside +-250 L and a
    // delivery mode above ~2,000 L - so the split is not sensitive to the exact value.
    private const decimal DeliveryThresholdL = 2000m;

    // A tank cannot really lose a fifth of its throughput. At this level the
    // litres are almost always attributed to the wrong tank of the same grade.
    private const decimal MappingTankPct = 8m;
    private const decimal MappingGroupPct = 3m;

    // Below this the bias is not worth reporting however statistically clean.
    private const decimal TolerancePct = 0.25m;
    // Standard errors from zero before a bias counts as real rather than noise.
    private const decimal MinTStat = 3m;
    private const decimal MinCorrLevel = 0.6m;
    private const int MinDaysForShape = 10;

    private const string DaysSql = @"
        WITH tg AS (
            SELECT SiteId, TankId, BusinessDate, Gauged, Capacity, Online, Uptime,
                   LAG(Gauged)       OVER (PARTITION BY SiteId, TankId ORDER BY BusinessDate) AS PrevGauged,
                   LAG(BusinessDate) OVER (PARTITION BY SiteId, TankId ORDER BY BusinessDate) AS PrevDate
            FROM TankGauges
            WHERE (@SiteId IS NULL OR SiteId = @SiteId)
        ),
        disp AS (
            SELECT pd.SiteId, ptc.TankId,
                   DATEADD(day, -1, pt.BusinessDate) AS ActivityDate,
                   SUM(ptc.VolumeDiff) AS Dispensed
            FROM PumpTankConsumption ptc
            JOIN PumpGradeTotals pg ON pg.PumpGradeTotalsId = ptc.PumpGradeTotalsId
            JOIN PumpTotals      pt ON pt.PumpTotalsId      = pg.PumpTotalsId
            JOIN PumpDevices     pd ON pd.PumpDeviceId      = pt.PumpDeviceId
            WHERE pt.TotType = 'pump'
              AND ptc.VolumeDiff BETWEEN 0 AND @Sentinel
              AND (@SiteId IS NULL OR pd.SiteId = @SiteId)
            GROUP BY pd.SiteId, ptc.TankId, pt.BusinessDate
        ),
        grade AS (
            SELECT SiteId, TankId, GradeId, GradeName FROM (
                SELECT pd.SiteId, ptc.TankId, pg.GradeId, ft.Name AS GradeName,
                       ROW_NUMBER() OVER (PARTITION BY pd.SiteId, ptc.TankId ORDER BY COUNT(*) DESC) AS rn
                FROM PumpTankConsumption ptc
                JOIN PumpGradeTotals pg ON pg.PumpGradeTotalsId = ptc.PumpGradeTotalsId
                JOIN PumpTotals      pt ON pt.PumpTotalsId      = pg.PumpTotalsId
                JOIN PumpDevices     pd ON pd.PumpDeviceId      = pt.PumpDeviceId
                LEFT JOIN FuelTypes  ft ON ft.FuelTypeId        = pg.GradeId
                WHERE pt.TotType = 'pump' AND (@SiteId IS NULL OR pd.SiteId = @SiteId)
                GROUP BY pd.SiteId, ptc.TankId, pg.GradeId, ft.Name
            ) x WHERE rn = 1
        )
        SELECT tg.SiteId, s.SiteName, tg.TankId, g.GradeId, g.GradeName,
               tg.BusinessDate, tg.Capacity,
               tg.PrevGauged AS Opening,
               tg.Gauged     AS Closing,
               d.Dispensed,
               (tg.Gauged - tg.PrevGauged) + d.Dispensed AS Residual,
               (tg.Gauged + tg.PrevGauged) / 2.0 AS MeanLevel
        FROM tg
        JOIN Sites s       ON s.SiteId = tg.SiteId
        JOIN disp d        ON d.SiteId = tg.SiteId AND d.TankId = tg.TankId AND d.ActivityDate = tg.BusinessDate
        LEFT JOIN grade g  ON g.SiteId = tg.SiteId AND g.TankId = tg.TankId
        WHERE tg.PrevGauged IS NOT NULL
          -- Only consecutive days reconcile; a gap hides an unknown amount of trade.
          AND DATEDIFF(day, tg.PrevDate, tg.BusinessDate) = 1
          -- A dead probe reads zero, which would look like catastrophic loss.
          AND tg.Online = 1 AND tg.Uptime >= 1400
          AND tg.Gauged > 0 AND tg.PrevGauged > 0
          AND d.Dispensed BETWEEN 0 AND @Sentinel
          AND tg.BusinessDate > DATEADD(day, -@Days, @Today)
        ORDER BY tg.SiteId, tg.TankId, tg.BusinessDate;

        SELECT sl.SiteId, sl.TankId,
               COUNT(*) AS SuddenLossCount,
               SUM(sl.VolumeLostLitres) AS SuddenLossLitres,
               0 AS GaugeAlarmCount
        FROM SuddenLossEvents sl
        WHERE CAST(sl.EventDateTime AS date) > DATEADD(day, -@Days, @Today)
          AND (@SiteId IS NULL OR sl.SiteId = @SiteId)
        GROUP BY sl.SiteId, sl.TankId;

        SELECT se.SiteId, se.DeviceId AS TankId,
               0 AS SuddenLossCount, CAST(NULL AS decimal(18,2)) AS SuddenLossLitres,
               COUNT(*) AS GaugeAlarmCount
        FROM SystemEvents se
        WHERE se.Grp = '0x04' AND se.EventDate > DATEADD(day, -@Days, @Today)
          AND (@SiteId IS NULL OR se.SiteId = @SiteId)
        GROUP BY se.SiteId, se.DeviceId;";

    private const string TodaySql = @"
        SELECT MAX(d) FROM (
            SELECT DATEADD(day, -1, MAX(BusinessDate)) AS d FROM PumpTotals
            UNION ALL
            SELECT MAX(BusinessDate) FROM TankGauges
        ) x";

    [HttpGet]
    public async Task<IActionResult> Get(
        [FromQuery] string? siteId = null,
        [FromQuery] int days = 28)
    {
        days = Math.Clamp(days, 7, 180);

        using var conn = connectionFactory.CreateConnection();
        var today = await conn.ExecuteScalarAsync<DateTime?>(TodaySql);
        if (today is null) return Ok(new { asOf = (DateTime?)null, rows = Array.Empty<VarianceRow>() });

        var (dayRows, alarms) = await LoadAsync(conn, siteId, days, today.Value);
        var rows = Analyse(dayRows, alarms);

        return Ok(new
        {
            asOf = today.Value,
            days,
            deliveryThresholdL = DeliveryThresholdL,
            tolerancePct = TolerancePct,
            summary = new
            {
                tanks = rows.Count,
                critical = rows.Count(r => r.Severity == "critical"),
                warning = rows.Count(r => r.Severity == "warning"),
                info = rows.Count(r => r.Severity == "info"),
                ok = rows.Count(r => r.Severity == "ok"),
                unknown = rows.Count(r => r.Severity == "unknown"),
                // Only litres we actually believe are missing. Mapping and
                // "does not reconcile" rows are data faults, and a probe fault
                // is a measurement error - counting either as lost fuel would
                // inflate this into a number nobody could act on.
                unexplainedLitres = Math.Round(
                    rows.Where(r => r.TotalVarianceL < 0
                                 && r.Cause is "meter_drift" or "constant_loss" or "sudden_loss" or "unexplained")
                        .Sum(r => r.TotalVarianceL), 0),
                dataFaultTanks = rows.Count(r => r.Cause is "mapping" or "implausible"),
            },
            rows
        });
    }

    [HttpGet("{siteId}/{tankId}/detail")]
    public async Task<IActionResult> GetDetail(
        string siteId, string tankId, [FromQuery] int days = 28)
    {
        days = Math.Clamp(days, 7, 180);

        using var conn = connectionFactory.CreateConnection();
        var today = await conn.ExecuteScalarAsync<DateTime?>(TodaySql);
        if (today is null) return NotFound(new { message = "No data loaded." });

        var (dayRows, alarms) = await LoadAsync(conn, siteId, days, today.Value);
        var rows = Analyse(dayRows, alarms);
        var row = rows.FirstOrDefault(r => r.TankId == tankId);
        if (row is null) return NotFound(new { message = $"No reconciled days for tank {tankId} at site {siteId}." });

        var series = dayRows
            .Where(d => d.TankId == tankId)
            .OrderBy(d => d.BusinessDate)
            .Select(d => new VarianceDayPoint
            {
                Date = d.BusinessDate,
                Opening = Math.Round(d.Opening, 0),
                Closing = Math.Round(d.Closing, 0),
                Dispensed = Math.Round(d.Dispensed, 0),
                Residual = Math.Round(d.Residual, 0),
                MeanLevel = Math.Round(d.MeanLevel, 0),
                IsDelivery = d.Residual >= DeliveryThresholdL,
                ResidualPct = d.Dispensed > 0 && d.Residual < DeliveryThresholdL
                    ? Math.Round(d.Residual / d.Dispensed * 100m, 2)
                    : null,
            })
            .ToList();

        return Ok(new { asOf = today.Value, tank = row, series });
    }

    private static async Task<(List<VarianceDayRow>, Dictionary<string, TankAlarmRow>)> LoadAsync(
        System.Data.IDbConnection conn, string? siteId, int days, DateTime today)
    {
        using var multi = await conn.QueryMultipleAsync(DaysSql,
            new { SiteId = siteId, Days = days, Today = today, Sentinel = SentinelVolume });

        var dayRows = (await multi.ReadAsync<VarianceDayRow>()).ToList();
        var suddenLoss = (await multi.ReadAsync<TankAlarmRow>()).ToList();
        var gaugeAlarms = (await multi.ReadAsync<TankAlarmRow>()).ToList();

        var alarms = new Dictionary<string, TankAlarmRow>();
        foreach (var a in suddenLoss.Concat(gaugeAlarms))
        {
            var key = Key(a.SiteId, a.TankId);
            if (!alarms.TryGetValue(key, out var existing))
            {
                alarms[key] = new TankAlarmRow
                {
                    SiteId = a.SiteId, TankId = a.TankId,
                    SuddenLossCount = a.SuddenLossCount,
                    SuddenLossLitres = a.SuddenLossLitres,
                    GaugeAlarmCount = a.GaugeAlarmCount
                };
            }
            else
            {
                existing.SuddenLossCount += a.SuddenLossCount;
                existing.SuddenLossLitres = (existing.SuddenLossLitres ?? 0) + (a.SuddenLossLitres ?? 0);
                existing.GaugeAlarmCount += a.GaugeAlarmCount;
            }
        }
        return (dayRows, alarms);
    }

    private static string Key(string siteId, string? tankId) => $"{siteId}|{tankId}";

    private static List<VarianceRow> Analyse(
        List<VarianceDayRow> dayRows, Dictionary<string, TankAlarmRow> alarms)
    {
        // Roll the same reconciliation up over every tank of one grade at a site.
        // Manifolded tanks swap litres between each other, so the group nets out
        // even when the individual tanks look alarming.
        var groups = dayRows
            .GroupBy(d => $"{d.SiteId}|{d.GradeId}")
            .ToDictionary(g => g.Key, g =>
            {
                var tanks = g.Select(d => d.TankId).Distinct().OrderBy(t => t).ToList();
                // The group only nets out on days where EVERY tank in it reconciled
                // and none took a delivery. Summing a ragged set of tank-days
                // mixes one tank's delivery day into another's quiet day.
                var wholeDays = g.GroupBy(d => d.BusinessDate)
                    .Where(day => day.Count() == tanks.Count
                               && day.All(d => d.Residual < DeliveryThresholdL))
                    .ToList();
                var thru = wholeDays.Sum(day => day.Sum(d => d.Dispensed));
                // Net, not absolute: litres moved from one tank to its neighbour cancel.
                var net = wholeDays.Sum(day => day.Sum(d => d.Residual));
                return new
                {
                    Pct = thru > 0 ? net / thru * 100m : (decimal?)null,
                    Days = wholeDays.Count,
                    Tanks = tanks
                };
            });

        var rows = new List<VarianceRow>();

        foreach (var tank in dayRows.GroupBy(d => Key(d.SiteId, d.TankId)))
        {
            var all = tank.OrderBy(d => d.BusinessDate).ToList();
            var first = all[0];
            var quiet = all.Where(d => d.Residual < DeliveryThresholdL).ToList();

            var row = new VarianceRow
            {
                SiteId = first.SiteId,
                SiteName = first.SiteName,
                TankId = string.IsNullOrWhiteSpace(first.TankId) ? "(none)" : first.TankId!,
                GradeId = first.GradeId,
                GradeName = string.IsNullOrWhiteSpace(first.GradeName) ? "Unknown" : first.GradeName!,
                Days = all.Count,
                QuietDays = quiet.Count,
                DeliveryDays = all.Count - quiet.Count,
            };

            if (alarms.TryGetValue(tank.Key, out var alarm))
            {
                row.SuddenLossCount = alarm.SuddenLossCount;
                row.SuddenLossLitres = alarm.SuddenLossLitres == 0 ? null : alarm.SuddenLossLitres;
                row.GaugeAlarmCount = alarm.GaugeAlarmCount;
            }

            if (groups.TryGetValue($"{first.SiteId}|{first.GradeId}", out var grp))
            {
                row.GroupVariancePct = grp.Pct.HasValue ? Math.Round(grp.Pct.Value, 2) : null;
                row.GroupDays = grp.Days;
                var peers = grp.Tanks.Where(t => t != first.TankId).ToList();
                row.GroupPeerTanks = peers.Count > 0 ? string.Join(", ", peers) : null;
            }

            if (quiet.Count < 3)
            {
                row.Cause = "insufficient_data";
                row.CauseLabel = "Not enough data";
                row.Severity = "unknown";
                row.Confidence = "none";
                row.Explanation = $"Only {quiet.Count} reconcilable day(s) in the window. A day needs consecutive gauge readings, a healthy probe and recorded dispensing before it can be reconciled.";
                row.Recommendation = "Check the tank gauge is reporting daily and that its pumps are mapped to it.";
                rows.Add(row);
                continue;
            }

            var n = quiet.Count;
            var throughput = quiet.Sum(d => d.Dispensed);
            var total = quiet.Sum(d => d.Residual);
            var mean = total / n;
            var sd = StdDev(quiet.Select(d => (double)d.Residual).ToList());

            row.ThroughputL = Math.Round(throughput, 0);
            row.TotalVarianceL = Math.Round(total, 0);
            row.MeanDailyVarianceL = Math.Round(mean, 1);
            row.SdDailyL = Math.Round((decimal)sd, 1);
            row.VariancePct = throughput > 0 ? Math.Round(total / throughput * 100m, 2) : null;
            row.TStat = sd > 0.0001
                ? Math.Round(Math.Abs((decimal)((double)mean / (sd / Math.Sqrt(n)))), 1)
                : null;

            row.SlopeVsThroughputPct = Slope(
                quiet.Select(d => (double)d.Dispensed).ToList(),
                quiet.Select(d => (double)d.Residual).ToList()) is { } slope
                ? Math.Round((decimal)(slope * 100), 2)
                : null;

            row.CorrWithLevel = Correlation(
                quiet.Select(d => (double)d.MeanLevel).ToList(),
                quiet.Select(d => (double)d.Residual).ToList()) is { } corr
                ? Math.Round((decimal)corr, 2)
                : null;

            row.PostDeliveryRatio = PostDeliveryRatio(all);

            var worst = quiet.OrderBy(d => d.Residual).First();
            row.WorstDayVarianceL = Math.Round(worst.Residual, 0);
            row.WorstDayDate = worst.BusinessDate;

            Classify(row);
            rows.Add(row);
        }

        return rows
            .OrderBy(r => SeverityRank(r.Severity))
            .ThenBy(r => r.VariancePct ?? 0)
            .ThenBy(r => r.SiteId)
            .ThenBy(r => r.TankId)
            .ToList();
    }

    private static int SeverityRank(string s) => s switch
    {
        "critical" => 0, "warning" => 1, "info" => 2, "ok" => 3, _ => 4
    };

    /// <summary>
    /// Picks the best-supported cause. Order matters: the cheap explanations
    /// (bad attribution, a probe fault) are ruled out before anything is called
    /// a fuel loss, because telling someone to investigate theft when the real
    /// problem is a tank mapping wastes a site visit.
    /// </summary>
    private static void Classify(VarianceRow row)
    {
        var pct = row.VariancePct ?? 0m;
        var absPct = Math.Abs(pct);
        var t = row.TStat ?? 0m;
        var corr = Math.Abs(row.CorrWithLevel ?? 0m);
        var lost = row.TotalVarianceL < 0;
        var direction = lost ? "loss" : "gain";

        // 1. Attribution, not fuel. The tank is wildly out but its grade group nets out.
        if (absPct >= MappingTankPct
            && row.GroupVariancePct is { } gp && Math.Abs(gp) <= MappingGroupPct
            && !string.IsNullOrEmpty(row.GroupPeerTanks))
        {
            row.Cause = "mapping";
            row.CauseLabel = "Tank / pump mapping";
            row.Severity = "info";
            row.Confidence = "high";
            row.Explanation =
                $"This tank shows a {Math.Abs(pct):0.0}% {direction} against throughput, but every {row.GradeName} tank at the site together reconciles to {gp:+0.00;-0.00;0.00}%. "
                + $"The litres are accounted for at the site, so consumption is being attributed to the wrong tank — these tanks are almost certainly manifolded or share pumps with {row.GroupPeerTanks}.";
            row.Recommendation = $"Fix the pump-to-tank mapping across tanks {row.TankId}, {row.GroupPeerTanks}, or reconcile this grade at site level instead of per tank. Do not investigate this as a fuel loss.";
            return;
        }

        // 1b. Too big to be fuel, and the grade group does not clear it either.
        // A tank physically cannot lose a large fraction of everything it sells,
        // so this is a data fault. Saying "theft" here would send someone to site
        // for nothing, so it is reported as what it is: numbers that do not add up.
        if (absPct >= MappingTankPct)
        {
            row.Cause = "implausible";
            row.CauseLabel = "Does not reconcile";
            row.Severity = "warning";
            row.Confidence = "high";
            var groupNote = row.GroupVariancePct is { } g2
                ? (row.GroupDays > 0
                    ? $"Rolling up every {row.GradeName} tank at the site over {row.GroupDays} comparable day(s) still leaves {g2:+0.00;-0.00;0.00}%, so the attribution between tanks does not explain it either."
                    : "There were no days on which every tank of this grade reconciled together, so the site-level cross-check could not be run.")
                : "No site-level cross-check was possible for this grade.";
            row.Explanation =
                $"A {Math.Abs(pct):0.0}% {direction} against throughput — {Math.Abs(row.TotalVarianceL):N0} L on {row.ThroughputL:N0} L dispensed. "
                + $"That is far too large to be real fuel movement. {groupNote} "
                + "The most likely causes are pumps missing from this tank's mapping, deliveries too small to be detected, or a gauge reading in the wrong units or scale.";
            row.Recommendation = "Treat as a data fault first: check which pumps are mapped to this tank, and confirm the gauge's capacity and tank chart. Do not raise a loss investigation on these numbers.";
            return;
        }

        // 2. A probe that reads differently at different levels fakes a variance.
        if (corr >= MinCorrLevel && row.QuietDays >= MinDaysForShape && absPct >= TolerancePct)
        {
            row.Cause = "probe";
            row.CauseLabel = "Probe / tank chart";
            row.Severity = "warning";
            row.Confidence = corr >= 0.75m ? "high" : "medium";
            row.Explanation =
                $"The daily variance tracks the tank level (correlation {row.CorrWithLevel:+0.00;-0.00}), which physical loss does not do. "
                + $"A gauge that reads high or low at particular depths, or a tank chart that does not match the tank, produces exactly this pattern.";
            row.Recommendation = "Have the probe recalibrated and the tank strapping chart verified before treating these litres as lost.";
            return;
        }

        // 3. The gauge raised its own sudden-loss alarm. Strong corroboration when
        // the reconciliation agrees - but an alarm alone does not make a tank
        // critical if the month's litres balance, so severity follows the litres.
        if (row.SuddenLossCount > 0 && lost)
        {
            var corroborated = absPct >= TolerancePct && t >= MinTStat;
            row.Cause = "sudden_loss";
            row.CauseLabel = corroborated ? "Confirmed sudden loss" : "Sudden-loss alarm only";
            row.Severity = corroborated ? "critical" : "warning";
            row.Confidence = corroborated ? "high" : "medium";
            row.Explanation =
                $"{row.SuddenLossCount} sudden-loss alarm(s) were raised by the gauge itself in this window"
                + (row.SuddenLossLitres.HasValue ? $", totalling {row.SuddenLossLitres:N0} L" : "")
                + ". "
                + (corroborated
                    ? $"The reconciliation agrees: {Math.Abs(row.TotalVarianceL):N0} L unexplained ({pct:+0.00;-0.00;0.00}% of throughput) over {row.QuietDays} day(s)."
                    : (absPct < TolerancePct
                    ? $"The reconciliation does not corroborate it: just {Math.Abs(row.TotalVarianceL):N0} L ({pct:+0.00;-0.00;0.00}% of throughput) over {row.QuietDays} day(s). The fuel came back, so this reads as a probe disturbance rather than lost fuel."
                    : $"The reconciliation cannot confirm it: {Math.Abs(row.TotalVarianceL):N0} L ({pct:+0.00;-0.00;0.00}%) over {row.QuietDays} day(s), but day-to-day scatter is larger than the average itself, so the litres cannot be separated from noise."));
            row.Recommendation = corroborated
                ? "Treat as a live loss: check for theft, siphoning or a line leak, and review the Sudden Loss page for timing."
                : "Check the Sudden Loss page for what the gauge saw, but the month's litres balance — likely a probe disturbance rather than lost fuel.";
            return;
        }

        // 4. Not statistically distinguishable from noise.
        if (absPct < TolerancePct || t < MinTStat)
        {
            row.Cause = "ok";
            row.CauseLabel = "Within tolerance";
            row.Severity = "ok";
            row.Confidence = row.QuietDays >= MinDaysForShape ? "high" : "medium";
            row.Explanation =
                $"{row.TotalVarianceL:+#,##0;-#,##0;0} L over {row.QuietDays} reconciled day(s) on {row.ThroughputL:N0} L of throughput ({pct:+0.00;-0.00;0.00}%). "
                + (t < MinTStat
                    ? "Day-to-day scatter is larger than the average, so there is no consistent bias to explain."
                    : "That is inside the reporting tolerance.");
            row.Recommendation = "No action.";
            return;
        }

        // 5. Proportional to throughput -> the meter is miscounting, not the tank leaking.
        //    Constant per day regardless of throughput -> something physical.
        var slope = row.SlopeVsThroughputPct ?? 0m;
        var explainedBySlope = Math.Abs(slope) >= 0.2m && Math.Sign(slope) == Math.Sign(pct)
                               && Math.Abs(slope) >= Math.Abs(pct) * 0.5m;

        if (explainedBySlope && absPct <= MappingTankPct)
        {
            row.Cause = "meter_drift";
            row.CauseLabel = "Meter drift";
            row.Severity = absPct >= 1m ? "warning" : "info";
            row.Confidence = t >= 6m && row.QuietDays >= MinDaysForShape ? "high" : "medium";
            row.Explanation =
                $"The tank consistently shows a {Math.Abs(pct):0.00}% {direction} against what the pumps recorded, and it scales with throughput ({slope:+0.00;-0.00}% per litre dispensed) rather than with time. "
                + $"That is the signature of meter calibration error: the dispensers are {(lost ? "giving away more fuel than they record" : "recording more than they deliver")}.";
            row.Recommendation = lost
                ? "Have the affected dispenser meters verified and recalibrated — at this rate the loss is proportional to how much you sell."
                : "Have the dispenser meters verified; customers may be being over-charged relative to fuel delivered.";
            return;
        }

        if (row.QuietDays >= MinDaysForShape && Math.Abs(row.MeanDailyVarianceL) >= 50m)
        {
            row.Cause = "constant_loss";
            row.CauseLabel = lost ? "Steady unexplained loss" : "Steady unexplained gain";
            row.Severity = lost ? "critical" : "warning";
            row.Confidence = t >= 6m ? "high" : "medium";
            row.Explanation =
                $"A steady {Math.Abs(row.MeanDailyVarianceL):N0} L/day {direction} that does not scale with throughput ({slope:+0.00;-0.00}% per litre dispensed), so it is not a meter calibration problem. "
                + $"A constant daily {direction} independent of trade points at a physical cause — a leak, an unmetered draw, or fuel moving in or out of the tank unrecorded.";
            row.Recommendation = lost
                ? "Book a line and tank integrity test, and check for unrecorded transfers or manual dips being taken."
                : "Check for unrecorded deliveries or top-ups, and confirm the gauge is not drifting upward.";
            return;
        }

        // 6. Real and consistent, but the shape does not match any known signature.
        row.Cause = "unexplained";
        row.CauseLabel = "Unexplained variance";
        row.Severity = lost ? "warning" : "info";
        row.Confidence = row.QuietDays >= MinDaysForShape ? "medium" : "low";
        row.Explanation =
            $"{row.TotalVarianceL:+#,##0;-#,##0;0} L ({pct:+0.00;-0.00;0.00}% of throughput) over {row.QuietDays} day(s), consistent enough to be real, but it matches neither meter drift, a probe fault nor a steady leak.";
        row.Recommendation = "Review the daily pattern below for a step change, and check deliveries around the worst day.";
    }

    /// <summary>
    /// Mean |residual| on the day after a delivery, over that on other quiet days.
    /// Much above 1 means the variance appears when fuel arrives.
    /// </summary>
    private static decimal? PostDeliveryRatio(List<VarianceDayRow> all)
    {
        var after = new List<decimal>();
        var other = new List<decimal>();
        for (var i = 1; i < all.Count; i++)
        {
            if (all[i].Residual >= DeliveryThresholdL) continue;
            if ((all[i].BusinessDate - all[i - 1].BusinessDate).Days != 1) continue;
            (all[i - 1].Residual >= DeliveryThresholdL ? after : other).Add(Math.Abs(all[i].Residual));
        }
        if (after.Count < 2 || other.Count < 2) return null;
        var otherMean = other.Average();
        if (otherMean <= 0.01m) return null;
        return Math.Round(after.Average() / otherMean, 2);
    }

    private static double StdDev(List<double> xs)
    {
        if (xs.Count < 2) return 0;
        var mean = xs.Average();
        return Math.Sqrt(xs.Sum(x => (x - mean) * (x - mean)) / (xs.Count - 1));
    }

    /// <summary>Least-squares slope of y on x, or null when x barely varies.</summary>
    private static double? Slope(List<double> xs, List<double> ys)
    {
        var n = xs.Count;
        if (n < 3) return null;
        double sx = xs.Sum(), sy = ys.Sum();
        double sxy = 0, sxx = 0;
        for (var i = 0; i < n; i++) { sxy += xs[i] * ys[i]; sxx += xs[i] * xs[i]; }
        var denom = n * sxx - sx * sx;
        if (Math.Abs(denom) < 1e-9) return null;
        return (n * sxy - sx * sy) / denom;
    }

    private static double? Correlation(List<double> xs, List<double> ys)
    {
        var n = xs.Count;
        if (n < 3) return null;
        double sx = xs.Sum(), sy = ys.Sum(), sxy = 0, sxx = 0, syy = 0;
        for (var i = 0; i < n; i++)
        {
            sxy += xs[i] * ys[i];
            sxx += xs[i] * xs[i];
            syy += ys[i] * ys[i];
        }
        var denom = Math.Sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
        if (denom < 1e-9) return null;
        return (n * sxy - sx * sy) / denom;
    }
}
