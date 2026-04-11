using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace EvoFlow.Api.Models;

[Table("ReportSchedules")]
public class ReportSchedule
{
    [Key]
    public int Id { get; set; }

    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = null!;

    [Required]
    [MaxLength(100)]
    public string ReportType { get; set; } = null!;

    /// <summary>Daily | Weekly | Monthly</summary>
    [Required]
    [MaxLength(20)]
    public string RecurrencePattern { get; set; } = null!;

    /// <summary>Comma-separated day numbers: 1=Mon … 7=Sun. Used when RecurrencePattern = Weekly.</summary>
    [MaxLength(20)]
    public string? DaysOfWeek { get; set; }

    /// <summary>Day of month (1-28). Used when RecurrencePattern = Monthly.</summary>
    public int? DayOfMonth { get; set; }

    public TimeOnly TimeOfDay { get; set; }

    public bool IsEnabled { get; set; } = true;

    [MaxLength(500)]
    public string? Notes { get; set; }

    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedUtc { get; set; } = DateTime.UtcNow;

    public ICollection<ReportScheduleRecipient> Recipients { get; set; } = [];
}
