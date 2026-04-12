using Dapper;
using EvoFlow.Api.Data;
using EvoFlow.Api.Models;
using Microsoft.AspNetCore.Mvc;

namespace EvoFlow.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class EmailLogController(IDapperConnectionFactory connectionFactory) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        if (page < 1) page = 1;
        if (pageSize < 1 || pageSize > 200) pageSize = 50;

        using var conn = connectionFactory.CreateConnection();
        var offset = (page - 1) * pageSize;

        var rows = await conn.QueryAsync<EmailLog>(
            @"SELECT * FROM EmailLog ORDER BY SentAtUtc DESC OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY",
            new { Offset = offset, PageSize = pageSize });

        var total = await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM EmailLog");

        return Ok(new { total, page, pageSize, rows });
    }
}
