using Dapper;
using EvoFlow.Api.Data;
using EvoFlow.Api.Models;
using Microsoft.AspNetCore.Mvc;

namespace EvoFlow.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PumpStatusController(EvoFlowDbContext db, IDapperConnectionFactory connectionFactory) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] int? pumpDeviceId = null, [FromQuery] DateOnly? date = null)
    {
        using var conn = connectionFactory.CreateConnection();
        var sql = @"SELECT * FROM PumpStatus
                    WHERE (@PumpDeviceId IS NULL OR PumpDeviceId = @PumpDeviceId)
                      AND (@Date IS NULL OR BusinessDate = @Date)
                    ORDER BY SnapshotUtc DESC";
        var items = await conn.QueryAsync<PumpStatus>(sql, new { PumpDeviceId = pumpDeviceId, Date = date });
        return Ok(items);
    }

    [HttpGet("{id:long}")]
    public async Task<IActionResult> GetById(long id)
    {
        using var conn = connectionFactory.CreateConnection();
        var item = await conn.QuerySingleOrDefaultAsync<PumpStatus>(
            "SELECT * FROM PumpStatus WHERE PumpStatusId = @PumpStatusId", new { PumpStatusId = id });
        return item is null ? NotFound() : Ok(item);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] PumpStatus pumpStatus)
    {
        db.PumpStatus.Add(pumpStatus);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = pumpStatus.PumpStatusId }, pumpStatus);
    }
}
