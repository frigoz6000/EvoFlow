using Dapper;
using EvoFlow.Api.Data;
using Microsoft.AspNetCore.Mvc;

namespace EvoFlow.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DeliverectOrdersController(IDapperConnectionFactory connectionFactory) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? siteId,
        [FromQuery] string? from,
        [FromQuery] string? to,
        [FromQuery] string? workStationId,
        [FromQuery] bool? latePickedNotCollected)
    {
        using var conn = connectionFactory.CreateConnection();

        var conditions = new List<string>();
        var p = new DynamicParameters();

        if (!string.IsNullOrWhiteSpace(siteId))
        {
            conditions.Add("SiteId = @SiteId");
            p.Add("SiteId", siteId);
        }

        if (DateOnly.TryParse(from, out var fromDate))
        {
            conditions.Add("OrderDate >= @From");
            p.Add("From", fromDate);
        }

        if (DateOnly.TryParse(to, out var toDate))
        {
            conditions.Add("OrderDate <= @To");
            p.Add("To", toDate);
        }

        if (!string.IsNullOrWhiteSpace(workStationId))
        {
            conditions.Add("WorkStationId = @WorkStationId");
            p.Add("WorkStationId", workStationId);
        }

        if (latePickedNotCollected == true)
        {
            conditions.Add("OrderPickedDateTime IS NOT NULL");
            conditions.Add("OrderCollectedDateTime IS NULL");
            conditions.Add("OrderPickedDateTime < DATEADD(HOUR, -2, GETUTCDATE())");
        }

        var where = conditions.Count > 0 ? "WHERE " + string.Join(" AND ", conditions) : "";

        var sql = $@"
            SELECT
                OrderId                         AS orderId,
                SiteId                          AS siteId,
                CONVERT(varchar(10), OrderDate, 120)                       AS orderDate,
                CONVERT(varchar(23), OrderReceivedAtSiteDateTime, 126)     AS orderReceivedAtSiteDateTime,
                CONVERT(varchar(23), OrderPickedDateTime, 126)             AS orderPickedDateTime,
                CONVERT(varchar(23), OrderReadyForCollectionDateTime, 126) AS orderReadyForCollectionDateTime,
                CONVERT(varchar(23), OrderCollectedDateTime, 126)          AS orderCollectedDateTime,
                CONVERT(varchar(23), TransactionDateTime, 126)             AS transactionDateTime,
                WorkStationId                   AS workStationId,
                TransactionNumber               AS transactionNumber
            FROM DeliverectOrders
            {where}
            ORDER BY OrderReceivedAtSiteDateTime DESC";

        var rows = await conn.QueryAsync(sql, p);
        return Ok(rows);
    }
}
