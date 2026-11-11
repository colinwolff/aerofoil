//! En-route cruise, holding pattern, and VFR flight profile generators.

use super::{FlightCategory, FlightProfile};

/// Injects 12 en-route high-altitude overflights.
pub fn add_enroute_cruises(p: &mut Vec<FlightProfile>) {
    let crz = [
        ("UAL901", 0xA03333, 52.65, 4.10, 36000, 460.0, 095.0),
        ("UAL902", 0xA03334, 52.60, 5.90, 37000, 470.0, 275.0),
        ("DAL102", 0xA04444, 52.80, 4.05, 35000, 455.0, 100.0),
        ("ACA850", 0xC01111, 52.55, 5.85, 38000, 465.0, 280.0),
        ("CPA260", 0x780111, 52.45, 4.15, 34000, 480.0, 090.0),
        ("SIA322", 0x76A111, 52.70, 5.75, 39000, 475.0, 270.0),
        ("QTR012", 0x06A111, 52.10, 4.20, 35000, 460.0, 110.0),
        ("ETD044", 0x896222, 52.15, 5.70, 36000, 465.0, 290.0),
        ("BAW015", 0x400831, 52.50, 4.00, 33000, 450.0, 092.0),
        ("SVA112", 0x710111, 52.25, 4.30, 37000, 470.0, 115.0),
        ("ANA204", 0x841111, 52.75, 5.80, 38000, 485.0, 272.0),
        ("JAL041", 0x861111, 52.40, 4.05, 39000, 480.0, 088.0),
    ];
    for (i, &(cs, icao, lat, lon, alt, spd, hdg)) in crz.iter().enumerate() {
        p.push(FlightProfile {
            icao,
            callsign: cs,
            squawk: 0o6201 + (i as u16),
            category: FlightCategory::EnRouteCruise,
            start_lat: lat,
            start_lon: lon,
            start_alt: alt,
            target_alt: alt,
            alt_rate_fpm: 0,
            speed_kts: spd,
            target_speed_kts: spd,
            start_heading_deg: hdg,
            turn_rate_deg_per_step: 0.0,
            is_uat: false,
        });
    }
}

/// Injects 8 holding pattern profiles across terminal arrival stacks.
pub fn add_holding_patterns(p: &mut Vec<FlightProfile>) {
    let holds = [
        ("KLM81H", 0x484081, 52.60, 5.20, 7000, 210.0, 045.0),
        ("DLH82H", 0x3C4982, 52.60, 5.20, 8000, 210.0, 045.0),
        ("BAW83H", 0x400883, 52.60, 5.20, 9000, 220.0, 045.0),
        ("AFR84H", 0x39AC84, 52.60, 5.20, 10000, 220.0, 045.0),
        ("EZY85H", 0x406285, 52.40, 4.25, 6000, 200.0, 225.0),
        ("SAS86H", 0x478186, 52.40, 4.25, 7000, 205.0, 225.0),
        ("TRA87H", 0x484B87, 52.40, 4.25, 8000, 210.0, 225.0),
        ("RYR88H", 0x4CA188, 52.40, 4.25, 9000, 215.0, 225.0),
    ];
    for (i, &(cs, icao, lat, lon, alt, spd, hdg)) in holds.iter().enumerate() {
        p.push(FlightProfile {
            icao,
            callsign: cs,
            squawk: 0o3401 + (i as u16),
            category: FlightCategory::Holding,
            start_lat: lat,
            start_lon: lon,
            start_alt: alt,
            target_alt: alt,
            alt_rate_fpm: 0,
            speed_kts: spd,
            target_speed_kts: spd,
            start_heading_deg: hdg,
            turn_rate_deg_per_step: 3.0,
            is_uat: false,
        });
    }
}

/// Injects 8 VFR, helicopter, and UAT 978 flight profiles.
pub fn add_vfr_traffic(p: &mut Vec<FlightProfile>) {
    let vfr = [
        (
            "MEDIC1", 0x4855AA, 0o7700, 52.28, 4.96, 1200, 90.0, 0.0, 3.0, false,
        ),
        (
            "POLICE", 0x4855BB, 0o7000, 52.37, 4.89, 1000, 80.0, 180.0, -2.5, false,
        ),
        (
            "PHXYZ", 0x484999, 0o7000, 52.45, 4.60, 2000, 110.0, 030.0, 0.2, false,
        ),
        (
            "PHTDI", 0x48499A, 0o7000, 52.15, 5.05, 3000, 125.0, 120.0, 0.0, false,
        ),
        (
            "N1090U", 0xA09999, 0o1200, 52.20, 4.50, 2500, 130.0, 060.0, -0.1, false,
        ),
        (
            "N978GA", 0xA09781, 0o1200, 52.35, 4.45, 1800, 105.0, 150.0, 0.0, true,
        ),
        (
            "N978EX", 0xA09782, 0o1200, 52.50, 4.80, 3500, 140.0, 330.0, 0.1, true,
        ),
        (
            "SKYDIVE", 0x484888, 0o7000, 52.10, 4.80, 9500, 120.0, 270.0, 1.5, false,
        ),
    ];
    for &(cs, icao, sq, lat, lon, alt, spd, hdg, tr, uat) in &vfr {
        p.push(FlightProfile {
            icao,
            callsign: cs,
            squawk: sq,
            category: FlightCategory::VfrLow,
            start_lat: lat,
            start_lon: lon,
            start_alt: alt,
            target_alt: alt,
            alt_rate_fpm: 0,
            speed_kts: spd,
            target_speed_kts: spd,
            start_heading_deg: hdg,
            turn_rate_deg_per_step: tr,
            is_uat: uat,
        });
    }
}
