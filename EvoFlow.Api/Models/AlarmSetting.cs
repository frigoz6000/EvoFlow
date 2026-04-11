using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace EvoFlow.Api.Models;

[Table("AlarmSettings")]
public class AlarmSetting
{
    [Key]
    public int Id { get; set; }

    public int AlarmTypeId { get; set; }

    public bool IsEnabled { get; set; } = false;

    [MaxLength(500)]
    public string? Notes { get; set; }

    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedUtc { get; set; } = DateTime.UtcNow;

    public AlarmType AlarmType { get; set; } = null!;
    public ICollection<AlarmSettingRecipient> Recipients { get; set; } = [];
}
