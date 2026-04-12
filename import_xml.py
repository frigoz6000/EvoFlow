"""
EvoFlow XML Import Script
Reads all XML files from C:\Zips\domsfiles\ and imports into EvoFlow SQL Server database.
Uses Windows Authentication.
"""

import os
import glob
import pyodbc
from xml.etree import ElementTree as ET
from datetime import datetime, date, time

CONN_STR = (
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=DESKTOP-QOQ7DHK\\SQLEXPRESS01;"
    "DATABASE=EvoFlow;"
    "Trusted_Connection=yes;"
)

XML_DIR = r"C:\Zips\domsfiles"


def parse_date(d: str):
    """Parse YYYYMMDD string to date."""
    if not d or d == "00000000":
        return None
    return date(int(d[:4]), int(d[4:6]), int(d[6:8]))


def parse_time(t: str):
    """Parse HHMMSS string to time."""
    if not t or t == "000000":
        return time(0, 0, 0)
    return time(int(t[:2]), int(t[2:4]), int(t[4:6]))


def parse_datetime(d: str, t: str):
    """Parse YYYYMMDD + HHMMSS into datetime."""
    dt = parse_date(d)
    tm = parse_time(t)
    if dt is None:
        return None
    return datetime(dt.year, dt.month, dt.day, tm.hour, tm.minute, tm.second)


def f(val):
    """Return float or None."""
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def i(val):
    """Return int or None."""
    if val is None:
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


def b(val):
    """Return bool from yes/no string."""
    return 1 if val and val.lower() == "yes" else 0


