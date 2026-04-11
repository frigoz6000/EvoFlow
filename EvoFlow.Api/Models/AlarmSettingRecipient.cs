using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace EvoFlow.Api.Models;

[Table("AlarmSettingRecipients")]
public class AlarmSettingRecipient
{
    [Key]
    public int Id { get; set; }

    public int AlarmSettingId { get; set; }
    public int EmailRecipientId { get; set; }

    public AlarmSetting AlarmSetting { get; set; } = null!;
    public EmailRecipient EmailRecipient { get; set; } = null!;
}
