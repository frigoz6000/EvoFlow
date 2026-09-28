using Dapper;
using EvoFlow.Api.Data;
using Microsoft.AspNetCore.Mvc;

namespace EvoFlow.Api.Controllers;

/// <summary>
/// One data source the "New Ideas" roadmap depends on, with a live view of
/// whether the database actually holds enough of it to build on.
/// </summary>
public class DataReadinessRow
{
    public string Key { get; set; } = "";
    public string Label { get; set; } = "";
    public string Source { get; set; } = "";
    /// <summary>ready | partial | missing</summary>
    public string Status { get; set; } = "missing";
    public long Rows { get; set; }
    public DateTime? FirstDate { get; set; }
    public DateTime? LastDate { get; set; }
    public string Note { get; set; } = "";
}

public class ProbeResult
{
    public string Key { get; set; } = "";
    public long Rows { get; set; }
    public DateTime? FirstDate { get; set; }
    public DateTime? LastDate { get; set; }
}

// Backs the New Ideas page (/new-ideas). Everything here is read-only probing:
// it counts what is in the database today so the roadmap's readiness badges
// reflect reality rather than a hardcoded snapshot. If a missing table (e.g.
// Deliveries) is added later, its probe flips off "missing" on the next load.
[ApiController]
[Route("api/newideas")]
public class NewIdeasController(IDapperConnectionFactory connectionFactory) : ControllerBase
{
    // Volumes above this are DOMS sentinel / rollover meter readings rather than
    // real litres - same idea as @MaxPumpVolume in dbo.GetVolumeDiscrepancies.
    private const decimal SentinelVolume = 100000m;

    private const string ProbeSql = @"
        SELECT 'sites' AS [Key], COUNT_BIG(*) AS [Rows], NULL AS FirstDate, NULL AS LastDate FROM Sites
        UNION ALL SELECT 'tank_readings', COUNT_BIG(*), MIN(BusinessDate), MAX(BusinessDate) FROM TankGauges
        UNION ALL SELECT 'tank_water', COUNT_BIG(*), MIN(BusinessDate), MAX(BusinessDate) FROM TankGauges WHERE WaterHeight > 0 OR WaterVol > 0
        UNION ALL SELECT 'tank_temp', COUNT_BIG(*), NULL, NULL FROM TankGauges WHERE Temp <> 0
        UNION ALL SELECT 'tank_capacity', COUNT_BIG(*), NULL, NULL FROM TankGauges WHERE Capacity > 0
        UNION ALL SELECT 'tank_gauge_health', COUNT_BIG(*), NULL, NULL FROM TankGauges WHERE Online = 0 OR Uptime < 1440
        UNION ALL SELECT 'pump_dispensed', COUNT_BIG(*), MIN(pt.BusinessDate), MAX(pt.BusinessDate)
            FROM PumpTankConsumption ptc
            JOIN PumpGradeTotals pg ON pg.PumpGradeTotalsId = ptc.PumpGradeTotalsId
            JOIN PumpTotals pt      ON pt.PumpTotalsId      = pg.PumpTotalsId
            WHERE pt.TotType = 'pump' AND ptc.VolumeDiff BETWEEN 0 AND @SentinelVolume
        UNION ALL SELECT 'pump_vs_fp', COUNT_BIG(*), MIN(BusinessDate), MAX(BusinessDate) FROM PumpTotals WHERE TotType = 'fp'
        UNION ALL SELECT 'flow_rates', COUNT_BIG(*), NULL, NULL FROM PumpFlowInfo WHERE AvgFlowRate > 0
        UNION ALL SELECT 'flow_nominal', COUNT_BIG(*), NULL, NULL FROM PumpFlowInfo WHERE NominalFlowRate > 0
        UNION ALL SELECT 'pump_health', COUNT_BIG(*), MIN(DomsDate), MAX(DomsDate) FROM DomsInfoSnapshot
        UNION ALL SELECT 'system_events', COUNT_BIG(*), MIN(EventDate), MAX(EventDate) FROM SystemEvents
        UNION ALL SELECT 'sudden_loss', COUNT_BIG(*), MIN(CAST(EventDateTime AS date)), MAX(CAST(EventDateTime AS date)) FROM SuddenLossEvents
        UNION ALL SELECT 'retail_prices', COUNT_BIG(*), NULL, NULL FROM FuelGradePrices WHERE GradeUnitPrice > 0
        UNION ALL SELECT 'price_history', COUNT_BIG(*), NULL, NULL FROM FuelGradePriceHistory
        UNION ALL SELECT 'pos_transactions', COUNT_BIG(*), MIN(BusinessDate), MAX(BusinessDate) FROM FuelRecords";

    // One row per tank per day today, so anything intraday (delivery windows,
    // overnight loss, hour-of-day forecasting) has nothing to work with.
    private const string GranularitySql = @"
        SELECT CAST(ISNULL(AVG(CAST(n AS float)), 0) AS decimal(10,2))
        FROM (SELECT COUNT_BIG(*) AS n FROM TankGauges GROUP BY SiteId, TankId, BusinessDate) x";

    private const string DeliveriesTableSql = @"
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME IN ('Deliveries', 'TankDeliveries', 'FuelDeliveries')";

    private const string CostPriceColumnSql = @"
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
        WHERE COLUMN_NAME IN ('CostPrice', 'GradeCostPrice', 'WholesalePrice', 'BuyPrice')";

