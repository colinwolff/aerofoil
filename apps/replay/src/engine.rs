//! Replay execution engine coordinating parsing, pacing, and emission.

use std::{
    io,
    time::{Duration, Instant},
};

use crate::{pacer::StreamPacer, reader::ReplayFrame, sink::ReplaySink};

/// Summary statistics collected after a replay session concludes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ReplayStats {
    /// Total number of discrete frames or chunks emitted.
    pub frames_sent: u64,
    /// Total payload and framing bytes transmitted.
    pub bytes_sent: u64,
    /// Wall-clock time spent replaying.
    pub duration: Duration,
}

/// Orchestration engine executing paced replay sessions.
#[derive(Debug)]
pub struct ReplayEngine {
    frames: Vec<ReplayFrame>,
    pacer: StreamPacer,
    sink: Box<dyn ReplaySink>,
    loop_playback: bool,
}

impl ReplayEngine {
    /// Constructs a new [`ReplayEngine`].
    #[must_use]
    pub fn new(
        frames: Vec<ReplayFrame>,
        pacer: StreamPacer,
        sink: Box<dyn ReplaySink>,
        loop_playback: bool,
    ) -> Self {
        Self {
            frames,
            pacer,
            sink,
            loop_playback,
        }
    }

    /// Executes the replay loop until completion or interrupt.
    pub fn run(&mut self) -> io::Result<ReplayStats> {
        let start = Instant::now();
        let mut frames_sent = 0u64;
        let mut bytes_sent = 0u64;

        if self.frames.is_empty() {
            return Ok(ReplayStats {
                frames_sent: 0,
                bytes_sent: 0,
                duration: start.elapsed(),
            });
        }

        loop {
            self.pacer.reset();
            for frame in &self.frames {
                if let Some(ts_us) = frame.timestamp_us {
                    self.pacer.pace_microseconds(ts_us);
                } else {
                    self.pacer.pace_fixed(Duration::from_millis(5));
                }

                self.sink.emit(&frame.raw_bytes)?;
                frames_sent += 1;
                bytes_sent += frame.raw_bytes.len() as u64;
            }

            self.sink.flush()?;

            if !self.loop_playback {
                break;
            }
        }

        Ok(ReplayStats {
            frames_sent,
            bytes_sent,
            duration: start.elapsed(),
        })
    }
}
