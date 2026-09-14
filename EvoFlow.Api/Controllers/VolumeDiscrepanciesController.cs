using System.Data;
using Dapper;
using EvoFlow.Api.Data;
using Microsoft.AspNetCore.Mvc;

namespace EvoFlow.Api.Controllers;

public class VolumeDiscrepancyRow
{
    public string SiteId { get; set; } = "";
    public string SiteName { get; set; } = "";
    public string FuellingPointId { get; set; } = "";
    public DateOnly ActivityDate { get; set; }
    public DateOnly ReportDate { get; set; }
    public int GradeOption { get; set; }
    public string GradeId { get; set; } = "";
    public string? GradeDescription { get; set; }
    public string? TankIds { get; set; }
    public decimal PhysicalPumpVolume { get; set; }
    public decimal RecordedFpVolume { get; set; }
    public decimal MissingVolume { get; set; }
    public decimal PhysicalPumpMoney { get; set; }
    public decimal RecordedFpMoney { get; set; }
    public decimal MissingMoney { get; set; }
    public int SuddenLossCount { get; set; }
    public decimal? SuddenLossVolumeL { get; set; }
}

// Calls the dbo.GetVolumeDiscrepancies stored procedure (see EvoFlow.Api/Sql/GetVolumeDiscrepancies.sql).
// Run that script once against the database before using this endpoint.
[ApiController]
[Route("api/volumediscrepancies")]
public class VolumeDiscrepanciesController(IDapperConnectionFactory connectionFactory) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? siteId = null,
        [FromQuery] DateOnly? dateFrom = null,
        [FromQuery] DateOnly? dateTo = null,
        [FromQuery] decimal threshold = 0.01m)
    {
        using var conn = connectionFactory.CreateConnection();
        var rows = await conn.QueryAsync<VolumeDiscrepancyRow>(
            new CommandDefinition(
                "dbo.GetVolumeDiscrepancies",
                new { SiteId = siteId, DateFrom = dateFrom, DateTo = dateTo, Threshold = threshold },
                commandType: CommandType.StoredProcedure,
                commandTimeout: 120));
        return Ok(rows);
    }
}
