-- Run this once against the EvoFlow database (e.g. in SSMS) to create/update the
-- stored procedure used by GET /api/volumediscrepancies (VolumeDiscrepanciesController).
--
-- Parameterized version of the ad-hoc discrepancy script: matches each pump-side
-- grade total to its fp-side counterpart (same PumpTotalsId lineage, same
-- GradeOption/GradeId) and returns only lines where the volume gap meets/exceeds
-- @Threshold, with lines dropped where the gap exceeds @MaxGap or the pump volume
-- exceeds @MaxPumpVolume. All parameters are optional so the proc can also be run
-- ad-hoc with no arguments.

USE EvoFlow;
GO

CREATE OR ALTER PROCEDURE dbo.GetVolumeDiscrepancies
    @DateFrom  DATE            = NULL,   -- filters on ActivityDate (BusinessDate - 1)
    @DateTo    DATE            = NULL,
    @SiteId    NVARCHAR(20)    = NULL,
    @Threshold DECIMAL(18, 4)  = 0.01,
    -- Upper bounds: a gap this large, or a pump volume this large, is a
    -- bad/sentinel meter reading rather than a real discrepancy, so the line is
    -- dropped rather than reported.
    @MaxGap        DECIMAL(18, 4) = 9999999000,
    @MaxPumpVolume DECIMAL(18, 4) = 9999000000
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        pd.SiteId,
        s.SiteName,
        pd.DeviceId AS FuellingPointId,

        -- The report dated 11 September contains activity for 10 September
        CAST(DATEADD(DAY, -1, pump.BusinessDate) AS date) AS ActivityDate,
        pump.BusinessDate AS ReportDate,

        pumpGrade.GradeOption,
        pumpGrade.GradeId,
        ft.Name AS GradeDescription,
        tanks.TankIds,

        pumpGrade.VolumeDiff AS PhysicalPumpVolume,
        fpGrade.VolumeDiff   AS RecordedFpVolume,

        pumpGrade.VolumeDiff - fpGrade.VolumeDiff AS MissingVolume,

        pump.MoneyDiff AS PhysicalPumpMoney,
        fp.MoneyDiff   AS RecordedFpMoney,

        pump.MoneyDiff - fp.MoneyDiff AS MissingMoney,

        ISNULL(suddenloss.SuddenLossCount, 0)   AS SuddenLossCount,
        suddenloss.SuddenLossVolumeL            AS SuddenLossVolumeL

    FROM PumpTotals pump

    INNER JOIN PumpTotals fp
        ON fp.PumpDeviceId = pump.PumpDeviceId
        AND fp.BusinessDate = pump.BusinessDate
        AND fp.TotType = 'fp'

    INNER JOIN PumpDevices pd
        ON pd.PumpDeviceId = pump.PumpDeviceId

    INNER JOIN Sites s
        ON s.SiteId = pd.SiteId

    INNER JOIN PumpGradeTotals pumpGrade
        ON pumpGrade.PumpTotalsId = pump.PumpTotalsId

    INNER JOIN PumpGradeTotals fpGrade
        ON fpGrade.PumpTotalsId = fp.PumpTotalsId
        AND fpGrade.GradeOption = pumpGrade.GradeOption
        AND fpGrade.GradeId = pumpGrade.GradeId

    LEFT JOIN FuelTypes ft
        ON ft.FuelTypeId = pumpGrade.GradeId

    OUTER APPLY
    (
        SELECT
            STRING_AGG(ptc.TankId, ', ') AS TankIds
        FROM PumpTankConsumption ptc
        WHERE ptc.PumpGradeTotalsId = pumpGrade.PumpGradeTotalsId
    ) tanks

    -- Cross-reference: Sudden Loss / possible Sudden Loss tank gauge alarms recorded
    -- for the same site on the same activity date (see CreateSuddenLossTable.sql).
    OUTER APPLY
    (
        SELECT
            COUNT(*)                  AS SuddenLossCount,
            SUM(sl.VolumeLostLitres)  AS SuddenLossVolumeL
        FROM SuddenLossEvents sl
        WHERE sl.SiteId = pd.SiteId
          AND CAST(sl.EventDateTime AS date) = CAST(DATEADD(DAY, -1, pump.BusinessDate) AS date)
    ) suddenloss

    WHERE pump.TotType = 'pump'
      AND (@SiteId IS NULL OR pd.SiteId = @SiteId)
      AND (@DateFrom IS NULL OR CAST(DATEADD(DAY, -1, pump.BusinessDate) AS date) >= @DateFrom)
      AND (@DateTo   IS NULL OR CAST(DATEADD(DAY, -1, pump.BusinessDate) AS date) <= @DateTo)
      AND ABS(pumpGrade.VolumeDiff - fpGrade.VolumeDiff) >= @Threshold
      AND ABS(pumpGrade.VolumeDiff - fpGrade.VolumeDiff) <= @MaxGap
      AND pumpGrade.VolumeDiff <= @MaxPumpVolume

    ORDER BY
        ActivityDate,
        pd.SiteId,
        pd.DeviceId,
        pumpGrade.GradeOption;
END
GO
