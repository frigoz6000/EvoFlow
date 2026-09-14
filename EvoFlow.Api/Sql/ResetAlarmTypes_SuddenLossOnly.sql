-- Run this once against the EvoFlow database (e.g. in SSMS) to clear out the old
-- demo alarm types (Low Tank Level, Pump Offline, etc. — none of which were ever
-- actually wired up to a real detection process) and start again with a single,
-- real alarm: "Sudden Loss Alarm".
--
-- Sudden Loss / possible Sudden Loss events are picked up in real time (site event
-- XML imports every 3-4 minutes) by ImportController.ProcessSystemEventsXmlAsync,
-- which — after this alarm is enabled here with recipients assigned in the
-- Alarm Settings screen — emails everyone subscribed whenever a NEW Sudden Loss
-- event is imported (one consolidated email per import batch, not one per event).

USE EvoFlow;
GO

DELETE FROM AlarmSettingRecipients;
DELETE FROM AlarmSettings;
DELETE FROM AlarmTypes;

-- Reset identities so the new alarm type starts clean at Id = 1
DBCC CHECKIDENT ('AlarmTypes', RESEED, 0);
DBCC CHECKIDENT ('AlarmSettings', RESEED, 0);
DBCC CHECKIDENT ('AlarmSettingRecipients', RESEED, 0);

INSERT INTO AlarmTypes (Category, Description, Name)
VALUES (
    'Tank',
    'A tank gauge reported a Sudden Loss or possible Sudden Loss event from incoming site event data.',
    'Sudden Loss Alarm'
);

-- Go to Config -> Alarm Settings, click Configure on "Sudden Loss Alarm",
-- tick Enable this alarm, and pick recipients.
GO
