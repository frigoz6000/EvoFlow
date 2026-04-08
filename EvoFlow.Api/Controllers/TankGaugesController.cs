using Dapper;
using EvoFlow.Api.Data;
using Microsoft.AspNetCore.Mvc;

namespace EvoFlow.Api.Controllers;

public class TankGaugeRow
{
    public int TankGaugeId { get; set; }
    public string SiteId { get; set; } = "";
    public string SiteName { get; set; } = "";
    public string DeviceId { get; set; } = "";
    public bool Online { get; set; }
    public int OfflineCount { get; set; }
    public string Protocol { get; set; } = "";
    public string TypeBits { get; set; } = "";
    public string TankId { get; set; } = "";
    public decimal Capacity { get; set; }
    public decimal TankHeight { get; set; }
    public decimal ShellCapacity { get; set; }
    public DateOnly BusinessDate { get; set; }
    public TimeOnly DataTime { get; set; }
    public decimal Gauged { get; set; }
    public decimal GaugedDif { get; set; }
    public decimal Ullage { get; set; }
    public decimal ProdHeight { get; set; }
    public decimal Temp { get; set; }
    public decimal TcCorrVol { get; set; }
    public decimal WaterVol { get; set; }
    public decimal WaterHeight { get; set; }
    public int Uptime { get; set; }
    public DateTime CreatedUtc { get; set; }
}

public class TankGaugeUpsert
{
    public string SiteId { get; set; } = "";
    public string DeviceId { get; set; } = "";
    public bool Online { get; set; }
    public int OfflineCount { get; set; }
    public string Protocol { get; set; } = "VeederRoot Tank Gauge (9600)";
    public string TypeBits { get; set; } = "0000000000000000";
    public string TankId { get; set; } = "";
    public decimal Capacity { get; set; }
    public decimal TankHeight { get; set; }
    public decimal ShellCapacity { get; set; }
    public DateOnly BusinessDate { get; set; }
    public TimeOnly DataTime { get; set; }
    public decimal Gauged { get; set; }
    public decimal GaugedDif { get; set; }
    public decimal Ullage { get; set; }
    public decimal ProdHeight { get; set; }
    public decimal Temp { get; set; }
    public decimal TcCorrVol { get; set; }
    public decimal WaterVol { get; set; }
    public decimal WaterHeight { get; set; }
    public int Uptime { get; set; }
}

[ApiController]
[Route("api/tankgauges")]
public class TankGaugesController(IDapperConnectionFactory connectionFactory) : ControllerBase
{
    private const string ReadSql = @"
        SELECT
            tg.TankGaugeId, tg.SiteId, s.SiteName, tg.DeviceId,
            tg.Online, tg.OfflineCount, tg.Protocol, tg.TypeBits,
            tg.TankId, tg.Capacity, tg.TankHeight, tg.ShellCapacity,
            tg.BusinessDate, tg.DataTime,
            tg.Gauged, tg.GaugedDif, tg.Ullage, tg.ProdHeight, tg.Temp,
            tg.TcCorrVol, tg.WaterVol, tg.WaterHeight, tg.Uptime, tg.CreatedUtc
        FROM TankGauges tg
        JOIN Sites s ON s.SiteId = tg.SiteId
        WHERE (@SiteId   IS NULL OR tg.SiteId      = @SiteId)
          AND (@DateFrom IS NULL OR tg.BusinessDate >= @DateFrom)
          AND (@DateTo   IS NULL OR tg.BusinessDate <= @DateTo)
        ORDER BY tg.BusinessDate DESC, tg.SiteId, tg.DeviceId, tg.TankId";

    private const string InsertSql = @"
        INSERT INTO TankGauges
            (SiteId, DeviceId, Online, OfflineCount, Protocol, TypeBits,
             TankId, Capacity, TankHeight, ShellCapacity,
             BusinessDate, DataTime, Gauged, GaugedDif, Ullage, ProdHeight, Temp,
             TcCorrVol, WaterVol, WaterHeight, Uptime, CreatedUtc)
        VALUES
            (@SiteId, @DeviceId, @Online, @OfflineCount, @Protocol, @TypeBits,
             @TankId, @Capacity, @TankHeight, @ShellCapacity,
             @BusinessDate, @DataTime, @Gauged, @GaugedDif, @Ullage, @ProdHeight, @Temp,
             @TcCorrVol, @WaterVol, @WaterHeight, @Uptime, GETUTCDATE())";

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? siteId = null,
        [FromQuery] DateOnly? dateFrom = null,
        [FromQuery] DateOnly? dateTo = null)
    {
        using var conn = connectionFactory.CreateConnection();
        var rows = await conn.QueryAsync<TankGaugeRow>(
            new CommandDefinition(ReadSql, new { SiteId = siteId, DateFrom = dateFrom, DateTo = dateTo }, commandTimeout: 60));
        return Ok(rows);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] TankGaugeUpsert dto)
    {
        using var conn = connectionFactory.CreateConnection();
        await conn.ExecuteAsync(InsertSql, dto);
        return Created("", new { message = "Tank gauge record created." });
    }
}
