using Dapper;
using EvoFlow.Api.Data;
using EvoFlow.Api.Models;
using Microsoft.AspNetCore.Mvc;

namespace EvoFlow.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class EmailLogController(IDapperConnectionFactory connectionFactory) : ControllerBase
{
    private static readonly HashSet<string> AllowedSortColumns = new(StringComparer.OrdinalIgnoreCase)
    {
        "sentAtUtc", "subject", "recipients", "status"
    };

    [HttpGet]
    public async Task<IActionResult> Get(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        [FromQuery] string? status = null,
        [FromQuery] string? subject = null,
        [FromQuery] string? recipients = null,
        [FromQuery] DateTime? dateFrom = null,
        [FromQuery] DateTime? dateTo = null,
        [FromQuery] string sortBy = "sentAtUtc",
        [FromQuery] string sortDir = "desc")
    {
        if (page < 1) page = 1;
        if (pageSize < 1 || pageSize > 200) pageSize = 50;

        var col = AllowedSortColumns.Contains(sortBy) ? sortBy : "sentAtUtc";
        var dir = sortDir.Equals("asc", StringComparison.OrdinalIgnoreCase) ? "ASC" : "DESC";

        var conditions = new List<string>();
        var p = new DynamicParameters();

        if (!string.IsNullOrWhiteSpace(status))    { conditions.Add("Status = @Status");          p.Add("Status", status); }
        if (!string.IsNullOrWhiteSpace(subject))   { conditions.Add("Subject LIKE @Subject");     p.Add("Subject", $"%{subject}%"); }
        if (!string.IsNullOrWhiteSpace(recipients)){ conditions.Add("Recipients LIKE @Recip");    p.Add("Recip", $"%{recipients}%"); }
        if (dateFrom.HasValue) { conditions.Add("SentAtUtc >= @DateFrom"); p.Add("DateFrom", dateFrom.Value.Date); }
        if (dateTo.HasValue)   { conditions.Add("SentAtUtc < @DateTo");    p.Add("DateTo", dateTo.Value.Date.AddDays(1)); }

        var where = conditions.Count > 0 ? "WHERE " + string.Join(" AND ", conditions) : "";

        p.Add("Offset", (page - 1) * pageSize);
        p.Add("PageSize", pageSize);

        using var conn = connectionFactory.CreateConnection();

        var rows  = await conn.QueryAsync<EmailLog>($"SELECT * FROM EmailLog {where} ORDER BY {col} {dir} OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY", p);
        var total = await conn.ExecuteScalarAsync<int>($"SELECT COUNT(*) FROM EmailLog {where}", p);

        // Overall (unfiltered) summary counts for the stat cards
        var stats = await conn.QueryFirstOrDefaultAsync<(int Total, int Sent, int Failed)>(
            "SELECT COUNT(*) AS Total, SUM(CASE WHEN Status='Sent' THEN 1 ELSE 0 END) AS Sent, SUM(CASE WHEN Status='Failed' THEN 1 ELSE 0 END) AS Failed FROM EmailLog");

        return Ok(new
        {
            total,
            page,
            pageSize,
            rows,
            stats = new { stats.Total, stats.Sent, stats.Failed }
        });
    }
}
