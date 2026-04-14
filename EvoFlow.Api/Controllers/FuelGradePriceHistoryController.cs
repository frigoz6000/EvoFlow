using Dapper;
using EvoFlow.Api.Data;
using Microsoft.AspNetCore.Mvc;

namespace EvoFlow.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class FuelGradePriceHistoryController(IDapperConnectionFactory connectionFactory) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? siteId,
        [FromQuery] string? siteName,
        [FromQuery] DateTime? fromDate,
        [FromQuery] DateTime? toDate)
    {
        using var conn = connectionFactory.CreateConnection();
        var from = fromDate ?? DateTime.Today.AddDays(-6);
        var to = toDate ?? DateTime.Today.AddDays(1);
        var sql = @"
            SELECT h.Id, h.SiteId, s.SiteName, h.HistoryDate, h.GradeId, h.GradeDescription, h.GradeShortCode,
                   h.GradeUnitPrice, h.DtFuelChange, h.DtSentToGov, h.DtLastReceived
            FROM FuelGradePriceHistory h
            INNER JOIN Sites s ON h.SiteId = s.SiteId
            WHERE (@SiteId IS NULL OR h.SiteId LIKE '%' + @SiteId + '%')
              AND (@SiteName IS NULL OR s.SiteName LIKE '%' + @SiteName + '%')
              AND h.HistoryDate >= @From
              AND h.HistoryDate < @To
            ORDER BY h.HistoryDate DESC, h.SiteId, h.GradeId";
        var rows = await conn.QueryAsync(sql, new { SiteId = siteId, SiteName = siteName, From = from, To = to });
        return Ok(rows);
    }
}
