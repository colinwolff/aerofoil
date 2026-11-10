//! Command-line argument parsing for `aerofoil-replay`.

use std::path::PathBuf;

use clap::{Parser, ValueEnum};

/// Pacing speed factor for surveillance stream replay.
#[derive(Debug, Clone, Copy, PartialEq, Eq, ValueEnum, Default)]
pub enum PacingSpeed {
    /// Real-time playback (1.0x speed).
    #[default]
    #[value(name = "1x")]
    OneX,
    /// 2x accelerated playback.
    #[value(name = "2x")]
    TwoX,
    /// 5x accelerated playback.
    #[value(name = "5x")]
    FiveX,
    /// 10x accelerated playback.
    #[value(name = "10x")]
    TenX,
    /// Maximum speed unthrottled burst playback (zero inter-frame delay).
    #[value(name = "burst")]
    Burst,
}

impl PacingSpeed {
    /// Returns the speed multiplier factor (or `None` for unthrottled burst).
    #[must_use]
    pub const fn multiplier(self) -> Option<f64> {
        match self {
            Self::OneX => Some(1.0),
            Self::TwoX => Some(2.0),
            Self::FiveX => Some(5.0),
            Self::TenX => Some(10.0),
            Self::Burst => None,
        }
    }
}

/// Surveillance stream framing format.
#[derive(Debug, Clone, Copy, PartialEq, Eq, ValueEnum, Default)]
pub enum InputFormat {
    /// Autodetect stream framing based on file extension or magic bytes.
    #[default]
    Auto,
    /// Mode-S Beast binary stream with 0x1A escape framing.
    Beast,
    /// Mode-S AVR ASCII hexadecimal stream with '*<hex>;' framing.
    Avr,
    /// JSON-lines formatted self-describing captured target frames.
    Jsonl,
    /// Raw RF I/Q sample stream.
    Iq,
}

/// Standalone multi-tier surveillance and RF sample replay engine.
#[derive(Debug, Parser)]
#[command(name = "aerofoil-replay", version, about)]
pub struct ReplayArgs {
    /// Input capture file path (defaults to reading from standard input if omitted).
    #[arg(short, long)]
    pub input: Option<PathBuf>,

    /// Input stream framing format.
    #[arg(short, long, value_enum, default_value_t = InputFormat::Auto)]
    pub format: InputFormat,

    /// Pacing speed multiplier (1x, 2x, 5x, 10x, burst).
    #[arg(short, long, value_enum, default_value_t = PacingSpeed::OneX)]
    pub speed: PacingSpeed,

    /// Loop playback indefinitely upon reaching the end of the input stream.
    #[arg(short, long, default_value_t = false)]
    pub r#loop: bool,

    /// Stream output to a remote TCP server address (e.g. 127.0.0.1:30005).
    #[arg(long)]
    pub tcp: Option<String>,

    /// Bind a local TCP listener to stream to connected clients (e.g. 0.0.0.0:30005).
    #[arg(long)]
    pub bind: Option<String>,

    /// Force output to standard output even if network streaming is configured.
    #[arg(long, default_value_t = false)]
    pub stdout: bool,
}