    [HttpGet("data-readiness")]
    public async Task<IActionResult> GetDataReadiness()
    {
        using var conn = connectionFactory.CreateConnection();

        var probes = (await conn.QueryAsync<ProbeResult>(ProbeSql, new { SentinelVolume }))
            .ToDictionary(p => p.Key);

        var readingsPerTankDay = await conn.ExecuteScalarAsync<decimal>(GranularitySql);
        var hasDeliveriesTable = await conn.ExecuteScalarAsync<int>(DeliveriesTableSql) > 0;
        var hasCostPriceColumn = await conn.ExecuteScalarAsync<int>(CostPriceColumnSql) > 0;

        DataReadinessRow Probe(string key, string label, string source, string note, long partialBelow = 0)
        {
            probes.TryGetValue(key, out var p);
            var rows = p?.Rows ?? 0;
            var status = rows == 0 ? "missing" : rows < partialBelow ? "partial" : "ready";
            return new DataReadinessRow
            {
                Key = key,
                Label = label,
                Source = source,
                Status = status,
                Rows = rows,
                FirstDate = p?.FirstDate,
                LastDate = p?.LastDate,
                Note = note
            };
        }

        var sources = new List<DataReadinessRow>
        {
            Probe("sites", "Sites", "Sites",
                "Site master data, opening hours and map location."),
            Probe("tank_readings", "Tank gauge readings", "TankGauges",
                $"End-of-day gauged volume, ullage and product height per tank, at {readingsPerTankDay:0.0} reading(s) per tank per day."),
            Probe("pump_dispensed", "Dispensed volume per tank", "PumpTankConsumption > PumpGradeTotals > PumpTotals",
                "Daily litres drawn from each tank. This is the 'sales' side of reconciliation."),
            Probe("pump_vs_fp", "Pump vs fuelling-point totals", "PumpTotals (TotType 'pump' / 'fp')",
                "Already powers Volume Discrepancies - meter-side vs recorded-side gap."),
            Probe("flow_rates", "Measured nozzle flow rates", "PumpFlowInfo (AvgFlowRate, PeakFlowRate)",
                "Average and peak flow rate per grade at normal and high speed, plus time-to-flow and time-to-peak-flow."),
            Probe("flow_nominal", "Nominal (expected) flow rate", "PumpFlowInfo.NominalFlowRate",
                "Imported as 0.00 on every row, so there is no manufacturer baseline to measure degradation against - it would have to be derived from each nozzle's own rolling history."),
            Probe("pump_health", "Pump / device health", "DomsInfoSnapshot",
                "Device status, offline counts, error text, uptime and zero transactions."),
            Probe("tank_gauge_health", "Tank gauge health", "TankGauges (Online, OfflineCount, Uptime)",
                "Probe online flag, offline count and daily uptime minutes. Row count here is the number of readings that were actually degraded, so the signal is real and non-trivial."),
            Probe("system_events", "System events", "SystemEvents",
                "Categorised DOMS event log - alarms, online/offline, leakage tests, price changes."),
            Probe("sudden_loss", "Sudden loss alarms", "SuddenLossEvents",
                "Litres lost, duration and rate, parsed from Veeder-Root PSS alarms. Real but very sparse.", partialBelow: 100),
            Probe("tank_temp", "Tank temperature", "TankGauges.Temp",
                "Needed for temperature-corrected volume rather than raw litres."),
            Probe("tank_capacity", "Tank capacity / chart", "TankGauges (Capacity, TankHeight, ShellCapacity)",
                "Needed for ullage, fill %, run-out prediction and delivery sizing."),
            Probe("tank_water", "Water in tank", "TankGauges (WaterVol, WaterHeight)",
                "Columns exist and are imported, but almost every reading is zero.", partialBelow: 500),
            Probe("retail_prices", "Retail fuel prices", "FuelGradePrices",
                "Current pump price per grade per site - enough to value a loss at retail."),
            Probe("price_history", "Retail price history", "FuelGradePriceHistory",
                "Table exists but is empty, so a historical loss cannot be valued at the price of the day."),
            Probe("pos_transactions", "POS transactions", "FuelRecords",
                "Table, controller and UI already exist, but no rows have ever been imported."),
        };

        probes.TryGetValue("tank_readings", out var tankProbe);

        sources.Add(new DataReadinessRow
        {
            Key = "intraday_tank",
            Label = "Intraday tank level series",
            Source = "TankGauges (one end-of-day row per tank)",
            Status = readingsPerTankDay >= 4 ? "ready" : readingsPerTankDay >= 2 ? "partial" : "missing",
            Rows = tankProbe?.Rows ?? 0,
            FirstDate = tankProbe?.FirstDate,
            LastDate = tankProbe?.LastDate,
            Note = $"Averaging {readingsPerTankDay:0.0} reading(s) per tank per day. Delivery detection, overnight loss and investigation timelines need a level every few minutes."
        });

        sources.Add(new DataReadinessRow
        {
            Key = "deliveries",
            Label = "Fuel deliveries",
            Source = hasDeliveriesTable ? "Deliveries table found" : "No deliveries table exists in the database",
            Status = hasDeliveriesTable ? "partial" : "missing",
            Rows = 0,
            Note = "Nothing records ordered / delivered / BOL quantities, so a delivery can only be inferred from an overnight jump in tank level."
        });

        sources.Add(new DataReadinessRow
        {
            Key = "cost_prices",
            Label = "Wholesale / cost price",
            Source = hasCostPriceColumn ? "Cost price column found" : "No cost price column exists anywhere in the schema",
            Status = hasCostPriceColumn ? "partial" : "missing",
            Rows = 0,
            Note = "Only retail price is stored, so a loss can be valued at retail but margin impact cannot be calculated."
        });

        return Ok(new
        {
            generatedUtc = DateTime.UtcNow,
            readingsPerTankPerDay = readingsPerTankDay,
            sources
        });
    }
}
