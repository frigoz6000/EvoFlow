using Dapper;
using EvoFlow.Api.Data;
using Microsoft.AspNetCore.Mvc;

namespace EvoFlow.Api.Controllers;

/// <summary>One tank's reconciliation for one day.</summary>
public class TimelineTankDay
{
    public string TankId { get; set; } = "";
    public string GradeName { get; set; } = "";
    public decimal Opening { get; set; }
    public decimal Closing { get; set; }
    public decimal Capacity { get; set; }
    public decimal Dispensed { get; set; }
    /// <summary>Deliveries are not recorded, so a large positive residual is inferred as one.</summary>
    public decimal? ImpliedDelivery { get; set; }
    public decimal Variance { get; set; }
    public bool Online { get; set; }
    public int? Uptime { get; set; }
    /// <summary>delivery | loss | gain | quiet | gauge_fault</summary>
    public string Status { get; set; } = "quiet";
    public string Narrative { get; set; } = "";
}

/// <summary>A timestamped thing that happened, from SystemEvents or SuddenLossEvents.</summary>
public class TimelineEvent
{
    public DateTime EventDateTime { get; set; }
    public string Source { get; set; } = "";
    public string Category { get; set; } = "";
    public string Text { get; set; } = "";
    public string? DeviceId { get; set; }
    public string? Grp { get; set; }
    /// <summary>tank | pump | pos | system | loss</summary>
    public string Layer { get; set; } = "system";
    /// <summary>critical | warning | info</summary>
    public string Severity { get; set; } = "info";
    public decimal? VolumeLostLitres { get; set; }
}

public class TimelineDayTotals
{
    public decimal Dispensed { get; set; }
    public decimal Delivered { get; set; }
    public decimal Variance { get; set; }
    public decimal ClosingStock { get; set; }
}

/// <summary>
/// Repeated events of one kind collapsed into a single line. A flapping POS can
/// log a hundred entries in a day, which would bury the one alarm that matters.
/// </summary>
public class TimelineEventGroup
{
    public string Category { get; set; } = "";
    public string Layer { get; set; } = "";
    public string Severity { get; set; } = "";
    public int Count { get; set; }
    public DateTime FirstTime { get; set; }
    public DateTime LastTime { get; set; }
    public string SampleText { get; set; } = "";
}

public class TimelineDayFlags
{
    public bool Delivery { get; set; }
    public bool Loss { get; set; }
    public bool GaugeFault { get; set; }
    public bool Critical { get; set; }
}

public class TimelineDay
{
    public DateTime Date { get; set; }
    public List<TimelineTankDay> Tanks { get; set; } = new();
    public List<TimelineEvent> Events { get; set; } = new();
    public List<TimelineEventGroup> EventGroups { get; set; } = new();
    public TimelineDayTotals Totals { get; set; } = new();
    public TimelineDayFlags Flags { get; set; } = new();
}

/// <summary>
/// A site that actually has timestamped events. Typed rather than dynamic so it
/// serialises camelCase like every other response - an untyped Dapper row keeps
/// the raw SQL column names and silently breaks the client.
/// </summary>
/// <summary>Site header for the timeline, plus how much event history it has.</summary>
public class TimelineSiteRow
{
    public string SiteId { get; set; } = "";
    public string SiteName { get; set; } = "";
    public string? City { get; set; }
    public string? PostCode { get; set; }
    public int EventCount { get; set; }
    public int SuddenLossCount { get; set; }
    public DateTime? LastReadingDate { get; set; }
}

public class SiteWithEventsRow
{
    public string SiteId { get; set; } = "";
    public string SiteName { get; set; } = "";
    public int EventCount { get; set; }
    public DateTime? FirstDate { get; set; }
    public DateTime? LastDate { get; set; }
    public int SuddenLossCount { get; set; }
}

