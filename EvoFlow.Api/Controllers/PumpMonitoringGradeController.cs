using Dapper;
using EvoFlow.Api.Data;
using EvoFlow.Api.Models;
using Microsoft.AspNetCore.Mvc;

namespace EvoFlow.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PumpMonitoringGradeController(EvoFlowDbContext db, IDapperConnectionFactory connectionFactory) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] long? pumpMonitoringId = null)
    {
        using var conn = connectionFactory.CreateConnection();
        var sql = pumpMonitoringId is null
            ? "SELECT * FROM PumpMonitoringGrade ORDER BY PumpMonitoringGradeId"
            : "SELECT * FROM PumpMonitoringGrade WHERE PumpMonitoringId = @PumpMonitoringId ORDER BY GradeOption";
        var items = await conn.QueryAsync<PumpMonitoringGrade>(sql, new { PumpMonitoringId = pumpMonitoringId });
        return Ok(items);
    }

    [HttpGet("{id:long}")]
    public async Task<IActionResult> GetById(long id)
    {
        using var conn = connectionFactory.CreateConnection();
        var item = await conn.QuerySingleOrDefaultAsync<PumpMonitoringGrade>(
            "SELECT * FROM PumpMonitoringGrade WHERE PumpMonitoringGradeId = @PumpMonitoringGradeId",
            new { PumpMonitoringGradeId = id });
        return item is null ? NotFound() : Ok(item);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] PumpMonitoringGrade grade)
    {
        db.PumpMonitoringGrade.Add(grade);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = grade.PumpMonitoringGradeId }, grade);
    }
}
