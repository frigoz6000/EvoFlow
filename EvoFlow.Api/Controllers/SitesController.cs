using Dapper;
using EvoFlow.Api.Data;
using EvoFlow.Api.Models;
using Microsoft.AspNetCore.Mvc;

namespace EvoFlow.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SitesController(EvoFlowDbContext db, IDapperConnectionFactory connectionFactory) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        using var conn = connectionFactory.CreateConnection();
        var sites = await conn.QueryAsync<Site>("SELECT * FROM Sites ORDER BY SiteId");
        return Ok(sites);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(string id)
    {
        using var conn = connectionFactory.CreateConnection();
        var site = await conn.QuerySingleOrDefaultAsync<Site>(
            "SELECT * FROM Sites WHERE SiteId = @SiteId", new { SiteId = id });
        return site is null ? NotFound() : Ok(site);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Site site)
    {
        db.Sites.Add(site);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = site.SiteId }, site);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(string id, [FromBody] Site site)
    {
        if (id != site.SiteId) return BadRequest();
        db.Sites.Update(site);
        await db.SaveChangesAsync();
        return NoContent();
    }
}
