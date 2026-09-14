-- Run this once against the EvoFlow database (e.g. in SSMS) to create the table used
-- to store parsed <log_entry> rows from the "event_log_entries" XML export
-- (grp/code/subcode driven system event log — POS online/offline, HTTP logins,
-- fuelling point errors, grade availability, price changes, tank gauge alarms,
-- leakage test reports, terminal online/offline, clock changes, etc).
--
-- The event schema has ~15 different "shapes" of child element depending on
-- grp/code/subcode (device+id, device+ip_addr, user, grade_availability,
-- price_change/priceset/price_group, tank_info/leakage_test/struct_vro,
-- totals_mismatch, time_changed). Rather than modelling every shape as its own
-- table, the common queryable fields are pulled out into real columns and the
-- full <log_entry> fragment is kept in RawXml for drill-down / anything not
-- captured by the common columns.

USE EvoFlow;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'SystemEvents')
BEGIN
    CREATE TABLE SystemEvents (
        SystemEventId   BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,

        SiteId          VARCHAR(20)   NOT NULL,   -- must match Sites.SiteId exactly (varchar, not nvarchar) for the FK below
        SystemName      NVARCHAR(100) NULL,
        StationId       NVARCHAR(50)  NULL,

        SeqNo           INT           NOT NULL,
        EventDate       DATE          NOT NULL,
        EventTime       TIME(0)       NOT NULL,
        EventDateTime   DATETIME2(0)  NOT NULL,

        Grp             VARCHAR(10)   NOT NULL,   -- e.g. '0x0b'
        Code            VARCHAR(10)   NOT NULL,   -- e.g. '0x01'
        Subcode         VARCHAR(10)   NULL,        -- e.g. '0x01' (some event types have none)

        EventCategory   NVARCHAR(60)  NOT NULL,   -- friendly name derived from grp/code/subcode
        EventText       NVARCHAR(500) NULL,        -- the raw text="" attribute

        DeviceId        NVARCHAR(20)  NULL,        -- fuelling point / terminal / tank id, when present
        UserName        NVARCHAR(50)  NULL,        -- HTTP login user name, when present
        IpAddress       NVARCHAR(50)  NULL,         -- device/user/POS ip address, when present

        RawXml          NVARCHAR(MAX) NULL,         -- full <log_entry>...</log_entry> fragment

        ImportedAtUtc   DATETIME2     NOT NULL CONSTRAINT DF_SystemEvents_ImportedAtUtc DEFAULT (SYSUTCDATETIME()),

        CONSTRAINT UQ_SystemEvents_Site_SeqNo UNIQUE (SiteId, SeqNo),
        CONSTRAINT FK_SystemEvents_Sites FOREIGN KEY (SiteId) REFERENCES Sites(SiteId)
    );

    CREATE INDEX IX_SystemEvents_Site_EventDateTime ON SystemEvents (SiteId, EventDateTime);
    CREATE INDEX IX_SystemEvents_EventCategory ON SystemEvents (EventCategory);
    CREATE INDEX IX_SystemEvents_EventDateTime ON SystemEvents (EventDateTime);
END
GO
