using Dapper;
using EvoFlow.Api.Data;
using EvoFlow.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EvoFlow.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class WhatsAppConfigController(EvoFlowDbContext db, IDapperConnectionFactory connectionFactory) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get()
    {
        using var conn = connectionFactory.CreateConnection();
        var config = await conn.QueryFirstOrDefaultAsync<WhatsAppConfig>(
            "SELECT TOP 1 * FROM WhatsAppConfig ORDER BY Id");
        return Ok(config);
    }

    [HttpPost]
    public async Task<IActionResult> Upsert([FromBody] WhatsAppConfig config)
    {
        config.UpdatedUtc = DateTime.UtcNow;

        var existing = await db.WhatsAppConfig.OrderBy(x => x.Id).FirstOrDefaultAsync();
        if (existing is null)
        {
            db.WhatsAppConfig.Add(config);
        }
        else
        {
            existing.AccountSid = config.AccountSid;
            existing.AuthToken = config.AuthToken;
            existing.FromNumber = config.FromNumber;
            existing.IsEnabled = config.IsEnabled;
            existing.UpdatedUtc = config.UpdatedUtc;
            db.WhatsAppConfig.Update(existing);
        }

        await db.SaveChangesAsync();
        return Ok(await db.WhatsAppConfig.OrderBy(x => x.Id).FirstOrDefaultAsync());
    }
}
