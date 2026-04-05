using Dapper;
using EvoFlow.Api.Data;
using EvoFlow.Api.Models;
using Microsoft.AspNetCore.Mvc;

namespace EvoFlow.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PumpMonitoringController(EvoFlowDbContext db, IDapperConnectionFactory connectionFactory) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] int? pumpDeviceId = null, [FromQuery] DateOnly? date = null)
    {
        using var conn = connectionFactory.CreateConnection();
        var sql = @"SELECT * FROM PumpMonitoring
                    WHERE (@PumpDeviceId IS NULL OR PumpDeviceId = @PumpDeviceId)
                      AND (@Date IS NULL OR BusinessDate = @Date)
                    ORDER BY SnapshotUtc DESC";
        var items = await conn.QueryAsync<PumpMonitoring>(sql, new { PumpDeviceId = pumpDeviceId, Date = date });
        return Ok(items);
    }

    [HttpGet("{id:long}")]
    public async Task<IActionResult> GetById(long id)
    {
        using var conn = connectionFactory.CreateConnection();
        var item = await conn.QuerySingleOrDefaultAsync<PumpMonitoring>(
            "SELECT * FROM PumpMonitoring WHERE PumpMonitoringId = @PumpMonitoringId", new { PumpMonitoringId = id });
        return item is null ? NotFound() : Ok(item);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] PumpMonitoring pumpMonitoring)
    {
        db.PumpMonitoring.Add(pumpMonitoring);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = pumpMonitoring.PumpMonitoringId }, pumpMonitoring);
    }
}
