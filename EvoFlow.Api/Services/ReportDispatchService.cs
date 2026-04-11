using Dapper;
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
            // TODO: wire up a real email provider (SMTP / SendGrid / etc.)
            // For now, log the dispatch — the infrastructure for actual sending
            // should be added when email credentials are configured.
            logger.LogInformation(
                "Report dispatch: schedule={ScheduleId} name={Name} report={Report} recipients={Recipients}",
                schedule.Id, schedule.Name, schedule.ReportType,
                string.Join(", ", recipientEmails));

            status = "Sent";
            notes = recipientEmails.Count > 0
                ? $"Would send to: {string.Join(", ", recipientEmails)}"
                : "No active recipients configured.";
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
}
