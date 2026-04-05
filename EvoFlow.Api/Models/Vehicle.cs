using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace EvoFlow.Api.Models;

[Table("Vehicles")]
public class Vehicle
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int VehicleId { get; set; }

    [Required]
    [MaxLength(20)]
    public string Registration { get; set; } = null!;

    [MaxLength(20)]
    public string? FleetNumber { get; set; }

    [MaxLength(200)]
    public string? Description { get; set; }

    [MaxLength(50)]
    public string? VehicleType { get; set; }

    public bool Active { get; set; }

    public ICollection<FuelRecord> FuelRecords { get; set; } = [];
}
