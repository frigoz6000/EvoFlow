using Dapper;
using EvoFlow.Api.Data;
using EvoFlow.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EvoFlow.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class EmailConfigController(EvoFlowDbContext db, IDapperConnectionFactory connectionFactory) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get()
    {
        using var conn = connectionFactory.CreateConnection();
        var config = await conn.QueryFirstOrDefaultAsync<EmailConfig>(
            "SELECT TOP 1 * FROM EmailConfig ORDER BY Id");
        return Ok(config);
    }

    [HttpPost]
    public async Task<IActionResult> Upsert([FromBody] EmailConfig config)
    {
        config.UpdatedUtc = DateTime.UtcNow;

        var existing = await db.EmailConfig.OrderBy(x => x.Id).FirstOrDefaultAsync();
        if (existing is null)
        {
            db.EmailConfig.Add(config);
        }
        else
        {
            existing.SmtpHost = config.SmtpHost;
            existing.SmtpPort = config.SmtpPort;
            existing.UseSsl = config.UseSsl;
            existing.Username = config.Username;
            existing.Password = config.Password;
            existing.FromEmail = config.FromEmail;
            existing.FromName = config.FromName;
            existing.IsEnabled = config.IsEnabled;
            existing.UpdatedUtc = config.UpdatedUtc;
            db.EmailConfig.Update(existing);
        }

        await db.SaveChangesAsync();
        return Ok(await db.EmailConfig.OrderBy(x => x.Id).FirstOrDefaultAsync());
    }
}
