using Dapper;
using EvoFlow.Api.Data;
using EvoFlow.Api.Models;
using EvoFlow.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace EvoFlow.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SitesController(EvoFlowDbContext db, IDapperConnectionFactory connectionFactory, GeocodingService geocodingService) : ControllerBase
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
                     ISNULL(ft.Name, fr.FuelTypeId) AS fuelDescription,
                     SUM(fr.VolumeL) AS totalVolume,
                     SUM(fr.AmountGBP) AS totalRevenue,
                     COUNT(*) AS transactions
              FROM FuelRecords fr
              LEFT JOIN FuelTypes ft ON fr.FuelTypeId = ft.FuelTypeId
              WHERE fr.SiteId = @SiteId
              GROUP BY fr.FuelTypeId, ft.Name
              ORDER BY totalRevenue DESC",
            new { SiteId = id })).ToList();

        var fuelGrades = (await conn.QueryAsync<object>(
            @"SELECT GradeId AS gradeId,
                     GradeDescription AS gradeDescription,
                     GradeShortCode AS gradeShortCode,
                     GradeUnitPrice AS gradeUnitPrice,
                     CONVERT(varchar(23), DtFuelChange, 126) AS dtFuelChange,
                     CONVERT(varchar(23), DtLastReceived, 126) AS dtLastReceived
              FROM FuelGradePrices
              WHERE SiteId = @SiteId
              ORDER BY GradeDescription",
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

        var tankReadings = (await conn.QueryAsync<TankGaugeRow>(
            @"SELECT tg.*
              FROM TankGauges tg
              INNER JOIN (
                  SELECT SiteId, TankId, MAX(BusinessDate) AS MaxDate
                  FROM TankGauges
                  WHERE SiteId = @SiteId
                  GROUP BY SiteId, TankId
              ) latest ON tg.SiteId = latest.SiteId AND tg.TankId = latest.TankId AND tg.BusinessDate = latest.MaxDate
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
            fuelGrades,
            recentTransactions,
            tankReadings
        });
    }

    [HttpGet("map-data")]
    public async Task<IActionResult> GetMapData()
    {
        using var conn = connectionFactory.CreateConnection();

        var sites = (await conn.QueryAsync<dynamic>(
            @"SELECT SiteId, SiteName, Address1, Address2, City, County, PostCode, PoleSign, Country,
                     CONVERT(varchar(5), OpeningHour, 108) AS OpeningHour,
                     CONVERT(varchar(5), ClosingHour, 108) AS ClosingHour,
                     CASE WHEN Location IS NOT NULL THEN Location.Lat ELSE NULL END AS Lat,
                     CASE WHEN Location IS NOT NULL THEN Location.Long ELSE NULL END AS Lng
              FROM Sites
              ORDER BY SiteId")).ToList();

        var fuelPrices = (await conn.QueryAsync<dynamic>(
            @"SELECT SiteId, GradeDescription, GradeShortCode, GradeUnitPrice, DtFuelChange
              FROM FuelGradePrices
              ORDER BY SiteId, GradeDescription")).ToList();

        var fuelBySite = fuelPrices
            .GroupBy(f => (string)f.SiteId)
            .ToDictionary(
                g => g.Key,
                g => g.Select(f => new
                {
                    grade = (string)f.GradeDescription,
                    shortCode = (string)f.GradeShortCode,
                    unitPrice = (decimal)f.GradeUnitPrice,
                    lastChanged = (DateTime?)f.DtFuelChange
                }).ToList()
            );

        var result = sites.Select(s =>
        {
            string siteId = s.SiteId;
            return new
            {
                siteId = (string)s.SiteId,
                siteName = (string)s.SiteName,
                address1 = (string?)s.Address1,
                address2 = (string?)s.Address2,
                city = (string?)s.City,
                county = (string?)s.County,
                postCode = (string?)s.PostCode,
                poleSign = (string?)s.PoleSign,
                country = (string?)s.Country,
                openingHour = (string?)s.OpeningHour,
                closingHour = (string?)s.ClosingHour,
                lat = (double?)s.Lat,
                lng = (double?)s.Lng,
                fuels = fuelBySite.TryGetValue(siteId, out var f) ? f : []
            };
        });

        return Ok(result);
    }

    [HttpPost("geocode")]
    public IActionResult StartGeocoding()
    {
        var started = geocodingService.StartAsync().GetAwaiter().GetResult();
        if (!started)
            return Conflict(new { message = "Geocoding is already running." });
        return Accepted(new { message = "Geocoding started in background." });
    }

    [HttpDelete("geocode")]
    public IActionResult CancelGeocoding()
    {
        geocodingService.Cancel();
        return Ok(new { message = "Geocoding cancelled." });
    }

    [HttpGet("geocode/status")]
    public IActionResult GetGeocodingStatus()
    {
        return Ok(geocodingService.GetProgress());
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
