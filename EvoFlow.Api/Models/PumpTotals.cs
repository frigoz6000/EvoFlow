using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace EvoFlow.Api.Models;

[Table("PumpTotals")]
public class PumpTotals
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long PumpTotalsId { get; set; }

    public int PumpDeviceId { get; set; }
    public DateOnly BusinessDate { get; set; }
    public DateTime SnapshotUtc { get; set; }

    [Required]
    [MaxLength(10)]
    public string TotType { get; set; } = null!;

    [Column(TypeName = "decimal(18,4)")]
    public decimal MoneyTotal { get; set; }

    [Column(TypeName = "decimal(18,4)")]
    public decimal MoneyDiff { get; set; }

    [Column(TypeName = "decimal(18,4)")]
    public decimal VolumeTotal { get; set; }

    [Column(TypeName = "decimal(18,4)")]
    public decimal VolumeDiff { get; set; }

    [ForeignKey(nameof(PumpDeviceId))]
    public PumpDevice PumpDevice { get; set; } = null!;

    public ICollection<PumpGradeTotals> PumpGradeTotals { get; set; } = [];
}
