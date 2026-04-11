using Dapper;
using EvoFlow.Api.Data;
using Microsoft.AspNetCore.Mvc;

namespace EvoFlow.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ReportDispatchesController(IDapperConnectionFactory connectionFactory) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetRecent([FromQuery] int? scheduleId, [FromQuery] int limit = 100)
    {
        using var conn = connectionFactory.CreateConnection();

        var sql = @"
            SELECT TOP (@Limit)
                d.Id, d.ReportScheduleId, d.DispatchedAt, d.Recipients, d.Status, d.Notes,
                s.Name AS ScheduleName, s.ReportType
            FROM ReportDispatches d
            JOIN ReportSchedules s ON s.Id = d.ReportScheduleId
            WHERE (@ScheduleId IS NULL OR d.ReportScheduleId = @ScheduleId)
            ORDER BY d.DispatchedAt DESC";

        var rows = await conn.QueryAsync(sql, new { Limit = limit, ScheduleId = scheduleId });
        return Ok(rows);
    }
}
