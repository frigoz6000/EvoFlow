using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace EvoFlow.Api.Models;

[Table("PumpMonitoringGrade")]
public class PumpMonitoringGrade
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long PumpMonitoringGradeId { get; set; }

    public long PumpMonitoringId { get; set; }
    public int GradeOption { get; set; }
    public int TotalPumpTrans { get; set; }
    public int ZeroTrans { get; set; }
    public int NoPeakHourZeroTrans { get; set; }
    public int UptimeMinutes { get; set; }

    [ForeignKey(nameof(PumpMonitoringId))]
    public PumpMonitoring PumpMonitoring { get; set; } = null!;

    public ICollection<PumpFlowInfo> PumpFlowInfos { get; set; } = [];
}
