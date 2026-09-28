using Dapper;
using EvoFlow.Api.Data;
using Microsoft.AspNetCore.Mvc;

namespace EvoFlow.Api.Controllers;

/// <summary>Raw per-tank inputs to the forecast, straight out of SQL.</summary>
public class RunOutBaseRow
{
    public string SiteId { get; set; } = "";
    public string SiteName { get; set; } = "";
    public string? TankId { get; set; }
    public string? GradeId { get; set; }
    public string? GradeName { get; set; }
    public decimal Capacity { get; set; }
    public decimal ShellCapacity { get; set; }
    public decimal Gauged { get; set; }
    public DateTime LastReadingDate { get; set; }
    public int ReadingAgeDays { get; set; }
    public bool Online { get; set; }
    public int? Uptime { get; set; }
    public decimal? WaterHeight { get; set; }
    public int SampleDays { get; set; }
    public decimal? MeanDaily { get; set; }
    public decimal? StdDaily { get; set; }
    public decimal? TypicalCover { get; set; }
}

/// <summary>Per-tank, per-weekday throughput mean (0 = Monday).</summary>
public class DowRow
{
    public string SiteId { get; set; } = "";
    public string? TankId { get; set; }
    public int Dow { get; set; }
    public decimal MeanVol { get; set; }
    public int N { get; set; }
}

public class SeriesPoint
{
    public DateTime Date { get; set; }
    public decimal? Gauged { get; set; }
    public decimal? Dispensed { get; set; }
}

public class ProjectionPoint
{
    public DateTime Date { get; set; }
    public decimal ProjectedStock { get; set; }
    public decimal ExpectedThroughput { get; set; }
}

public class RunOutRow
{
    public string SiteId { get; set; } = "";
    public string SiteName { get; set; } = "";
    public string TankId { get; set; } = "";
    public string? GradeId { get; set; }
    public string GradeName { get; set; } = "";

    public decimal Capacity { get; set; }
    public decimal LastGauged { get; set; }
    public DateTime LastReadingDate { get; set; }
    public int ReadingAgeDays { get; set; }
    public decimal FillPercent { get; set; }

    public decimal MinStockLitres { get; set; }
    /// <summary>Litres above minimum stock at the time of the reading.</summary>
    public decimal UsableStock { get; set; }

    public decimal? AvgDailyThroughput { get; set; }
    public int SampleDays { get; set; }
    /// <summary>Coefficient of variation of daily throughput - how steady the site is.</summary>
    public decimal? ThroughputCv { get; set; }
    public decimal? TomorrowThroughput { get; set; }

    /// <summary>Days the gauged reading lasts, measured from the reading itself.</summary>
    public decimal? DaysOfCover { get; set; }
    /// <summary>Cover left as of the latest loaded date - DaysOfCover less the reading age.</summary>
    public decimal? DaysRemaining { get; set; }
    /// <summary>Median cover this tank normally runs at, so "low" can mean low for this tank.</summary>
    public decimal? TypicalDaysOfCover { get; set; }
    public bool BelowTypical { get; set; }

    public DateTime? RunOutDate { get; set; }
    public DateTime? RecommendedDeliveryDate { get; set; }
    public decimal? RecommendedVolume { get; set; }

    /// <summary>critical | warning | ok | expired | gauge_suspect | no_data</summary>
    public string Status { get; set; } = "no_data";
    /// <summary>high | medium | low | none</summary>
    public string Confidence { get; set; } = "none";
    public string Explanation { get; set; } = "";
}

