using Dapper;
using EvoFlow.Api.Data;
using EvoFlow.Api.Models;
using Microsoft.AspNetCore.Mvc;

namespace EvoFlow.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PumpDevicesController(EvoFlowDbContext db, IDapperConnectionFactory connectionFactory) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? siteId = null)
    {
        using var conn = connectionFactory.CreateConnection();
        var sql = siteId is null
            ? "SELECT * FROM PumpDevices ORDER BY PumpDeviceId"
            : "SELECT * FROM PumpDevices WHERE SiteId = @SiteId ORDER BY PumpDeviceId";
        var items = await conn.QueryAsync<PumpDevice>(sql, new { SiteId = siteId });
        return Ok(items);
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetById(int id)
    {
        using var conn = connectionFactory.CreateConnection();
        var item = await conn.QuerySingleOrDefaultAsync<PumpDevice>(
            "SELECT * FROM PumpDevices WHERE PumpDeviceId = @PumpDeviceId", new { PumpDeviceId = id });
        return item is null ? NotFound() : Ok(item);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] PumpDevice pumpDevice)
    {
        db.PumpDevices.Add(pumpDevice);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = pumpDevice.PumpDeviceId }, pumpDevice);
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] PumpDevice pumpDevice)
    {
        if (id != pumpDevice.PumpDeviceId) return BadRequest();
        db.PumpDevices.Update(pumpDevice);
        await db.SaveChangesAsync();
        return NoContent();
    }
}
