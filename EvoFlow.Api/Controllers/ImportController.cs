using Dapper;
using EvoFlow.Api.Data;
using EvoFlow.Api.Services;
using Microsoft.AspNetCore.Mvc;
using System.Diagnostics;
using System.Text.RegularExpressions;
using System.Xml.Linq;

namespace EvoFlow.Api.Controllers;

[ApiController]
[Route("api/import")]
public class ImportController(IDapperConnectionFactory connectionFactory, ILogger<ImportController> logger, IEmailService emailService) : ControllerBase
{
    private static readonly string ScriptPath = @"C:\Users\roryj\.paperclip\instances\default\workspaces\0f171b86-1c9b-491f-b414-089c40818833\import_xml.py";

    private const string PopulateSql = @"
        TRUNCATE TABLE DomsInfoSnapshot;

        INSERT INTO DomsInfoSnapshot
            (DomsDate, SiteId, Device, DeviceStatus, DeviceOfflineCount,
             DeviceErrorType, DeviceErrorText, DeviceErrorDate, DeviceLifetimeVolume,
             GradeOption, GradeId, GradeDescription, Transactions, PeakFlow, Uptime,
             NumberZeroTransactions, TankId, CreatedUtc)
        SELECT
            pm.BusinessDate,
            s.SiteId,
            pd.DeviceId,
            CASE WHEN pd.Online = 1 THEN 'Online' ELSE 'Offline' END,
            pd.OfflineCount,
            ps.SubStateBits,
            ps.State,
            ps.SnapshotUtc,
            pt.VolumeTotal,
            pmg.GradeOption,
            pgt.GradeId,
            ft.Name,
            pmg.TotalPumpTrans,
            pfi.PeakFlowRate,
            pmg.UptimeMinutes,
            pmg.ZeroTrans,
            STRING_AGG(ptc.TankId, ', ') WITHIN GROUP (ORDER BY ptc.TankId),
            GETUTCDATE()
        FROM PumpMonitoring pm
        JOIN PumpMonitoringGrade pmg ON pmg.PumpMonitoringId = pm.PumpMonitoringId
        JOIN PumpDevices pd ON pd.PumpDeviceId = pm.PumpDeviceId
        JOIN Sites s ON s.SiteId = pd.SiteId
        LEFT JOIN PumpFlowInfo pfi
            ON pfi.PumpMonitoringGradeId = pmg.PumpMonitoringGradeId
           AND pfi.FlowType = 'normal_speed'
        LEFT JOIN PumpStatus ps
            ON ps.PumpDeviceId = pm.PumpDeviceId
           AND ps.BusinessDate = pm.BusinessDate
        LEFT JOIN PumpTotals pt
            ON pt.PumpDeviceId = pm.PumpDeviceId
           AND pt.BusinessDate = pm.BusinessDate
           AND pt.TotType = 'pump'
        LEFT JOIN PumpGradeTotals pgt
            ON pgt.PumpTotalsId = pt.PumpTotalsId
           AND pgt.GradeOption = pmg.GradeOption
        LEFT JOIN PumpTankConsumption ptc
            ON ptc.PumpGradeTotalsId = pgt.PumpGradeTotalsId
        LEFT JOIN FuelTypes ft ON ft.FuelTypeId = pgt.GradeId
        GROUP BY
            pm.BusinessDate, s.SiteId, pd.DeviceId, pd.Online, pd.OfflineCount,
            ps.SubStateBits, ps.State, ps.SnapshotUtc, pt.VolumeTotal,
            pmg.GradeOption, pgt.GradeId, ft.Name, pmg.TotalPumpTrans,
            pfi.PeakFlowRate, pmg.UptimeMinutes, pmg.ZeroTrans;

        SELECT COUNT(*) FROM DomsInfoSnapshot;";

    /// <summary>
    /// Runs the XML import script then repopulates DomsInfoSnapshot.
    /// Pass skipDelete=true to append without clearing existing data first.
    /// </summary>
    [HttpPost("doms-files")]
    public async Task<IActionResult> ImportDomsFiles([FromQuery] bool skipDelete = false)
    {
        var started = DateTime.UtcNow;

        // Step 1: run Python import script
        logger.LogInformation("Starting DOMS XML import (skipDelete={SkipDelete}). Script: {Path}", skipDelete, ScriptPath);

        if (!System.IO.File.Exists(ScriptPath))
            return StatusCode(500, new { error = $"Import script not found at: {ScriptPath}" });

        var scriptArgs = skipDelete ? $"{ScriptPath} --no-delete" : ScriptPath;
        var (exitCode, stdout, stderr) = await RunProcess("python", scriptArgs, TimeSpan.FromMinutes(10));

        if (exitCode != 0)
        {
            logger.LogError("Import script failed (exit {Code}): {Err}", exitCode, stderr);
            return StatusCode(500, new { error = "Import script failed", detail = stderr.Trim() });
        }

        logger.LogInformation("Import script complete. Output: {Out}", stdout.TrimEnd());

        // Step 2: repopulate DomsInfoSnapshot
        using var conn = connectionFactory.CreateConnection();
        var snapshotRows = await conn.ExecuteScalarAsync<int>(PopulateSql, commandTimeout: 300);

        var elapsed = (DateTime.UtcNow - started).TotalSeconds;

        return Ok(new
        {
            message = "Import complete",
            snapshotRowsInserted = snapshotRows,
            elapsedSeconds = Math.Round(elapsed, 1),
            scriptOutput = stdout.TrimEnd()
        });
    }

    private const string AnonymizeSitesSql = @"
        -- Step 1: rename sites sequentially
        WITH NumberedSites AS (
            SELECT SiteId, ROW_NUMBER() OVER (ORDER BY SiteId) AS RowNum
            FROM Sites
        )
        UPDATE s
        SET s.SiteName = 'Site ' + RIGHT('000' + CAST(n.RowNum AS VARCHAR(3)), 3)
        FROM Sites s
        INNER JOIN NumberedSites n ON s.SiteId = n.SiteId;

        -- Step 2: sync SiteIds to match new site names (e.g. 'Site 001' -> SiteId '001')
        CREATE TABLE #AnonSiteMap (OldId VARCHAR(20) NOT NULL, NewId VARCHAR(20) NOT NULL);
        INSERT INTO #AnonSiteMap (OldId, NewId)
        SELECT SiteId, LTRIM(RTRIM(REPLACE(SiteName, 'Site ', '')))
        FROM Sites
        WHERE SiteId <> LTRIM(RTRIM(REPLACE(SiteName, 'Site ', '')));

