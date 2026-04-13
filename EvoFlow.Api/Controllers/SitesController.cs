using Dapper;
using EvoFlow.Api.Data;
using EvoFlow.Api.Models;
using Microsoft.AspNetCore.Mvc;

namespace EvoFlow.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SitesController(EvoFlowDbContext db, IDapperConnectionFactory connectionFactory) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        using var conn = connectionFactory.CreateConnection();
        var sites = await conn.QueryAsync<Site>("SELECT * FROM Sites ORDER BY SiteId");
        return Ok(sites);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(string id)
    {
        using var conn = connectionFactory.CreateConnection();
        var site = await conn.QuerySingleOrDefaultAsync<Site>(
            "SELECT * FROM Sites WHERE SiteId = @SiteId", new { SiteId = id });
        return site is null ? NotFound() : Ok(site);
    }

    [HttpGet("{id}/detail")]
    public async Task<IActionResult> GetDetail(string id)
    {
        using var conn = connectionFactory.CreateConnection();

        var site = await conn.QuerySingleOrDefaultAsync<Site>(
            "SELECT * FROM Sites WHERE SiteId = @SiteId", new { SiteId = id });
        if (site is null) return NotFound();

        var pumps = (await conn.QueryAsync<PumpDevice>(
            "SELECT * FROM PumpDevices WHERE SiteId = @SiteId ORDER BY DeviceId",
            new { SiteId = id })).ToList();

        var dailyStats = (await conn.QueryAsync<object>(
            @"SELECT CONVERT(varchar(10), pt.BusinessDate, 120) AS date,
                     SUM(pt.MoneyDiff) AS revenue,
                     SUM(pt.VolumeDiff) AS volume
              FROM PumpTotals pt
              JOIN PumpDevices pd ON pt.PumpDeviceId = pd.PumpDeviceId
              WHERE pd.SiteId = @SiteId AND pt.TotType = 'pump' AND pt.MoneyDiff > 0
              GROUP BY pt.BusinessDate
              ORDER BY pt.BusinessDate",
            new { SiteId = id })).ToList();

        var fuelBreakdown = (await conn.QueryAsync<object>(
            @"SELECT fr.FuelTypeId AS fuelType,
                     SUM(fr.VolumeL) AS totalVolume,
                     SUM(fr.AmountGBP) AS totalRevenue,
                     COUNT(*) AS transactions
              FROM FuelRecords fr
              WHERE fr.SiteId = @SiteId
              GROUP BY fr.FuelTypeId
              ORDER BY totalRevenue DESC",
            new { SiteId = id })).ToList();

        var recentTransactions = (await conn.QueryAsync<object>(
            @"SELECT TOP 20
                     fr.FuelRecordId AS fuelRecordId,
                     CONVERT(varchar(23), fr.TransactionUtc, 126) AS transactionUtc,
                     CONVERT(varchar(10), fr.BusinessDate, 120) AS businessDate,
                     fr.FuelTypeId AS fuelTypeId,
                     fr.VolumeL AS volumeL,
                     fr.AmountGBP AS amountGBP,
                     fr.OdometerKm AS odometerKm,
                     ISNULL(v.Registration, '') AS vehicleReg
              FROM FuelRecords fr
              LEFT JOIN Vehicles v ON fr.VehicleId = v.VehicleId
              WHERE fr.SiteId = @SiteId
              ORDER BY fr.TransactionUtc DESC",
            new { SiteId = id })).ToList();

        var tankReadings = (await conn.QueryAsync<object>(
            @"SELECT tg.*
              FROM TankGauges tg
              INNER JOIN (
                  SELECT TankId, MAX(BusinessDate) AS MaxDate
                  FROM TankGauges
                  WHERE SiteId = @SiteId
                  GROUP BY TankId
              ) latest ON tg.TankId = latest.TankId AND tg.BusinessDate = latest.MaxDate
              WHERE tg.SiteId = @SiteId
              ORDER BY tg.TankId",
            new { SiteId = id })).ToList();

        var totalRevenue = dailyStats
            .Cast<IDictionary<string, object>>()
            .Sum(r => Convert.ToDecimal(r["revenue"] ?? 0));
        var totalVolume = dailyStats
            .Cast<IDictionary<string, object>>()
            .Sum(r => Convert.ToDecimal(r["volume"] ?? 0));
        var totalTransactions = fuelBreakdown
            .Cast<IDictionary<string, object>>()
            .Sum(r => Convert.ToInt64(r["transactions"] ?? 0));

        return Ok(new
        {
            site,
            pumps,
            totalPumps = pumps.Count,
            onlinePumps = pumps.Count(p => p.Online),
            totalRevenue,
            totalVolume,
            totalTransactions,
            dailyStats,
            fuelBreakdown,
            recentTransactions,
            tankReadings
        });
    }

    [HttpGet("map-data")]
    public async Task<IActionResult> GetMapData()
    {
        using var conn = connectionFactory.CreateConnection();
        var sites = await conn.QueryAsync<Site>("SELECT * FROM Sites ORDER BY SiteId");

        var fuelSummary = await conn.QueryAsync<dynamic>(
            @"SELECT fr.SiteId, fr.FuelTypeId,
                     ROUND(AVG(fr.AmountGBP / NULLIF(fr.VolumeL, 0) * 100), 1) AS avgPpl,
                     MAX(fr.BusinessDate) AS latestDate
              FROM FuelRecords fr
              WHERE fr.VolumeL > 0
              GROUP BY fr.SiteId, fr.FuelTypeId");

        var fuelBySite = fuelSummary
            .GroupBy(f => (string)f.SiteId)
            .ToDictionary(
                g => g.Key,
                g => g.Select(f => new
                {
                    fuelTypeId = (string)f.FuelTypeId,
                    avgPpl = (decimal?)f.avgPpl,
                    latestDate = (DateTime?)f.latestDate
                }).ToList()
            );

        var result = sites.Select(s => new
        {
            s.SiteId,
            s.SiteName,
            s.Address1,
            s.Address2,
            s.City,
            s.County,
            s.PostCode,
            s.PoleSign,
            fuels = fuelBySite.TryGetValue(s.SiteId, out var f) ? f : []
        });

        return Ok(result);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Site site)
    {
        db.Sites.Add(site);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = site.SiteId }, site);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(string id, [FromBody] Site site)
    {
        if (id != site.SiteId) return BadRequest();
        db.Sites.Update(site);
        await db.SaveChangesAsync();
        return NoContent();
    }
}
