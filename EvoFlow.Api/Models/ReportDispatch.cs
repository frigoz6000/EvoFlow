using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace EvoFlow.Api.Models;

[Table("ReportDispatches")]
public class ReportDispatch
{
    [Key]
    public int Id { get; set; }

    public int ReportScheduleId { get; set; }

    /// <summary>The UTC time this dispatch was triggered.</summary>
    public DateTime DispatchedAt { get; set; }

    /// <summary>Comma-separated list of email addresses the report was sent to.</summary>
    [MaxLength(2000)]
    public string? Recipients { get; set; }

    /// <summary>Sent | Failed | Skipped</summary>
    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = null!;

    [MaxLength(1000)]
    public string? Notes { get; set; }

    public ReportSchedule ReportSchedule { get; set; } = null!;
}
