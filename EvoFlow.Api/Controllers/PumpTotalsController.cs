using Dapper;
using EvoFlow.Api.Data;
using EvoFlow.Api.Models;
using Microsoft.AspNetCore.Mvc;

namespace EvoFlow.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PumpTotalsController(EvoFlowDbContext db, IDapperConnectionFactory connectionFactory) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] int? pumpDeviceId = null, [FromQuery] DateOnly? date = null)
    {
        using var conn = connectionFactory.CreateConnection();
        var sql = @"SELECT * FROM PumpTotals
                    WHERE (@PumpDeviceId IS NULL OR PumpDeviceId = @PumpDeviceId)
                      AND (@Date IS NULL OR BusinessDate = @Date)
                    ORDER BY SnapshotUtc DESC";
        var items = await conn.QueryAsync<PumpTotals>(sql, new { PumpDeviceId = pumpDeviceId, Date = date });
        return Ok(items);
    }

    [HttpGet("{id:long}")]
    public async Task<IActionResult> GetById(long id)
    {
        using var conn = connectionFactory.CreateConnection();
        var item = await conn.QuerySingleOrDefaultAsync<PumpTotals>(
            "SELECT * FROM PumpTotals WHERE PumpTotalsId = @PumpTotalsId", new { PumpTotalsId = id });
        return item is null ? NotFound() : Ok(item);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] PumpTotals pumpTotals)
    {
        db.PumpTotals.Add(pumpTotals);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = pumpTotals.PumpTotalsId }, pumpTotals);
    }
}
