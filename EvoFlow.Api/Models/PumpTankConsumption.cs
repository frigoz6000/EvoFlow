using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace EvoFlow.Api.Models;

[Table("PumpTankConsumption")]
public class PumpTankConsumption
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long PumpTankConsumptionId { get; set; }

    public long PumpGradeTotalsId { get; set; }

    [Required]
    [MaxLength(10)]
    public string TankId { get; set; } = null!;

    [Column(TypeName = "decimal(18,4)")]
    public decimal VolumeTotal { get; set; }

    [Column(TypeName = "decimal(18,4)")]
    public decimal VolumeDiff { get; set; }

    [ForeignKey(nameof(PumpGradeTotalsId))]
    public PumpGradeTotals PumpGradeTotals { get; set; } = null!;
}
