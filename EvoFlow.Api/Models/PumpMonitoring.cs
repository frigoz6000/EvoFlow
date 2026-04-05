using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace EvoFlow.Api.Models;

[Table("PumpMonitoring")]
public class PumpMonitoring
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long PumpMonitoringId { get; set; }

    public int PumpDeviceId { get; set; }
    public DateOnly BusinessDate { get; set; }
    public DateTime SnapshotUtc { get; set; }

    [Column(TypeName = "decimal(18,4)")]
    public decimal HiSpeedTrigFlow { get; set; }

    [ForeignKey(nameof(PumpDeviceId))]
    public PumpDevice PumpDevice { get; set; } = null!;

    public ICollection<PumpMonitoringGrade> PumpMonitoringGrades { get; set; } = [];
}
