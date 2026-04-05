using Dapper;
using EvoFlow.Api.Data;
using EvoFlow.Api.Models;
using Microsoft.AspNetCore.Mvc;

namespace EvoFlow.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class FuelRecordsController(EvoFlowDbContext db, IDapperConnectionFactory connectionFactory) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? siteId = null,
        [FromQuery] DateOnly? from = null,
        [FromQuery] DateOnly? to = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 100)
    {
        using var conn = connectionFactory.CreateConnection();
        var sql = @"SELECT * FROM FuelRecords
                    WHERE (@SiteId IS NULL OR SiteId = @SiteId)
                      AND (@From IS NULL OR BusinessDate >= @From)
                      AND (@To IS NULL OR BusinessDate <= @To)
                    ORDER BY TransactionUtc DESC
                    OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY";
        var items = await conn.QueryAsync<FuelRecord>(sql, new
        {
            SiteId = siteId,
            From = from,
            To = to,
            Offset = (page - 1) * pageSize,
            PageSize = pageSize
        });
        return Ok(items);
    }

    [HttpGet("{id:long}")]
    public async Task<IActionResult> GetById(long id)
    {
        using var conn = connectionFactory.CreateConnection();
        var item = await conn.QuerySingleOrDefaultAsync<FuelRecord>(
            "SELECT * FROM FuelRecords WHERE FuelRecordId = @FuelRecordId", new { FuelRecordId = id });
        return item is null ? NotFound() : Ok(item);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] FuelRecord fuelRecord)
    {
        db.FuelRecords.Add(fuelRecord);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = fuelRecord.FuelRecordId }, fuelRecord);
    }

    [HttpPost("batch")]
    public async Task<IActionResult> CreateBatch([FromBody] IEnumerable<FuelRecord> fuelRecords)
    {
        db.FuelRecords.AddRange(fuelRecords);
        await db.SaveChangesAsync();
        return Ok(new { message = "Batch inserted successfully" });
    }
}
