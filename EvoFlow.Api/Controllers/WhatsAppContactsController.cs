using Dapper;
using EvoFlow.Api.Data;
using EvoFlow.Api.Models;
using Microsoft.AspNetCore.Mvc;

namespace EvoFlow.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class WhatsAppContactsController(EvoFlowDbContext db, IDapperConnectionFactory connectionFactory) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        using var conn = connectionFactory.CreateConnection();
        var contacts = await conn.QueryAsync<WhatsAppContact>(
            "SELECT * FROM WhatsAppContacts ORDER BY Name");
        return Ok(contacts);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] WhatsAppContact contact)
    {
        contact.CreatedUtc = DateTime.UtcNow;
        db.WhatsAppContacts.Add(contact);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetAll), new { id = contact.Id }, contact);
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] WhatsAppContact contact)
    {
        if (id != contact.Id) return BadRequest();
        db.WhatsAppContacts.Update(contact);
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var contact = await db.WhatsAppContacts.FindAsync(id);
        if (contact is null) return NotFound();
        db.WhatsAppContacts.Remove(contact);
        await db.SaveChangesAsync();
        return NoContent();
    }
}
