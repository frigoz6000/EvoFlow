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
    }
}
