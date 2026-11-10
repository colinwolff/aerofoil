//! Pacing controller governing variable-rate surveillance stream playback.

use std::{
    thread,
    time::{Duration, Instant},
};

use crate::args::PacingSpeed;

/// Pacing controller that throttles stream emission according to elapsed time.
#[derive(Debug)]
pub struct StreamPacer {
    speed: PacingSpeed,
    last_frame_ts: Option<u64>,
    last_emit: Option<Instant>,
}

impl StreamPacer {
    /// Creates a new [`StreamPacer`] configured for the given [`PacingSpeed`].
    #[must_use]
    pub const fn new(speed: PacingSpeed) -> Self {
        Self {
            speed,
            last_frame_ts: None,
            last_emit: None,
        }
    }

    /// Resets timestamp reference state (useful when looping).
    pub fn reset(&mut self) {
        self.last_frame_ts = None;
        self.last_emit = None;
    }

    /// Computes and applies inter-frame sleep based on frame timestamp (microseconds).
    pub fn pace_microseconds(&mut self, timestamp_us: u64) {
        let Some(multiplier) = self.speed.multiplier() else {
            return;
        };

        if let (Some(prev_ts), Some(prev_emit)) = (self.last_frame_ts, self.last_emit)
            && timestamp_us > prev_ts
        {
            let delta_us = timestamp_us - prev_ts;
            let target_duration = Duration::from_micros((delta_us as f64 / multiplier) as u64);
            let elapsed = prev_emit.elapsed();

            if target_duration > elapsed {
                let sleep_time = target_duration - elapsed;
                // Cap max sleep to 5 seconds to avoid freezing on timestamp jumps
                let capped = sleep_time.min(Duration::from_secs(5));
                thread::sleep(capped);
            }
        }

        self.last_frame_ts = Some(timestamp_us);
        self.last_emit = Some(Instant::now());
    }

    /// Fixed-interval pacing for streams lacking explicit timestamps (e.g. raw I/Q or AVR).
    pub fn pace_fixed(&mut self, base_delay: Duration) {
        let Some(multiplier) = self.speed.multiplier() else {
            return;
        };

        let target = Duration::from_micros((base_delay.as_micros() as f64 / multiplier) as u64);
        if let Some(prev_emit) = self.last_emit {
            let elapsed = prev_emit.elapsed();
            if target > elapsed {
                thread::sleep(target - elapsed);
            }
        }
        self.last_emit = Some(Instant::now());
    }
}
