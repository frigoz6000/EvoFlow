using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace EvoFlow.Api.Models;

[Table("Sites")]
public class Site
{
    [Key]
    [MaxLength(20)]
    public string SiteId { get; set; } = null!;

    [Required]
    [MaxLength(200)]
    public string SiteName { get; set; } = null!;

    public TimeOnly? OpeningHour { get; set; }
    public TimeOnly? ClosingHour { get; set; }

    [MaxLength(200)]
    public string? Address1 { get; set; }

    [MaxLength(200)]
    public string? Address2 { get; set; }

    [MaxLength(100)]
    public string? City { get; set; }

    [MaxLength(100)]
    public string? County { get; set; }

    [MaxLength(20)]
    public string? PostCode { get; set; }

    [MaxLength(20)]
    public string? PoleSign { get; set; }

    public DateTime CreatedUtc { get; set; }

    public ICollection<PumpDevice> PumpDevices { get; set; } = [];
    public ICollection<FuelRecord> FuelRecords { get; set; } = [];
}
