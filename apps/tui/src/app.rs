//! Application state and filtering for `aerofoil-tui`.

use std::sync::Arc;

use aerofoil_common::AircraftTarget;
use aerofoil_tracker::Tracker;

pub use crate::types::{SortColumn, distance_nm, is_emergency_squawk};

/// Application state holding tracker reference, view configuration, and filters.
#[derive(Debug, Clone)]
pub struct App {
    /// Reference to shared sharded aircraft tracker.
    pub tracker: Arc<Tracker>,
    /// PPI radar center latitude in degrees.
    pub center_lat: f64,
    /// PPI radar center longitude in degrees.
    pub center_lon: f64,
    /// Radar display radius in nautical miles.
    pub radar_range_nm: f64,
    /// Selected telemetry table sort column.
    pub sort_column: SortColumn,
    /// Sort ascending flag.
    pub sort_ascending: bool,
    /// Selected row index in telemetry table.
    pub selected_index: usize,
    /// Filter to only emergency squawk codes.
    pub filter_emergency: bool,
    /// Minimum altitude filter in feet.
    pub filter_min_alt: Option<i32>,
    /// Termination request flag.
    pub should_quit: bool,
}

impl App {
    /// Constructs a new [`App`] attached to the given tracker.
    #[must_use]
    pub fn new(tracker: Arc<Tracker>) -> Self {
        Self {
            tracker,
            center_lat: 51.5074,
            center_lon: -0.1278,
            radar_range_nm: 40.0,
            sort_column: SortColumn::Distance,
            sort_ascending: true,
            selected_index: 0,
            filter_emergency: false,
            filter_min_alt: None,
            should_quit: false,
        }
    }

    /// Zoom in radar range.
    pub fn zoom_in(&mut self) {
        if self.radar_range_nm > 5.0 {
            self.radar_range_nm *= 0.5;
        }
    }

    /// Zoom out radar range.
    pub fn zoom_out(&mut self) {
        if self.radar_range_nm < 320.0 {
            self.radar_range_nm *= 2.0;
        }
    }

    /// Advances sort column to next option.
    pub fn cycle_sort(&mut self) {
        self.sort_column = self.sort_column.next();
    }

    /// Toggles sort order between ascending and descending.
    pub fn toggle_sort_direction(&mut self) {
        self.sort_ascending = !self.sort_ascending;
    }

    /// Toggles emergency squawk filter.
    pub fn toggle_emergency_filter(&mut self) {
        self.filter_emergency = !self.filter_emergency;
    }

    /// Increments table selection with wrap-around.
    pub fn select_next(&mut self, total: usize) {
        if total > 0 {
            self.selected_index = (self.selected_index + 1) % total;
        }
    }

    /// Decrements table selection with wrap-around.
    pub fn select_prev(&mut self, total: usize) {
        if total > 0 {
            self.selected_index = if self.selected_index == 0 {
                total - 1
            } else {
                self.selected_index - 1
            };
        }
    }

    /// Fetches and filters aircraft targets according to active view criteria.
    #[must_use]
    pub fn filtered_targets(&self) -> Vec<AircraftTarget> {
        let mut targets: Vec<AircraftTarget> = self
            .tracker
            .snapshot()
            .into_iter()
            .filter(|t| {
                if self.filter_emergency && !is_emergency_squawk(t.squawk) {
                    return false;
                }
                if let Some(min_alt) = self.filter_min_alt {
                    if let Some(alt) = t.altitude {
                        if alt.feet() < min_alt {
                            return false;
                        }
                    } else {
                        return false;
                    }
                }
                true
            })
            .collect();

        targets.sort_by(|a, b| {
            let ord = match self.sort_column {
                SortColumn::Address => a.address.cmp(&b.address),
                SortColumn::Callsign => a.callsign.cmp(&b.callsign),
                SortColumn::Altitude => {
                    let a_alt = a.altitude.map_or(i32::MIN, |v| v.feet());
                    let b_alt = b.altitude.map_or(i32::MIN, |v| v.feet());
                    a_alt.cmp(&b_alt)
                }
                SortColumn::Speed => {
                    let a_spd = a.velocity.ground_speed_knots.unwrap_or(0);
                    let b_spd = b.velocity.ground_speed_knots.unwrap_or(0);
                    a_spd.cmp(&b_spd)
                }
                SortColumn::Squawk => {
                    let a_sq = a.squawk.map_or(0, |s| s.code());
                    let b_sq = b.squawk.map_or(0, |s| s.code());
                    a_sq.cmp(&b_sq)
                }
                SortColumn::Distance => {
                    let a_d = a.position.map_or(f64::MAX, |p| {
                        let (lat, lon) = p.to_f64();
                        distance_nm(self.center_lat, self.center_lon, lat, lon)
                    });
                    let b_d = b.position.map_or(f64::MAX, |p| {
                        let (lat, lon) = p.to_f64();
                        distance_nm(self.center_lat, self.center_lon, lat, lon)
                    });
                    a_d.total_cmp(&b_d)
                }
            };
            if self.sort_ascending {
                ord
            } else {
                ord.reverse()
            }
        });

        targets
    }
}
