using Dapper;
using EvoFlow.Api.Data;
using Microsoft.AspNetCore.Mvc;

namespace EvoFlow.Api.Controllers;

[ApiController]
[Route("api/dataintegrity")]
public class DataIntegrityController(IDapperConnectionFactory connectionFactory) : ControllerBase
{
    private const string SummarySql = @"
        WITH DateRange AS (
            SELECT DISTINCT DomsDate
            FROM DomsInfoSnapshot
            WHERE (@DateFrom IS NULL OR DomsDate >= @DateFrom)
              AND (@DateTo   IS NULL OR DomsDate <= @DateTo)
        ),
        SiteDates AS (
            SELECT s.SiteId, d.DomsDate
            FROM Sites s
            CROSS JOIN DateRange d
        ),
        Present AS (
            SELECT DISTINCT SiteId, DomsDate
            FROM DomsInfoSnapshot
            WHERE (@DateFrom IS NULL OR DomsDate >= @DateFrom)
              AND (@DateTo   IS NULL OR DomsDate <= @DateTo)
        )
        SELECT
            sd.DomsDate                             AS CheckDate,
            COUNT(*)                                AS TotalSites,
            COUNT(p.SiteId)                         AS SitesWithData,
            COUNT(*) - COUNT(p.SiteId)              AS MissingSites
        FROM SiteDates sd
        LEFT JOIN Present p ON p.SiteId = sd.SiteId AND p.DomsDate = sd.DomsDate
        GROUP BY sd.DomsDate
        ORDER BY sd.DomsDate";

    private const string MissingSql = @"
        WITH DateRange AS (
            SELECT DISTINCT DomsDate
            FROM DomsInfoSnapshot
            WHERE (@DateFrom IS NULL OR DomsDate >= @DateFrom)
              AND (@DateTo   IS NULL OR DomsDate <= @DateTo)
        )
        SELECT
            s.SiteId,
            s.SiteName,
            d.DomsDate AS MissingDate
        FROM Sites s
        CROSS JOIN DateRange d
        WHERE NOT EXISTS (
            SELECT 1 FROM DomsInfoSnapshot ds
            WHERE ds.SiteId = s.SiteId AND ds.DomsDate = d.DomsDate
        )
        ORDER BY s.SiteId, d.DomsDate";

    /// <summary>
    /// Returns per-date summary: total sites, sites with data, missing count.
    /// </summary>
    [HttpGet("summary")]
    public async Task<IActionResult> GetSummary(
        [FromQuery] DateOnly? dateFrom = null,
        [FromQuery] DateOnly? dateTo = null)
    {
        using var conn = connectionFactory.CreateConnection();
        var rows = await conn.QueryAsync<DateSummaryRow>(
            new CommandDefinition(SummarySql, new { DateFrom = dateFrom, DateTo = dateTo }, commandTimeout: 60));
        return Ok(rows);
    }

    /// <summary>
    /// Returns every (site, date) combination where DomsInfoSnapshot has no data.
    /// </summary>
    [HttpGet("missing")]
    public async Task<IActionResult> GetMissing(
        [FromQuery] DateOnly? dateFrom = null,
        [FromQuery] DateOnly? dateTo = null)
    {
        using var conn = connectionFactory.CreateConnection();
        var rows = await conn.QueryAsync<MissingRow>(
            new CommandDefinition(MissingSql, new { DateFrom = dateFrom, DateTo = dateTo }, commandTimeout: 60));
        return Ok(rows);
    }
}

public class DateSummaryRow
{
    public DateOnly CheckDate { get; set; }
    public int TotalSites { get; set; }
    public int SitesWithData { get; set; }
    public int MissingSites { get; set; }
}

public class MissingRow
{
    public string SiteId { get; set; } = "";
    public string SiteName { get; set; } = "";
    public DateOnly MissingDate { get; set; }
}