        IF EXISTS (SELECT 1 FROM #AnonSiteMap)
        BEGIN
            ALTER TABLE FuelGradePriceHistory NOCHECK CONSTRAINT FK_FuelGradePriceHistory_Sites;
            ALTER TABLE FuelGradePrices       NOCHECK CONSTRAINT FK_FuelGradePrices_Sites;
            ALTER TABLE FuelRecords           NOCHECK CONSTRAINT FK_FuelRecords_Sites;
            ALTER TABLE PumpDevices           NOCHECK CONSTRAINT FK_PumpDevices_Site;
            ALTER TABLE TankGauges            NOCHECK CONSTRAINT FK_TankGauges_Sites;

            UPDATE fr  SET fr.SiteId  = m.NewId FROM FuelRecords fr             JOIN #AnonSiteMap m ON fr.SiteId  = m.OldId;
            UPDATE fgp SET fgp.SiteId = m.NewId FROM FuelGradePrices fgp        JOIN #AnonSiteMap m ON fgp.SiteId = m.OldId;
            UPDATE fgh SET fgh.SiteId = m.NewId FROM FuelGradePriceHistory fgh  JOIN #AnonSiteMap m ON fgh.SiteId = m.OldId;
            UPDATE pd  SET pd.SiteId  = m.NewId FROM PumpDevices pd             JOIN #AnonSiteMap m ON pd.SiteId  = m.OldId;
            UPDATE tg  SET tg.SiteId  = m.NewId FROM TankGauges tg              JOIN #AnonSiteMap m ON tg.SiteId  = m.OldId;
            UPDATE dis SET dis.SiteId = m.NewId FROM DomsInfoSnapshot dis        JOIN #AnonSiteMap m ON dis.SiteId = m.OldId;
            UPDATE deo SET deo.SiteId = m.NewId FROM DeliverectOrders deo        JOIN #AnonSiteMap m ON deo.SiteId = m.OldId;
            UPDATE s   SET s.SiteId   = m.NewId FROM Sites s                    JOIN #AnonSiteMap m ON s.SiteId   = m.OldId;

            ALTER TABLE FuelGradePriceHistory WITH CHECK CHECK CONSTRAINT FK_FuelGradePriceHistory_Sites;
            ALTER TABLE FuelGradePrices       WITH CHECK CHECK CONSTRAINT FK_FuelGradePrices_Sites;
            ALTER TABLE FuelRecords           WITH CHECK CHECK CONSTRAINT FK_FuelRecords_Sites;
            ALTER TABLE PumpDevices           WITH CHECK CHECK CONSTRAINT FK_PumpDevices_Site;
            ALTER TABLE TankGauges            WITH CHECK CHECK CONSTRAINT FK_TankGauges_Sites;
        END

        DROP TABLE #AnonSiteMap;

        -- Step 3: assign random UK addresses, pole signs, country and geography locations
        WITH StreetNames AS (
            SELECT 1 AS id, 'High Street' AS name UNION ALL SELECT 2,'Victoria Road' UNION ALL
            SELECT 3,'Church Lane' UNION ALL SELECT 4,'Station Road' UNION ALL SELECT 5,'Park Road' UNION ALL
            SELECT 6,'London Road' UNION ALL SELECT 7,'Manor Road' UNION ALL SELECT 8,'Kings Road' UNION ALL
            SELECT 9,'Queens Avenue' UNION ALL SELECT 10,'Mill Lane' UNION ALL SELECT 11,'George Street' UNION ALL
            SELECT 12,'New Road' UNION ALL SELECT 13,'Main Street' UNION ALL SELECT 14,'Green Lane' UNION ALL
            SELECT 15,'Springfield Road' UNION ALL SELECT 16,'Chestnut Avenue' UNION ALL
            SELECT 17,'Richmond Road' UNION ALL SELECT 18,'Clifton Road' UNION ALL
            SELECT 19,'West Street' UNION ALL SELECT 20,'Elm Street'
        ),
        Cities AS (
            SELECT  1 AS id,'London' AS city,'Greater London' AS county,'SW' AS pcPrefix,51.5074 AS lat,-0.1278 AS lon UNION ALL
            SELECT  2,'Birmingham','West Midlands','B',52.4862,-1.8904 UNION ALL
            SELECT  3,'Leeds','West Yorkshire','LS',53.8008,-1.5491 UNION ALL
            SELECT  4,'Sheffield','South Yorkshire','S',53.3811,-1.4701 UNION ALL
            SELECT  5,'Bristol','Avon','BS',51.4545,-2.5879 UNION ALL
            SELECT  6,'Manchester','Greater Manchester','M',53.4808,-2.2426 UNION ALL
            SELECT  7,'Liverpool','Merseyside','L',53.4084,-2.9916 UNION ALL
            SELECT  8,'Leicester','Leicestershire','LE',52.6369,-1.1398 UNION ALL
            SELECT  9,'Coventry','West Midlands','CV',52.4068,-1.5197 UNION ALL
            SELECT 10,'Nottingham','Nottinghamshire','NG',52.9548,-1.1581 UNION ALL
            SELECT 11,'Newcastle upon Tyne','Tyne and Wear','NE',54.9783,-1.6178 UNION ALL
            SELECT 12,'Sunderland','Tyne and Wear','SR',54.9069,-1.3838 UNION ALL
            SELECT 13,'Brighton','East Sussex','BN',50.8229,-0.1363 UNION ALL
            SELECT 14,'Plymouth','Devon','PL',50.3755,-4.1427 UNION ALL
            SELECT 15,'Stoke-on-Trent','Staffordshire','ST',53.0027,-2.1794 UNION ALL
            SELECT 16,'Wolverhampton','West Midlands','WV',52.5862,-2.1285 UNION ALL
            SELECT 17,'Derby','Derbyshire','DE',52.9225,-1.4746 UNION ALL
            SELECT 18,'Southampton','Hampshire','SO',50.9097,-1.4044 UNION ALL
            SELECT 19,'Portsmouth','Hampshire','PO',50.8198,-1.0880 UNION ALL
            SELECT 20,'York','North Yorkshire','YO',53.9590,-1.0815 UNION ALL
            SELECT 21,'Oxford','Oxfordshire','OX',51.7520,-1.2577 UNION ALL
            SELECT 22,'Cambridge','Cambridgeshire','CB',52.2053,0.1218 UNION ALL
            SELECT 23,'Exeter','Devon','EX',50.7184,-3.5339 UNION ALL
            SELECT 24,'Norwich','Norfolk','NR',52.6309,1.2974 UNION ALL
            SELECT 25,'Ipswich','Suffolk','IP',52.0567,1.1482 UNION ALL
            SELECT 26,'Swansea','West Glamorgan','SA',51.6214,-3.9436 UNION ALL
            SELECT 27,'Cardiff','South Glamorgan','CF',51.4816,-3.1791 UNION ALL
            SELECT 28,'Hull','East Yorkshire','HU',53.7457,-0.3367 UNION ALL
            SELECT 29,'Bradford','West Yorkshire','BD',53.7960,-1.7594 UNION ALL
            SELECT 30,'Peterborough','Cambridgeshire','PE',52.5695,-0.2405 UNION ALL
            SELECT 31,'Gloucester','Gloucestershire','GL',51.8642,-2.2382 UNION ALL
            SELECT 32,'Edinburgh','Midlothian','EH',55.9533,-3.1883 UNION ALL
            SELECT 33,'Glasgow','Lanarkshire','G',55.8642,-4.2518 UNION ALL
            SELECT 34,'Aberdeen','Aberdeenshire','AB',57.1497,-2.0943 UNION ALL
            SELECT 35,'Dundee','Angus','DD',56.4620,-2.9707 UNION ALL
            SELECT 36,'Inverness','Inverness-shire','IV',57.4778,-4.2247 UNION ALL
            SELECT 37,'Belfast','County Antrim','BT',54.5973,-5.9301 UNION ALL
            SELECT 38,'Londonderry','County Londonderry','BT',54.9966,-7.3086 UNION ALL
            SELECT 39,'Newport','Gwent','NP',51.5842,-2.9977 UNION ALL
            SELECT 40,'Wrexham','Clwyd','LL',53.0428,-2.9923 UNION ALL
            SELECT 41,'Middlesbrough','Cleveland','TS',54.5742,-1.2350 UNION ALL
            SELECT 42,'Blackpool','Lancashire','FY',53.8142,-3.0503 UNION ALL
            SELECT 43,'Preston','Lancashire','PR',53.7632,-2.7031 UNION ALL
            SELECT 44,'Luton','Bedfordshire','LU',51.8787,-0.4200 UNION ALL
            SELECT 45,'Reading','Berkshire','RG',51.4543,-0.9781 UNION ALL
            SELECT 46,'Northampton','Northamptonshire','NN',52.2405,-0.9027 UNION ALL
            SELECT 47,'Milton Keynes','Buckinghamshire','MK',52.0406,-0.7594 UNION ALL
            SELECT 48,'Swindon','Wiltshire','SN',51.5558,-1.7797 UNION ALL
            SELECT 49,'Huddersfield','West Yorkshire','HD',53.6458,-1.7850 UNION ALL
            SELECT 50,'Wakefield','West Yorkshire','WF',53.6830,-1.4977
        ),
        Poles AS (
            SELECT 1 AS id,'BP' AS brand UNION ALL SELECT 2,'Shell' UNION ALL
            SELECT 3,'Esso' UNION ALL SELECT 4,'Texaco' UNION ALL SELECT 5,'JET'
        ),
        SiteRows AS (
            SELECT SiteId,
                ABS(CHECKSUM(SiteId,'addr2')) AS rAddr,
                ABS(CHECKSUM(SiteId,'city2')) AS rCity,
                ABS(CHECKSUM(SiteId,'post2')) AS rPost,
                ABS(CHECKSUM(SiteId,'sign2')) AS rSign,
                ABS(CHECKSUM(SiteId,'lat2'))  AS rLat,
                ABS(CHECKSUM(SiteId,'lon2'))  AS rLon
            FROM Sites
        ),
        Assigned AS (
            SELECT sr.SiteId,
                sn.name AS Street, ct.city AS City, ct.county AS County, ct.pcPrefix AS PCPrefix,
                p.brand AS Brand,
                (sr.rAddr % 300) + 1 AS HouseNum,
                (sr.rPost % 99) + 1 AS PCNum1,
                (sr.rPost % 9) + 1 AS PCNum2,
                CHAR(65 + (sr.rPost % 26)) AS PCLet1,
                CHAR(65 + ((sr.rPost / 26) % 26)) AS PCLet2,
                ct.lat + ((sr.rLat % 400) - 200) * 0.0001 AS Lat,
                ct.lon + ((sr.rLon % 400) - 200) * 0.0001 AS Lon
            FROM SiteRows sr
            INNER JOIN StreetNames sn ON (sr.rAddr % 20) + 1 = sn.id
            INNER JOIN Cities ct ON (sr.rCity % 50) + 1 = ct.id
            INNER JOIN Poles p ON (sr.rSign % 5) + 1 = p.id
        )
        UPDATE s
        SET
            s.Address1 = CAST(a.HouseNum AS VARCHAR(5)) + ' ' + a.Street,
            s.Address2 = '',
            s.City     = a.City,
            s.County   = a.County,
            s.PostCode = a.PCPrefix + CAST(a.PCNum1 AS VARCHAR(2)) + ' ' + CAST(a.PCNum2 AS VARCHAR(1)) + a.PCLet1 + a.PCLet2,
            s.PoleSign = a.Brand,
            s.Country  = 'United Kingdom',
            s.Location = geography::Point(a.Lat, a.Lon, 4326)
        FROM Sites s
        INNER JOIN Assigned a ON s.SiteId = a.SiteId;

        SELECT COUNT(*) FROM Sites;";

    /// <summary>
    /// Anonymizes all site names in the Sites table (Site 001, Site 002, …) and
    /// assigns random UK addresses, pole signs, country and geography locations.
    /// </summary>
    [HttpPost("anonymize-sites")]
    public async Task<IActionResult> AnonymizeSites()
    {
        var started = DateTime.UtcNow;
        logger.LogInformation("Anonymizing site names");

        using var conn = connectionFactory.CreateConnection();
        var sitesUpdated = await conn.ExecuteScalarAsync<int>(AnonymizeSitesSql, commandTimeout: 120);

        var elapsed = (DateTime.UtcNow - started).TotalSeconds;
        logger.LogInformation("Anonymization complete. Sites updated: {Count}", sitesUpdated);

        return Ok(new
        {
            message = "Anonymization complete",
            sitesUpdated,
            elapsedSeconds = Math.Round(elapsed, 1)
        });
    }

    private const string MoveDatesForwardSql = @"
        DECLARE @Today DATE = CAST(GETDATE() AS DATE);

        -- Each table group computes its own offset so a group that is already current
        -- does not block other groups from being shifted.

        DECLARE @PrimaryMaxDate DATE;
        SELECT @PrimaryMaxDate = MAX(d) FROM (
            SELECT MAX(BusinessDate) AS d FROM FuelRecords
            UNION ALL SELECT MAX(BusinessDate) FROM PumpMonitoring
            UNION ALL SELECT MAX(BusinessDate) FROM PumpStatus
            UNION ALL SELECT MAX(BusinessDate) FROM PumpTotals
            UNION ALL SELECT MAX(BusinessDate) FROM TankGauges
        ) x;
        DECLARE @PrimaryOffset INT = 0;
        IF @PrimaryMaxDate IS NOT NULL AND @PrimaryMaxDate < @Today
            SET @PrimaryOffset = DATEDIFF(day, @PrimaryMaxDate, @Today);

        DECLARE @DeliverectMaxDate DATE = (SELECT MAX(OrderDate) FROM DeliverectOrders);
        DECLARE @DeliverectOffset INT = 0;
        IF @DeliverectMaxDate IS NOT NULL AND @DeliverectMaxDate < @Today
            SET @DeliverectOffset = DATEDIFF(day, @DeliverectMaxDate, @Today);

        DECLARE @HistoryMaxDate DATE = (SELECT MAX(CAST(HistoryDate AS DATE)) FROM FuelGradePriceHistory);
        DECLARE @HistoryOffset INT = 0;
        IF @HistoryMaxDate IS NOT NULL AND @HistoryMaxDate < @Today
            SET @HistoryOffset = DATEDIFF(day, @HistoryMaxDate, @Today);

        -- FuelGradePrices uses DtLastReceived (falling back to DtFuelChange) as its anchor
        DECLARE @FuelPricesMaxDate DATE = (
            SELECT MAX(CAST(ISNULL(DtLastReceived, DtFuelChange) AS DATE)) FROM FuelGradePrices
        );
        DECLARE @FuelPricesOffset INT = 0;
        IF @FuelPricesMaxDate IS NOT NULL AND @FuelPricesMaxDate < @Today
            SET @FuelPricesOffset = DATEDIFF(day, @FuelPricesMaxDate, @Today);

        IF @PrimaryOffset = 0 AND @DeliverectOffset = 0 AND @HistoryOffset = 0 AND @FuelPricesOffset = 0
        BEGIN
            SELECT 0 AS OffsetDays, 0 AS RowsUpdated;
            RETURN;
        END

        IF @PrimaryOffset > 0
        BEGIN
            UPDATE FuelRecords
            SET BusinessDate = DATEADD(day, @PrimaryOffset, BusinessDate),
                TransactionUtc = DATEADD(day, @PrimaryOffset, TransactionUtc);

            UPDATE PumpMonitoring
            SET BusinessDate = DATEADD(day, @PrimaryOffset, BusinessDate),
                SnapshotUtc = DATEADD(day, @PrimaryOffset, SnapshotUtc);

            UPDATE PumpStatus
            SET BusinessDate = DATEADD(day, @PrimaryOffset, BusinessDate),
                SnapshotUtc = DATEADD(day, @PrimaryOffset, SnapshotUtc);

            UPDATE PumpTotals
            SET BusinessDate = DATEADD(day, @PrimaryOffset, BusinessDate),
                SnapshotUtc = DATEADD(day, @PrimaryOffset, SnapshotUtc);

            UPDATE TankGauges
            SET BusinessDate = DATEADD(day, @PrimaryOffset, BusinessDate);
        END

        IF @FuelPricesOffset > 0
        BEGIN
            UPDATE FuelGradePrices
            SET DtFuelChange = DATEADD(day, @FuelPricesOffset, DtFuelChange),
                DtSentToGov = DATEADD(day, @FuelPricesOffset, DtSentToGov),
                DtLastReceived = DATEADD(day, @FuelPricesOffset, DtLastReceived);
        END

        IF @DeliverectOffset > 0
        BEGIN
            UPDATE DeliverectOrders
            SET OrderDate = DATEADD(day, @DeliverectOffset, OrderDate),
                OrderReceivedAtSiteDateTime = DATEADD(day, @DeliverectOffset, OrderReceivedAtSiteDateTime),
                OrderPickedDateTime = DATEADD(day, @DeliverectOffset, OrderPickedDateTime),
                OrderReadyForCollectionDateTime = DATEADD(day, @DeliverectOffset, OrderReadyForCollectionDateTime),
                OrderCollectedDateTime = DATEADD(day, @DeliverectOffset, OrderCollectedDateTime),
                TransactionDateTime = DATEADD(day, @DeliverectOffset, TransactionDateTime);
        END

        IF @HistoryOffset > 0
        BEGIN
            UPDATE FuelGradePriceHistory
            SET HistoryDate = DATEADD(day, @HistoryOffset, HistoryDate),
                DtFuelChange = DATEADD(day, @HistoryOffset, DtFuelChange),
                DtSentToGov = DATEADD(day, @HistoryOffset, DtSentToGov),
                DtLastReceived = DATEADD(day, @HistoryOffset, DtLastReceived);
        END

        -- Return the largest offset applied across all groups
        DECLARE @MaxOffset INT = (
            SELECT MAX(v) FROM (VALUES (@PrimaryOffset),(@FuelPricesOffset),(@DeliverectOffset),(@HistoryOffset)) AS t(v)
        );
        SELECT @MaxOffset AS OffsetDays,
               (SELECT COUNT(*) FROM FuelRecords) +
               (SELECT COUNT(*) FROM PumpMonitoring) +
               (SELECT COUNT(*) FROM PumpStatus) +
               (SELECT COUNT(*) FROM PumpTotals) +
               (SELECT COUNT(*) FROM TankGauges) +
               (SELECT COUNT(*) FROM DeliverectOrders) +
               (SELECT COUNT(*) FROM FuelGradePrices) +
               (SELECT COUNT(*) FROM FuelGradePriceHistory) AS RowsUpdated;";

    /// <summary>
    /// Shifts all business dates forward so the latest date becomes today.
    /// Updates FuelRecords, PumpMonitoring, PumpStatus, PumpTotals, and TankGauges,
    /// then refreshes the DomsInfoSnapshot.
    /// </summary>
    [HttpPost("move-dates-forward")]
    public async Task<IActionResult> MoveDatesForward()
    {
        var started = DateTime.UtcNow;
        logger.LogInformation("Moving dates forward so latest business date = today");

        using var conn = connectionFactory.CreateConnection();
        var row = await conn.QuerySingleAsync(MoveDatesForwardSql, commandTimeout: 300);
        int offsetDays = (int)row.OffsetDays;
        int rowsUpdated = (int)row.RowsUpdated;

        if (offsetDays == 0)
        {
            return Ok(new
            {
                message = "Dates are already current — no changes made",
                offsetDays = 0,
                rowsUpdated = 0,
                elapsedSeconds = 0.0
            });
        }

        // Refresh the DomsInfoSnapshot to reflect the shifted dates
        var snapshotRows = await conn.ExecuteScalarAsync<int>(PopulateSql, commandTimeout: 300);

        var elapsed = (DateTime.UtcNow - started).TotalSeconds;
        logger.LogInformation("Move dates forward complete. Offset={Days}d, Rows={Rows}", offsetDays, rowsUpdated);

        return Ok(new
        {
            message = "Dates moved forward successfully",
            offsetDays,
            rowsUpdated,
            snapshotRowsRefreshed = snapshotRows,
            elapsedSeconds = Math.Round(elapsed, 1)
        });
    }

    private const string RandomizeDataSql = @"
        -- ── Step 1: build site mapping (keep 200, renumber 001…200) ──────────────
        CREATE TABLE #SiteMap (OldId VARCHAR(20) NOT NULL, NewId VARCHAR(20) NOT NULL, Keep BIT NOT NULL);

        WITH Ranked AS (
            SELECT SiteId, ROW_NUMBER() OVER (ORDER BY SiteId) AS rn
            FROM Sites
        )
        INSERT INTO #SiteMap (OldId, NewId, Keep)
        SELECT SiteId,
               RIGHT('000' + CAST(rn AS VARCHAR(3)), 3),
               CASE WHEN rn <= 200 THEN 1 ELSE 0 END
        FROM Ranked;

        -- ── Step 2: delete child data for excess sites ───────────────────────────
        DELETE pfi FROM PumpFlowInfo pfi
            JOIN PumpMonitoringGrade pmg ON pmg.PumpMonitoringGradeId = pfi.PumpMonitoringGradeId
            JOIN PumpMonitoring pm        ON pm.PumpMonitoringId       = pmg.PumpMonitoringId
            JOIN PumpDevices pd           ON pd.PumpDeviceId           = pm.PumpDeviceId
            JOIN #SiteMap sm              ON sm.OldId = pd.SiteId AND sm.Keep = 0;

        DELETE ptc FROM PumpTankConsumption ptc
            JOIN PumpGradeTotals pgt ON pgt.PumpGradeTotalsId = ptc.PumpGradeTotalsId
            JOIN PumpTotals pt       ON pt.PumpTotalsId        = pgt.PumpTotalsId
            JOIN PumpDevices pd      ON pd.PumpDeviceId        = pt.PumpDeviceId
            JOIN #SiteMap sm         ON sm.OldId = pd.SiteId AND sm.Keep = 0;

        DELETE pgt FROM PumpGradeTotals pgt
            JOIN PumpTotals pt  ON pt.PumpTotalsId   = pgt.PumpTotalsId
            JOIN PumpDevices pd ON pd.PumpDeviceId   = pt.PumpDeviceId
            JOIN #SiteMap sm    ON sm.OldId = pd.SiteId AND sm.Keep = 0;

        DELETE pt FROM PumpTotals pt
            JOIN PumpDevices pd ON pd.PumpDeviceId = pt.PumpDeviceId
            JOIN #SiteMap sm    ON sm.OldId = pd.SiteId AND sm.Keep = 0;

        DELETE pmg FROM PumpMonitoringGrade pmg
            JOIN PumpMonitoring pm ON pm.PumpMonitoringId = pmg.PumpMonitoringId
            JOIN PumpDevices pd    ON pd.PumpDeviceId     = pm.PumpDeviceId
            JOIN #SiteMap sm       ON sm.OldId = pd.SiteId AND sm.Keep = 0;

        DELETE pm FROM PumpMonitoring pm
            JOIN PumpDevices pd ON pd.PumpDeviceId = pm.PumpDeviceId
            JOIN #SiteMap sm    ON sm.OldId = pd.SiteId AND sm.Keep = 0;

        DELETE ps FROM PumpStatus ps
            JOIN PumpDevices pd ON pd.PumpDeviceId = ps.PumpDeviceId
            JOIN #SiteMap sm    ON sm.OldId = pd.SiteId AND sm.Keep = 0;

        DELETE pd FROM PumpDevices pd
            JOIN #SiteMap sm ON sm.OldId = pd.SiteId AND sm.Keep = 0;

        DELETE fr  FROM FuelRecords fr          JOIN #SiteMap sm ON sm.OldId = fr.SiteId  AND sm.Keep = 0;
        DELETE fgp FROM FuelGradePrices fgp     JOIN #SiteMap sm ON sm.OldId = fgp.SiteId AND sm.Keep = 0;
        DELETE fgh FROM FuelGradePriceHistory fgh JOIN #SiteMap sm ON sm.OldId = fgh.SiteId AND sm.Keep = 0;
        DELETE tg  FROM TankGauges tg           JOIN #SiteMap sm ON sm.OldId = tg.SiteId  AND sm.Keep = 0;
        DELETE s   FROM Sites s                 JOIN #SiteMap sm ON sm.OldId = s.SiteId   AND sm.Keep = 0;

        -- ── Step 3: renumber SiteIds 001…200 ────────────────────────────────────
        ALTER TABLE FuelGradePriceHistory NOCHECK CONSTRAINT ALL;
        ALTER TABLE FuelGradePrices       NOCHECK CONSTRAINT ALL;
        ALTER TABLE FuelRecords           NOCHECK CONSTRAINT ALL;
        ALTER TABLE PumpDevices           NOCHECK CONSTRAINT ALL;
        ALTER TABLE TankGauges            NOCHECK CONSTRAINT ALL;

        UPDATE fr  SET fr.SiteId  = sm.NewId FROM FuelRecords fr          JOIN #SiteMap sm ON sm.OldId = fr.SiteId  WHERE sm.Keep = 1;
        UPDATE fgp SET fgp.SiteId = sm.NewId FROM FuelGradePrices fgp     JOIN #SiteMap sm ON sm.OldId = fgp.SiteId WHERE sm.Keep = 1;
        UPDATE fgh SET fgh.SiteId = sm.NewId FROM FuelGradePriceHistory fgh JOIN #SiteMap sm ON sm.OldId = fgh.SiteId WHERE sm.Keep = 1;
        UPDATE pd  SET pd.SiteId  = sm.NewId FROM PumpDevices pd           JOIN #SiteMap sm ON sm.OldId = pd.SiteId  WHERE sm.Keep = 1;
        UPDATE tg  SET tg.SiteId  = sm.NewId FROM TankGauges tg            JOIN #SiteMap sm ON sm.OldId = tg.SiteId  WHERE sm.Keep = 1;
        UPDATE s   SET s.SiteId   = sm.NewId FROM Sites s                  JOIN #SiteMap sm ON sm.OldId = s.SiteId   WHERE sm.Keep = 1;

        ALTER TABLE FuelGradePriceHistory WITH CHECK CHECK CONSTRAINT ALL;
        ALTER TABLE FuelGradePrices       WITH CHECK CHECK CONSTRAINT ALL;
        ALTER TABLE FuelRecords           WITH CHECK CHECK CONSTRAINT ALL;
        ALTER TABLE PumpDevices           WITH CHECK CHECK CONSTRAINT ALL;
        ALTER TABLE TankGauges            WITH CHECK CHECK CONSTRAINT ALL;

        -- ── Step 4: randomise financial figures ±30 % ───────────────────────────
        -- FuelRecords: AmountGBP, VolumeL
        UPDATE FuelRecords
        SET AmountGBP = ROUND(AmountGBP * (0.7 + (ABS(CHECKSUM(NEWID())) % 601) / 1000.0), 2),
            VolumeL   = ROUND(VolumeL   * (0.7 + (ABS(CHECKSUM(NEWID())) % 601) / 1000.0), 3);

        -- FuelGradePrices: GradeUnitPrice
        UPDATE FuelGradePrices
        SET GradeUnitPrice = ROUND(GradeUnitPrice * (0.7 + (ABS(CHECKSUM(NEWID())) % 601) / 1000.0), 4);

        -- PumpTotals: MoneyTotal, MoneyDiff, VolumeTotal, VolumeDiff
        UPDATE PumpTotals
        SET MoneyTotal  = ROUND(MoneyTotal  * (0.7 + (ABS(CHECKSUM(NEWID())) % 601) / 1000.0), 2),
            MoneyDiff   = ROUND(MoneyDiff   * (0.7 + (ABS(CHECKSUM(NEWID())) % 601) / 1000.0), 2),
            VolumeTotal = ROUND(VolumeTotal * (0.7 + (ABS(CHECKSUM(NEWID())) % 601) / 1000.0), 3),
            VolumeDiff  = ROUND(VolumeDiff  * (0.7 + (ABS(CHECKSUM(NEWID())) % 601) / 1000.0), 3);

        -- PumpGradeTotals: VolumeTotal, VolumeDiff
        UPDATE PumpGradeTotals
        SET VolumeTotal = ROUND(VolumeTotal * (0.7 + (ABS(CHECKSUM(NEWID())) % 601) / 1000.0), 3),
            VolumeDiff  = ROUND(VolumeDiff  * (0.7 + (ABS(CHECKSUM(NEWID())) % 601) / 1000.0), 3);

        -- TankGauges: volume/level readings
        UPDATE TankGauges
        SET Gauged    = ROUND(Gauged    * (0.7 + (ABS(CHECKSUM(NEWID())) % 601) / 1000.0), 1),
            GaugedDif = ROUND(GaugedDif * (0.7 + (ABS(CHECKSUM(NEWID())) % 601) / 1000.0), 1),
            Ullage     = ROUND(Ullage    * (0.7 + (ABS(CHECKSUM(NEWID())) % 601) / 1000.0), 1),
            TcCorrVol  = ROUND(TcCorrVol * (0.7 + (ABS(CHECKSUM(NEWID())) % 601) / 1000.0), 1);

        DROP TABLE #SiteMap;

        SELECT COUNT(*) FROM Sites;";

    /// <summary>
    /// Reduces sites to 200, renumbers SiteIds as 001–200, and randomises
    /// all financial/volume figures by a random ±30 %.
    /// </summary>
    [HttpPost("randomize-data")]
    public async Task<IActionResult> RandomizeData()
    {
        var started = DateTime.UtcNow;
        logger.LogInformation("Randomize data: reducing to 200 sites, renumbering IDs, randomising financials");

        using var conn = connectionFactory.CreateConnection();
        var sitesAfter = await conn.ExecuteScalarAsync<int>(RandomizeDataSql, commandTimeout: 300);

        // Rebuild the DomsInfoSnapshot to reflect the new state
        var snapshotRows = await conn.ExecuteScalarAsync<int>(PopulateSql, commandTimeout: 300);

        var elapsed = (DateTime.UtcNow - started).TotalSeconds;
        logger.LogInformation("Randomize data complete. Sites now: {Sites}, snapshot rows: {Snap}", sitesAfter, snapshotRows);

        return Ok(new
        {
            message = "Data randomized successfully",
            sitesAfter,
            snapshotRowsRefreshed = snapshotRows,
            elapsedSeconds = Math.Round(elapsed, 1)
        });
    }

    private const string SeedPriceHistorySql = @"
        -- Remove existing seeded history for the last 365 days so re-runs are idempotent
        DELETE FROM FuelGradePriceHistory
        WHERE HistoryDate >= DATEADD(day, -364, CAST(GETDATE() AS DATE));

        -- Generate day offsets 0–364 via cross-joined digit CTEs (avoids long VALUES list)
        -- Insert 365 days of price history derived from current FuelGradePrices.
        -- Each site+grade gets a change interval of 1, 2 or 3 days (hash-determined),
        -- so the price stays flat within a period then shifts by a random ±8%.
        WITH
            Digits AS (
                SELECT n FROM (VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9)) AS t(n)
            ),
            Nums AS (
                SELECT a.n * 100 + b.n * 10 + c.n AS n
                FROM Digits a CROSS JOIN Digits b CROSS JOIN Digits c
                WHERE a.n * 100 + b.n * 10 + c.n < 365
            )
        INSERT INTO FuelGradePriceHistory
            (SiteId, HistoryDate, GradeId, GradeDescription, GradeShortCode, GradeUnitPrice, DtFuelChange)
        SELECT
            gp.SiteId,
            CAST(DATEADD(day, nm.n - 364, CAST(GETDATE() AS DATE)) AS DATE) AS HistoryDate,
            gp.GradeId,
            gp.GradeDescription,
            gp.GradeShortCode,
            ROUND(
                gp.GradeUnitPrice * (
                    0.92 +
                    CAST(ABS(CHECKSUM(
                        gp.SiteId,
                        gp.GradeId,
                        nm.n / (1 + ABS(CHECKSUM(gp.SiteId, gp.GradeId)) % 3)
                    )) % 160 AS DECIMAL(10,4)) / 1000.0
                ),
                4
            ) AS GradeUnitPrice,
            CAST(DATEADD(day, nm.n - 364, CAST(GETDATE() AS DATE)) AS DATE) AS DtFuelChange
        FROM FuelGradePrices gp
        CROSS JOIN Nums nm;