def import_xml(cursor, filepath: str):
    filename = os.path.basename(filepath)
    try:
        tree = ET.parse(filepath)
        root = tree.getroot()
    except ET.ParseError as e:
        print(f"  SKIP (parse error): {filename} - {e}")
        return

    # --- Site info ---
    pss_info = root.find("pss_info")
    if pss_info is None:
        print(f"  SKIP (no pss_info): {filename}")
        return

    system_el = pss_info.find("system")
    if system_el is None:
        print(f"  SKIP (no system element): {filename}")
        return

    site_id = system_el.get("number", "").strip()
    site_name = system_el.get("name", "").strip()
    if not site_id:
        print(f"  SKIP (no site id): {filename}")
        return

    time_el = pss_info.find("time")
    business_date_str = time_el.get("date", "00000000") if time_el is not None else "00000000"
    snapshot_time_str = time_el.get("time", "000000") if time_el is not None else "000000"
    business_date = parse_date(business_date_str)
    snapshot_utc = parse_datetime(business_date_str, snapshot_time_str)

    # Insert Site (MERGE to avoid duplicates across files)
    cursor.execute("""
        IF NOT EXISTS (SELECT 1 FROM Sites WHERE SiteId = ?)
        INSERT INTO Sites (SiteId, SiteName, OpeningHour, ClosingHour, CreatedUtc)
        VALUES (?, ?, '00:00:00', '23:59:59', GETUTCDATE())
        ELSE
        UPDATE Sites SET SiteName = ? WHERE SiteId = ?
    """, site_id, site_id, site_name, site_name, site_id)

    forecourt = root.find(".//devices/forecourt")
    if forecourt is None:
        return

    # --- Pump Devices ---
    pumps_el = forecourt.find("pumps")
    if pumps_el is not None:
        for device_el in pumps_el.findall("device"):
            dev_id = device_el.get("id", "").strip()
            if not dev_id:
                continue
            online = b(device_el.get("online"))
            offline_count = i(device_el.get("offline_count")) or 0
            protocol = device_el.get("protocol")
            type_bits_gen = device_el.get("type_bits_general")
            type_bits_prot = device_el.get("type_bits_protocol")

            # Upsert PumpDevice
            cursor.execute("""
                IF NOT EXISTS (SELECT 1 FROM PumpDevices WHERE SiteId = ? AND DeviceId = ?)
                INSERT INTO PumpDevices (SiteId, DeviceId, Online, OfflineCount, Protocol, TypeBitsGeneral, TypeBitsProtocol, LastSeenUtc)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ELSE
                UPDATE PumpDevices SET Online=?, OfflineCount=?, Protocol=?, TypeBitsGeneral=?, TypeBitsProtocol=?, LastSeenUtc=?
                WHERE SiteId=? AND DeviceId=?
            """,
                site_id, dev_id,
                site_id, dev_id, online, offline_count, protocol, type_bits_gen, type_bits_prot, snapshot_utc,
                online, offline_count, protocol, type_bits_gen, type_bits_prot, snapshot_utc,
                site_id, dev_id
            )

            # Get PumpDeviceId
            cursor.execute("SELECT PumpDeviceId FROM PumpDevices WHERE SiteId=? AND DeviceId=?", site_id, dev_id)
            row = cursor.fetchone()
            if row is None:
                continue
            pump_device_id = row[0]

            # PumpStatus
            status_el = device_el.find("status")
            if status_el is not None and business_date is not None:
                state = status_el.get("state")
                sub_state_bits = status_el.get("sub_state_bits")
                sub_state2_bits = status_el.get("sub_state2_bits")
                cursor.execute("""
                    IF NOT EXISTS (SELECT 1 FROM PumpStatus WHERE PumpDeviceId=? AND BusinessDate=?)
                    INSERT INTO PumpStatus (PumpDeviceId, BusinessDate, SnapshotUtc, State, SubStateBits, SubState2Bits)
                    VALUES (?, ?, ?, ?, ?, ?)
                """,
                    pump_device_id, business_date,
                    pump_device_id, business_date, snapshot_utc, state, sub_state_bits, sub_state2_bits
                )

            # PumpTotals
            for pump_tots_el in device_el.findall("pump_tots"):
                tot_type = pump_tots_el.get("type")
                grand_tot = pump_tots_el.find("grand_tot")
                if grand_tot is None or business_date is None:
                    continue
                money_tot = f(grand_tot.get("money_tot"))
                money_dif = f(grand_tot.get("money_dif"))
                vol_tot = f(grand_tot.get("vol_tot"))
                vol_dif = f(grand_tot.get("vol_dif"))

                cursor.execute("""
                    IF NOT EXISTS (SELECT 1 FROM PumpTotals WHERE PumpDeviceId=? AND BusinessDate=? AND TotType=?)
                    INSERT INTO PumpTotals (PumpDeviceId, BusinessDate, SnapshotUtc, TotType, MoneyTotal, MoneyDiff, VolumeTotal, VolumeDiff)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                    pump_device_id, business_date, tot_type,
                    pump_device_id, business_date, snapshot_utc, tot_type, money_tot, money_dif, vol_tot, vol_dif
                )

                cursor.execute("SELECT PumpTotalsId FROM PumpTotals WHERE PumpDeviceId=? AND BusinessDate=? AND TotType=?",
                               pump_device_id, business_date, tot_type)
                pt_row = cursor.fetchone()
                if pt_row is None:
                    continue
                pump_totals_id = pt_row[0]

                # PumpGradeTotals + PumpTankConsumption
                for gropt_el in pump_tots_el.findall("gropt_tot"):
                    gropt = i(gropt_el.get("gropt"))
                    gr_id = gropt_el.get("gr_id", "").strip()
                    vol_total = f(gropt_el.get("vol_total"))
                    vol_dif_g = f(gropt_el.get("vol_dif"))

                    cursor.execute("""
                        IF NOT EXISTS (SELECT 1 FROM PumpGradeTotals WHERE PumpTotalsId=? AND GradeOption=? AND GradeId=?)
                        INSERT INTO PumpGradeTotals (PumpTotalsId, VolumeTotal, VolumeDiff, GradeOption, GradeId)
                        VALUES (?, ?, ?, ?, ?)
                    """,
                        pump_totals_id, gropt, gr_id,
                        pump_totals_id, vol_total, vol_dif_g, gropt, gr_id
                    )

                    cursor.execute("SELECT PumpGradeTotalsId FROM PumpGradeTotals WHERE PumpTotalsId=? AND GradeOption=? AND GradeId=?",
                                   pump_totals_id, gropt, gr_id)
                    pgt_row = cursor.fetchone()
                    if pgt_row is None:
                        continue
                    pump_grade_totals_id = pgt_row[0]

                    for tc_el in gropt_el.findall("tank_consumption"):
                        tank_id = tc_el.get("tank_id", "").strip()
                        tc_vol_tot = f(tc_el.get("vol_total"))
                        tc_vol_dif = f(tc_el.get("vol_dif"))
                        cursor.execute("""
                            IF NOT EXISTS (SELECT 1 FROM PumpTankConsumption WHERE PumpGradeTotalsId=? AND TankId=?)
                            INSERT INTO PumpTankConsumption (PumpGradeTotalsId, TankId, VolumeTotal, VolumeDiff)
                            VALUES (?, ?, ?, ?)
                        """,
                            pump_grade_totals_id, tank_id,
                            pump_grade_totals_id, tank_id, tc_vol_tot, tc_vol_dif
                        )

            # PumpMonitoring + PumpMonitoringGrade + PumpFlowInfo
            monitoring_el = device_el.find("monitoring")
            if monitoring_el is not None and business_date is not None:
                hi_speed_trig = f(monitoring_el.get("hi_speed_trig_flow_rate")) or 0.0

                cursor.execute("""
                    IF NOT EXISTS (SELECT 1 FROM PumpMonitoring WHERE PumpDeviceId=? AND BusinessDate=?)
                    INSERT INTO PumpMonitoring (PumpDeviceId, BusinessDate, SnapshotUtc, HiSpeedTrigFlow)
                    VALUES (?, ?, ?, ?)
                """,
                    pump_device_id, business_date,
                    pump_device_id, business_date, snapshot_utc, hi_speed_trig
                )

                cursor.execute("SELECT PumpMonitoringId FROM PumpMonitoring WHERE PumpDeviceId=? AND BusinessDate=?",
                               pump_device_id, business_date)
                pm_row = cursor.fetchone()
                if pm_row is None:
                    continue
                pump_monitoring_id = pm_row[0]

                for gropt_el in monitoring_el.findall("grade_option"):
                    gropt = i(gropt_el.get("gropt"))
                    total_trans = i(gropt_el.get("total_no_pump_trans")) or 0
                    zero_trans = i(gropt_el.get("no_pump_zero_trans")) or 0
                    no_peak_zero = i(gropt_el.get("no_peak_hour_pump_zero_trans")) or 0
                    uptime = i(gropt_el.get("uptime")) or 0

                    cursor.execute("""
                        IF NOT EXISTS (SELECT 1 FROM PumpMonitoringGrade WHERE PumpMonitoringId=? AND GradeOption=?)
                        INSERT INTO PumpMonitoringGrade (PumpMonitoringId, GradeOption, TotalPumpTrans, ZeroTrans, NoPeakHourZeroTrans, UptimeMinutes)
                        VALUES (?, ?, ?, ?, ?, ?)
                    """,
                        pump_monitoring_id, gropt,
                        pump_monitoring_id, gropt, total_trans, zero_trans, no_peak_zero, uptime
                    )

                    cursor.execute("SELECT PumpMonitoringGradeId FROM PumpMonitoringGrade WHERE PumpMonitoringId=? AND GradeOption=?",
                                   pump_monitoring_id, gropt)
                    pmg_row = cursor.fetchone()
                    if pmg_row is None:
                        continue
                    pump_monitoring_grade_id = pmg_row[0]

                    for flow_el in gropt_el.findall("flow_info"):
                        flow_type = flow_el.get("flow_type")
                        fi_total_trans = i(flow_el.get("total_no_pump_trans")) or 0
                        nominal_flow = f(flow_el.get("nominal_flow_rate")) or 0.0

                        flow_rate_el = flow_el.find("flow_rate")
                        avg_flow = f(flow_rate_el.get("average")) if flow_rate_el is not None else None
                        peak_flow = f(flow_rate_el.get("peak")) if flow_rate_el is not None else None

                        ttf_el = flow_el.find("time_to_flow")
                        avg_ttf = i(ttf_el.get("average")) if ttf_el is not None else None
                        max_ttf = i(ttf_el.get("max")) if ttf_el is not None else None

                        ttpf_el = flow_el.find("time_to_trans_peak_flow")
                        avg_ttpf = i(ttpf_el.get("average")) if ttpf_el is not None else None
                        max_ttpf = i(ttpf_el.get("max")) if ttpf_el is not None else None

                        cursor.execute("""
                            IF NOT EXISTS (SELECT 1 FROM PumpFlowInfo WHERE PumpMonitoringGradeId=? AND FlowType=?)
                            INSERT INTO PumpFlowInfo (PumpMonitoringGradeId, FlowType, TotalPumpTrans, NominalFlowRate,
                                AvgFlowRate, PeakFlowRate, AvgTimeToFlow, MaxTimeToFlow, AvgTimeToPeakFlow, MaxTimeToPeakFlow)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                            pump_monitoring_grade_id, flow_type,
                            pump_monitoring_grade_id, flow_type, fi_total_trans, nominal_flow,
                            avg_flow, peak_flow, avg_ttf, max_ttf, avg_ttpf, max_ttpf
                        )

    # --- Tank Gauges ---
    tank_gauges_el = forecourt.find("tank_gauges")
    if tank_gauges_el is not None:
        for device_el in tank_gauges_el.findall("device"):
            dev_id = device_el.get("id", "").strip()
            if not dev_id:
                continue
            online = b(device_el.get("online"))
            offline_count = i(device_el.get("offline_count")) or 0
            protocol = device_el.get("protocol", "")
            type_bits = device_el.get("type_bits", "")
            monitoring_el = device_el.find("monitoring")
            uptime = i(monitoring_el.get("uptime")) if monitoring_el is not None else 0

            tank_info_el = device_el.find("tank_info")
            if tank_info_el is None:
                continue
            tank_id = tank_info_el.get("tank_id", "").strip()
            capacity = f(tank_info_el.get("capacity")) or 0.0
            tank_height = f(tank_info_el.get("tank_height")) or 0.0
            shell_capacity = f(tank_info_el.get("shell_capacity")) or 0.0

            data_el = tank_info_el.find("data")
            if data_el is None:
                continue
            data_date = parse_date(data_el.get("date", "00000000"))
            data_time = parse_time(data_el.get("time", "000000"))
            gauged = f(data_el.get("gauged")) or 0.0
            gauged_dif = f(data_el.get("gauged_dif")) or 0.0
            ullage = f(data_el.get("ullage")) or 0.0
            prod_height = f(data_el.get("prod_height")) or 0.0
            temp = f(data_el.get("temp")) or 0.0
            tc_corr_vol = f(data_el.get("tc_corr_vol")) or 0.0
            water_vol = f(data_el.get("water_vol")) or 0.0
            water_height = f(data_el.get("water_height")) or 0.0

            if data_date is None:
                data_date = business_date

            cursor.execute("""
                IF NOT EXISTS (SELECT 1 FROM TankGauges WHERE SiteId=? AND DeviceId=? AND TankId=? AND BusinessDate=?)
                INSERT INTO TankGauges (SiteId, DeviceId, Online, OfflineCount, Protocol, TypeBits, TankId,
                    Capacity, TankHeight, ShellCapacity, BusinessDate, DataTime, Gauged, GaugedDif,
                    Ullage, ProdHeight, Temp, TcCorrVol, WaterVol, WaterHeight, Uptime, CreatedUtc)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, GETUTCDATE())
            """,
                site_id, dev_id, tank_id, data_date,
                site_id, dev_id, online, offline_count, protocol, type_bits, tank_id,
                capacity, tank_height, shell_capacity, data_date, data_time, gauged, gauged_dif,
                ullage, prod_height, temp, tc_corr_vol, water_vol, water_height, uptime
            )


