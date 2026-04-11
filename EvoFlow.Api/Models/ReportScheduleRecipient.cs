using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace EvoFlow.Api.Models;

[Table("ReportScheduleRecipients")]
public class ReportScheduleRecipient
{
    [Key]
    public int Id { get; set; }

    public int ReportScheduleId { get; set; }
    public int EmailRecipientId { get; set; }

    public ReportSchedule ReportSchedule { get; set; } = null!;
    public EmailRecipient EmailRecipient { get; set; } = null!;
}