// Backs the Fuel Investigation Timeline page (/fuel-timeline).
//
// The roadmap sketch for this feature is minute-by-minute. That is not
// available: TankGauges holds one end-of-day reading per tank and PumpTotals a
// single daily snapshot, so the only genuinely intraday sources are SystemEvents
// and SuddenLossEvents. So the timeline is built in two layers -
//   * a DAY layer: what the litres did (stock moved, dispensed, implied
//     delivery, unaccounted variance), and
//   * a TIMESTAMPED layer: the alarms and device events inside that day,
// which still puts tank movement, deliveries, alarms and losses on one screen
// instead of five, without pretending to a resolution the data does not have.
[ApiController]
[Route("api/fueltimeline")]
public class FuelTimelineController(IDapperConnectionFactory connectionFactory) : ControllerBase
{
    private const decimal SentinelVolume = 100000m;
    private const decimal DeliveryThresholdL = 2000m;
    // Below this a day's variance is ordinary gauge/meter noise, not an event.
    private const decimal QuietVarianceL = 250m;

    private const string TimelineSql = @"
        WITH tg AS (
            SELECT SiteId, TankId, BusinessDate, Gauged, Capacity, Online, Uptime,
                   LAG(Gauged)       OVER (PARTITION BY SiteId, TankId ORDER BY BusinessDate) AS PrevGauged,
                   LAG(BusinessDate) OVER (PARTITION BY SiteId, TankId ORDER BY BusinessDate) AS PrevDate
            FROM TankGauges
            WHERE SiteId = @SiteId
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
              AND pd.SiteId = @SiteId
            GROUP BY pd.SiteId, ptc.TankId, pt.BusinessDate
        ),
        grade AS (
            SELECT SiteId, TankId, GradeName FROM (
                SELECT pd.SiteId, ptc.TankId, ft.Name AS GradeName,
                       ROW_NUMBER() OVER (PARTITION BY pd.SiteId, ptc.TankId ORDER BY COUNT(*) DESC) AS rn
                FROM PumpTankConsumption ptc
                JOIN PumpGradeTotals pg ON pg.PumpGradeTotalsId = ptc.PumpGradeTotalsId
                JOIN PumpTotals      pt ON pt.PumpTotalsId      = pg.PumpTotalsId
                JOIN PumpDevices     pd ON pd.PumpDeviceId      = pt.PumpDeviceId
                LEFT JOIN FuelTypes  ft ON ft.FuelTypeId        = pg.GradeId
                WHERE pt.TotType = 'pump' AND pd.SiteId = @SiteId
                GROUP BY pd.SiteId, ptc.TankId, ft.Name
            ) x WHERE rn = 1
        )
        SELECT tg.BusinessDate, tg.TankId,
               ISNULL(g.GradeName, 'Unknown') AS GradeName,
               tg.Capacity, tg.Online, tg.Uptime,
               ISNULL(tg.PrevGauged, tg.Gauged) AS Opening,
               tg.Gauged AS Closing,
               ISNULL(d.Dispensed, 0) AS Dispensed,
               CASE WHEN tg.PrevGauged IS NULL OR DATEDIFF(day, tg.PrevDate, tg.BusinessDate) <> 1
                    THEN NULL
                    ELSE (tg.Gauged - tg.PrevGauged) + ISNULL(d.Dispensed, 0) END AS Residual
        FROM tg
        LEFT JOIN disp d  ON d.SiteId = tg.SiteId AND d.TankId = tg.TankId AND d.ActivityDate = tg.BusinessDate
        LEFT JOIN grade g ON g.SiteId = tg.SiteId AND g.TankId = tg.TankId
        WHERE tg.BusinessDate BETWEEN @DateFrom AND @DateTo
          AND (@TankId IS NULL OR tg.TankId = @TankId)
        ORDER BY tg.BusinessDate, tg.TankId;

