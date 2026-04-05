using Dapper;
using EvoFlow.Api.Data;
using EvoFlow.Api.Models;
using Microsoft.AspNetCore.Mvc;

namespace EvoFlow.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class FuelTypesController(EvoFlowDbContext db, IDapperConnectionFactory connectionFactory) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        using var conn = connectionFactory.CreateConnection();
        var items = await conn.QueryAsync<FuelType>("SELECT * FROM FuelTypes ORDER BY FuelTypeId");
        return Ok(items);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(string id)
    {
        using var conn = connectionFactory.CreateConnection();
        var item = await conn.QuerySingleOrDefaultAsync<FuelType>(
            "SELECT * FROM FuelTypes WHERE FuelTypeId = @FuelTypeId", new { FuelTypeId = id });
        return item is null ? NotFound() : Ok(item);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] FuelType fuelType)
    {
        db.FuelTypes.Add(fuelType);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = fuelType.FuelTypeId }, fuelType);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(string id, [FromBody] FuelType fuelType)
    {
        if (id != fuelType.FuelTypeId) return BadRequest();
        db.FuelTypes.Update(fuelType);
        await db.SaveChangesAsync();
        return NoContent();
    }
}
