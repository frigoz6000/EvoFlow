using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace EvoFlow.Api.Models;

[Table("PumpGradeTotals")]
public class PumpGradeTotals
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long PumpGradeTotalsId { get; set; }

    public long PumpTotalsId { get; set; }

    [Column(TypeName = "decimal(18,4)")]
    public decimal VolumeTotal { get; set; }

    [Column(TypeName = "decimal(18,4)")]
    public decimal VolumeDiff { get; set; }

    public int GradeOption { get; set; }

    [Required]
    [MaxLength(10)]
    public string GradeId { get; set; } = null!;

    [ForeignKey(nameof(PumpTotalsId))]
    public PumpTotals PumpTotals { get; set; } = null!;

    public ICollection<PumpTankConsumption> PumpTankConsumptions { get; set; } = [];
}
