using Dapper;
using EvoFlow.Api.Data;
using EvoFlow.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EvoFlow.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AlarmSettingsController(EvoFlowDbContext db, IDapperConnectionFactory connectionFactory) : ControllerBase
{
    // GET api/alarmsettings — returns all alarm types with their current setting (if any) and assigned recipients
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        using var conn = connectionFactory.CreateConnection();

        var alarmTypes = await conn.QueryAsync<AlarmType>(
            "SELECT * FROM AlarmTypes ORDER BY Category, Name");

        var settings = await conn.QueryAsync<AlarmSetting>(
            "SELECT * FROM AlarmSettings");

        var recipients = await conn.QueryAsync<dynamic>(
            @"SELECT asr.AlarmSettingId, er.Id, er.Email, er.Name
              FROM AlarmSettingRecipients asr
              JOIN EmailRecipients er ON er.Id = asr.EmailRecipientId");

        var settingsDict = settings.ToDictionary(s => s.AlarmTypeId);
        var recipientsLookup = recipients
            .GroupBy(r => (int)r.AlarmSettingId)
            .ToDictionary(g => g.Key, g => g.Select(r => new { id = (int)r.Id, email = (string)r.Email, name = (string?)r.Name }).ToList());

        var result = alarmTypes.Select(at =>
        {
            settingsDict.TryGetValue(at.Id, out var setting);
            var settingRecipients = setting != null && recipientsLookup.TryGetValue(setting.Id, out var rList) ? rList : [];
            return new
            {
                alarmType = at,
                setting = setting == null ? null : new
                {
                    setting.Id,
                    setting.AlarmTypeId,
                    setting.IsEnabled,
                    setting.Notes,
                    setting.UpdatedUtc
                },
                recipients = settingRecipients
            };
        });

        return Ok(result);
    }

    // POST api/alarmsettings — create or update alarm setting with recipient list
    [HttpPost]
    public async Task<IActionResult> Upsert([FromBody] UpsertAlarmSettingRequest request)
    {
        var existing = await db.AlarmSettings
            .Include(s => s.Recipients)
            .FirstOrDefaultAsync(s => s.AlarmTypeId == request.AlarmTypeId);

        if (existing == null)
        {
            existing = new AlarmSetting
            {
                AlarmTypeId = request.AlarmTypeId,
                IsEnabled = request.IsEnabled,
                Notes = request.Notes,
                CreatedUtc = DateTime.UtcNow,
                UpdatedUtc = DateTime.UtcNow
            };
            db.AlarmSettings.Add(existing);
            await db.SaveChangesAsync();
        }
        else
        {
            existing.IsEnabled = request.IsEnabled;
            existing.Notes = request.Notes;
            existing.UpdatedUtc = DateTime.UtcNow;
            db.AlarmSettingRecipients.RemoveRange(existing.Recipients);
            await db.SaveChangesAsync();
        }

        if (request.RecipientIds?.Count > 0)
        {
            var newRecipients = request.RecipientIds.Select(rid => new AlarmSettingRecipient
            {
                AlarmSettingId = existing.Id,
                EmailRecipientId = rid
            });
            db.AlarmSettingRecipients.AddRange(newRecipients);
            await db.SaveChangesAsync();
        }

        return Ok(new { existing.Id });
    }
}

public class UpsertAlarmSettingRequest
{
    public int AlarmTypeId { get; set; }
    public bool IsEnabled { get; set; }
    public string? Notes { get; set; }
    public List<int>? RecipientIds { get; set; }
}
