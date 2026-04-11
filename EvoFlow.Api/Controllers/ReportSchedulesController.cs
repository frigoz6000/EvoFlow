using Dapper;
using EvoFlow.Api.Data;
using EvoFlow.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EvoFlow.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ReportSchedulesController(EvoFlowDbContext db, IDapperConnectionFactory connectionFactory) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        using var conn = connectionFactory.CreateConnection();

        var schedules = await conn.QueryAsync<ReportSchedule>(
            "SELECT * FROM ReportSchedules ORDER BY Name");

        var recipients = await conn.QueryAsync<dynamic>(
            @"SELECT rsr.ReportScheduleId, er.Id, er.Email, er.Name
              FROM ReportScheduleRecipients rsr
              JOIN EmailRecipients er ON er.Id = rsr.EmailRecipientId");

        var recipientsLookup = recipients
            .GroupBy(r => (int)r.ReportScheduleId)
            .ToDictionary(
                g => g.Key,
                g => g.Select(r => new { id = (int)r.Id, email = (string)r.Email, name = (string?)r.Name }).ToList());

        var result = schedules.Select(s =>
        {
            recipientsLookup.TryGetValue(s.Id, out var rList);
            return new
            {
                schedule = new
                {
                    s.Id, s.Name, s.ReportType, s.RecurrencePattern,
                    s.DaysOfWeek, s.DayOfMonth,
                    timeOfDay = s.TimeOfDay.ToString("HH:mm"),
                    s.IsEnabled, s.Notes, s.UpdatedUtc
                },
                recipients = rList ?? []
            };
        });

        return Ok(result);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] SaveReportScheduleRequest request)
    {
        var schedule = new ReportSchedule
        {
            Name = request.Name,
            ReportType = request.ReportType,
            RecurrencePattern = request.RecurrencePattern,
            DaysOfWeek = request.DaysOfWeek,
            DayOfMonth = request.DayOfMonth,
            TimeOfDay = TimeOnly.Parse(request.TimeOfDay),
            IsEnabled = request.IsEnabled,
            Notes = request.Notes,
            CreatedUtc = DateTime.UtcNow,
            UpdatedUtc = DateTime.UtcNow
        };
        db.ReportSchedules.Add(schedule);
        await db.SaveChangesAsync();

        if (request.RecipientIds?.Count > 0)
        {
            db.ReportScheduleRecipients.AddRange(
                request.RecipientIds.Select(rid => new ReportScheduleRecipient
                {
                    ReportScheduleId = schedule.Id,
                    EmailRecipientId = rid
                }));
            await db.SaveChangesAsync();
        }

        return CreatedAtAction(nameof(GetAll), new { id = schedule.Id }, new { schedule.Id });
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] SaveReportScheduleRequest request)
    {
        var schedule = await db.ReportSchedules
            .Include(s => s.Recipients)
            .FirstOrDefaultAsync(s => s.Id == id);

        if (schedule is null) return NotFound();

        schedule.Name = request.Name;
        schedule.ReportType = request.ReportType;
        schedule.RecurrencePattern = request.RecurrencePattern;
        schedule.DaysOfWeek = request.DaysOfWeek;
        schedule.DayOfMonth = request.DayOfMonth;
        schedule.TimeOfDay = TimeOnly.Parse(request.TimeOfDay);
        schedule.IsEnabled = request.IsEnabled;
        schedule.Notes = request.Notes;
        schedule.UpdatedUtc = DateTime.UtcNow;

        db.ReportScheduleRecipients.RemoveRange(schedule.Recipients);
        await db.SaveChangesAsync();

        if (request.RecipientIds?.Count > 0)
        {
            db.ReportScheduleRecipients.AddRange(
                request.RecipientIds.Select(rid => new ReportScheduleRecipient
                {
                    ReportScheduleId = schedule.Id,
                    EmailRecipientId = rid
                }));
            await db.SaveChangesAsync();
        }

        return NoContent();
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var schedule = await db.ReportSchedules.FindAsync(id);
        if (schedule is null) return NotFound();
        db.ReportSchedules.Remove(schedule);
        await db.SaveChangesAsync();
        return NoContent();
    }
}

public class SaveReportScheduleRequest
{
    public string Name { get; set; } = null!;
    public string ReportType { get; set; } = null!;
    public string RecurrencePattern { get; set; } = null!;
    public string? DaysOfWeek { get; set; }
    public int? DayOfMonth { get; set; }
    public string TimeOfDay { get; set; } = null!;
    public bool IsEnabled { get; set; }
    public string? Notes { get; set; }
    public List<int>? RecipientIds { get; set; }
}