        SELECT COUNT(*) FROM FuelGradePriceHistory
        WHERE HistoryDate >= DATEADD(day, -364, CAST(GETDATE() AS DATE));";

    /// <summary>
    /// Seeds 365 days of fake fuel price history into FuelGradePriceHistory.
    /// Prices vary every 1–3 days per site+grade combination.
    /// Any existing rows in that date range are replaced.
    /// </summary>
    [HttpPost("seed-price-history")]
    public async Task<IActionResult> SeedPriceHistory()
    {
        var started = DateTime.UtcNow;
        logger.LogInformation("Seeding fuel price history for the last 365 days");

        using var conn = connectionFactory.CreateConnection();
        var rowsInserted = await conn.ExecuteScalarAsync<int>(SeedPriceHistorySql, commandTimeout: 120);

        var elapsed = (DateTime.UtcNow - started).TotalSeconds;
        logger.LogInformation("Price history seeding complete. Rows: {Rows}", rowsInserted);

        return Ok(new
        {
            message = "Price history seeded successfully",
            rowsInserted,
            elapsedSeconds = Math.Round(elapsed, 1)
        });
    }

    private const string ImportLogInsertSql = @"
        INSERT INTO ImportLog (FileName, Status, Message, ImportedAtUtc)
        VALUES (@FileName, @Status, @Message, @ImportedAtUtc)";

