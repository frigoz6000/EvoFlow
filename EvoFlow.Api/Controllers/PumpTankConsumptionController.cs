using Dapper;
using EvoFlow.Api.Data;
using EvoFlow.Api.Models;
using Microsoft.AspNetCore.Mvc;

namespace EvoFlow.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PumpTankConsumptionController(EvoFlowDbContext db, IDapperConnectionFactory connectionFactory) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] long? pumpGradeTotalsId = null)
    {
        using var conn = connectionFactory.CreateConnection();
        var sql = pumpGradeTotalsId is null
            ? "SELECT * FROM PumpTankConsumption ORDER BY PumpTankConsumptionId"
            : "SELECT * FROM PumpTankConsumption WHERE PumpGradeTotalsId = @PumpGradeTotalsId ORDER BY TankId";
        var items = await conn.QueryAsync<PumpTankConsumption>(sql, new { PumpGradeTotalsId = pumpGradeTotalsId });
        return Ok(items);
    }

    [HttpGet("{id:long}")]
    public async Task<IActionResult> GetById(long id)
    {
        using var conn = connectionFactory.CreateConnection();
        var item = await conn.QuerySingleOrDefaultAsync<PumpTankConsumption>(
            "SELECT * FROM PumpTankConsumption WHERE PumpTankConsumptionId = @PumpTankConsumptionId",
            new { PumpTankConsumptionId = id });
        return item is null ? NotFound() : Ok(item);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] PumpTankConsumption tankConsumption)
    {
        db.PumpTankConsumption.Add(tankConsumption);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = tankConsumption.PumpTankConsumptionId }, tankConsumption);
    }
}
