using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace EvoFlow.Api.Models;

[Table("FuelTypes")]
public class FuelType
{
    [Key]
    [MaxLength(10)]
    public string FuelTypeId { get; set; } = null!;

    [Required]
    [MaxLength(100)]
    public string Name { get; set; } = null!;

    [MaxLength(200)]
    public string? Description { get; set; }

    public ICollection<FuelRecord> FuelRecords { get; set; } = [];
}
