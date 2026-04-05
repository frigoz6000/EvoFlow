using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace EvoFlow.Api.Models;

[Table("PumpDevices")]
public class PumpDevice
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int PumpDeviceId { get; set; }

    [Required]
    [MaxLength(20)]
    public string SiteId { get; set; } = null!;

    [Required]
    [MaxLength(10)]
    public string DeviceId { get; set; } = null!;

    public bool Online { get; set; }
    public int OfflineCount { get; set; }

    [MaxLength(200)]
    public string? Protocol { get; set; }

    [MaxLength(16)]
    public string? TypeBitsGeneral { get; set; }

    [MaxLength(16)]
    public string? TypeBitsProtocol { get; set; }

    public DateTime LastSeenUtc { get; set; }

    [ForeignKey(nameof(SiteId))]
    public Site Site { get; set; } = null!;

    public ICollection<FuelRecord> FuelRecords { get; set; } = [];
    public ICollection<PumpMonitoring> PumpMonitorings { get; set; } = [];
    public ICollection<PumpStatus> PumpStatuses { get; set; } = [];
    public ICollection<PumpTotals> PumpTotals { get; set; } = [];
}
