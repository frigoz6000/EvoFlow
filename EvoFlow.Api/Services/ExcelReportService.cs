using ClosedXML.Excel;
using Dapper;
using EvoFlow.Api.Data;

namespace EvoFlow.Api.Services;

public interface IExcelReportService
{
    Task<(byte[] Data, string FileName)?> GenerateAsync(string reportType);
}

public class ExcelReportService(IDapperConnectionFactory connectionFactory, ILogger<ExcelReportService> logger)
    : IExcelReportService
{
    public async Task<(byte[] Data, string FileName)?> GenerateAsync(string reportType)
    {
        try
        {
            using var wb = new XLWorkbook();
            var date = DateTime.Now.ToString("yyyy-MM-dd");

            switch (reportType)
            {
                case "Daily Fuel Summary":
                case "Volume & Revenue Report":
                    await BuildVolumeRevenueSheet(wb, reportType);
                    break;
                case "Pump Performance Report":
                    await BuildPumpPerformanceSheet(wb);
                    break;
                case "Active Alarms Report":
                    await BuildActiveAlarmsSheet(wb);
                    break;
                case "Tank Level Report":
                case "Fuel Consumption Report":
                    await BuildTankConsumptionSheet(wb, reportType);
                    break;
                case "Transaction History Report":
                    await BuildTransactionHistorySheet(wb);
                    break;
                case "Device Status Report":
                    await BuildDeviceStatusSheet(wb);
                    break;
                case "Flow Rate Analysis":
                    await BuildFlowRateSheet(wb);
                    break;
                case "Site Comparison Report":
                    await BuildSiteComparisonSheet(wb);
                    break;
                default:
                    await BuildVolumeRevenueSheet(wb, reportType);
                    break;
            }

            using var ms = new MemoryStream();
            wb.SaveAs(ms);
            var safeName = reportType.Replace(" ", "_").Replace("/", "-");
            return (ms.ToArray(), $"EvoFlow_{safeName}_{date}.xlsx");
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to generate Excel report for {ReportType}", reportType);
            return null;
        }
    }

    private async Task BuildVolumeRevenueSheet(XLWorkbook wb, string title)
    {
        using var conn = connectionFactory.CreateConnection();
        var latestDate = await conn.ExecuteScalarAsync<DateOnly?>(
            "SELECT MAX(BusinessDate) FROM PumpTotals");
        if (latestDate is null) { wb.AddWorksheet("No Data"); return; }

        var rows = await conn.QueryAsync<VolumeRevenueRow>("""
            SELECT pt.BusinessDate, pd.SiteId, s.SiteName, pd.DeviceId,
                   pt.TotType, pt.MoneyTotal, pt.MoneyDiff, pt.VolumeTotal, pt.VolumeDiff
            FROM PumpTotals pt
            JOIN PumpDevices pd ON pd.PumpDeviceId = pt.PumpDeviceId
            LEFT JOIN Sites s ON s.SiteId = pd.SiteId
            WHERE pt.BusinessDate = @d
            ORDER BY pd.SiteId, pd.DeviceId, pt.TotType
            """, new { d = latestDate });

        var ws = wb.AddWorksheet(title.Length > 31 ? title[..31] : title);
        AddTitle(ws, title, latestDate.Value);
        var headers = new[] { "Date", "Site ID", "Site Name", "Device", "Tot Type",
            "Money Total (£)", "Money Daily (£)", "Volume Total (L)", "Volume Daily (L)" };
        WriteHeaders(ws, 3, headers);

        int row = 4;
        foreach (var r in rows)
        {
            ws.Cell(row, 1).Value = r.BusinessDate.ToString("yyyy-MM-dd");
            ws.Cell(row, 2).Value = r.SiteId;
            ws.Cell(row, 3).Value = r.SiteName ?? "";
            ws.Cell(row, 4).Value = r.DeviceId;
            ws.Cell(row, 5).Value = r.TotType;
            ws.Cell(row, 6).Value = r.MoneyTotal; ws.Cell(row, 6).Style.NumberFormat.Format = "#,##0.00";
            ws.Cell(row, 7).Value = r.MoneyDiff;  ws.Cell(row, 7).Style.NumberFormat.Format = "#,##0.00";
            ws.Cell(row, 8).Value = r.VolumeTotal; ws.Cell(row, 8).Style.NumberFormat.Format = "#,##0.000";
            ws.Cell(row, 9).Value = r.VolumeDiff;  ws.Cell(row, 9).Style.NumberFormat.Format = "#,##0.000";
            row++;
        }
        AutoFit(ws, headers.Length);
    }

    private async Task BuildPumpPerformanceSheet(XLWorkbook wb)
    {
        using var conn = connectionFactory.CreateConnection();
        var latestDate = await conn.ExecuteScalarAsync<DateOnly?>(
            "SELECT MAX(BusinessDate) FROM PumpMonitoring");
        if (latestDate is null) { wb.AddWorksheet("No Data"); return; }

        var rows = await conn.QueryAsync<PumpPerfRow>("""
            SELECT pm.BusinessDate, pd.SiteId, s.SiteName, pd.DeviceId,
                   pmg.GradeOption, pmg.TotalPumpTrans, pmg.ZeroTrans,
                   pmg.NoPeakHourZeroTrans, pmg.UptimeMinutes, pm.HiSpeedTrigFlow
            FROM PumpMonitoring pm
            JOIN PumpDevices pd ON pd.PumpDeviceId = pm.PumpDeviceId
            LEFT JOIN Sites s ON s.SiteId = pd.SiteId
            JOIN PumpMonitoringGrade pmg ON pmg.PumpMonitoringId = pm.PumpMonitoringId
            WHERE pm.BusinessDate = @d
            ORDER BY pd.SiteId, pd.DeviceId, pmg.GradeOption
            """, new { d = latestDate });

        var ws = wb.AddWorksheet("Pump Performance");
        AddTitle(ws, "Pump Performance Report", latestDate.Value);
        var headers = new[] { "Date", "Site ID", "Site Name", "Device", "Grade Option",
            "Total Transactions", "Zero Trans", "No Peak Zero Trans", "Uptime (min)", "Hi Speed Trig Flow" };
        WriteHeaders(ws, 3, headers);

        int row = 4;
        foreach (var r in rows)
        {
            ws.Cell(row, 1).Value = r.BusinessDate.ToString("yyyy-MM-dd");
            ws.Cell(row, 2).Value = r.SiteId;
            ws.Cell(row, 3).Value = r.SiteName ?? "";
            ws.Cell(row, 4).Value = r.DeviceId;
            ws.Cell(row, 5).Value = r.GradeOption;
            ws.Cell(row, 6).Value = r.TotalPumpTrans;
            ws.Cell(row, 7).Value = r.ZeroTrans;
            ws.Cell(row, 8).Value = r.NoPeakHourZeroTrans;
            ws.Cell(row, 9).Value = r.UptimeMinutes;
            ws.Cell(row, 10).Value = r.HiSpeedTrigFlow;
            row++;
        }
        AutoFit(ws, headers.Length);
    }

    private async Task BuildActiveAlarmsSheet(XLWorkbook wb)
    {
        using var conn = connectionFactory.CreateConnection();
        var latestDate = await conn.ExecuteScalarAsync<DateOnly?>(
            "SELECT MAX(BusinessDate) FROM PumpStatus");
        if (latestDate is null) { wb.AddWorksheet("No Data"); return; }

        var rows = await conn.QueryAsync<DeviceStatusRow>("""
            SELECT ps.BusinessDate, ps.SnapshotUtc, pd.SiteId, s.SiteName,
                   pd.DeviceId, ps.State, ps.SubStateBits, ps.SubState2Bits
            FROM PumpStatus ps
            JOIN PumpDevices pd ON pd.PumpDeviceId = ps.PumpDeviceId
            LEFT JOIN Sites s ON s.SiteId = pd.SiteId
            WHERE ps.BusinessDate = @d AND ps.State <> 'idle'
            ORDER BY pd.SiteId, pd.DeviceId
            """, new { d = latestDate });

        var ws = wb.AddWorksheet("Active Alarms");
        AddTitle(ws, "Active Alarms Report", latestDate.Value);
        var headers = new[] { "Date", "Snapshot UTC", "Site ID", "Site Name", "Device", "State", "Sub State Bits", "Sub State 2 Bits" };
        WriteHeaders(ws, 3, headers);

        int row = 4;
        foreach (var r in rows)
        {
            ws.Cell(row, 1).Value = r.BusinessDate.ToString("yyyy-MM-dd");
            ws.Cell(row, 2).Value = r.SnapshotUtc.ToString("yyyy-MM-dd HH:mm:ss");
            ws.Cell(row, 3).Value = r.SiteId;
            ws.Cell(row, 4).Value = r.SiteName ?? "";
            ws.Cell(row, 5).Value = r.DeviceId;
            ws.Cell(row, 6).Value = r.State;
            ws.Cell(row, 7).Value = r.SubStateBits ?? "";
            ws.Cell(row, 8).Value = r.SubState2Bits ?? "";
            row++;
        }
        if (row == 4) ws.Cell(4, 1).Value = "No active alarms found for this date.";
        AutoFit(ws, headers.Length);
    }

    private async Task BuildTankConsumptionSheet(XLWorkbook wb, string title)
    {
        using var conn = connectionFactory.CreateConnection();
        var latestDate = await conn.ExecuteScalarAsync<DateOnly?>(
            "SELECT MAX(BusinessDate) FROM PumpTotals");
        if (latestDate is null) { wb.AddWorksheet("No Data"); return; }

        var rows = await conn.QueryAsync<TankConsumptionRow>("""
            SELECT pt.BusinessDate, pd.SiteId, s.SiteName, pd.DeviceId,
                   pgt.GradeId, ptc.TankId, ptc.VolumeTotal, ptc.VolumeDiff
            FROM PumpTankConsumption ptc
            JOIN PumpGradeTotals pgt ON pgt.PumpGradeTotalsId = ptc.PumpGradeTotalsId
            JOIN PumpTotals pt ON pt.PumpTotalsId = pgt.PumpTotalsId
            JOIN PumpDevices pd ON pd.PumpDeviceId = pt.PumpDeviceId
            LEFT JOIN Sites s ON s.SiteId = pd.SiteId
            WHERE pt.BusinessDate = @d
            ORDER BY pd.SiteId, pd.DeviceId, pgt.GradeId, ptc.TankId
            """, new { d = latestDate });

        var sheetTitle = title.Length > 31 ? title[..31] : title;
        var ws = wb.AddWorksheet(sheetTitle);
        AddTitle(ws, title, latestDate.Value);
        var headers = new[] { "Date", "Site ID", "Site Name", "Device", "Grade", "Tank", "Volume Total (L)", "Volume Daily (L)" };
        WriteHeaders(ws, 3, headers);

        int row = 4;
        foreach (var r in rows)
        {
            ws.Cell(row, 1).Value = r.BusinessDate.ToString("yyyy-MM-dd");
            ws.Cell(row, 2).Value = r.SiteId;
            ws.Cell(row, 3).Value = r.SiteName ?? "";
            ws.Cell(row, 4).Value = r.DeviceId;
            ws.Cell(row, 5).Value = r.GradeId;
            ws.Cell(row, 6).Value = r.TankId;
            ws.Cell(row, 7).Value = r.VolumeTotal; ws.Cell(row, 7).Style.NumberFormat.Format = "#,##0.000";
            ws.Cell(row, 8).Value = r.VolumeDiff;  ws.Cell(row, 8).Style.NumberFormat.Format = "#,##0.000";
            row++;
        }
        AutoFit(ws, headers.Length);
    }

    private async Task BuildTransactionHistorySheet(XLWorkbook wb)
    {
        using var conn = connectionFactory.CreateConnection();
        var rows = await conn.QueryAsync<TransactionRow>("""
            SELECT TOP 1000 fr.BusinessDate, fr.TransactionUtc, fr.SiteId, s.SiteName,
                   fr.FuelTypeId, ft.Name AS FuelTypeName, fr.VolumeL, fr.AmountGBP,
                   v.Registration AS Vehicle, fr.OdometerKm
            FROM FuelRecords fr
            LEFT JOIN Sites s ON s.SiteId = fr.SiteId
            LEFT JOIN FuelTypes ft ON ft.FuelTypeId = fr.FuelTypeId
            LEFT JOIN Vehicles v ON v.VehicleId = fr.VehicleId
            ORDER BY fr.TransactionUtc DESC
            """);

        var ws = wb.AddWorksheet("Transaction History");
        var title = "Transaction History Report";
        ws.Cell(1, 1).Value = title;
        ws.Cell(1, 1).Style.Font.Bold = true;
        ws.Cell(1, 1).Style.Font.FontSize = 14;
        var headers = new[] { "Date", "Time (UTC)", "Site ID", "Site Name", "Fuel Type ID", "Fuel Type", "Volume (L)", "Amount (£)", "Vehicle", "Odometer (km)" };
        WriteHeaders(ws, 3, headers);

        int row = 4;
        foreach (var r in rows)
        {
            ws.Cell(row, 1).Value = r.BusinessDate.ToString("yyyy-MM-dd");
            ws.Cell(row, 2).Value = r.TransactionUtc.ToString("HH:mm:ss");
            ws.Cell(row, 3).Value = r.SiteId;
            ws.Cell(row, 4).Value = r.SiteName ?? "";
            ws.Cell(row, 5).Value = r.FuelTypeId;
            ws.Cell(row, 6).Value = r.FuelTypeName ?? "";
            ws.Cell(row, 7).Value = r.VolumeL; ws.Cell(row, 7).Style.NumberFormat.Format = "#,##0.000";
            ws.Cell(row, 8).Value = r.AmountGBP; ws.Cell(row, 8).Style.NumberFormat.Format = "#,##0.00";
            ws.Cell(row, 9).Value = r.Vehicle ?? "";
            if (r.OdometerKm.HasValue) ws.Cell(row, 10).Value = r.OdometerKm.Value;
            row++;
        }
        if (row == 4) ws.Cell(4, 1).Value = "No transactions found.";
        AutoFit(ws, headers.Length);
    }

    private async Task BuildDeviceStatusSheet(XLWorkbook wb)
    {
        using var conn = connectionFactory.CreateConnection();
        var latestDate = await conn.ExecuteScalarAsync<DateOnly?>(
            "SELECT MAX(BusinessDate) FROM PumpStatus");
        if (latestDate is null) { wb.AddWorksheet("No Data"); return; }

        var rows = await conn.QueryAsync<DeviceStatusRow>("""
            SELECT ps.BusinessDate, ps.SnapshotUtc, pd.SiteId, s.SiteName,
                   pd.DeviceId, ps.State, ps.SubStateBits, ps.SubState2Bits
            FROM PumpStatus ps
            JOIN PumpDevices pd ON pd.PumpDeviceId = ps.PumpDeviceId
            LEFT JOIN Sites s ON s.SiteId = pd.SiteId
            WHERE ps.BusinessDate = @d
            ORDER BY pd.SiteId, pd.DeviceId
            """, new { d = latestDate });

        var ws = wb.AddWorksheet("Device Status");
        AddTitle(ws, "Device Status Report", latestDate.Value);
        var headers = new[] { "Date", "Snapshot UTC", "Site ID", "Site Name", "Device", "State", "Sub State Bits", "Sub State 2 Bits" };
        WriteHeaders(ws, 3, headers);

        int row = 4;
        foreach (var r in rows)
        {
            ws.Cell(row, 1).Value = r.BusinessDate.ToString("yyyy-MM-dd");
            ws.Cell(row, 2).Value = r.SnapshotUtc.ToString("yyyy-MM-dd HH:mm:ss");
            ws.Cell(row, 3).Value = r.SiteId;
            ws.Cell(row, 4).Value = r.SiteName ?? "";
            ws.Cell(row, 5).Value = r.DeviceId;
            ws.Cell(row, 6).Value = r.State;
            ws.Cell(row, 7).Value = r.SubStateBits ?? "";
            ws.Cell(row, 8).Value = r.SubState2Bits ?? "";
            row++;
        }
        AutoFit(ws, headers.Length);
    }

    private async Task BuildFlowRateSheet(XLWorkbook wb)
    {
        using var conn = connectionFactory.CreateConnection();
        var latestDate = await conn.ExecuteScalarAsync<DateOnly?>(
            "SELECT MAX(BusinessDate) FROM PumpMonitoring");
        if (latestDate is null) { wb.AddWorksheet("No Data"); return; }

        var rows = await conn.QueryAsync<FlowRateRow>("""
            SELECT pm.BusinessDate, pd.SiteId, s.SiteName, pd.DeviceId,
                   pmg.GradeOption, pfi.FlowType, pfi.TotalPumpTrans,
                   pfi.NominalFlowRate, pfi.AvgFlowRate, pfi.PeakFlowRate,
                   pfi.AvgTimeToFlow, pfi.MaxTimeToFlow,
                   pfi.AvgTimeToPeakFlow, pfi.MaxTimeToPeakFlow
            FROM PumpFlowInfo pfi
            JOIN PumpMonitoringGrade pmg ON pmg.PumpMonitoringGradeId = pfi.PumpMonitoringGradeId
            JOIN PumpMonitoring pm ON pm.PumpMonitoringId = pmg.PumpMonitoringId
            JOIN PumpDevices pd ON pd.PumpDeviceId = pm.PumpDeviceId
            LEFT JOIN Sites s ON s.SiteId = pd.SiteId
            WHERE pm.BusinessDate = @d
            ORDER BY pd.SiteId, pd.DeviceId, pmg.GradeOption, pfi.FlowType
            """, new { d = latestDate });

        var ws = wb.AddWorksheet("Flow Rate Analysis");
        AddTitle(ws, "Flow Rate Analysis", latestDate.Value);
        var headers = new[] { "Date", "Site ID", "Site Name", "Device", "Grade", "Flow Type",
            "Transactions", "Nominal (L/min)", "Avg (L/min)", "Peak (L/min)",
            "Avg Time to Flow (s)", "Max Time to Flow (s)", "Avg Time to Peak (s)", "Max Time to Peak (s)" };
        WriteHeaders(ws, 3, headers);

        int row = 4;
        foreach (var r in rows)
        {
            ws.Cell(row, 1).Value = r.BusinessDate.ToString("yyyy-MM-dd");
            ws.Cell(row, 2).Value = r.SiteId;
            ws.Cell(row, 3).Value = r.SiteName ?? "";
            ws.Cell(row, 4).Value = r.DeviceId;
            ws.Cell(row, 5).Value = r.GradeOption;
            ws.Cell(row, 6).Value = r.FlowType;
            ws.Cell(row, 7).Value = r.TotalPumpTrans;
            ws.Cell(row, 8).Value = r.NominalFlowRate; ws.Cell(row, 8).Style.NumberFormat.Format = "#,##0.00";
            if (r.AvgFlowRate.HasValue) { ws.Cell(row, 9).Value = r.AvgFlowRate.Value; ws.Cell(row, 9).Style.NumberFormat.Format = "#,##0.00"; }
            if (r.PeakFlowRate.HasValue) { ws.Cell(row, 10).Value = r.PeakFlowRate.Value; ws.Cell(row, 10).Style.NumberFormat.Format = "#,##0.00"; }
            if (r.AvgTimeToFlow.HasValue) ws.Cell(row, 11).Value = r.AvgTimeToFlow.Value;
            if (r.MaxTimeToFlow.HasValue) ws.Cell(row, 12).Value = r.MaxTimeToFlow.Value;
            if (r.AvgTimeToPeakFlow.HasValue) ws.Cell(row, 13).Value = r.AvgTimeToPeakFlow.Value;
            if (r.MaxTimeToPeakFlow.HasValue) ws.Cell(row, 14).Value = r.MaxTimeToPeakFlow.Value;
            row++;
        }
        AutoFit(ws, headers.Length);
    }

    private async Task BuildSiteComparisonSheet(XLWorkbook wb)
    {
        using var conn = connectionFactory.CreateConnection();
        var latestDate = await conn.ExecuteScalarAsync<DateOnly?>(
            "SELECT MAX(BusinessDate) FROM PumpTotals");
        if (latestDate is null) { wb.AddWorksheet("No Data"); return; }

        var rows = await conn.QueryAsync<SiteComparisonRow>("""
            SELECT pd.SiteId, s.SiteName,
                   SUM(pt.VolumeTotal) AS TotalVolume,
                   SUM(pt.VolumeDiff) AS DailyVolume,
                   SUM(pt.MoneyTotal) AS TotalMoney,
                   SUM(pt.MoneyDiff) AS DailyMoney,
                   COUNT(DISTINCT pd.PumpDeviceId) AS PumpCount
            FROM PumpTotals pt
            JOIN PumpDevices pd ON pd.PumpDeviceId = pt.PumpDeviceId
            LEFT JOIN Sites s ON s.SiteId = pd.SiteId
            WHERE pt.BusinessDate = @d AND pt.TotType = 'pump'
            GROUP BY pd.SiteId, s.Name
            ORDER BY pd.SiteId
            """, new { d = latestDate });

        var ws = wb.AddWorksheet("Site Comparison");
        AddTitle(ws, "Site Comparison Report", latestDate.Value);
        var headers = new[] { "Site ID", "Site Name", "Volume Total (L)", "Volume Daily (L)", "Money Total (£)", "Money Daily (£)", "Pump Count" };
        WriteHeaders(ws, 3, headers);

        int row = 4;
        foreach (var r in rows)
        {
            ws.Cell(row, 1).Value = r.SiteId;
            ws.Cell(row, 2).Value = r.SiteName ?? "";
            ws.Cell(row, 3).Value = r.TotalVolume;  ws.Cell(row, 3).Style.NumberFormat.Format = "#,##0.000";
            ws.Cell(row, 4).Value = r.DailyVolume;  ws.Cell(row, 4).Style.NumberFormat.Format = "#,##0.000";
            ws.Cell(row, 5).Value = r.TotalMoney;   ws.Cell(row, 5).Style.NumberFormat.Format = "#,##0.00";
            ws.Cell(row, 6).Value = r.DailyMoney;   ws.Cell(row, 6).Style.NumberFormat.Format = "#,##0.00";
            ws.Cell(row, 7).Value = r.PumpCount;
            row++;
        }
        AutoFit(ws, headers.Length);
    }

    // --- Helpers ---

    private static void AddTitle(IXLWorksheet ws, string title, DateOnly date)
    {
        ws.Cell(1, 1).Value = $"{title} — {date:dd MMM yyyy}";
        ws.Cell(1, 1).Style.Font.Bold = true;
        ws.Cell(1, 1).Style.Font.FontSize = 14;
        ws.Cell(1, 1).Style.Font.FontColor = XLColor.FromHtml("#1a1d35");
    }

    private static void WriteHeaders(IXLWorksheet ws, int row, string[] headers)
    {
        for (int i = 0; i < headers.Length; i++)
        {
            var cell = ws.Cell(row, i + 1);
            cell.Value = headers[i];
            cell.Style.Font.Bold = true;
            cell.Style.Fill.BackgroundColor = XLColor.FromHtml("#1a1d35");
            cell.Style.Font.FontColor = XLColor.White;
            cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
        }
    }

    private static void AutoFit(IXLWorksheet ws, int colCount)
    {
        for (int i = 1; i <= colCount; i++)
            ws.Column(i).AdjustToContents();
    }

    // --- DTOs ---

    private record VolumeRevenueRow(DateOnly BusinessDate, string SiteId, string? SiteName, string DeviceId,
        string TotType, decimal MoneyTotal, decimal MoneyDiff, decimal VolumeTotal, decimal VolumeDiff);

    private record PumpPerfRow(DateOnly BusinessDate, string SiteId, string? SiteName, string DeviceId,
        int GradeOption, int TotalPumpTrans, int ZeroTrans, int NoPeakHourZeroTrans, int UptimeMinutes, decimal HiSpeedTrigFlow);

    private record DeviceStatusRow(DateOnly BusinessDate, DateTime SnapshotUtc, string SiteId, string? SiteName,
        string DeviceId, string State, string? SubStateBits, string? SubState2Bits);

    private record TankConsumptionRow(DateOnly BusinessDate, string SiteId, string? SiteName, string DeviceId,
        string GradeId, string TankId, decimal VolumeTotal, decimal VolumeDiff);

    private record TransactionRow(DateOnly BusinessDate, DateTime TransactionUtc, string SiteId, string? SiteName,
        string FuelTypeId, string? FuelTypeName, decimal VolumeL, decimal AmountGBP, string? Vehicle, int? OdometerKm);

    private record FlowRateRow(DateOnly BusinessDate, string SiteId, string? SiteName, string DeviceId,
        int GradeOption, string FlowType, int TotalPumpTrans, decimal NominalFlowRate,
        decimal? AvgFlowRate, decimal? PeakFlowRate, int? AvgTimeToFlow, int? MaxTimeToFlow,
        int? AvgTimeToPeakFlow, int? MaxTimeToPeakFlow);

    private record SiteComparisonRow(string SiteId, string? SiteName, decimal TotalVolume, decimal DailyVolume,
        decimal TotalMoney, decimal DailyMoney, int PumpCount);
}
