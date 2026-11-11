//! Simulation models and trajectory generators for kinematic tracking tests.

use aerofoil_common::{
    Position,
    cpr::{RawCpr, cpr_nl_from_microdegrees},
};

pub struct SimProfile {
    pub icao: u32,
    pub callsign: &'static str,
    pub squawk: u16,
    pub lat: f64,
    pub lon: f64,
    pub alt: i32,
    pub target_alt: i32,
    pub alt_rate: i16,
    pub speed: f64,
    pub target_speed: f64,
    pub heading: f64,
    pub turn_rate: f64,
    pub is_holding: bool,
}

pub struct SimState {
    pub profile: SimProfile,
    pub lat: f64,
    pub lon: f64,
    pub alt: i32,
    pub speed: f64,
    pub heading: f64,
    pub last_pos: Option<Position>,
    pub last_heading: Option<u16>,
    pub cpr_pair: (Option<RawCpr>, Option<RawCpr>),
}

impl SimState {
    pub fn new(p: SimProfile) -> Self {
        Self {
            lat: p.lat,
            lon: p.lon,
            alt: p.alt,
            speed: p.speed,
            heading: p.heading,
            last_pos: None,
            last_heading: None,
            cpr_pair: (None, None),
            profile: p,
        }
    }

    pub fn step(&mut self, dt: f64, elapsed: f64) {
        let tr = if self.profile.is_holding {
            let ph = (elapsed % 240.0) as u32;
            if (60..120).contains(&ph) || ph >= 180 {
                3.0
            } else {
                0.0
            }
        } else {
            self.profile.turn_rate
        };
        self.heading = (self.heading + tr * dt).rem_euclid(360.0);

        if (self.speed - self.profile.target_speed).abs() > 0.1 {
            let diff = self.profile.target_speed - self.speed;
            let acc = 1.5 * dt;
            self.speed += if diff.abs() <= acc {
                diff
            } else {
                acc.copysign(diff)
            };
        }

        if self.profile.alt_rate != 0 {
            let d_alt = ((self.profile.alt_rate as f64) / 60.0) * dt;
            let next = self.alt + d_alt.round() as i32;
            let reached = (self.profile.alt_rate < 0 && next <= self.profile.target_alt)
                || (self.profile.alt_rate > 0 && next >= self.profile.target_alt);
            self.alt = if reached {
                self.profile.target_alt
            } else {
                next
            };
        }

        let dist_deg = ((self.speed / 3600.0) * dt) / 60.0;
        let hdg_rad = self.heading.to_radians();
        self.lat += dist_deg * hdg_rad.cos();
        self.lon += (dist_deg * hdg_rad.sin()) / self.lat.to_radians().cos().max(0.1);
    }
}

pub fn encode_cpr(lat_deg: f64, lon_deg: f64, is_odd: bool) -> (u32, u32) {
    let k = if is_odd { 59.0 } else { 60.0 };
    let dlat = 360.0 / k;
    let yz = (((lat_deg % dlat + dlat) % dlat) / dlat * 131_072.0).round() as u32;
    let nl = cpr_nl_from_microdegrees((lat_deg * 1_000_000.0) as i32);
    let n = if is_odd { (nl - 1).max(1) } else { nl.max(1) } as f64;
    let dlon = 360.0 / n;
    let xz = (((lon_deg % dlon + dlon) % dlon) / dlon * 131_072.0).round() as u32;
    (yz % 131_072, xz % 131_072)
}

pub fn generate_55_sim_profiles() -> Vec<SimProfile> {
    let mut p = Vec::with_capacity(55);
    for i in 0..15 {
        p.push(SimProfile {
            icao: 0x484100 + i,
            callsign: "KLM100",
            squawk: 0o4201 + (i as u16),
            lat: 52.75 + (i as f64 * 0.01),
            lon: 5.20 + (i as f64 * 0.01),
            alt: 14000 - (i as i32 * 100),
            target_alt: 2500,
            alt_rate: -1200,
            speed: 240.0,
            target_speed: 180.0,
            heading: 225.0,
            turn_rate: -0.2,
            is_holding: false,
        });
    }
    for i in 0..12 {
        p.push(SimProfile {
            icao: 0x484B00 + i,
            callsign: "TRA500",
            squawk: 0o1001 + (i as u16),
            lat: 52.31 + (i as f64 * 0.01),
            lon: 4.76 + (i as f64 * 0.01),
            alt: 1500 + (i as i32 * 100),
            target_alt: 18000,
            alt_rate: 1800,
            speed: 180.0,
            target_speed: 280.0,
            heading: 310.0,
            turn_rate: 0.15,
            is_holding: false,
        });
    }
    for i in 0..12 {
        p.push(SimProfile {
            icao: 0xA03300 + i,
            callsign: "UAL900",
            squawk: 0o6201 + (i as u16),
            lat: 52.65 - (i as f64 * 0.02),
            lon: 4.10 + (i as f64 * 0.05),
            alt: 36000,
            target_alt: 36000,
            alt_rate: 0,
            speed: 460.0,
            target_speed: 460.0,
            heading: 95.0,
            turn_rate: 0.0,
            is_holding: false,
        });
    }
    for i in 0..8 {
        p.push(SimProfile {
            icao: 0x484080 + i,
            callsign: "HLD800",
            squawk: 0o3401 + (i as u16),
            lat: 52.60,
            lon: 5.20,
            alt: 7000 + (i as i32 * 500),
            target_alt: 7000,
            alt_rate: 0,
            speed: 210.0,
            target_speed: 210.0,
            heading: 45.0,
            turn_rate: 3.0,
            is_holding: true,
        });
    }
    for i in 0..8 {
        p.push(SimProfile {
            icao: 0x485500 + i,
            callsign: "VFR001",
            squawk: 0o7000,
            lat: 52.30 + (i as f64 * 0.02),
            lon: 4.90 + (i as f64 * 0.02),
            alt: 1500,
            target_alt: 1500,
            alt_rate: 0,
            speed: 100.0,
            target_speed: 100.0,
            heading: 0.0,
            turn_rate: 2.5,
            is_holding: false,
        });
    }
    p
}