    /// <summary>
    /// Accepts a DOMS XML file upload, processes it into the database, and records the result in ImportLog.
    /// </summary>
    [HttpPost("doms-xml-upload")]
    [RequestSizeLimit(50 * 1024 * 1024)]
    public async Task<IActionResult> UploadDomsXml(IFormFile file)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new { error = "No file uploaded." });

        var fileName = Path.GetFileName(file.FileName);
        var now = DateTime.UtcNow;

        string xmlContent;
        using (var reader = new StreamReader(file.OpenReadStream()))
            xmlContent = await reader.ReadToEndAsync();

        try
        {
            var result = await ProcessDomsXmlAsync(xmlContent);
            using var conn = connectionFactory.CreateConnection();
            await conn.ExecuteAsync(ImportLogInsertSql, new
            {
                FileName = fileName,
                Status = "success",
                Message = $"Processed OK. Site: {result.SiteId}, Pumps: {result.PumpCount}, Tanks: {result.TankCount}",
                ImportedAtUtc = now
            });
            logger.LogInformation("DOMS XML import success: {File}, site={Site}", fileName, result.SiteId);
            return Ok(new { message = "Import successful", fileName, siteId = result.SiteId, pumpCount = result.PumpCount, tankCount = result.TankCount });
        }
        catch (Exception ex)
        {
            using var conn = connectionFactory.CreateConnection();
            await conn.ExecuteAsync(ImportLogInsertSql, new
            {
                FileName = fileName,
                Status = "failed",
                Message = ex.Message,
                ImportedAtUtc = now
            });
            logger.LogError(ex, "DOMS XML import failed: {File}", fileName);
            return StatusCode(500, new { error = ex.Message, fileName });
        }
    }

    private async Task<(string SiteId, int PumpCount, int TankCount)> ProcessDomsXmlAsync(string xmlContent)
    {
        var root = XElement.Parse(xmlContent);
        var pssInfo = root.Element("pss_info") ?? throw new InvalidOperationException("No pss_info element.");
        var systemEl = pssInfo.Element("system") ?? throw new InvalidOperationException("No system element.");

        var siteId = (string?)systemEl.Attribute("number") ?? throw new InvalidOperationException("No site id.");
        siteId = siteId.Trim();
        var siteName = ((string?)systemEl.Attribute("name") ?? "").Trim();

        var timeEl = pssInfo.Element("time");
        var businessDateStr = (string?)timeEl?.Attribute("date") ?? "00000000";
        var snapshotTimeStr = (string?)timeEl?.Attribute("time") ?? "000000";
        var businessDate = ParseDate(businessDateStr);
        var snapshotUtc = ParseDateTime(businessDateStr, snapshotTimeStr);

        using var conn = connectionFactory.CreateConnection();

        // Upsert site
        await conn.ExecuteAsync(@"
            IF NOT EXISTS (SELECT 1 FROM Sites WHERE SiteId = @SiteId)
                INSERT INTO Sites (SiteId, SiteName, OpeningHour, ClosingHour, CreatedUtc)
                VALUES (@SiteId, @SiteName, '00:00:00', '23:59:59', GETUTCDATE())
            ELSE
                UPDATE Sites SET SiteName = @SiteName WHERE SiteId = @SiteId",
            new { SiteId = siteId, SiteName = siteName });

        var forecourt = root.Element("devices")?.Element("forecourt") ?? root.Descendants("forecourt").FirstOrDefault();
        int pumpCount = 0, tankCount = 0;

        if (forecourt != null)
        {
            // Pumps
            var pumpsEl = forecourt.Element("pumps");
            if (pumpsEl != null)
            {
                foreach (var deviceEl in pumpsEl.Elements("device"))
                {
                    var devId = ((string?)deviceEl.Attribute("id") ?? "").Trim();
                    if (string.IsNullOrEmpty(devId)) continue;

                    var online = Bit((string?)deviceEl.Attribute("online"));
                    var offlineCount = Int32Val((string?)deviceEl.Attribute("offline_count")) ?? 0;
                    var protocol = (string?)deviceEl.Attribute("protocol");
                    var typeBitsGen = (string?)deviceEl.Attribute("type_bits_general");
                    var typeBitsProt = (string?)deviceEl.Attribute("type_bits_protocol");

                    await conn.ExecuteAsync(@"
                        IF NOT EXISTS (SELECT 1 FROM PumpDevices WHERE SiteId=@SiteId AND DeviceId=@DeviceId)
                            INSERT INTO PumpDevices (SiteId, DeviceId, Online, OfflineCount, Protocol, TypeBitsGeneral, TypeBitsProtocol, LastSeenUtc)
                            VALUES (@SiteId, @DeviceId, @Online, @OfflineCount, @Protocol, @TypeBitsGeneral, @TypeBitsProtocol, @LastSeenUtc)
                        ELSE
                            UPDATE PumpDevices SET Online=@Online, OfflineCount=@OfflineCount, Protocol=@Protocol,
                                TypeBitsGeneral=@TypeBitsGeneral, TypeBitsProtocol=@TypeBitsProtocol, LastSeenUtc=@LastSeenUtc
                            WHERE SiteId=@SiteId AND DeviceId=@DeviceId",
                        new { SiteId = siteId, DeviceId = devId, Online = online, OfflineCount = offlineCount,
                              Protocol = protocol, TypeBitsGeneral = typeBitsGen, TypeBitsProtocol = typeBitsProt, LastSeenUtc = snapshotUtc });

                    var pumpDeviceId = await conn.ExecuteScalarAsync<int>(
                        "SELECT PumpDeviceId FROM PumpDevices WHERE SiteId=@SiteId AND DeviceId=@DeviceId",
                        new { SiteId = siteId, DeviceId = devId });

                    // PumpStatus
                    var statusEl = deviceEl.Element("status");
                    if (statusEl != null && businessDate.HasValue)
                    {
                        await conn.ExecuteAsync(@"
                            IF NOT EXISTS (SELECT 1 FROM PumpStatus WHERE PumpDeviceId=@PumpDeviceId AND BusinessDate=@BusinessDate)
                                INSERT INTO PumpStatus (PumpDeviceId, BusinessDate, SnapshotUtc, State, SubStateBits, SubState2Bits)
                                VALUES (@PumpDeviceId, @BusinessDate, @SnapshotUtc, @State, @SubStateBits, @SubState2Bits)",
                            new { PumpDeviceId = pumpDeviceId, BusinessDate = businessDate, SnapshotUtc = snapshotUtc,
                                  State = (string?)statusEl.Attribute("state"),
                                  SubStateBits = (string?)statusEl.Attribute("sub_state_bits"),
                                  SubState2Bits = (string?)statusEl.Attribute("sub_state2_bits") });
                    }

                    // PumpTotals
                    foreach (var pumpTotsEl in deviceEl.Elements("pump_tots"))
                    {
                        if (!businessDate.HasValue) continue;
                        var totType = (string?)pumpTotsEl.Attribute("type");
                        var grandTot = pumpTotsEl.Element("grand_tot");
                        if (grandTot == null) continue;

                        await conn.ExecuteAsync(@"
                            IF NOT EXISTS (SELECT 1 FROM PumpTotals WHERE PumpDeviceId=@PumpDeviceId AND BusinessDate=@BusinessDate AND TotType=@TotType)
                                INSERT INTO PumpTotals (PumpDeviceId, BusinessDate, SnapshotUtc, TotType, MoneyTotal, MoneyDiff, VolumeTotal, VolumeDiff)
                                VALUES (@PumpDeviceId, @BusinessDate, @SnapshotUtc, @TotType, @MoneyTotal, @MoneyDiff, @VolumeTotal, @VolumeDiff)",
                            new { PumpDeviceId = pumpDeviceId, BusinessDate = businessDate, SnapshotUtc = snapshotUtc, TotType = totType,
                                  MoneyTotal = DecimalVal((string?)grandTot.Attribute("money_tot")),
                                  MoneyDiff = DecimalVal((string?)grandTot.Attribute("money_dif")),
                                  VolumeTotal = DecimalVal((string?)grandTot.Attribute("vol_tot")),
                                  VolumeDiff = DecimalVal((string?)grandTot.Attribute("vol_dif")) });

                        var pumpTotalsId = await conn.ExecuteScalarAsync<int>(
                            "SELECT PumpTotalsId FROM PumpTotals WHERE PumpDeviceId=@PumpDeviceId AND BusinessDate=@BusinessDate AND TotType=@TotType",
                            new { PumpDeviceId = pumpDeviceId, BusinessDate = businessDate, TotType = totType });

                        foreach (var groptEl in pumpTotsEl.Elements("gropt_tot"))
                        {
                            var gropt = Int32Val((string?)groptEl.Attribute("gropt"));
                            var grId = ((string?)groptEl.Attribute("gr_id") ?? "").Trim();

                            await conn.ExecuteAsync(@"
                                IF NOT EXISTS (SELECT 1 FROM PumpGradeTotals WHERE PumpTotalsId=@PumpTotalsId AND GradeOption=@GradeOption AND GradeId=@GradeId)
                                    INSERT INTO PumpGradeTotals (PumpTotalsId, VolumeTotal, VolumeDiff, GradeOption, GradeId)
                                    VALUES (@PumpTotalsId, @VolumeTotal, @VolumeDiff, @GradeOption, @GradeId)",
                                new { PumpTotalsId = pumpTotalsId, GradeOption = gropt, GradeId = grId,
                                      VolumeTotal = DecimalVal((string?)groptEl.Attribute("vol_total")),
                                      VolumeDiff = DecimalVal((string?)groptEl.Attribute("vol_dif")) });

                            var pumpGradeTotalsId = await conn.ExecuteScalarAsync<int>(
                                "SELECT PumpGradeTotalsId FROM PumpGradeTotals WHERE PumpTotalsId=@PumpTotalsId AND GradeOption=@GradeOption AND GradeId=@GradeId",
                                new { PumpTotalsId = pumpTotalsId, GradeOption = gropt, GradeId = grId });

                            foreach (var tcEl in groptEl.Elements("tank_consumption"))
                            {
                                var tankId = ((string?)tcEl.Attribute("tank_id") ?? "").Trim();
                                await conn.ExecuteAsync(@"
                                    IF NOT EXISTS (SELECT 1 FROM PumpTankConsumption WHERE PumpGradeTotalsId=@PumpGradeTotalsId AND TankId=@TankId)
                                        INSERT INTO PumpTankConsumption (PumpGradeTotalsId, TankId, VolumeTotal, VolumeDiff)
                                        VALUES (@PumpGradeTotalsId, @TankId, @VolumeTotal, @VolumeDiff)",
                                    new { PumpGradeTotalsId = pumpGradeTotalsId, TankId = tankId,
                                          VolumeTotal = DecimalVal((string?)tcEl.Attribute("vol_total")),
                                          VolumeDiff = DecimalVal((string?)tcEl.Attribute("vol_dif")) });
                            }
                        }
                    }

                    // PumpMonitoring
                    var monitoringEl = deviceEl.Element("monitoring");
                    if (monitoringEl != null && businessDate.HasValue)
                    {
                        var hiSpeedTrig = DecimalVal((string?)monitoringEl.Attribute("hi_speed_trig_flow_rate")) ?? 0m;

                        await conn.ExecuteAsync(@"
                            IF NOT EXISTS (SELECT 1 FROM PumpMonitoring WHERE PumpDeviceId=@PumpDeviceId AND BusinessDate=@BusinessDate)
                                INSERT INTO PumpMonitoring (PumpDeviceId, BusinessDate, SnapshotUtc, HiSpeedTrigFlow)
                                VALUES (@PumpDeviceId, @BusinessDate, @SnapshotUtc, @HiSpeedTrigFlow)",
                            new { PumpDeviceId = pumpDeviceId, BusinessDate = businessDate, SnapshotUtc = snapshotUtc, HiSpeedTrigFlow = hiSpeedTrig });

                        var pumpMonitoringId = await conn.ExecuteScalarAsync<int>(
                            "SELECT PumpMonitoringId FROM PumpMonitoring WHERE PumpDeviceId=@PumpDeviceId AND BusinessDate=@BusinessDate",
                            new { PumpDeviceId = pumpDeviceId, BusinessDate = businessDate });

                        foreach (var groptEl in monitoringEl.Elements("grade_option"))
                        {
                            var gropt = Int32Val((string?)groptEl.Attribute("gropt"));
                            var totalTrans = Int32Val((string?)groptEl.Attribute("total_no_pump_trans")) ?? 0;
                            var zeroTrans = Int32Val((string?)groptEl.Attribute("no_pump_zero_trans")) ?? 0;
                            var noPeakZero = Int32Val((string?)groptEl.Attribute("no_peak_hour_pump_zero_trans")) ?? 0;
                            var uptime = Int32Val((string?)groptEl.Attribute("uptime")) ?? 0;

                            await conn.ExecuteAsync(@"
                                IF NOT EXISTS (SELECT 1 FROM PumpMonitoringGrade WHERE PumpMonitoringId=@PumpMonitoringId AND GradeOption=@GradeOption)
                                    INSERT INTO PumpMonitoringGrade (PumpMonitoringId, GradeOption, TotalPumpTrans, ZeroTrans, NoPeakHourZeroTrans, UptimeMinutes)
                                    VALUES (@PumpMonitoringId, @GradeOption, @TotalPumpTrans, @ZeroTrans, @NoPeakHourZeroTrans, @UptimeMinutes)",
                                new { PumpMonitoringId = pumpMonitoringId, GradeOption = gropt,
                                      TotalPumpTrans = totalTrans, ZeroTrans = zeroTrans,
                                      NoPeakHourZeroTrans = noPeakZero, UptimeMinutes = uptime });

                            var pmgId = await conn.ExecuteScalarAsync<int>(
                                "SELECT PumpMonitoringGradeId FROM PumpMonitoringGrade WHERE PumpMonitoringId=@PumpMonitoringId AND GradeOption=@GradeOption",
                                new { PumpMonitoringId = pumpMonitoringId, GradeOption = gropt });

                            foreach (var flowEl in groptEl.Elements("flow_info"))
                            {
                                var flowType = (string?)flowEl.Attribute("flow_type");
                                var flowRateEl = flowEl.Element("flow_rate");
                                var ttfEl = flowEl.Element("time_to_flow");
                                var ttpfEl = flowEl.Element("time_to_trans_peak_flow");

                                await conn.ExecuteAsync(@"
                                    IF NOT EXISTS (SELECT 1 FROM PumpFlowInfo WHERE PumpMonitoringGradeId=@PumpMonitoringGradeId AND FlowType=@FlowType)
                                        INSERT INTO PumpFlowInfo (PumpMonitoringGradeId, FlowType, TotalPumpTrans, NominalFlowRate,
                                            AvgFlowRate, PeakFlowRate, AvgTimeToFlow, MaxTimeToFlow, AvgTimeToPeakFlow, MaxTimeToPeakFlow)
                                        VALUES (@PumpMonitoringGradeId, @FlowType, @TotalPumpTrans, @NominalFlowRate,
                                            @AvgFlowRate, @PeakFlowRate, @AvgTimeToFlow, @MaxTimeToFlow, @AvgTimeToPeakFlow, @MaxTimeToPeakFlow)",
                                    new { PumpMonitoringGradeId = pmgId, FlowType = flowType,
                                          TotalPumpTrans = Int32Val((string?)flowEl.Attribute("total_no_pump_trans")) ?? 0,
                                          NominalFlowRate = DecimalVal((string?)flowEl.Attribute("nominal_flow_rate")) ?? 0m,
                                          AvgFlowRate = DecimalVal((string?)flowRateEl?.Attribute("average")),
                                          PeakFlowRate = DecimalVal((string?)flowRateEl?.Attribute("peak")),
                                          AvgTimeToFlow = Int32Val((string?)ttfEl?.Attribute("average")),
                                          MaxTimeToFlow = Int32Val((string?)ttfEl?.Attribute("max")),
                                          AvgTimeToPeakFlow = Int32Val((string?)ttpfEl?.Attribute("average")),
                                          MaxTimeToPeakFlow = Int32Val((string?)ttpfEl?.Attribute("max")) });
                            }
                        }
                    }
                    pumpCount++;
                }
            }

            // Tank Gauges
            var tankGaugesEl = forecourt.Element("tank_gauges");
            if (tankGaugesEl != null)
            {
                foreach (var deviceEl in tankGaugesEl.Elements("device"))
                {
                    var devId = ((string?)deviceEl.Attribute("id") ?? "").Trim();
                    if (string.IsNullOrEmpty(devId)) continue;

                    var tankInfoEl = deviceEl.Element("tank_info");
                    if (tankInfoEl == null) continue;
                    var tankId = ((string?)tankInfoEl.Attribute("tank_id") ?? "").Trim();

                    var dataEl = tankInfoEl.Element("data");
                    if (dataEl == null) continue;

                    var dataDateStr = (string?)dataEl.Attribute("date") ?? "00000000";
                    var dataDate = ParseDate(dataDateStr) ?? businessDate;
                    var dataTime = ParseTimeOnly((string?)dataEl.Attribute("time") ?? "000000");
                    var monitoringEl = deviceEl.Element("monitoring");

                    await conn.ExecuteAsync(@"
                        IF NOT EXISTS (SELECT 1 FROM TankGauges WHERE SiteId=@SiteId AND DeviceId=@DeviceId AND TankId=@TankId AND BusinessDate=@BusinessDate)
                            INSERT INTO TankGauges (SiteId, DeviceId, Online, OfflineCount, Protocol, TypeBits, TankId,
                                Capacity, TankHeight, ShellCapacity, BusinessDate, DataTime, Gauged, GaugedDif,
                                Ullage, ProdHeight, Temp, TcCorrVol, WaterVol, WaterHeight, Uptime, CreatedUtc)
                            VALUES (@SiteId, @DeviceId, @Online, @OfflineCount, @Protocol, @TypeBits, @TankId,
                                @Capacity, @TankHeight, @ShellCapacity, @BusinessDate, @DataTime, @Gauged, @GaugedDif,
                                @Ullage, @ProdHeight, @Temp, @TcCorrVol, @WaterVol, @WaterHeight, @Uptime, GETUTCDATE())",
                        new { SiteId = siteId, DeviceId = devId,
                              Online = Bit((string?)deviceEl.Attribute("online")),
                              OfflineCount = Int32Val((string?)deviceEl.Attribute("offline_count")) ?? 0,
                              Protocol = (string?)deviceEl.Attribute("protocol") ?? "",
                              TypeBits = (string?)deviceEl.Attribute("type_bits") ?? "",
                              TankId = tankId,
                              Capacity = DecimalVal((string?)tankInfoEl.Attribute("capacity")) ?? 0m,
                              TankHeight = DecimalVal((string?)tankInfoEl.Attribute("tank_height")) ?? 0m,
                              ShellCapacity = DecimalVal((string?)tankInfoEl.Attribute("shell_capacity")) ?? 0m,
                              BusinessDate = dataDate,
                              DataTime = dataTime,
                              Gauged = DecimalVal((string?)dataEl.Attribute("gauged")) ?? 0m,
                              GaugedDif = DecimalVal((string?)dataEl.Attribute("gauged_dif")) ?? 0m,
                              Ullage = DecimalVal((string?)dataEl.Attribute("ullage")) ?? 0m,
                              ProdHeight = DecimalVal((string?)dataEl.Attribute("prod_height")) ?? 0m,
                              Temp = DecimalVal((string?)dataEl.Attribute("temp")) ?? 0m,
                              TcCorrVol = DecimalVal((string?)dataEl.Attribute("tc_corr_vol")) ?? 0m,
                              WaterVol = DecimalVal((string?)dataEl.Attribute("water_vol")) ?? 0m,
                              WaterHeight = DecimalVal((string?)dataEl.Attribute("water_height")) ?? 0m,
                              Uptime = Int32Val((string?)monitoringEl?.Attribute("uptime")) ?? 0 });
                    tankCount++;
                }
            }
        }

        return (siteId, pumpCount, tankCount);
    }

    /// <summary>
    /// Accepts a system "event_log_entries" XML export (log_entry rows keyed by grp/code/subcode —
    /// POS online/offline, HTTP logins, fuelling point errors, grade availability, price changes,
    /// tank gauge alarms, leakage reports, terminal online/offline, clock changes), and imports
    /// each entry into SystemEvents. Existing (SiteId, SeqNo) pairs are skipped so re-imports are safe.
    /// Requires the SystemEvents table — see EvoFlow.Api/Sql/CreateSystemEventsTable.sql.
    ///
    /// Accepts one or more files under the "files" form field. Every file is processed and
    /// logged individually, but any new Sudden Loss events found across the whole batch are
    /// combined into a single alert email covering every affected site, rather than one email
    /// per site.
    /// </summary>
    [HttpPost("system-events-upload")]
    [RequestSizeLimit(50 * 1024 * 1024)]
    public async Task<IActionResult> UploadSystemEventsXml()
    {
        var files = Request.Form.Files.Count > 0 ? Request.Form.Files.ToList() : new List<IFormFile>();
        if (files.Count == 0)
            return BadRequest(new { error = "No file uploaded." });

        var now = DateTime.UtcNow;
        var fileResults = new List<object>();
        var allNewSuddenLossAlerts = new List<SuddenLossAlert>();
        int successCount = 0, failCount = 0;

        using var conn = connectionFactory.CreateConnection();

        foreach (var file in files)
        {
            if (file.Length == 0) continue;
            var fileName = Path.GetFileName(file.FileName);

            string xmlContent;
            using (var reader = new StreamReader(file.OpenReadStream()))
                xmlContent = await reader.ReadToEndAsync();

            try
            {
                var result = await ProcessSystemEventsXmlAsync(xmlContent);
                allNewSuddenLossAlerts.AddRange(result.NewSuddenLossAlerts);

                await conn.ExecuteAsync(ImportLogInsertSql, new
                {
                    FileName = fileName,
                    Status = "success",
                    Message = $"Processed OK. Site: {result.SiteId}, Entries: {result.TotalEntries}, Inserted: {result.Inserted}, Skipped (duplicate): {result.Skipped}",
                    ImportedAtUtc = now
                });
                logger.LogInformation("System events XML import success: {File}, site={Site}, inserted={Inserted}", fileName, result.SiteId, result.Inserted);

                successCount++;
                fileResults.Add(new
                {
                    fileName,
                    success = true,
                    siteId = result.SiteId,
                    totalEntries = result.TotalEntries,
                    inserted = result.Inserted,
                    skipped = result.Skipped
                });
            }
            catch (Exception ex)
            {
                await conn.ExecuteAsync(ImportLogInsertSql, new
                {
                    FileName = fileName,
                    Status = "failed",
                    Message = ex.Message,
                    ImportedAtUtc = now
                });
                logger.LogError(ex, "System events XML import failed: {File}", fileName);

                failCount++;
                fileResults.Add(new { fileName, success = false, error = ex.Message });
            }
        }

        // One consolidated email for the whole batch, covering every site that had a
        // genuinely new Sudden Loss event — not one email per site.
        if (allNewSuddenLossAlerts.Count > 0)
            await SendSuddenLossAlertAsync(conn, allNewSuddenLossAlerts);

        return Ok(new
        {
            message = failCount == 0 ? "Import successful" : "Import completed with errors",
            filesProcessed = files.Count,
            succeeded = successCount,
            failed = failCount,
            results = fileResults
        });
    }

    private async Task<(string SiteId, string SiteName, int TotalEntries, int Inserted, int Skipped, List<SuddenLossAlert> NewSuddenLossAlerts)> ProcessSystemEventsXmlAsync(string xmlContent)
    {
        var root = XElement.Parse(xmlContent);

        var siteId = ((string?)root.Attribute("system_number") ?? "").Trim();
        if (string.IsNullOrEmpty(siteId))
            throw new InvalidOperationException("No system_number attribute on event_log_entries root.");
        var systemName = ((string?)root.Attribute("system_name") ?? "").Trim();
        var stationId = ((string?)root.Attribute("station_id") ?? "").Trim();

        using var conn = connectionFactory.CreateConnection();

        // Upsert site (same convention as the DOMS import)
        await conn.ExecuteAsync(@"
            IF NOT EXISTS (SELECT 1 FROM Sites WHERE SiteId = @SiteId)
                INSERT INTO Sites (SiteId, SiteName, OpeningHour, ClosingHour, CreatedUtc)
                VALUES (@SiteId, @SiteName, '00:00:00', '23:59:59', GETUTCDATE())
            ELSE IF @SiteName <> ''
                UPDATE Sites SET SiteName = @SiteName WHERE SiteId = @SiteId",
            new { SiteId = siteId, SiteName = systemName });

        int total = 0, inserted = 0, skipped = 0;
        var newSuddenLossAlerts = new List<SuddenLossAlert>();

        foreach (var entry in root.Elements("log_entry"))
        {
            total++;

            var seqNo = Int32Val((string?)entry.Attribute("seqno"));
            var dateStr = (string?)entry.Attribute("date");
            var timeStr = (string?)entry.Attribute("time");
            var grp = (string?)entry.Attribute("grp") ?? "";
            var code = (string?)entry.Attribute("code") ?? "";
            var subcode = (string?)entry.Attribute("subcode");
            var text = (string?)entry.Attribute("text") ?? "";

            if (seqNo == null || string.IsNullOrEmpty(dateStr)) { skipped++; continue; }

            var eventDate = ParseDate(dateStr);
            if (eventDate == null) { skipped++; continue; }
            var eventTime = ParseTimeOnly(timeStr ?? "000000");
            var eventDateTime = new DateTime(eventDate.Value.Year, eventDate.Value.Month, eventDate.Value.Day,
                eventTime.Hour, eventTime.Minute, eventTime.Second, DateTimeKind.Unspecified);

            var deviceId = (string?)entry.Element("device")?.Element("id")?.Attribute("value");
            var ipAddress = (string?)entry.Element("device")?.Element("ip_addr")?.Attribute("value")
                             ?? (string?)entry.Element("user")?.Attribute("ip_addr")
                             ?? (string?)entry.Element("time_changed")?.Attribute("ip_addr");
            var userName = (string?)entry.Element("user")?.Attribute("name");

            var category = CategorizeEvent(grp, code, subcode);

            var rowsAffected = await conn.ExecuteAsync(@"
                IF NOT EXISTS (SELECT 1 FROM SystemEvents WHERE SiteId=@SiteId AND SeqNo=@SeqNo)
                    INSERT INTO SystemEvents
                        (SiteId, SystemName, StationId, SeqNo, EventDate, EventTime, EventDateTime,
                         Grp, Code, Subcode, EventCategory, EventText, DeviceId, UserName, IpAddress, RawXml)
                    VALUES
                        (@SiteId, @SystemName, @StationId, @SeqNo, @EventDate, @EventTime, @EventDateTime,
                         @Grp, @Code, @Subcode, @EventCategory, @EventText, @DeviceId, @UserName, @IpAddress, @RawXml)",
                new
                {
                    SiteId = siteId,
                    SystemName = string.IsNullOrEmpty(systemName) ? null : systemName,
                    StationId = string.IsNullOrEmpty(stationId) ? null : stationId,
                    SeqNo = seqNo,
                    EventDate = eventDate,
                    EventTime = eventTime,
                    EventDateTime = eventDateTime,
                    Grp = grp,
                    Code = code,
                    Subcode = subcode,
                    EventCategory = category,
                    EventText = text,
                    DeviceId = deviceId,
                    UserName = userName,
                    IpAddress = ipAddress,
                    RawXml = entry.ToString()
                });

            if (rowsAffected > 0) inserted++; else skipped++;

            // Sudden Loss / possible Sudden Loss tank gauge alarms also get parsed into
            // SuddenLossEvents (Loss=... L, t=... sec, c.r.=..., m.r.=... l/min pulled out
            // of the device event_txt attribute) alongside the generic SystemEvents row.
            if (grp == "0x04" && code == "0x02" && (subcode == "0x67" || subcode == "0x66"))
            {
                var systemEventId = await conn.ExecuteScalarAsync<long?>(
                    "SELECT SystemEventId FROM SystemEvents WHERE SiteId=@SiteId AND SeqNo=@SeqNo",
                    new { SiteId = siteId, SeqNo = seqNo });

                var eventTxt = (string?)entry.Element("device")?.Attribute("event_txt") ?? "";
                var match = Regex.Match(eventTxt,
                    @"Loss=(?<loss>[\d.]+)\s*L,\s*t=(?<t>[\d.]+)\s*sec,\s*c\.r\.=(?<cr>[\d.]+),\s*m\.r\.=(?<mr>[\d.]+)\s*l/min",
                    RegexOptions.IgnoreCase);

                var isPossible = text.Contains("possible", StringComparison.OrdinalIgnoreCase);
                var volumeLostLitres = match.Success ? DecimalVal(match.Groups["loss"].Value) : null;

                var suddenLossInserted = await conn.ExecuteAsync(@"
                    IF NOT EXISTS (SELECT 1 FROM SuddenLossEvents WHERE SiteId=@SiteId AND SeqNo=@SeqNo)
                        INSERT INTO SuddenLossEvents
                            (SystemEventId, SiteId, SeqNo, EventDateTime, TankId, IsPossible,
                             VolumeLostLitres, DurationSeconds, ConsumptionRate, MaxRateLPerMin, EventText)
                        VALUES
                            (@SystemEventId, @SiteId, @SeqNo, @EventDateTime, @TankId, @IsPossible,
                             @VolumeLostLitres, @DurationSeconds, @ConsumptionRate, @MaxRateLPerMin, @EventText)",
                    new
                    {
                        SystemEventId = systemEventId,
                        SiteId = siteId,
                        SeqNo = seqNo,
                        EventDateTime = eventDateTime,
                        TankId = deviceId,
                        IsPossible = isPossible,
                        VolumeLostLitres = volumeLostLitres,
                        DurationSeconds = match.Success ? Int32Val(match.Groups["t"].Value) : null,
                        ConsumptionRate = match.Success ? DecimalVal(match.Groups["cr"].Value) : null,
                        MaxRateLPerMin = match.Success ? DecimalVal(match.Groups["mr"].Value) : null,
                        EventText = text
                    });

                // Only alert on genuinely new events — re-imports of already-seen data stay silent.
                if (suddenLossInserted > 0)
                    newSuddenLossAlerts.Add(new SuddenLossAlert(siteId, systemName, eventDateTime, deviceId, isPossible, volumeLostLitres));
            }
        }

        // Alerting is handled by the caller, which aggregates new events across every
        // file in the batch so sites end up in one consolidated email rather than one each.
        return (siteId, systemName, total, inserted, skipped, newSuddenLossAlerts);
    }

    private record SuddenLossAlert(string SiteId, string SiteName, DateTime EventDateTime, string? TankId, bool IsPossible, decimal? VolumeLostLitres);

    /// <summary>
    /// Emails whoever is subscribed to the "Sudden Loss Alarm" in Alarm Settings, if it's enabled.
    /// One consolidated email per import batch covering every affected site — not one email per
    /// site. Never throws — a failed alert should not fail the import itself.
    /// </summary>
    private async Task SendSuddenLossAlertAsync(System.Data.IDbConnection conn, List<SuddenLossAlert> events)
    {
        try
        {
            var recipientEmails = (await conn.QueryAsync<string>(@"
                SELECT DISTINCT er.Email
                FROM AlarmTypes at
                JOIN AlarmSettings aset ON aset.AlarmTypeId = at.Id AND aset.IsEnabled = 1
                JOIN AlarmSettingRecipients asr ON asr.AlarmSettingId = aset.Id
                JOIN EmailRecipients er ON er.Id = asr.EmailRecipientId AND er.IsActive = 1
                WHERE at.Name = 'Sudden Loss Alarm'")).ToList();

            var siteCount = events.Select(e => e.SiteId).Distinct().Count();

            if (recipientEmails.Count == 0)
            {
                logger.LogInformation("Sudden Loss Alarm not enabled or has no recipients — skipping alert for {SiteCount} site(s), {Count} new event(s).",
                    siteCount, events.Count);
                return;
            }

            var plural = events.Count == 1 ? "event requires" : "events require";
            var siteWord = siteCount == 1 ? "site" : "sites";
            var subject = $"Sudden Loss Alarm — {events.Count} new event{(events.Count > 1 ? "s" : "")} across {siteCount} {siteWord}";
            var timestamp = DateTime.Now.ToString("dddd dd MMMM yyyy") + " &#8226; " + DateTime.Now.ToString("HH:mm");

            var rowsHtml = string.Join("", events
                .OrderByDescending(e => e.EventDateTime)
                .Select(e =>
                {
                    var (badgeLabel, badgeBg, badgeFg) = e.IsPossible
                        ? ("Possible", "#fef0c7", "#93540b")
                        : ("Confirmed", "#fee4e2", "#b42318");
                    var displaySite = string.IsNullOrEmpty(e.SiteName) ? e.SiteId : $"{e.SiteName} ({e.SiteId})";

                    return $"""
                        <tr>
                          {Td($"<span style='color:#667085;white-space:nowrap;'>{e.EventDateTime:dd-MMM-yyyy HH:mm:ss}</span>")}
                          {Td($"<span style='font-weight:600;color:#101828;'>{HtmlEnc(displaySite)}</span>")}
                          {Td($"<span style='font-weight:600;color:#101828;'>{HtmlEnc(e.TankId ?? "—")}</span>")}
                          {Td($"<span style='display:inline-block;background-color:{badgeBg};color:{badgeFg};font-size:12px;font-weight:600;padding:3px 10px;border-radius:999px;white-space:nowrap;'>{badgeLabel}</span>")}
                          {Td(e.VolumeLostLitres.HasValue ? e.VolumeLostLitres.Value.ToString("0.00") + " L" : "—", right: true)}
                        </tr>
                        """;
                }));

            var body = $"""
                <div style='margin:0;padding:0;background-color:#f1f3f6;'>
                  <table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='background-color:#f1f3f6;padding:24px 12px;'>
                    <tr>
                      <td align='center'>
                        <table role='presentation' width='820' cellpadding='0' cellspacing='0'
                               style='width:100%;max-width:820px;background-color:#ffffff;border-radius:14px;overflow:hidden;
                                      border:1px solid #e4e7ec;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;'>

                          <!-- Header -->
                          <tr>
                            <td style='background-color:#0f2440;padding:28px 32px;'>
                              <table role='presentation' width='100%' cellpadding='0' cellspacing='0'>
                                <tr>
                                  <td>
                                    <div style='font-size:20px;font-weight:600;color:#ffffff;letter-spacing:.3px;'>
                                      Sudden Loss Alarm
                                    </div>
                                    <div style='font-size:13px;color:#9db2cc;padding-top:6px;'>
                                      {siteCount} {siteWord} affected &#8226; {timestamp}
                                    </div>
                                  </td>
                                  <td align='right' style='vertical-align:middle;'>
                                    <span style='display:inline-block;background-color:#e8503a;color:#ffffff;
                                                 font-size:13px;font-weight:600;padding:6px 14px;border-radius:999px;'>
                                      {events.Count} new
                                    </span>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>

                          <!-- Intro -->
                          <tr>
                            <td style='padding:24px 32px 8px 32px;'>
                              <div style='font-size:14px;color:#475467;line-height:1.5;'>
                                The following {events.Count} tank gauge sudden-loss {plural} attention, across {siteCount} {siteWord}.
                              </div>
                            </td>
                          </tr>

                          <!-- Detail table -->
                          <tr>
                            <td style='padding:16px 32px 8px 32px;'>
                              <table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='border-collapse:collapse;'>
                                <tr>
                                  {Th("Date/Time")}{Th("Site")}{Th("Tank")}{Th("Type")}{Th("Volume Lost", right: true)}
                                </tr>
                                {rowsHtml}
                              </table>
                            </td>
                          </tr>

                          <!-- Footer -->
                          <tr>
                            <td style='padding:20px 32px 26px 32px;'>
                              <div style='border-top:1px solid #eaecf0;padding-top:16px;font-size:12px;color:#98a2b3;line-height:1.6;'>
                                Sent automatically by EvoFlow when new Sudden Loss (or possible Sudden Loss) events are imported from site data.
                              </div>
                            </td>
                          </tr>

                        </table>
                      </td>
                    </tr>
                  </table>
                </div>
                """;

            await emailService.SendAsync(recipientEmails, subject, body);
            logger.LogInformation("Sudden Loss Alarm email sent to {Count} recipient(s) covering {SiteCount} site(s), {EventCount} event(s).",
                recipientEmails.Count, siteCount, events.Count);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to send consolidated Sudden Loss Alarm email");
        }
    }

    /// <summary>
    /// Maps grp/code/subcode to a friendly event category. Falls back to a
    /// "Grp x / Code y" label for anything not seen before so new event types
    /// never fail an import — they just show up uncategorized until this map
    /// is extended.
    /// </summary>
    private static string CategorizeEvent(string grp, string code, string? subcode)
    {
        return (grp, code, subcode) switch
        {
            ("0x0b", "0x01", "0x01") => "POS Online",
            ("0x0b", "0x01", "0x00") => "POS Offline",
            ("0x02", "0x01", "0x01") => "Fuelling Point Online",
            ("0x02", "0x01", "0x00") => "Fuelling Point Offline",
            ("0x03", "0x01", "0x01") => "Terminal Online",
            ("0x03", "0x01", "0x00") => "Terminal Offline",
            ("0x01", "0x11", "0x01") => "HTTP Login On",
            ("0x01", "0x11", "0x00") => "HTTP Login Off",
            ("0x02", "0x04", "0x10") => "Fuelling Point Error: Preset Overrun",
            ("0x02", "0x84", "0x10") => "Fuelling Point Error Cleared: Preset Overrun",
            ("0x02", "0x04", "0x22") => "Fuelling Point Error: Totals Mismatch",
            ("0x02", "0x84", "0x22") => "Fuelling Point Error Cleared: Totals Mismatch",
            ("0x01", "0x23", "0x01") => "Grade Availability",
            ("0x01", "0x22", "0x01") => "Price Change",
            ("0x04", "0x11", _) => "Leakage Test Report",
            ("0x04", "0x02", "0x67") => "Tank Gauge Alarm: Sudden Loss",
            ("0x04", "0x02", "0x66") => "Tank Gauge Alarm: Possible Sudden Loss",
            ("0x01", "0x21", "0x00") => "Clock Changed",
            _ => $"Other (grp {grp} / code {code}{(string.IsNullOrEmpty(subcode) ? "" : $" / sub {subcode}")})"
        };
    }

    private static DateOnly? ParseDate(string? s)
    {
        if (string.IsNullOrEmpty(s) || s == "00000000") return null;
        return new DateOnly(int.Parse(s[..4]), int.Parse(s[4..6]), int.Parse(s[6..8]));
    }

    private static TimeOnly ParseTimeOnly(string? s)
    {
        if (string.IsNullOrEmpty(s) || s == "000000") return new TimeOnly(0, 0, 0);
        return new TimeOnly(int.Parse(s[..2]), int.Parse(s[2..4]), int.Parse(s[4..6]));
    }

    private static DateTime? ParseDateTime(string? d, string? t)
    {
        var dt = ParseDate(d);
        if (dt == null) return null;
        var tm = ParseTimeOnly(t);
        return new DateTime(dt.Value.Year, dt.Value.Month, dt.Value.Day, tm.Hour, tm.Minute, tm.Second, DateTimeKind.Utc);
    }

    private static int Bit(string? val) => val?.ToLower() == "yes" ? 1 : 0;
    private static decimal? DecimalVal(string? s) => decimal.TryParse(s, out var v) ? v : null;
    private static int? Int32Val(string? s) => int.TryParse(s, out var v) ? v : null;

    // ---------------------------------------------------------
    // Sudden Loss email template helpers — styled to match the
    // EvoMonitor alert email (dark header bar, pill badges, plain
    // table-based layout for broad email-client support).
    // ---------------------------------------------------------
    private static string Th(string text, bool right = false) =>
        $"<th align='{(right ? "right" : "left")}' style='padding:10px 12px;font-size:11px;font-weight:600;" +
        $"color:#667085;text-transform:uppercase;letter-spacing:.6px;border-bottom:2px solid #eaecf0;'>{text}</th>";

    private static string Td(string? inner, bool right = false) =>
        $"<td align='{(right ? "right" : "left")}' style='padding:12px;font-size:14px;color:#344054;" +
        $"border-bottom:1px solid #f2f4f7;vertical-align:middle;'>{inner ?? ""}</td>";

    private static string HtmlEnc(string? value) => System.Net.WebUtility.HtmlEncode(value ?? "");

    private static async Task<(int exitCode, string stdout, string stderr)> RunProcess(
        string executable, string arguments, TimeSpan timeout)
    {
        var psi = new ProcessStartInfo(executable, arguments)
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };

        using var proc = Process.Start(psi) ?? throw new InvalidOperationException("Failed to start process");

        var stdoutTask = proc.StandardOutput.ReadToEndAsync();
        var stderrTask = proc.StandardError.ReadToEndAsync();

        var completed = await Task.WhenAny(
            proc.WaitForExitAsync(),
            Task.Delay(timeout));

        if (!proc.HasExited)
        {
            proc.Kill(entireProcessTree: true);
            return (-1, "", "Process timed out");
        }

        return (proc.ExitCode, await stdoutTask, await stderrTask);
    }
}
