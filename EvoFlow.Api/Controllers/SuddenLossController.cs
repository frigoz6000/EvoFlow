using Dapper;
using EvoFlow.Api.Data;
using Microsoft.AspNetCore.Mvc;

namespace EvoFlow.Api.Controllers;

public class SuddenLossRow
{
    public long SuddenLossEventId { get; set; }
    public long? SystemEventId { get; set; }
    public string SiteId { get; set; } = "";
    public string SiteName { get; set; } = "";
    public int SeqNo { get; set; }
    public DateTime EventDateTime { get; set; }
    public string? TankId { get; set; }
    public bool IsPossible { get; set; }
    public decimal? VolumeLostLitres { get; set; }
    public int? DurationSeconds { get; set; }
    public decimal? ConsumptionRate { get; set; }
    public decimal? MaxRateLPerMin { get; set; }
    public string? EventText { get; set; }
}

// Reads from SuddenLossEvents, populated during the SystemEvents XML import
// (see EvoFlow.Api/Sql/CreateSuddenLossTable.sql for the table this depends on).
[ApiController]
[Route("api/suddenloss")]
public class SuddenLossController(IDapperConnectionFactory connectionFactory) : ControllerBase
{
    private const string BaseSql = @"
        SELECT TOP (@MaxRows)
            sl.SuddenLossEventId,
            sl.SystemEventId,
            sl.SiteId,
            s.SiteName,
            sl.SeqNo,
            sl.EventDateTime,
            sl.TankId,
            sl.IsPossible,
            sl.VolumeLostLitres,
            sl.DurationSeconds,
            sl.ConsumptionRate,
            sl.MaxRateLPerMin,
            sl.EventText
        FROM SuddenLossEvents sl
        JOIN Sites s ON s.SiteId = sl.SiteId
        WHERE (@SiteId     IS NULL OR sl.SiteId = @SiteId)
          AND (@DateFrom   IS NULL OR CAST(sl.EventDateTime AS DATE) >= @DateFrom)
          AND (@DateTo     IS NULL OR CAST(sl.EventDateTime AS DATE) <= @DateTo)
          AND (@TankId     IS NULL OR sl.TankId = @TankId)
          AND (@IsPossible IS NULL OR sl.IsPossible = @IsPossible)
          AND (@Search     IS NULL OR sl.EventText LIKE '%' + @Search + '%'
                                    OR sl.TankId    LIKE '%' + @Search + '%')
        ORDER BY sl.EventDateTime DESC, sl.SeqNo DESC";

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? siteId = null,
        [FromQuery] DateOnly? dateFrom = null,
        [FromQuery] DateOnly? dateTo = null,
        [FromQuery] string? tankId = null,
        [FromQuery] bool? isPossible = null,
        [FromQuery] string? search = null,
        [FromQuery] int maxRows = 5000)
    {
        using var conn = connectionFactory.CreateConnection();
        var rows = await conn.QueryAsync<SuddenLossRow>(
            new CommandDefinition(BaseSql, new
            {
                SiteId = siteId,
                DateFrom = dateFrom,
                DateTo = dateTo,
                TankId = tankId,
                IsPossible = isPossible,
                Search = search,
                MaxRows = maxRows
            }, commandTimeout: 120));
        return Ok(rows);
    }
}
