using EvoFlow.Api.Data;
using EvoFlow.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace EvoFlow.Api.Services;

public class ReportDispatchService(IServiceScopeFactory scopeFactory, ILogger<ReportDispatchService> logger)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("ReportDispatchService started.");

        // Align to the next full minute boundary before entering the main loop
        var now = DateTime.UtcNow;
        var delay = TimeSpan.FromSeconds(60 - now.Second);
        await Task.Delay(delay, stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await CheckAndDispatchAsync();
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Error in ReportDispatchService.");
            }

            // Wait until the top of the next minute
            now = DateTime.UtcNow;
            var next = TimeSpan.FromSeconds(60 - now.Second);
            await Task.Delay(next, stoppingToken);
        }
    }

    private async Task CheckAndDispatchAsync()
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<EvoFlowDbContext>();

        var nowUtc = DateTime.UtcNow;
        var localNow = DateTime.Now; // Use local time to match configured schedule times
        var currentTime = TimeOnly.FromDateTime(localNow);
        var currentDayOfWeek = ((int)localNow.DayOfWeek == 0 ? 7 : (int)localNow.DayOfWeek); // 1=Mon…7=Sun

        var schedules = await db.ReportSchedules
            .Include(s => s.Recipients)
            .ThenInclude(r => r.EmailRecipient)
            .Where(s => s.IsEnabled)
            .ToListAsync();

        foreach (var schedule in schedules)
        {
            if (!IsDue(schedule, currentTime, currentDayOfWeek, localNow.Day))
                continue;

            // Idempotency: skip if already dispatched in this minute window
            var windowStart = nowUtc.AddMinutes(-1);
            var alreadySent = await db.ReportDispatches
                .AnyAsync(d => d.ReportScheduleId == schedule.Id && d.DispatchedAt >= windowStart);

            if (alreadySent)
                continue;

            await DispatchAsync(db, schedule, nowUtc);
        }
    }

    private static bool IsDue(ReportSchedule schedule, TimeOnly currentTime, int currentDayOfWeek, int currentDayOfMonth)
    {
        // Check if we're within the configured minute (±30 sec tolerance)
        var diff = Math.Abs((currentTime - schedule.TimeOfDay).TotalMinutes);
        if (diff > 0.5 && diff < 1439.5) // 1439.5 = wrap-around tolerance
            return false;

        return schedule.RecurrencePattern switch
        {
            "Daily" => true,
            "Weekly" => schedule.DaysOfWeek != null &&
                        schedule.DaysOfWeek.Split(',').Contains(currentDayOfWeek.ToString()),
            "Monthly" => schedule.DayOfMonth.HasValue && schedule.DayOfMonth.Value == currentDayOfMonth,
            _ => false
        };
    }

    private async Task DispatchAsync(EvoFlowDbContext db, ReportSchedule schedule, DateTime nowUtc)
    {
        var recipientEmails = schedule.Recipients
            .Where(r => r.EmailRecipient.IsActive)
            .Select(r => r.EmailRecipient.Email)
            .ToList();

        string status;
        string notes;

        try
        {
            using var scope = scopeFactory.CreateScope();
            var emailService = scope.ServiceProvider.GetRequiredService<IEmailService>();

            if (recipientEmails.Count == 0)
            {
                status = "Skipped";
                notes = "No active recipients configured for this schedule.";
            }
            else if (!emailService.IsConfigured)
            {
                logger.LogWarning("Email not configured — report dispatch logged only. Configure Email settings in appsettings.json.");
                status = "Skipped";
                notes = $"Email not configured. Would send to: {string.Join(", ", recipientEmails)}";
            }
            else
            {
                var reportGenerator = scope.ServiceProvider.GetRequiredService<IExcelReportService>();
                var excelResult = await reportGenerator.GenerateAsync(schedule.ReportType);

                var subject = $"EvoFlow Report: {schedule.ReportType}";
                var body = BuildEmailBody(schedule, nowUtc, excelResult?.FileName);

                if (excelResult.HasValue)
                {
                    var attachments = new[] { (excelResult.Value.Data, excelResult.Value.FileName,
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") };
                    await emailService.SendAsync(recipientEmails, subject, body, attachments);
                    notes = $"Sent to: {string.Join(", ", recipientEmails)}. Attachment: {excelResult.Value.FileName}";
                }
                else
                {
                    await emailService.SendAsync(recipientEmails, subject, body);
                    notes = $"Sent to: {string.Join(", ", recipientEmails)}. (No attachment — report generation failed)";
                }
                status = "Sent";
            }

            logger.LogInformation(
                "Report dispatch: schedule={ScheduleId} name={Name} status={Status}",
                schedule.Id, schedule.Name, status);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to dispatch report schedule {ScheduleId}", schedule.Id);
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
    }

    private static string BuildEmailBody(ReportSchedule schedule, DateTime nowUtc, string? attachmentName = null)
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
                {(attachmentName != null
                    ? $"Please find the latest data attached as <strong>{attachmentName}</strong>."
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
