using Dapper;
using EvoFlow.Api.Data;
using EvoFlow.Api.Models;
using Microsoft.AspNetCore.Mvc;

namespace EvoFlow.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PumpGradeTotalsController(EvoFlowDbContext db, IDapperConnectionFactory connectionFactory) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] long? pumpTotalsId = null)
    {
        using var conn = connectionFactory.CreateConnection();
        var sql = pumpTotalsId is null
            ? "SELECT * FROM PumpGradeTotals ORDER BY PumpGradeTotalsId"
            : "SELECT * FROM PumpGradeTotals WHERE PumpTotalsId = @PumpTotalsId ORDER BY GradeOption";
        var items = await conn.QueryAsync<PumpGradeTotals>(sql, new { PumpTotalsId = pumpTotalsId });
        return Ok(items);
    }

    [HttpGet("{id:long}")]
    public async Task<IActionResult> GetById(long id)
    {
        using var conn = connectionFactory.CreateConnection();
        var item = await conn.QuerySingleOrDefaultAsync<PumpGradeTotals>(
            "SELECT * FROM PumpGradeTotals WHERE PumpGradeTotalsId = @PumpGradeTotalsId",
            new { PumpGradeTotalsId = id });
        return item is null ? NotFound() : Ok(item);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] PumpGradeTotals gradeTotals)
    {
        db.PumpGradeTotals.Add(gradeTotals);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = gradeTotals.PumpGradeTotalsId }, gradeTotals);
    }
}
