using Dapper;
using EvoFlow.Api.Data;
using EvoFlow.Api.Models;
using Microsoft.AspNetCore.Mvc;

namespace EvoFlow.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class FuelGradePricesController(EvoFlowDbContext db, IDapperConnectionFactory connectionFactory) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? siteId, [FromQuery] string? siteName)
    {
        using var conn = connectionFactory.CreateConnection();
        var sql = @"
            SELECT f.SiteId, s.SiteName, f.GradeId, f.GradeDescription, f.GradeShortCode,
                   f.GradeUnitPrice, f.DtFuelChange, f.DtSentToGov, f.DtLastReceived
            FROM FuelGradePrices f
            INNER JOIN Sites s ON f.SiteId = s.SiteId
            WHERE (@SiteId IS NULL OR f.SiteId LIKE '%' + @SiteId + '%')
              AND (@SiteName IS NULL OR s.SiteName LIKE '%' + @SiteName + '%')
            ORDER BY f.SiteId, f.GradeId";
        var rows = await conn.QueryAsync(sql, new { SiteId = siteId, SiteName = siteName });
        return Ok(rows);
    }

    [HttpPost]
    public async Task<IActionResult> Upsert([FromBody] FuelGradePrice price)
    {
        var existing = await db.FuelGradePrices.FindAsync(price.SiteId, price.GradeId);
        if (existing is null)
        {
            db.FuelGradePrices.Add(price);
        }
        else
        {
            existing.GradeDescription = price.GradeDescription;
            existing.GradeShortCode = price.GradeShortCode;
            existing.GradeUnitPrice = price.GradeUnitPrice;
            existing.DtFuelChange = price.DtFuelChange;
            existing.DtSentToGov = price.DtSentToGov;
            existing.DtLastReceived = price.DtLastReceived;
        }
        await db.SaveChangesAsync();
        return Ok(price);
    }
}
