using EvoFlow.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace EvoFlow.Api.Data;

public class EvoFlowDbContext(DbContextOptions<EvoFlowDbContext> options) : DbContext(options)
{
    public DbSet<Site> Sites => Set<Site>();
    public DbSet<FuelType> FuelTypes => Set<FuelType>();
    public DbSet<Vehicle> Vehicles => Set<Vehicle>();
    public DbSet<PumpDevice> PumpDevices => Set<PumpDevice>();
    public DbSet<FuelRecord> FuelRecords => Set<FuelRecord>();
    public DbSet<PumpMonitoring> PumpMonitoring => Set<PumpMonitoring>();
    public DbSet<PumpMonitoringGrade> PumpMonitoringGrade => Set<PumpMonitoringGrade>();
    public DbSet<PumpFlowInfo> PumpFlowInfo => Set<PumpFlowInfo>();
    public DbSet<PumpStatus> PumpStatus => Set<PumpStatus>();
    public DbSet<PumpTotals> PumpTotals => Set<PumpTotals>();
    public DbSet<PumpGradeTotals> PumpGradeTotals => Set<PumpGradeTotals>();
    public DbSet<PumpTankConsumption> PumpTankConsumption => Set<PumpTankConsumption>();
    public DbSet<EmailRecipient> EmailRecipients => Set<EmailRecipient>();
    public DbSet<AlarmType> AlarmTypes => Set<AlarmType>();
    public DbSet<AlarmSetting> AlarmSettings => Set<AlarmSetting>();
    public DbSet<AlarmSettingRecipient> AlarmSettingRecipients => Set<AlarmSettingRecipient>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Site>(e =>
        {
            e.Property(x => x.SiteId).HasMaxLength(20);
            e.Property(x => x.OpeningHour).HasColumnType("time");
            e.Property(x => x.ClosingHour).HasColumnType("time");
        });

        modelBuilder.Entity<FuelRecord>(e =>
        {
            e.Property(x => x.BusinessDate).HasColumnType("date");
            e.Property(x => x.VolumeL).HasColumnType("decimal(18,4)");
            e.Property(x => x.AmountGBP).HasColumnType("decimal(18,4)");
        });

        modelBuilder.Entity<PumpMonitoring>(e =>
        {
            e.Property(x => x.BusinessDate).HasColumnType("date");
        });

        modelBuilder.Entity<PumpStatus>(e =>
        {
            e.Property(x => x.BusinessDate).HasColumnType("date");
        });

        modelBuilder.Entity<PumpTotals>(e =>
        {
            e.Property(x => x.BusinessDate).HasColumnType("date");
        });

        modelBuilder.Entity<AlarmSetting>(e =>
        {
            e.HasOne(x => x.AlarmType).WithMany().HasForeignKey(x => x.AlarmTypeId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<AlarmSettingRecipient>(e =>
        {
            e.HasOne(x => x.AlarmSetting).WithMany(x => x.Recipients).HasForeignKey(x => x.AlarmSettingId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.EmailRecipient).WithMany().HasForeignKey(x => x.EmailRecipientId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => new { x.AlarmSettingId, x.EmailRecipientId }).IsUnique();
        });

        modelBuilder.Entity<AlarmType>().HasData(
            new AlarmType { Id = 1,  Name = "Low Tank Level",                Category = "Tank",    Description = "Tank fuel level has dropped below the low threshold." },
            new AlarmType { Id = 2,  Name = "Very Low Tank Level",           Category = "Tank",    Description = "Tank fuel level is critically low." },
            new AlarmType { Id = 3,  Name = "Tank Overfill",                 Category = "Tank",    Description = "Tank level has exceeded the maximum safe capacity." },
            new AlarmType { Id = 4,  Name = "High Water Level in Tank",      Category = "Tank",    Description = "Water detected in the tank above the acceptable threshold." },
            new AlarmType { Id = 5,  Name = "High Temperature in Tank",      Category = "Tank",    Description = "Tank temperature exceeds safe operating limit." },
            new AlarmType { Id = 6,  Name = "Low Temperature / Freeze Risk", Category = "Tank",    Description = "Tank temperature is low enough to risk freezing." },
            new AlarmType { Id = 7,  Name = "Tank Leak Detected",            Category = "Tank",    Description = "Sensor indicates a possible fuel leak in the tank." },
            new AlarmType { Id = 8,  Name = "Sump Alarm",                    Category = "Tank",    Description = "Liquid detected in the sump below the tank." },
            new AlarmType { Id = 9,  Name = "Delivery In Progress",          Category = "Delivery", Description = "A fuel delivery has started at the site." },
            new AlarmType { Id = 10, Name = "Delivery Complete",             Category = "Delivery", Description = "A fuel delivery has finished successfully." },
            new AlarmType { Id = 11, Name = "Delivery Volume Discrepancy",   Category = "Delivery", Description = "Delivered volume does not match the expected amount." },
            new AlarmType { Id = 12, Name = "Pump Offline",                  Category = "Pump",    Description = "A pump has gone offline and is not responding." },
            new AlarmType { Id = 13, Name = "Pump Fault",                    Category = "Pump",    Description = "A pump is reporting a fault condition." },
            new AlarmType { Id = 14, Name = "Low Flow Rate",                 Category = "Pump",    Description = "Pump flow rate has dropped below the expected minimum." },
            new AlarmType { Id = 15, Name = "High Flow Rate",                Category = "Pump",    Description = "Pump flow rate exceeds the safe maximum." },
            new AlarmType { Id = 16, Name = "Pump Meter Calibration Due",    Category = "Pump",    Description = "The pump meter is due for calibration." },
            new AlarmType { Id = 17, Name = "Card Reader Fault",             Category = "Equipment", Description = "The card reader on a pump is not functioning correctly." },
            new AlarmType { Id = 18, Name = "Vapour Recovery Fault",         Category = "Equipment", Description = "The vapour recovery system is reporting a fault." },
            new AlarmType { Id = 19, Name = "Emergency Stop Activated",      Category = "Safety",  Description = "An emergency stop button has been triggered at the site." },
            new AlarmType { Id = 20, Name = "Unauthorised Access Attempt",   Category = "Safety",  Description = "An access attempt outside permitted hours or credentials was detected." },
            new AlarmType { Id = 21, Name = "Site Offline",                  Category = "Connectivity", Description = "The site has lost communication with the central system." },
            new AlarmType { Id = 22, Name = "Data Sync Failure",             Category = "Connectivity", Description = "Transaction or telemetry data has failed to sync." },
            new AlarmType { Id = 23, Name = "Daily Volume Threshold Exceeded", Category = "Reporting", Description = "Total dispensed volume for the day has exceeded the configured threshold." },
            new AlarmType { Id = 24, Name = "Price Discrepancy Alert",       Category = "Reporting", Description = "Pump price does not match the expected price in the system." }
        );
    }
}
