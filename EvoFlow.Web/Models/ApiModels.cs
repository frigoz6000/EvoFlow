namespace EvoFlow.Web.Models;

public class Site
{
    public string SiteId { get; set; } = "";
    public string SiteName { get; set; } = "";
    public string? OpeningHour { get; set; }
    public string? ClosingHour { get; set; }
    public string? Address1 { get; set; }
    public string? City { get; set; }
    public string? PostCode { get; set; }
    public DateTime CreatedUtc { get; set; }
}

public class PumpDevice
{
    public int PumpDeviceId { get; set; }
    public string SiteId { get; set; } = "";
    public string DeviceId { get; set; } = "";
    public bool Online { get; set; }
    public int OfflineCount { get; set; }
    public string? Protocol { get; set; }
    public DateTime LastSeenUtc { get; set; }
}

public class FuelType
{
    public string FuelTypeId { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Description { get; set; }
}

public class PumpTotals
{
    public long PumpTotalsId { get; set; }
    public int PumpDeviceId { get; set; }
    public string BusinessDate { get; set; } = "";
    public DateTime SnapshotUtc { get; set; }
    public string TotType { get; set; } = "";
    public decimal MoneyTotal { get; set; }
    public decimal MoneyDiff { get; set; }
    public decimal VolumeTotal { get; set; }
    public decimal VolumeDiff { get; set; }
}

public class PumpStatus
{
    public long PumpStatusId { get; set; }
    public int PumpDeviceId { get; set; }
    public DateTime SnapshotUtc { get; set; }
    public string? Status { get; set; }
}

public class PumpMonitoring
{
    public long PumpMonitoringId { get; set; }
    public int PumpDeviceId { get; set; }
    public string BusinessDate { get; set; } = "";
    public DateTime SnapshotUtc { get; set; }
    public decimal HiSpeedTrigFlow { get; set; }
}
