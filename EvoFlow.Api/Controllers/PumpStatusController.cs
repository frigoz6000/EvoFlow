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
    public async Task<IActionResult> GetAll([FromQuery] int? pumpDeviceId = null, [FromQuery] DateOnly? date = null, [FromQuery] bool latestOnly = false)
    {
        using var conn = connectionFactory.CreateConnection();
        string sql;
        if (latestOnly)
        {
            sql = @"WITH Ranked AS (
                        SELECT *, ROW_NUMBER() OVER (PARTITION BY PumpDeviceId ORDER BY SnapshotUtc DESC) AS rn
                        FROM PumpStatus
                        WHERE (@PumpDeviceId IS NULL OR PumpDeviceId = @PumpDeviceId)
                          AND (@Date IS NULL OR BusinessDate = @Date)
                    )
                    SELECT PumpStatusId, PumpDeviceId, BusinessDate, SnapshotUtc, State, SubStateBits, SubState2Bits
                    FROM Ranked WHERE rn = 1";
        }
        else
        {
            sql = @"SELECT * FROM PumpStatus
                    WHERE (@PumpDeviceId IS NULL OR PumpDeviceId = @PumpDeviceId)
                      AND (@Date IS NULL OR BusinessDate = @Date)
                    ORDER BY SnapshotUtc DESC";
        }
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
