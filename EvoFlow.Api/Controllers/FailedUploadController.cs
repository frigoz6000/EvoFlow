using Dapper;
using EvoFlow.Api.Data;
using Microsoft.AspNetCore.Mvc;

namespace EvoFlow.Api.Controllers;

[ApiController]
[Route("api/import")]
public class FailedUploadController(IDapperConnectionFactory connectionFactory, ILogger<FailedUploadController> logger) : ControllerBase
{
    private const string InsertSql = @"
        INSERT INTO ImportLog (FileName, Status, Message, ImportedAtUtc)
        OUTPUT INSERTED.Id
        VALUES (@FileName, 'failed', @Message, @ImportedAtUtc)";

    private const string GetAllSql = @"
        SELECT Id, FileName, Status, Message, ImportedAtUtc
        FROM ImportLog
        ORDER BY ImportedAtUtc DESC";

    /// <summary>
    /// Records a failed DOMS XML file upload in the ImportLog table.
    /// Called by the Windows Service after all retries are exhausted.
    /// </summary>
    [HttpPost("failed-upload")]
    public async Task<IActionResult> RecordFailure([FromBody] FailedUploadRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.FileName))
            return BadRequest(new { error = "FileName is required." });

        var now = DateTime.UtcNow;
        using var conn = connectionFactory.CreateConnection();
        var id = await conn.ExecuteScalarAsync<int>(InsertSql, new
        {
            FileName = request.FileName,
            Message = request.Message ?? "Unknown error",
            ImportedAtUtc = now
        });

        logger.LogWarning("Failed upload recorded: {File} - {Message}", request.FileName, request.Message);
        return Ok(new { id, fileName = request.FileName, status = "failed", importedAtUtc = now });
    }

    /// <summary>
    /// Returns all import log entries (successes and failures) for data integrity review.
    /// </summary>
    [HttpGet("log")]
    public async Task<IActionResult> GetLog()
    {
        using var conn = connectionFactory.CreateConnection();
        var rows = await conn.QueryAsync<ImportLogRow>(new CommandDefinition(GetAllSql, commandTimeout: 30));
        return Ok(rows);
    }
}

public class FailedUploadRequest
{
    public string FileName { get; set; } = "";
    public string? Message { get; set; }
}

public class ImportLogRow
{
    public int Id { get; set; }
    public string FileName { get; set; } = "";
    public string Status { get; set; } = "";
    public string? Message { get; set; }
    public DateTime ImportedAtUtc { get; set; }
}
