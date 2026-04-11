using Dapper;
using EvoFlow.Api.Data;
using EvoFlow.Api.Models;
using EvoFlow.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EvoFlow.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ReportDispatchesController(IDapperConnectionFactory connectionFactory, EvoFlowDbContext db,
    IEmailService emailService, IExcelReportService excelReportService) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetRecent([FromQuery] int? scheduleId, [FromQuery] int limit = 100)
    {
        using var conn = connectionFactory.CreateConnection();

        var sql = @"
            SELECT TOP (@Limit)
                d.Id, d.ReportScheduleId, d.DispatchedAt, d.Recipients, d.Status, d.Notes,
                s.Name AS ScheduleName, s.ReportType
            FROM ReportDispatches d
            JOIN ReportSchedules s ON s.Id = d.ReportScheduleId
            WHERE (@ScheduleId IS NULL OR d.ReportScheduleId = @ScheduleId)
            ORDER BY d.DispatchedAt DESC";

        var rows = await conn.QueryAsync(sql, new { Limit = limit, ScheduleId = scheduleId });
        return Ok(rows);
    }

    [HttpPost("{scheduleId:int}/send-now")]
    public async Task<IActionResult> SendNow(int scheduleId)
    {
        var schedule = await db.ReportSchedules
            .Include(s => s.Recipients)
            .ThenInclude(r => r.EmailRecipient)
            .FirstOrDefaultAsync(s => s.Id == scheduleId);

        if (schedule is null) return NotFound();

        var recipientEmails = schedule.Recipients
            .Where(r => r.EmailRecipient.IsActive)
            .Select(r => r.EmailRecipient.Email)
            .ToList();

        if (recipientEmails.Count == 0)
            return BadRequest("No active recipients on this schedule.");

        if (!emailService.IsConfigured)
            return BadRequest("Email is not configured.");

        var nowUtc = DateTime.UtcNow;
        string status, notes;

        try
        {
            var reportTypes = schedule.ReportType
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

            var attachments = new List<(byte[] Data, string FileName, string ContentType)>();
            foreach (var rt in reportTypes)
            {
                var result = await excelReportService.GenerateAsync(rt);
                if (result.HasValue)
                    attachments.Add((result.Value.Data, result.Value.FileName,
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
            }

            var reportLabel = reportTypes.Length == 1 ? reportTypes[0] : $"{reportTypes.Length} reports";
            var subject = $"EvoFlow Report: {reportLabel}";
            var body = BuildEmailBody(schedule, nowUtc, attachments.Select(a => a.FileName).ToList());
            await emailService.SendAsync(recipientEmails, subject, body, attachments);

            var fileList = attachments.Count > 0
                ? string.Join(", ", attachments.Select(a => a.FileName))
                : "none";
            notes = $"Sent to: {string.Join(", ", recipientEmails)}. Attachments: {fileList}";
            status = "Sent";
        }
        catch (Exception ex)
        {
            status = "Failed";
            notes = ex.Message;
        }

        db.ReportDispatches.Add(new ReportDispatch
        {
            ReportScheduleId = schedule.Id,
            DispatchedAt = nowUtc,
            Recipients = string.Join(", ", recipientEmails),
            Status = status,
            Notes = notes,
        });
        await db.SaveChangesAsync();

        return Ok(new { status, notes });
    }

    private static string BuildEmailBody(ReportSchedule schedule, DateTime nowUtc, List<string>? attachmentNames)
    {
        var localTime = nowUtc.ToLocalTime();
        return $"""
            <html><body style="font-family:Inter,sans-serif;color:#14172a;max-width:600px;margin:0 auto;padding:24px">
            <div style="background:#1a1d35;border-radius:10px;padding:18px 24px;margin-bottom:24px">
              <span style="color:#ffffff;font-size:18px;font-weight:700">EvoFlow</span>
              <span style="color:#8b93bc;font-size:13px;margin-left:12px">Scheduled Report</span>
            </div>
            <h2 style="margin:0 0 8px;font-size:20px">{schedule.ReportType}</h2>
            <p style="color:#5c6478;margin:0 0 24px;font-size:13px">
              Schedule: <strong>{schedule.Name}</strong> &nbsp;·&nbsp;
              Dispatched: <strong>{localTime:dd MMM yyyy HH:mm}</strong>
            </p>
            <div style="background:#f2f4f8;border-radius:8px;padding:20px;margin-bottom:24px">
              <p style="margin:0;color:#5c6478;font-size:13px">
                {(attachmentNames != null && attachmentNames.Count > 0
                    ? $"Please find the latest data attached: {string.Join(", ", attachmentNames.Select(n => $"<strong>{n}</strong>"))}."
                    : "This is an automated report notification from EvoFlow.")}
              </p>
            </div>
            {(string.IsNullOrWhiteSpace(schedule.Notes) ? "" : $"<p style='font-size:12px;color:#9ca3af'>Note: {schedule.Notes}</p>")}
            <p style="font-size:11px;color:#9ca3af;border-top:1px solid #e4e6ef;padding-top:16px;margin-top:24px">
              Sent by EvoFlow Report Scheduler · <a href="http://localhost:5019/config/report-schedules" style="color:#e91e8c">Manage schedules</a>
            </p>
            </body></html>
            """;
    }
}
