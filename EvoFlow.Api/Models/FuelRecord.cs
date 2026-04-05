using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace EvoFlow.Api.Models;

[Table("FuelRecords")]
public class FuelRecord
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long FuelRecordId { get; set; }

    [Required]
    [MaxLength(20)]
    public string SiteId { get; set; } = null!;

    public int? VehicleId { get; set; }

    [Required]
    [MaxLength(10)]
    public string FuelTypeId { get; set; } = null!;

    public int? PumpDeviceId { get; set; }

    public DateOnly BusinessDate { get; set; }
    public DateTime TransactionUtc { get; set; }

    [Column(TypeName = "decimal(18,4)")]
    public decimal VolumeL { get; set; }

    [Column(TypeName = "decimal(18,4)")]
    public decimal AmountGBP { get; set; }

    public int? OdometerKm { get; set; }

    [ForeignKey(nameof(SiteId))]
    public Site Site { get; set; } = null!;

    [ForeignKey(nameof(VehicleId))]
    public Vehicle? Vehicle { get; set; }

    [ForeignKey(nameof(FuelTypeId))]
    public FuelType FuelType { get; set; } = null!;

    [ForeignKey(nameof(PumpDeviceId))]
    public PumpDevice? PumpDevice { get; set; }
}
