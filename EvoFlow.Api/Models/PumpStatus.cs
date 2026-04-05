using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace EvoFlow.Api.Models;

[Table("PumpStatus")]
public class PumpStatus
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long PumpStatusId { get; set; }

    public int PumpDeviceId { get; set; }
    public DateOnly BusinessDate { get; set; }
    public DateTime SnapshotUtc { get; set; }

    [Required]
    [MaxLength(20)]
    public string State { get; set; } = null!;

    [MaxLength(16)]
    public string? SubStateBits { get; set; }

    [MaxLength(16)]
    public string? SubState2Bits { get; set; }

    [ForeignKey(nameof(PumpDeviceId))]
    public PumpDevice PumpDevice { get; set; } = null!;
}
