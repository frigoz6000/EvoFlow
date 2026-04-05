using Dapper;
using EvoFlow.Api.Data;
using EvoFlow.Api.Models;
using Microsoft.AspNetCore.Mvc;

namespace EvoFlow.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class VehiclesController(EvoFlowDbContext db, IDapperConnectionFactory connectionFactory) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        using var conn = connectionFactory.CreateConnection();
        var items = await conn.QueryAsync<Vehicle>("SELECT * FROM Vehicles ORDER BY VehicleId");
        return Ok(items);
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetById(int id)
    {
        using var conn = connectionFactory.CreateConnection();
        var item = await conn.QuerySingleOrDefaultAsync<Vehicle>(
            "SELECT * FROM Vehicles WHERE VehicleId = @VehicleId", new { VehicleId = id });
        return item is null ? NotFound() : Ok(item);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Vehicle vehicle)
    {
        db.Vehicles.Add(vehicle);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = vehicle.VehicleId }, vehicle);
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] Vehicle vehicle)
    {
        if (id != vehicle.VehicleId) return BadRequest();
        db.Vehicles.Update(vehicle);
        await db.SaveChangesAsync();
        return NoContent();
    }
}
