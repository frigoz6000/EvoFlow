using Dapper;
using EvoFlow.Api.Data;
using Microsoft.AspNetCore.Mvc;

namespace EvoFlow.Api.Controllers;

public class SystemEventRow
{
    public long SystemEventId { get; set; }
    public string SiteId { get; set; } = "";
    public string SiteName { get; set; } = "";
    public int SeqNo { get; set; }
    public DateOnly EventDate { get; set; }
    public TimeOnly EventTime { get; set; }
    public DateTime EventDateTime { get; set; }
    public string Grp { get; set; } = "";
    public string Code { get; set; } = "";
    public string? Subcode { get; set; }
    public string EventCategory { get; set; } = "";
    public string? EventText { get; set; }
    public string? DeviceId { get; set; }
    public string? UserName { get; set; }
    public string? IpAddress { get; set; }
    public string? RawXml { get; set; }
}

// Reads from SystemEvents, populated by POST /api/import/system-events-upload
// (see EvoFlow.Api/Sql/CreateSystemEventsTable.sql for the table this depends on).
[ApiController]
[Route("api/systemevents")]
public class SystemEventsController(IDapperConnectionFactory connectionFactory) : ControllerBase
{
    private const string BaseSql = @"
        SELECT TOP (@MaxRows)
            se.SystemEventId,
            se.SiteId,
            s.SiteName,
            se.SeqNo,
            se.EventDate,
            se.EventTime,
            se.EventDateTime,
            se.Grp,
            se.Code,
            se.Subcode,
            se.EventCategory,
            se.EventText,
            se.DeviceId,
            se.UserName,
            se.IpAddress,
            se.RawXml
        FROM SystemEvents se
        JOIN Sites s ON s.SiteId = se.SiteId
        WHERE (@SiteId    IS NULL OR se.SiteId = @SiteId)
          AND (@DateFrom  IS NULL OR se.EventDate >= @DateFrom)
          AND (@DateTo    IS NULL OR se.EventDate <= @DateTo)
          AND (@Category  IS NULL OR se.EventCategory = @Category)
          AND (@Search    IS NULL OR se.EventText LIKE '%' + @Search + '%'
                                   OR se.DeviceId  LIKE '%' + @Search + '%'
                                   OR se.UserName  LIKE '%' + @Search + '%')
        ORDER BY se.EventDateTime DESC, se.SeqNo DESC";

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? siteId = null,
        [FromQuery] DateOnly? dateFrom = null,
        [FromQuery] DateOnly? dateTo = null,
        [FromQuery] string? category = null,
        [FromQuery] string? search = null,
        [FromQuery] int maxRows = 5000)
    {
        using var conn = connectionFactory.CreateConnection();
        var rows = await conn.QueryAsync<SystemEventRow>(
            new CommandDefinition(BaseSql, new
            {
                SiteId = siteId,
                DateFrom = dateFrom,
                DateTo = dateTo,
                Category = category,
                Search = search,
                MaxRows = maxRows
            }, commandTimeout: 120));
        return Ok(rows);
    }

    [HttpGet("categories")]
    public async Task<IActionResult> GetCategories()
    {
        using var conn = connectionFactory.CreateConnection();
        var categories = await conn.QueryAsync<string>(
            "SELECT DISTINCT EventCategory FROM SystemEvents ORDER BY EventCategory");
        return Ok(categories);
    }
}