// Backs the Run-out Prediction page (/run-out-prediction).
//
// Forecast, per tank:
//   1. Take the most recent gauged reading.
//   2. Take mean daily throughput over the lookback window from
//      PumpTankConsumption, applying the +1 day report/activity offset that
//      dbo.GetVolumeDiscrepancies also uses.
//   3. Shape it by a day-of-week index (the tank's own where there are enough
//      samples, otherwise the estate-wide profile).
//   4. Walk forward a day at a time to find when usable stock runs out.
//
// The projection deliberately assumes NO further deliveries, because nothing in
// the database records planned or actual deliveries. That is what makes the
// output actionable: it answers "when must fuel arrive by".
[ApiController]
[Route("api/runoutprediction")]
public class RunOutPredictionController(IDapperConnectionFactory connectionFactory) : ControllerBase
{
    // Volumes above this are DOMS sentinel / rollover meter readings, not litres.
    private const decimal SentinelVolume = 100000m;
    // Thin per-weekday samples produce silly multipliers, so keep them sane.
    private const decimal MinDowIndex = 0.55m;
    private const decimal MaxDowIndex = 1.60m;
    private const int MinDowSamples = 2;
    // Never plan a delivery that would overfill the tank.
    private const decimal SafeFillFraction = 0.95m;
    // Give up walking forward past this horizon.
    private const int MaxHorizonDays = 60;