        SELECT se.EventDateTime, 'SystemEvents' AS Source,
               ISNULL(se.EventCategory, 'Event') AS Category,
               ISNULL(se.EventText, '') AS Text,
               se.DeviceId, se.Grp,
               CAST(NULL AS decimal(10,2)) AS VolumeLostLitres
        FROM SystemEvents se
        WHERE se.SiteId = @SiteId
          AND se.EventDate BETWEEN @DateFrom AND @DateTo
          -- A parsed sudden loss is the SAME physical event as the raw gauge
          -- alarm it came from, and carries the litres, so drop the raw row.
          AND NOT EXISTS (
              SELECT 1 FROM SuddenLossEvents sl
              WHERE sl.SystemEventId = se.SystemEventId
          )
        ORDER BY se.EventDateTime;

        SELECT sl.EventDateTime, 'SuddenLossEvents' AS Source,
               CASE WHEN sl.IsPossible = 1 THEN 'Possible sudden loss' ELSE 'Sudden loss' END AS Category,
               ISNULL(sl.EventText, '') AS Text,
               sl.TankId AS DeviceId, '0x04' AS Grp,
               sl.VolumeLostLitres
        FROM SuddenLossEvents sl
        WHERE sl.SiteId = @SiteId
          AND CAST(sl.EventDateTime AS date) BETWEEN @DateFrom AND @DateTo
        ORDER BY sl.EventDateTime;";

    private const string SiteSql = @"
        SELECT s.SiteId, s.SiteName, s.City, s.PostCode,
               (SELECT COUNT(*) FROM SystemEvents e WHERE e.SiteId = s.SiteId)     AS EventCount,
               (SELECT COUNT(*) FROM SuddenLossEvents l WHERE l.SiteId = s.SiteId) AS SuddenLossCount,
               (SELECT MAX(BusinessDate) FROM TankGauges g WHERE g.SiteId = s.SiteId) AS LastReadingDate
        FROM Sites s WHERE s.SiteId = @SiteId";

