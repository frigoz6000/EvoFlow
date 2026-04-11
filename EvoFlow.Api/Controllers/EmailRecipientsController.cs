using Dapper;
using EvoFlow.Api.Data;
using EvoFlow.Api.Models;
using Microsoft.AspNetCore.Mvc;

namespace EvoFlow.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class EmailRecipientsController(EvoFlowDbContext db, IDapperConnectionFactory connectionFactory) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        using var conn = connectionFactory.CreateConnection();
        var recipients = await conn.QueryAsync<EmailRecipient>(
            "SELECT * FROM EmailRecipients ORDER BY Name, Email");
        return Ok(recipients);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] EmailRecipient recipient)
    {
        recipient.CreatedUtc = DateTime.UtcNow;
        db.EmailRecipients.Add(recipient);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetAll), new { id = recipient.Id }, recipient);
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] EmailRecipient recipient)
    {
        if (id != recipient.Id) return BadRequest();
        db.EmailRecipients.Update(recipient);
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var recipient = await db.EmailRecipients.FindAsync(id);
        if (recipient is null) return NotFound();
        db.EmailRecipients.Remove(recipient);
        await db.SaveChangesAsync();
        return NoContent();
    }
}
