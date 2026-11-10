//! Aircraft kinematics and waypoint definitions for synthetic hub generation.

#[derive(Debug, Clone)]
pub struct FlightProfile {
    pub icao: u32,
    pub callsign: &'static str,
    pub squawk: u16,
    pub start_alt: i32,
    pub alt_rate_fpm: i16,
    pub start_lat: f64,
    pub start_lon: f64,
    pub speed_kts: f64,
    pub start_heading_deg: f64,
    pub turn_rate_deg_per_step: f64,
}

#[derive(Debug, Clone)]
pub struct AircraftSimState {
    pub profile: FlightProfile,
    pub current_lat: f64,
    pub current_lon: f64,
    pub current_alt: i32,
    pub current_heading: f64,
}

impl AircraftSimState {
    pub fn new(profile: FlightProfile) -> Self {
        Self {
            current_lat: profile.start_lat,
            current_lon: profile.start_lon,
            current_alt: profile.start_alt,
            current_heading: profile.start_heading_deg,
            profile,
        }
    }

    pub fn step(&mut self, dt_seconds: f64) {
        self.current_heading = (self.current_heading
            + self.profile.turn_rate_deg_per_step * dt_seconds)
            .rem_euclid(360.0);
        let dist_nm = (self.profile.speed_kts / 3600.0) * dt_seconds;
        let dist_deg_lat = dist_nm / 60.0;
        let hdg_rad = self.current_heading.to_radians();

        let d_lat = dist_deg_lat * hdg_rad.cos();
        let cos_lat = self.current_lat.to_radians().cos().max(0.1);
        let d_lon = (dist_deg_lat * hdg_rad.sin()) / cos_lat;

        self.current_lat += d_lat;
        self.current_lon += d_lon;

        let d_alt = ((self.profile.alt_rate_fpm as f64) / 60.0) * dt_seconds;
        self.current_alt += d_alt.round() as i32;
    }

    pub fn velocity_components(&self) -> (i16, i16) {
        let hdg_rad = self.current_heading.to_radians();
        let ew = (self.profile.speed_kts * hdg_rad.sin()).round() as i16;
        let ns = (self.profile.speed_kts * hdg_rad.cos()).round() as i16;
        (ew, ns)
    }
}
