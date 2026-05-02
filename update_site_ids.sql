-- FLO-76: Update SiteIds to match site name numbers
-- Maps old SiteId (e.g. '3001') to new SiteId (e.g. '001') based on SiteName

BEGIN TRANSACTION;

-- Step 1: Build mapping from old SiteId to new SiteId
CREATE TABLE #SiteIdMap (
    OldSiteId VARCHAR(20) NOT NULL,
    NewSiteId VARCHAR(20) NOT NULL
);

INSERT INTO #SiteIdMap (OldSiteId, NewSiteId)
SELECT
    SiteId AS OldSiteId,
    LTRIM(RTRIM(REPLACE(SiteName, 'Site ', ''))) AS NewSiteId
FROM Sites;

-- Verify mapping looks correct
SELECT TOP 10 OldSiteId, NewSiteId FROM #SiteIdMap ORDER BY NewSiteId;

-- Step 2: Disable FK constraints on child tables
ALTER TABLE FuelGradePriceHistory NOCHECK CONSTRAINT FK_FuelGradePriceHistory_Sites;
ALTER TABLE FuelGradePrices NOCHECK CONSTRAINT FK_FuelGradePrices_Sites;
ALTER TABLE FuelRecords NOCHECK CONSTRAINT FK_FuelRecords_Sites;
ALTER TABLE PumpDevices NOCHECK CONSTRAINT FK_PumpDevices_Site;
ALTER TABLE TankGauges NOCHECK CONSTRAINT FK_TankGauges_Sites;

-- Step 3: Update child tables
UPDATE fr
SET fr.SiteId = m.NewSiteId
FROM FuelRecords fr
JOIN #SiteIdMap m ON fr.SiteId = m.OldSiteId;
PRINT 'FuelRecords updated: ' + CAST(@@ROWCOUNT AS VARCHAR);

UPDATE fgp
SET fgp.SiteId = m.NewSiteId
FROM FuelGradePrices fgp
JOIN #SiteIdMap m ON fgp.SiteId = m.OldSiteId;
PRINT 'FuelGradePrices updated: ' + CAST(@@ROWCOUNT AS VARCHAR);

UPDATE fgph
SET fgph.SiteId = m.NewSiteId
FROM FuelGradePriceHistory fgph
JOIN #SiteIdMap m ON fgph.SiteId = m.OldSiteId;
PRINT 'FuelGradePriceHistory updated: ' + CAST(@@ROWCOUNT AS VARCHAR);

UPDATE pd
SET pd.SiteId = m.NewSiteId
FROM PumpDevices pd
JOIN #SiteIdMap m ON pd.SiteId = m.OldSiteId;
PRINT 'PumpDevices updated: ' + CAST(@@ROWCOUNT AS VARCHAR);

UPDATE tg
SET tg.SiteId = m.NewSiteId
FROM TankGauges tg
JOIN #SiteIdMap m ON tg.SiteId = m.OldSiteId;
PRINT 'TankGauges updated: ' + CAST(@@ROWCOUNT AS VARCHAR);

UPDATE dis
SET dis.SiteId = m.NewSiteId
FROM DomsInfoSnapshot dis
JOIN #SiteIdMap m ON dis.SiteId = m.OldSiteId;
PRINT 'DomsInfoSnapshot updated: ' + CAST(@@ROWCOUNT AS VARCHAR);

UPDATE deo
SET deo.SiteId = m.NewSiteId
FROM DeliverectOrders deo
JOIN #SiteIdMap m ON deo.SiteId = m.OldSiteId;
PRINT 'DeliverectOrders updated: ' + CAST(@@ROWCOUNT AS VARCHAR);

-- Step 4: Update the Sites table itself
UPDATE s
SET s.SiteId = m.NewSiteId
FROM Sites s
JOIN #SiteIdMap m ON s.SiteId = m.OldSiteId;
PRINT 'Sites updated: ' + CAST(@@ROWCOUNT AS VARCHAR);

-- Step 5: Re-enable FK constraints
ALTER TABLE FuelGradePriceHistory WITH CHECK CHECK CONSTRAINT FK_FuelGradePriceHistory_Sites;
ALTER TABLE FuelGradePrices WITH CHECK CHECK CONSTRAINT FK_FuelGradePrices_Sites;
ALTER TABLE FuelRecords WITH CHECK CHECK CONSTRAINT FK_FuelRecords_Sites;
ALTER TABLE PumpDevices WITH CHECK CHECK CONSTRAINT FK_PumpDevices_Site;
ALTER TABLE TankGauges WITH CHECK CHECK CONSTRAINT FK_TankGauges_Sites;

-- Step 6: Verify
SELECT TOP 10 SiteId, SiteName FROM Sites ORDER BY SiteName;

DROP TABLE #SiteIdMap;

COMMIT TRANSACTION;
PRINT 'All done. SiteIds updated successfully.';