def main():
    import sys
    skip_delete = "--no-delete" in sys.argv

    xml_files = sorted(glob.glob(os.path.join(XML_DIR, "*.xml")))
    print(f"Found {len(xml_files)} XML files.")

    conn = pyodbc.connect(CONN_STR)
    conn.autocommit = False
    cursor = conn.cursor()

    if skip_delete:
        print("Skipping delete step (append mode).")
    else:
        # Step 1: Delete all data (in FK-safe order)
        print("Deleting all existing data...")
        tables = [
            "PumpFlowInfo",
            "PumpMonitoringGrade",
            "PumpMonitoring",
            "PumpTankConsumption",
            "PumpGradeTotals",
            "PumpTotals",
            "PumpStatus",
            "TankGauges",
            "FuelRecords",
            "PumpDevices",
            "Sites",
            "FuelTypes",
            "Vehicles",
            "DomsInfoSnapshot",
        ]
        for table in tables:
            cursor.execute(f"DELETE FROM [{table}]")
            print(f"  Cleared {table}")
        conn.commit()
        print("All tables cleared.")

    # Step 2: Import each XML
    success = 0
    errors = 0
    for idx, filepath in enumerate(xml_files, 1):
        filename = os.path.basename(filepath)
        print(f"[{idx}/{len(xml_files)}] {filename}", end=" ... ")
        try:
            import_xml(cursor, filepath)
            conn.commit()
            print("OK")
            success += 1
        except Exception as e:
            conn.rollback()
            print(f"ERROR: {e}")
            errors += 1

    cursor.close()
    conn.close()

    print(f"\nDone. {success} imported, {errors} errors.")


if __name__ == "__main__":
    main()