    /// <summary>Sites that actually have timestamped events, so the page can steer users there.</summary>
    [HttpGet("sites-with-events")]
    public async Task<IActionResult> GetSitesWithEvents()
    {
        using var conn = connectionFactory.CreateConnection();
        var rows = await conn.QueryAsync<SiteWithEventsRow>(@"
            SELECT s.SiteId, s.SiteName,
                   COUNT(se.SystemEventId) AS EventCount,
                   MIN(se.EventDate) AS FirstDate,
                   MAX(se.EventDate) AS LastDate,
                   (SELECT COUNT(*) FROM SuddenLossEvents l WHERE l.SiteId = s.SiteId) AS SuddenLossCount
            FROM SystemEvents se
            JOIN Sites s ON s.SiteId = se.SiteId
            GROUP BY s.SiteId, s.SiteName
            ORDER BY COUNT(se.SystemEventId) DESC");
        return Ok(rows);
    }

    [HttpGet]
    public async Task<IActionResult> Get(
        [FromQuery] string siteId,
        [FromQuery] string? tankId = null,
        [FromQuery] DateOnly? dateFrom = null,
        [FromQuery] DateOnly? dateTo = null)
    {
        if (string.IsNullOrWhiteSpace(siteId))
            return BadRequest(new { message = "siteId is required." });

        using var conn = connectionFactory.CreateConnection();

        var site = await conn.QuerySingleOrDefaultAsync<TimelineSiteRow>(SiteSql, new { SiteId = siteId });
        if (site is null) return NotFound(new { message = $"Site {siteId} not found." });

        var to = dateTo ?? DateOnly.FromDateTime(site.LastReadingDate ?? DateTime.UtcNow);
        var from = dateFrom ?? to.AddDays(-13);
        if (from > to) (from, to) = (to, from);

        using var multi = await conn.QueryMultipleAsync(TimelineSql, new
        {
            SiteId = siteId,
            TankId = string.IsNullOrWhiteSpace(tankId) ? null : tankId,
            DateFrom = from,
            DateTo = to,
            Sentinel = SentinelVolume
        });

        var tankDays = (await multi.ReadAsync()).ToList();
        var sysEvents = (await multi.ReadAsync<TimelineEvent>()).ToList();
        var lossEvents = (await multi.ReadAsync<TimelineEvent>()).ToList();

        var events = sysEvents.Concat(lossEvents).ToList();
        foreach (var e in events) Decorate(e);

        var eventsByDate = events
            .GroupBy(e => DateOnly.FromDateTime(e.EventDateTime))
            .ToDictionary(g => g.Key, g => g.OrderBy(e => e.EventDateTime).ToList());

        var days = new List<TimelineDay>();
        foreach (var dayGroup in tankDays.GroupBy(r => (DateTime)r.BusinessDate).OrderByDescending(g => g.Key))
        {
            var date = DateOnly.FromDateTime(dayGroup.Key);
            var tanks = dayGroup.Select(BuildTankDay).OrderBy(t => t.TankId).ToList();
            eventsByDate.TryGetValue(date, out var dayEvents);

            days.Add(BuildDay(dayGroup.Key, tanks, dayEvents));
        }

        // Events on days with no usable gauge reading would otherwise disappear.
        var orphanDates = eventsByDate.Keys
            .Where(d => !tankDays.Any(r => DateOnly.FromDateTime((DateTime)r.BusinessDate) == d))
            .OrderByDescending(d => d)
            .ToList();
        foreach (var d in orphanDates)
            days.Add(BuildDay(d.ToDateTime(TimeOnly.MinValue), new List<TimelineTankDay>(), eventsByDate[d]));

        return Ok(new
        {
            site,
            dateFrom = from,
            dateTo = to,
            tankId,
            deliveryThresholdL = DeliveryThresholdL,
            summary = new
            {
                days = days.Count,
                events = events.Count,
                deliveries = tankDays.Count(r => r.Residual is decimal res && res >= DeliveryThresholdL),
                criticalEvents = events.Count(e => e.Severity == "critical"),
            },
            days = days.OrderByDescending(d => d.Date).ToList()
        });
    }

    private static TimelineDay BuildDay(
        DateTime date, List<TimelineTankDay> tanks, List<TimelineEvent>? events)
    {
        events ??= new List<TimelineEvent>();
        return new TimelineDay
        {
            Date = date,
            Tanks = tanks,
            Events = events,
            EventGroups = events
                .GroupBy(e => new { e.Category, e.Layer, e.Severity })
                .Select(g => new TimelineEventGroup
                {
                    Category = g.Key.Category,
                    Layer = g.Key.Layer,
                    Severity = g.Key.Severity,
                    Count = g.Count(),
                    FirstTime = g.Min(e => e.EventDateTime),
                    LastTime = g.Max(e => e.EventDateTime),
                    SampleText = g.First().Text,
                })
                .OrderBy(g => SeverityOrder(g.Severity))
                .ThenByDescending(g => g.Count)
                .ToList(),
            Totals = new TimelineDayTotals
            {
                Dispensed = Math.Round(tanks.Sum(t => t.Dispensed), 0),
                Delivered = Math.Round(tanks.Sum(t => t.ImpliedDelivery ?? 0m), 0),
                // Delivery days carry the delivery size in Variance's place, so
                // including them would swamp the day's real unaccounted litres.
                Variance = Math.Round(tanks.Where(t => t.Status != "delivery").Sum(t => t.Variance), 0),
                ClosingStock = Math.Round(tanks.Sum(t => t.Closing), 0),
            },
            Flags = new TimelineDayFlags
            {
                Delivery = tanks.Any(t => t.Status == "delivery"),
                Loss = tanks.Any(t => t.Status == "loss"),
                GaugeFault = tanks.Any(t => t.Status == "gauge_fault"),
                Critical = events.Any(e => e.Severity == "critical"),
            }
        };
    }

    private static int SeverityOrder(string s) =>
        s switch { "critical" => 0, "warning" => 1, _ => 2 };

    private static TimelineTankDay BuildTankDay(dynamic r)
    {
        var tank = new TimelineTankDay
        {
            TankId = (string?)r.TankId ?? "(none)",
            GradeName = (string)r.GradeName,
            Capacity = (decimal)r.Capacity,
            Opening = (decimal)r.Opening,
            Closing = (decimal)r.Closing,
            Dispensed = (decimal)r.Dispensed,
            Online = (bool)r.Online,
            Uptime = (int?)r.Uptime,
        };

        var residual = (decimal?)r.Residual;
        var moved = tank.Closing - tank.Opening;

        if (!tank.Online || (tank.Uptime ?? 0) < 1400)
        {
            tank.Status = "gauge_fault";
            tank.Narrative = $"Gauge unhealthy ({(tank.Online ? $"{tank.Uptime ?? 0} min uptime" : "offline")}), so this day cannot be reconciled.";
            return tank;
        }

        if (residual is null)
        {
            tank.Status = "quiet";
            tank.Narrative = $"No previous day's reading to compare against — {tank.Dispensed:N0} L dispensed, closing at {tank.Closing:N0} L.";
            return tank;
        }

        if (residual.Value >= DeliveryThresholdL)
        {
            tank.ImpliedDelivery = Math.Round(residual.Value, 0);
            tank.Status = "delivery";
            tank.Narrative =
                $"Delivery of about {residual.Value:N0} L inferred: stock went {tank.Opening:N0} → {tank.Closing:N0} L while {tank.Dispensed:N0} L was dispensed. "
                + "No delivery record exists to check this against.";
            return tank;
        }

        tank.Variance = Math.Round(residual.Value, 0);
        var absVar = Math.Abs(residual.Value);
        tank.Status = absVar < QuietVarianceL ? "quiet" : residual.Value < 0 ? "loss" : "gain";
        var pct = tank.Dispensed > 0 ? residual.Value / tank.Dispensed * 100m : 0m;

        tank.Narrative = tank.Status switch
        {
            "quiet" => $"Balanced: stock {(moved >= 0 ? "+" : "")}{moved:N0} L against {tank.Dispensed:N0} L dispensed, {residual.Value:+#,##0;-#,##0;0} L unaccounted.",
            "loss" => $"{absVar:N0} L unaccounted ({pct:0.0}% of throughput): stock fell {Math.Abs(moved):N0} L but only {tank.Dispensed:N0} L was dispensed.",
            _ => $"{absVar:N0} L more than expected ({pct:+0.0}% of throughput) — a small unrecorded delivery or a gauge step.",
        };
        return tank;
    }

    /// <summary>
    /// Works out which layer an event belongs to and how loud it should be.
    /// The DOMS group code is the reliable signal; the text is free-form.
    /// </summary>
    private static void Decorate(TimelineEvent e)
    {
        e.Layer = e.Grp switch
        {
            "0x04" => "tank",
            "0x02" => "pump",
            "0x03" => "pump",
            "0x0b" => "pos",
            _ => "system",
        };
        if (e.Source == "SuddenLossEvents") e.Layer = "loss";

        var category = e.Category ?? "";
        var text = e.Text ?? "";

        e.Severity =
            e.Source == "SuddenLossEvents" ? "critical"
            : category.Contains("Sudden Loss", StringComparison.OrdinalIgnoreCase) ? "critical"
            : category.Contains("Alarm", StringComparison.OrdinalIgnoreCase)
              && !text.Contains("Alarm off", StringComparison.OrdinalIgnoreCase) ? "critical"
            : category.Contains("Error", StringComparison.OrdinalIgnoreCase)
              && !category.Contains("Cleared", StringComparison.OrdinalIgnoreCase) ? "warning"
            : category.Contains("Offline", StringComparison.OrdinalIgnoreCase) ? "warning"
            : "info";

        // Some DOMS events carry only a category, so fall back to it for display.
        if (string.IsNullOrWhiteSpace(e.Text)) e.Text = category;
    }
}
