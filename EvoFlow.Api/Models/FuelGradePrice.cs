using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace EvoFlow.Api.Models;

[Table("FuelGradePrices")]
public class FuelGradePrice
{
    [Required]
    [MaxLength(20)]
    [Column(TypeName = "varchar(20)")]
    public string SiteId { get; set; } = null!;

    [Required]
    [MaxLength(20)]
    [Column(TypeName = "varchar(20)")]
    public string GradeId { get; set; } = null!;

    [Required]
    [MaxLength(50)]
    [Column(TypeName = "varchar(50)")]
    public string GradeDescription { get; set; } = null!;

    [Required]
    [MaxLength(20)]
    [Column(TypeName = "varchar(20)")]
    public string GradeShortCode { get; set; } = null!;

    [Column(TypeName = "decimal(18,4)")]
    public decimal GradeUnitPrice { get; set; }

    public DateTime? DtFuelChange { get; set; }
    public DateTime? DtSentToGov { get; set; }
    public DateTime? DtLastReceived { get; set; }

    [ForeignKey(nameof(SiteId))]
    public Site Site { get; set; } = null!;
}
