-- Run this once against the EvoFlow database (e.g. in SSMS) to create the table used
-- to store parsed "Sudden Loss" / "possible Sudden Loss" tank gauge alarm events
-- (grp=0x04, code=0x02, subcode=0x67 / 0x66 in the event_log_entries XML).
--
-- These events look like:
--   Tank Gauge Id 02; Alarm on:'PSS detected Sudden Loss - Loss=117 L, t=243 sec, c.r.=28, m.r.=25 l/min.'
--   Tank Gauge Id 01; Alarm on:'PSS detected possible Sudden Loss - Loss=204 L, t=244 sec, c.r.=50, m.r.=25 l/min.'
-- The Loss/t/c.r./m.r. values are parsed out of the device event_txt attribute at
-- import time (see ImportController.ProcessSystemEventsXmlAsync) alongside the
-- generic SystemEvents row, so this table only ever holds sudden-loss rows.

USE EvoFlow;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'SuddenLossEvents')
BEGIN
    CREATE TABLE SuddenLossEvents (
        SuddenLossEventId BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,

        SystemEventId     BIGINT        NULL,       -- link back to the raw SystemEvents row, when available
        SiteId            VARCHAR(20)   NOT NULL,    -- must match Sites.SiteId (varchar, not nvarchar)
        SeqNo             INT           NOT NULL,

        EventDateTime     DATETIME2(0)  NOT NULL,
        TankId            NVARCHAR(20)  NULL,        -- Tank Gauge Id, from the log entry's <device><id>
        IsPossible        BIT           NOT NULL,    -- 1 = "possible Sudden Loss", 0 = confirmed "Sudden Loss"

        VolumeLostLitres  DECIMAL(10,2) NULL,        -- Loss=... L
        DurationSeconds   INT           NULL,         -- t=... sec
        ConsumptionRate   DECIMAL(10,2) NULL,         -- c.r.=...
        MaxRateLPerMin    DECIMAL(10,2) NULL,         -- m.r.=... l/min

        EventText         NVARCHAR(500) NULL,         -- full raw text="" attribute

        ImportedAtUtc     DATETIME2     NOT NULL CONSTRAINT DF_SuddenLossEvents_ImportedAtUtc DEFAULT (SYSUTCDATETIME()),

        CONSTRAINT UQ_SuddenLossEvents_Site_SeqNo UNIQUE (SiteId, SeqNo),
        CONSTRAINT FK_SuddenLossEvents_Sites FOREIGN KEY (SiteId) REFERENCES Sites(SiteId),
        CONSTRAINT FK_SuddenLossEvents_SystemEvents FOREIGN KEY (SystemEventId) REFERENCES SystemEvents(SystemEventId)
    );

    CREATE INDEX IX_SuddenLossEvents_Site_EventDateTime ON SuddenLossEvents (SiteId, EventDateTime);
    CREATE INDEX IX_SuddenLossEvents_TankId ON SuddenLossEvents (TankId);
END
GO
