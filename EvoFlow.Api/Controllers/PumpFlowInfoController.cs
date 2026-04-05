using Dapper;
using EvoFlow.Api.Data;
using EvoFlow.Api.Models;
using Microsoft.AspNetCore.Mvc;

namespace EvoFlow.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PumpFlowInfoController(EvoFlowDbContext db, IDapperConnectionFactory connectionFactory) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] long? pumpMonitoringGradeId = null)
    {
        using var conn = connectionFactory.CreateConnection();
        var sql = pumpMonitoringGradeId is null
            ? "SELECT * FROM PumpFlowInfo ORDER BY PumpFlowInfoId"
            : "SELECT * FROM PumpFlowInfo WHERE PumpMonitoringGradeId = @PumpMonitoringGradeId ORDER BY FlowType";
        var items = await conn.QueryAsync<PumpFlowInfo>(sql, new { PumpMonitoringGradeId = pumpMonitoringGradeId });
        return Ok(items);
    }

    [HttpGet("{id:long}")]
    public async Task<IActionResult> GetById(long id)
    {
        using var conn = connectionFactory.CreateConnection();
        var item = await conn.QuerySingleOrDefaultAsync<PumpFlowInfo>(
            "SELECT * FROM PumpFlowInfo WHERE PumpFlowInfoId = @PumpFlowInfoId", new { PumpFlowInfoId = id });
        return item is null ? NotFound() : Ok(item);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] PumpFlowInfo pumpFlowInfo)
    {
        db.PumpFlowInfo.Add(pumpFlowInfo);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = pumpFlowInfo.PumpFlowInfoId }, pumpFlowInfo);
    }
}
