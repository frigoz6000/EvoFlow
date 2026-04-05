using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace EvoFlow.Api.Models;

[Table("PumpFlowInfo")]
public class PumpFlowInfo
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long PumpFlowInfoId { get; set; }

    public long PumpMonitoringGradeId { get; set; }

    [Required]
    [MaxLength(20)]
    public string FlowType { get; set; } = null!;

    public int TotalPumpTrans { get; set; }

    [Column(TypeName = "decimal(18,4)")]
    public decimal NominalFlowRate { get; set; }

    [Column(TypeName = "decimal(18,4)")]
    public decimal? AvgFlowRate { get; set; }

    [Column(TypeName = "decimal(18,4)")]
    public decimal? PeakFlowRate { get; set; }

    public int? AvgTimeToFlow { get; set; }
    public int? MaxTimeToFlow { get; set; }
    public int? AvgTimeToPeakFlow { get; set; }
    public int? MaxTimeToPeakFlow { get; set; }

    [ForeignKey(nameof(PumpMonitoringGradeId))]
    public PumpMonitoringGrade PumpMonitoringGrade { get; set; } = null!;
}
