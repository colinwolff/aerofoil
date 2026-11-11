//! Kinematic terminal airspace trajectory synthesizer (`docs/SPEC.md` §5).

mod arrivals;
mod enroute;

use arrivals::{add_sid_departures, add_star_arrivals};
use enroute::{add_enroute_cruises, add_holding_patterns, add_vfr_traffic};

/// Category of flight profile within the terminal airspace.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FlightCategory {
    /// Standard Terminal Arrival Route descent.
    StarArrival,
    /// Standard Instrument Departure climb.
    SidClimb,
    /// High-altitude sector cruise.
    EnRouteCruise,
    /// Terminal holding pattern orbit.
    Holding,
    /// Low-altitude visual flight rules or helicopter.
    VfrLow,
}

/// Initial trajectory profile for an aircraft.
#[derive(Debug, Clone)]
pub struct FlightProfile {
    pub icao: u32,
    pub callsign: &'static str,
    pub squawk: u16,
    pub category: FlightCategory,
    pub start_lat: f64,
    pub start_lon: f64,
    pub start_alt: i32,
    pub target_alt: i32,
    pub alt_rate_fpm: i16,
    pub speed_kts: f64,
    pub target_speed_kts: f64,
    pub start_heading_deg: f64,
    pub turn_rate_deg_per_step: f64,
    pub is_uat: bool,
}

/// Dynamic simulation state of an aircraft undergoing continuous trajectory updates.
#[derive(Debug, Clone)]
pub struct AircraftSimState {
    pub profile: FlightProfile,
    pub current_lat: f64,
    pub current_lon: f64,
    pub current_alt: i32,
    pub current_speed: f64,
    pub current_heading: f64,
    pub elapsed_sec: f64,
}

impl AircraftSimState {
    /// Creates a new state from a profile.
    #[must_use]
    pub fn new(profile: FlightProfile) -> Self {
        Self {
            current_lat: profile.start_lat,
            current_lon: profile.start_lon,
            current_alt: profile.start_alt,
            current_speed: profile.speed_kts,
            current_heading: profile.start_heading_deg,
            elapsed_sec: 0.0,
            profile,
        }
    }

    /// Advances the aircraft state by `dt_seconds`.
    pub fn step(&mut self, dt_seconds: f64) {
        self.elapsed_sec += dt_seconds;
        let turn_rate = match self.profile.category {
            FlightCategory::Holding => {
                let phase = (self.elapsed_sec % 240.0) as u32;
                if (60..120).contains(&phase) || phase >= 180 {
                    3.0
                } else {
                    0.0
                }
            }
            _ => self.profile.turn_rate_deg_per_step,
        };
        self.current_heading = (self.current_heading + turn_rate * dt_seconds).rem_euclid(360.0);

        if (self.current_speed - self.profile.target_speed_kts).abs() > 0.1 {
            let diff = self.profile.target_speed_kts - self.current_speed;
            let accel = 1.5 * dt_seconds;
            self.current_speed += if diff.abs() <= accel {
                diff
            } else {
                accel.copysign(diff)
            };
        }

        if self.profile.alt_rate_fpm != 0 {
            let d_alt = ((self.profile.alt_rate_fpm as f64) / 60.0) * dt_seconds;
            let next_alt = self.current_alt + d_alt.round() as i32;
            let reached_target = (self.profile.alt_rate_fpm < 0
                && next_alt <= self.profile.target_alt)
                || (self.profile.alt_rate_fpm > 0 && next_alt >= self.profile.target_alt);
            if reached_target {
                self.current_alt = self.profile.target_alt;
            } else {
                self.current_alt = next_alt;
            }
        }

        let dist_nm = (self.current_speed / 3600.0) * dt_seconds;
        let dist_deg_lat = dist_nm / 60.0;
        let hdg_rad = self.current_heading.to_radians();
        let cos_lat = self.current_lat.to_radians().cos().max(0.1);
        self.current_lat += dist_deg_lat * hdg_rad.cos();
        self.current_lon += (dist_deg_lat * hdg_rad.sin()) / cos_lat;
    }

    /// Computes East-West and North-South ground speed components in knots.
    #[must_use]
    pub fn velocity_components(&self) -> (i16, i16) {
        let hdg_rad = self.current_heading.to_radians();
        (
            (self.current_speed * hdg_rad.sin()).round() as i16,
            (self.current_speed * hdg_rad.cos()).round() as i16,
        )
    }
}

/// Generates 55 realistic terminal airspace profiles across STAR, SID, cruise, hold, and VFR.
#[must_use]
pub fn generate_terminal_hub_profiles() -> Vec<FlightProfile> {
    let mut profiles = Vec::with_capacity(55);
    add_star_arrivals(&mut profiles);
    add_sid_departures(&mut profiles);
    add_enroute_cruises(&mut profiles);
    add_holding_patterns(&mut profiles);
    add_vfr_traffic(&mut profiles);
    profiles
}