    private const string BaseSql = @"
        WITH latest AS (
            SELECT SiteId, TankId, Gauged, Capacity, ShellCapacity, Online, Uptime, WaterHeight,
                   BusinessDate AS LastReadingDate,
                   ROW_NUMBER() OVER (PARTITION BY SiteId, TankId ORDER BY BusinessDate DESC) AS rn
            FROM TankGauges
            WHERE (@SiteId IS NULL OR SiteId = @SiteId)
        ),
        daily AS (
            SELECT pd.SiteId,
                   ptc.TankId,
                   DATEADD(day, -1, pt.BusinessDate) AS ActivityDate,
                   SUM(ptc.VolumeDiff) AS Vol
            FROM PumpTankConsumption ptc
            JOIN PumpGradeTotals pg ON pg.PumpGradeTotalsId = ptc.PumpGradeTotalsId
            JOIN PumpTotals      pt ON pt.PumpTotalsId      = pg.PumpTotalsId
            JOIN PumpDevices     pd ON pd.PumpDeviceId      = pt.PumpDeviceId
            WHERE pt.TotType = 'pump'
              AND ptc.VolumeDiff BETWEEN 0 AND @Sentinel
              AND pt.BusinessDate >  DATEADD(day, -@LookbackDays, @Today)
              AND pt.BusinessDate <= DATEADD(day, 1, @Today)
              AND (@SiteId IS NULL OR pd.SiteId = @SiteId)
            GROUP BY pd.SiteId, ptc.TankId, pt.BusinessDate
        ),
        thru AS (
            SELECT SiteId, TankId, COUNT(*) AS SampleDays, AVG(Vol) AS MeanDaily, STDEV(Vol) AS StdDaily
            FROM daily GROUP BY SiteId, TankId
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
        SELECT l.SiteId, s.SiteName, l.TankId, g.GradeId, g.GradeName,
               l.Capacity, l.ShellCapacity, l.Gauged, l.LastReadingDate,
               DATEDIFF(day, l.LastReadingDate, @Today) AS ReadingAgeDays,
               l.Online, l.Uptime, l.WaterHeight,
               ISNULL(t.SampleDays, 0) AS SampleDays, t.MeanDaily, t.StdDaily,
               typ.TypicalCover
        FROM latest l
        JOIN Sites s       ON s.SiteId = l.SiteId
        LEFT JOIN thru  t  ON t.SiteId = l.SiteId AND t.TankId = l.TankId
        LEFT JOIN grade g  ON g.SiteId = l.SiteId AND g.TankId = l.TankId
        -- Median cover this tank normally runs at. A site that takes a delivery
        -- every day always has ~1 day of cover; that is routine, not an alert.
        OUTER APPLY (
            SELECT MAX(p.Cov) AS TypicalCover
            FROM (
                SELECT DISTINCT PERCENTILE_CONT(0.5) WITHIN GROUP (
                           ORDER BY (h.Gauged - h.Capacity * @MinStockPct / 100.0) / t.MeanDaily
                       ) OVER () AS Cov
                FROM TankGauges h
                WHERE h.SiteId = l.SiteId AND h.TankId = l.TankId
                  AND h.Online = 1 AND h.Uptime >= 60 AND h.Gauged > 0
                  AND t.MeanDaily > 0
                  AND h.BusinessDate > DATEADD(day, -@LookbackDays, @Today)
            ) p
        ) typ
        WHERE l.rn = 1;

        -- Per-tank day-of-week profile. DATEDIFF from 1900-01-01 (a Monday) keeps
        -- the weekday number independent of the server's DATEFIRST setting.
        SELECT SiteId, TankId,
               (DATEDIFF(day, '19000101', ActivityDate) % 7) AS Dow,
               AVG(Vol) AS MeanVol, COUNT(*) AS N
        FROM (
            SELECT pd.SiteId, ptc.TankId,
                   DATEADD(day, -1, pt.BusinessDate) AS ActivityDate,
                   SUM(ptc.VolumeDiff) AS Vol
            FROM PumpTankConsumption ptc
            JOIN PumpGradeTotals pg ON pg.PumpGradeTotalsId = ptc.PumpGradeTotalsId
            JOIN PumpTotals      pt ON pt.PumpTotalsId      = pg.PumpTotalsId
            JOIN PumpDevices     pd ON pd.PumpDeviceId      = pt.PumpDeviceId
            WHERE pt.TotType = 'pump'
              AND ptc.VolumeDiff BETWEEN 0 AND @Sentinel
              AND pt.BusinessDate >  DATEADD(day, -@LookbackDays, @Today)
              AND pt.BusinessDate <= DATEADD(day, 1, @Today)
              AND (@SiteId IS NULL OR pd.SiteId = @SiteId)
            GROUP BY pd.SiteId, ptc.TankId, pt.BusinessDate
        ) d
        GROUP BY SiteId, TankId, (DATEDIFF(day, '19000101', ActivityDate) % 7);

        -- Estate-wide weekday index, used when a tank has too few samples of its own.
        SELECT '' AS SiteId, NULL AS TankId,
               (DATEDIFF(day, '19000101', ActivityDate) % 7) AS Dow,
               AVG(Vol) AS MeanVol, COUNT(*) AS N
        FROM (
            SELECT pd.SiteId, ptc.TankId,
                   DATEADD(day, -1, pt.BusinessDate) AS ActivityDate,
                   SUM(ptc.VolumeDiff) AS Vol
            FROM PumpTankConsumption ptc
            JOIN PumpGradeTotals pg ON pg.PumpGradeTotalsId = ptc.PumpGradeTotalsId
            JOIN PumpTotals      pt ON pt.PumpTotalsId      = pg.PumpTotalsId
            JOIN PumpDevices     pd ON pd.PumpDeviceId      = pt.PumpDeviceId
            WHERE pt.TotType = 'pump'
              AND ptc.VolumeDiff BETWEEN 0 AND @Sentinel
              AND pt.BusinessDate > DATEADD(day, -@LookbackDays, @Today)
            GROUP BY pd.SiteId, ptc.TankId, pt.BusinessDate
        ) d
        WHERE Vol > 0
        GROUP BY (DATEDIFF(day, '19000101', ActivityDate) % 7);";

    // The dataset is imported in batches and lags real time, so "today" is the
    // newest activity date we hold rather than the wall clock. Using GETDATE()
    // would silently treat an import gap as days of unrecorded selling.
    private const string TodaySql = @"
        SELECT MAX(d) FROM (
            SELECT DATEADD(day, -1, MAX(BusinessDate)) AS d FROM PumpTotals
            UNION ALL
            SELECT MAX(BusinessDate) FROM TankGauges
        ) x";

    private const string SeriesSql = @"
        SELECT tg.BusinessDate AS Date, tg.Gauged, disp.Vol AS Dispensed
        FROM TankGauges tg
        OUTER APPLY (
            SELECT SUM(ptc.VolumeDiff) AS Vol
            FROM PumpTankConsumption ptc
            JOIN PumpGradeTotals pg ON pg.PumpGradeTotalsId = ptc.PumpGradeTotalsId
            JOIN PumpTotals      pt ON pt.PumpTotalsId      = pg.PumpTotalsId
            JOIN PumpDevices     pd ON pd.PumpDeviceId      = pt.PumpDeviceId
            WHERE pt.TotType = 'pump'
              AND pd.SiteId  = tg.SiteId
              AND ptc.TankId = tg.TankId
              AND ptc.VolumeDiff BETWEEN 0 AND @Sentinel
              AND pt.BusinessDate = DATEADD(day, 1, tg.BusinessDate)
        ) disp
        WHERE tg.SiteId = @SiteId AND tg.TankId = @TankId
          AND tg.BusinessDate > DATEADD(day, -@Days, @Today)
        ORDER BY tg.BusinessDate";

    private record Forecast(
        RunOutRow Row,
        decimal[] DowIndex,
        List<ProjectionPoint> Projection);

    [HttpGet]
    public async Task<IActionResult> Get(
        [FromQuery] string? siteId = null,
        [FromQuery] int lookbackDays = 28,
        [FromQuery] decimal minStockPct = 5m,
        [FromQuery] decimal criticalDays = 1m,
        [FromQuery] decimal warningDays = 2m)
    {
        lookbackDays = Math.Clamp(lookbackDays, 7, 180);
        minStockPct = Math.Clamp(minStockPct, 0m, 50m);

        using var conn = connectionFactory.CreateConnection();
        var today = await conn.ExecuteScalarAsync<DateTime?>(TodaySql);
        if (today is null) return Ok(new { asOf = (DateTime?)null, rows = Array.Empty<RunOutRow>() });

        var (bases, tankDow, estateIndex) = await LoadAsync(conn, siteId, lookbackDays, today.Value, minStockPct);

        var rows = bases
            .Select(b => Build(b, tankDow, estateIndex, today.Value, minStockPct, criticalDays, warningDays).Row)
            .OrderBy(r => StatusRank(r.Status))
            .ThenBy(r => r.DaysRemaining ?? decimal.MaxValue)
            .ThenBy(r => r.SiteId)
            .ThenBy(r => r.TankId)
            .ToList();

        return Ok(new
        {
            asOf = today.Value,
            lookbackDays,
            minStockPct,
            criticalDays,
            warningDays,
            summary = new
            {
                tanks = rows.Count,
                critical = rows.Count(r => r.Status == "critical"),
                warning = rows.Count(r => r.Status == "warning"),
                ok = rows.Count(r => r.Status == "ok"),
                expired = rows.Count(r => r.Status == "expired"),
                belowTypical = rows.Count(r => r.BelowTypical),
                gaugeSuspect = rows.Count(r => r.Status == "gauge_suspect"),
                noData = rows.Count(r => r.Status == "no_data"),
            },
            rows
        });
    }

    [HttpGet("{siteId}/{tankId}/detail")]
    public async Task<IActionResult> GetDetail(
        string siteId,
        string tankId,
        [FromQuery] int lookbackDays = 28,
        [FromQuery] decimal minStockPct = 5m,
        [FromQuery] decimal criticalDays = 1m,
        [FromQuery] decimal warningDays = 2m,
        [FromQuery] int historyDays = 30)
    {
        lookbackDays = Math.Clamp(lookbackDays, 7, 180);
        minStockPct = Math.Clamp(minStockPct, 0m, 50m);
        historyDays = Math.Clamp(historyDays, 7, 180);

        using var conn = connectionFactory.CreateConnection();
        var today = await conn.ExecuteScalarAsync<DateTime?>(TodaySql);
        if (today is null) return NotFound(new { message = "No data loaded." });

        var (bases, tankDow, estateIndex) = await LoadAsync(conn, siteId, lookbackDays, today.Value, minStockPct);
        var b = bases.FirstOrDefault(x => x.TankId == tankId);
        if (b is null) return NotFound(new { message = $"No tank {tankId} at site {siteId}." });

        var forecast = Build(b, tankDow, estateIndex, today.Value, minStockPct, criticalDays, warningDays);

        var history = (await conn.QueryAsync<SeriesPoint>(SeriesSql,
            new { SiteId = siteId, TankId = tankId, Days = historyDays, Today = today.Value, Sentinel = SentinelVolume }))
            .ToList();

        return Ok(new
        {
            asOf = today.Value,
            tank = forecast.Row,
            dowIndex = forecast.DowIndex,
            history,
            projection = forecast.Projection
        });
    }

    private static async Task<(List<RunOutBaseRow>, ILookup<string, DowRow>, decimal[])> LoadAsync(
        System.Data.IDbConnection conn, string? siteId, int lookbackDays, DateTime today, decimal minStockPct)
    {
        using var multi = await conn.QueryMultipleAsync(BaseSql,
            new { SiteId = siteId, LookbackDays = lookbackDays, Today = today, Sentinel = SentinelVolume, MinStockPct = minStockPct });

        var bases = (await multi.ReadAsync<RunOutBaseRow>()).ToList();
        var dowRows = (await multi.ReadAsync<DowRow>()).ToList();
        var estateRows = (await multi.ReadAsync<DowRow>()).ToList();

        var tankDow = dowRows.ToLookup(d => TankKey(d.SiteId, d.TankId));

        // Normalise the estate weekday means into multipliers around 1.0.
        var estateIndex = Enumerable.Repeat(1m, 7).ToArray();
        if (estateRows.Count > 0)
        {
            var overall = estateRows.Average(r => r.MeanVol);
            if (overall > 0)
                foreach (var r in estateRows.Where(r => r.Dow is >= 0 and < 7))
                    estateIndex[r.Dow] = Math.Clamp(r.MeanVol / overall, MinDowIndex, MaxDowIndex);
        }

        return (bases, tankDow, estateIndex);
    }

    private static string TankKey(string siteId, string? tankId) => $"{siteId}|{tankId}";

    private static int StatusRank(string status) => status switch
    {
        "critical" => 0,
        "warning" => 1,
        "expired" => 2,
        "gauge_suspect" => 3,
        "ok" => 4,
        _ => 5
    };

    private static Forecast Build(
        RunOutBaseRow b,
        ILookup<string, DowRow> tankDow,
        decimal[] estateIndex,
        DateTime today,
        decimal minStockPct,
        decimal criticalDays,
        decimal warningDays)
    {
        var row = new RunOutRow
        {
            SiteId = b.SiteId,
            SiteName = b.SiteName,
            TankId = string.IsNullOrWhiteSpace(b.TankId) ? "(none)" : b.TankId,
            GradeId = b.GradeId,
            GradeName = string.IsNullOrWhiteSpace(b.GradeName) ? "Unknown" : b.GradeName,
            Capacity = b.Capacity,
            LastGauged = b.Gauged,
            LastReadingDate = b.LastReadingDate,
            ReadingAgeDays = b.ReadingAgeDays,
            FillPercent = b.Capacity > 0 ? Math.Round(b.Gauged / b.Capacity * 100m, 1) : 0m,
            SampleDays = b.SampleDays,
            AvgDailyThroughput = b.MeanDaily.HasValue ? Math.Round(b.MeanDaily.Value, 0) : null,
            MinStockLitres = Math.Round(b.Capacity * minStockPct / 100m, 0),
        };
        row.UsableStock = Math.Round(Math.Max(0m, b.Gauged - row.MinStockLitres), 0);
        row.TypicalDaysOfCover = b.TypicalCover.HasValue
            ? Math.Round(Math.Max(0m, b.TypicalCover.Value), 1)
            : null;

        if (b.MeanDaily is > 0)
            row.ThroughputCv = Math.Round((b.StdDaily ?? 0m) / b.MeanDaily.Value, 2);

        // A dead or barely-reporting probe reads zero; that is not an empty tank,
        // and calling it a run-out would send someone to the wrong emergency.
        var gaugeSuspect = !b.Online
            || (b.Uptime ?? 0) < 60
            || (b.Gauged <= 0 && b.SampleDays > 0);

        var dowIndex = BuildDowIndex(b, tankDow, estateIndex);

        if (b.MeanDaily is null or <= 0)
        {
            row.Status = gaugeSuspect ? "gauge_suspect" : "no_data";
            row.Confidence = "none";
            row.Explanation = gaugeSuspect
                ? BuildGaugeExplanation(b)
                : "No dispensed volume recorded against this tank in the lookback window, so throughput is unknown and no run-out can be forecast.";
            return new Forecast(row, dowIndex, new List<ProjectionPoint>());
        }

        var baseRate = b.MeanDaily.Value;
        row.TomorrowThroughput = Math.Round(baseRate * dowIndex[DowOf(today.AddDays(1))], 0);

        // Deplete the gauged reading day by day FROM THE READING DATE. Cover is a
        // property of that reading, so the reading's age must not be baked into it
        // as well as subtracted from it later - that would count the lag twice.
        var stock = b.Gauged;
        var projection = new List<ProjectionPoint>();
        DateTime? runOutDate = null;
        decimal? daysOfCover = null;

        for (var i = 1; i <= MaxHorizonDays; i++)
        {
            var date = b.LastReadingDate.AddDays(i);
            var draw = baseRate * dowIndex[DowOf(date)];
            var opening = stock;
            stock = Math.Max(0m, stock - draw);

            projection.Add(new ProjectionPoint
            {
                Date = date,
                ProjectedStock = Math.Round(stock, 0),
                ExpectedThroughput = Math.Round(draw, 0)
            });

            if (runOutDate is null && opening > row.MinStockLitres && stock <= row.MinStockLitres)
            {
                runOutDate = date;
                // Interpolate within the day so cover reads 2.4 days, not 2 or 3.
                var usableAtOpen = opening - row.MinStockLitres;
                var fraction = draw > 0 ? Math.Clamp(usableAtOpen / draw, 0m, 1m) : 0m;
                daysOfCover = Math.Round(i - 1 + fraction, 1);
                break;
            }

            if (stock <= 0) break;
        }

        row.RunOutDate = runOutDate;
        row.DaysOfCover = daysOfCover;
        row.DaysRemaining = daysOfCover.HasValue
            ? Math.Round(daysOfCover.Value - b.ReadingAgeDays, 1)
            : null;

        row.BelowTypical = row.DaysOfCover.HasValue
            && row.TypicalDaysOfCover is > 0
            && row.DaysOfCover.Value < row.TypicalDaysOfCover.Value * 0.6m;

        if (runOutDate.HasValue && runOutDate.Value >= today)
        {
            // Latest day fuel can still arrive without dropping through minimum stock.
            var recommended = runOutDate.Value.AddDays(-1);
            row.RecommendedDeliveryDate = recommended < today ? today : recommended;

            var stockOnDelivery = projection
                .FirstOrDefault(p => p.Date == row.RecommendedDeliveryDate)?.ProjectedStock ?? b.Gauged;

            var target = (b.ShellCapacity > 0 ? b.ShellCapacity : b.Capacity) * SafeFillFraction;
            var volume = target - stockOnDelivery;
            // Tankers are ordered in round numbers, not to the litre.
            row.RecommendedVolume = volume > 0 ? Math.Floor(volume / 500m) * 500m : 0m;
        }

        // A forecast whose run-out has already passed says nothing about now: the
        // tank was either delivered or ran dry days ago. Calling that "critical"
        // would bury the tanks that genuinely need a tanker today.
        row.Status = gaugeSuspect ? "gauge_suspect"
            : row.DaysRemaining is null ? "ok"
            : row.DaysRemaining < 0m ? "expired"
            : row.DaysRemaining <= criticalDays ? "critical"
            : row.DaysRemaining <= warningDays ? "warning"
            : "ok";

        row.Confidence = gaugeSuspect ? "low" : Confidence(b, row);
        row.Explanation = gaugeSuspect ? BuildGaugeExplanation(b) : BuildExplanation(b, row, today);

        return new Forecast(row, dowIndex, projection);
    }

    private static decimal[] BuildDowIndex(RunOutBaseRow b, ILookup<string, DowRow> tankDow, decimal[] estateIndex)
    {
        var index = (decimal[])estateIndex.Clone();
        var own = tankDow[TankKey(b.SiteId, b.TankId)].Where(d => d.Dow is >= 0 and < 7).ToList();
        if (own.Count == 0 || b.MeanDaily is null or <= 0) return index;

        foreach (var d in own.Where(d => d.N >= MinDowSamples))
            index[d.Dow] = Math.Clamp(d.MeanVol / b.MeanDaily.Value, MinDowIndex, MaxDowIndex);

        return index;
    }

    private static int DowOf(DateTime d) => ((int)d.DayOfWeek + 6) % 7; // 0 = Monday

    private static string Plural(int n, string noun) => $"{n:N0} {noun}{(n == 1 ? "" : "s")}";

    private static string Confidence(RunOutBaseRow b, RunOutRow row)
    {
        var cv = row.ThroughputCv ?? 1m;
        if (b.SampleDays >= 21 && cv <= 0.35m && b.ReadingAgeDays <= 2) return "high";
        if (b.SampleDays < 7 || cv > 0.60m || b.ReadingAgeDays > 7) return "low";
        return "medium";
    }

    private static string BuildGaugeExplanation(RunOutBaseRow b)
    {
        var reasons = new List<string>();
        if (!b.Online) reasons.Add("the gauge is offline");
        if ((b.Uptime ?? 0) < 60) reasons.Add($"it reported only {b.Uptime ?? 0} minutes of uptime");
        if (b.Gauged <= 0) reasons.Add("it is reading zero litres while the pumps are still dispensing");
        return $"Reading not trusted because {string.Join(" and ", reasons)}. Fix the probe before relying on a forecast for this tank.";
    }

    private static string BuildExplanation(RunOutBaseRow b, RunOutRow row, DateTime today)
    {
        var parts = new List<string>
        {
            $"Gauged {b.Gauged:N0} L on {b.LastReadingDate:ddd d MMM}"
                + (b.ReadingAgeDays > 0 ? $" ({Plural(b.ReadingAgeDays, "day")} before the latest loaded data)." : "."),
            $"Averaging {row.AvgDailyThroughput:N0} L/day over {Plural(b.SampleDays, "day")} of history."
        };

        if (row.RunOutDate.HasValue)
            parts.Add($"That reading covers {row.DaysOfCover:0.0} days, reaching minimum stock ({row.MinStockLitres:N0} L) on {row.RunOutDate:ddd d MMM} if nothing is delivered.");
        else
            parts.Add($"Stays above minimum stock for at least {MaxHorizonDays} days at this rate.");

        if (row.Status == "expired")
            parts.Add("That date has already passed, so the tank has almost certainly been delivered since - this forecast is stale rather than urgent, and a fresh gauge reading is needed.");

        if (row.TypicalDaysOfCover is > 0)
        {
            parts.Add(row.BelowTypical
                ? $"This tank normally holds about {row.TypicalDaysOfCover:0.0} days of cover, so it is unusually low."
                : $"This tank normally runs at about {row.TypicalDaysOfCover:0.0} days of cover.");
        }

        if (row.ThroughputCv > 0.5m)
            parts.Add("Daily throughput is volatile, so treat the date as indicative.");

        return string.Join(" ", parts);
    }
}
