//! Terminal arrival (STAR) and departure (SID) profile generators.

use super::{FlightCategory, FlightProfile};

/// Injects 15 STAR arrival profiles approaching Schiphol fixes.
pub fn add_star_arrivals(p: &mut Vec<FlightProfile>) {
    let arr = [
        ("KLM101", 0x484101, 52.75, 5.20, 14000, 240.0, 225.0),
        ("KLM102", 0x484102, 52.78, 5.25, 15000, 250.0, 220.0),
        ("KLM103", 0x484103, 52.70, 5.15, 13000, 230.0, 230.0),
        ("BAW401", 0x400811, 52.82, 4.30, 16000, 260.0, 155.0),
        ("BAW402", 0x400812, 52.85, 4.25, 17000, 260.0, 150.0),
        ("BAW403", 0x400813, 52.79, 4.35, 14500, 245.0, 160.0),
        ("DLH221", 0x3C4911, 52.05, 5.50, 13500, 240.0, 315.0),
        ("DLH222", 0x3C4912, 52.02, 5.55, 14500, 245.0, 310.0),
        ("AFR331", 0x39AC11, 51.85, 4.65, 12000, 230.0, 020.0),
        ("AFR332", 0x39AC12, 51.80, 4.60, 13000, 235.0, 025.0),
        ("SAS441", 0x478111, 52.80, 4.95, 15500, 250.0, 190.0),
        ("SWR551", 0x4B1211, 51.95, 5.10, 14000, 240.0, 340.0),
        ("TAP661", 0x495111, 51.90, 4.30, 12500, 235.0, 045.0),
        ("LOT771", 0x48C111, 52.20, 5.60, 15000, 250.0, 280.0),
        ("RYR881", 0x4CA111, 52.65, 4.30, 13000, 230.0, 135.0),
    ];
    for (i, &(cs, icao, lat, lon, alt, spd, hdg)) in arr.iter().enumerate() {
        p.push(FlightProfile {
            icao,
            callsign: cs,
            squawk: 0o4201 + (i as u16),
            category: FlightCategory::StarArrival,
            start_lat: lat,
            start_lon: lon,
            start_alt: alt,
            target_alt: 2500 + ((i as i32 % 3) * 500),
            alt_rate_fpm: -1200,
            speed_kts: spd,
            target_speed_kts: 180.0,
            start_heading_deg: hdg,
            turn_rate_deg_per_step: -0.2,
            is_uat: false,
        });
    }
}

/// Injects 12 SID climb profiles departing the terminal area.
pub fn add_sid_departures(p: &mut Vec<FlightProfile>) {
    let dep = [
        ("TRA541", 0x484B01, 1500, 180.0, 310.0, 16000),
        ("TRA542", 0x484B02, 1800, 190.0, 315.0, 17000),
        ("KLM201", 0x484021, 2000, 200.0, 040.0, 19000),
        ("KLM202", 0x484022, 2200, 210.0, 045.0, 20000),
        ("DLH181", 0x3C4921, 1600, 185.0, 120.0, 15000),
        ("BAW291", 0x400821, 2400, 215.0, 270.0, 21000),
        ("UAE198", 0x896111, 2500, 220.0, 105.0, 24000),
        ("VIR012", 0x401211, 2100, 205.0, 260.0, 22000),
        ("AAL044", 0xA01111, 2300, 210.0, 280.0, 23000),
        ("DAL055", 0xA02222, 1900, 195.0, 275.0, 20000),
        ("EIN092", 0x4CA222, 1700, 190.0, 290.0, 18000),
        ("THY088", 0x4B8111, 2600, 225.0, 125.0, 24000),
    ];
    for (i, &(cs, icao, alt, spd, hdg, tgt_alt)) in dep.iter().enumerate() {
        p.push(FlightProfile {
            icao,
            callsign: cs,
            squawk: 0o1001 + (i as u16),
            category: FlightCategory::SidClimb,
            start_lat: 52.31 + (i as f64 * 0.01),
            start_lon: 4.76 + (i as f64 * 0.01),
            start_alt: alt,
            target_alt: tgt_alt,
            alt_rate_fpm: 1800,
            speed_kts: spd,
            target_speed_kts: 290.0,
            start_heading_deg: hdg,
            turn_rate_deg_per_step: 0.15,
            is_uat: false,
        });
    }
}
