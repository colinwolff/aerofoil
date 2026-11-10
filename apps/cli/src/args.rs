//! Command-line argument definitions and filter parsing for `aerofoil-cli`.

use clap::{Parser, ValueEnum};

/// Input stream wire framing formats supported by `aerofoil-cli`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, ValueEnum, Default)]
pub enum InputFormat {
    /// Autodetect stream framing based on initial bytes (Beast 0x1A or AVR '*').
    #[default]
    Auto,
    /// Mode-S Beast binary stream with 0x1A escape framing.
    Beast,
    /// Mode-S AVR ASCII hexadecimal stream with '*<hex>;' framing.
    Avr,
}

/// Output formatting options for decoded surveillance telemetry.
#[derive(Debug, Clone, Copy, PartialEq, Eq, ValueEnum, Default)]
pub enum OutputFormat {
    /// Schema-versioned JSON-lines formatted objects (one per decoded message/track).
    #[default]
    Json,
    /// Raw ASCII / Hexadecimal representation.
    Raw,
}

/// Unix pipeline frontend for aerofoil decoding Beast and AVR streams to JSON-lines.
#[derive(Parser, Debug, Clone)]
#[command(
    name = "aerofoil-cli",
    version,
    about = "Decodes Mode S / 1090ES and UAT streams to JSON-lines"
)]
pub struct CliArgs {
    /// Input stream framing format.
    #[arg(long, value_enum, default_value_t = InputFormat::Auto)]
    pub format: InputFormat,

    /// Output stream format.
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub output: OutputFormat,

    /// Filter targets by altitude expression (e.g. '>10000', '<5000', '10000..35000').
    #[arg(long)]
    pub filter_altitude: Option<String>,

    /// Filter targets by 4-digit octal squawk code (e.g. '7700', '7600', '7500').
    #[arg(long)]
    pub filter_squawk: Option<String>,
}

impl CliArgs {
    /// Evaluates whether an observed altitude (in feet) matches the configured `--filter-altitude`.
    #[must_use]
    pub fn matches_altitude(&self, altitude_feet: Option<i32>) -> bool {
        let Some(spec) = &self.filter_altitude else {
            return true;
        };
        let Some(feet) = altitude_feet else {
            return false;
        };

        let trimmed = spec.trim();
        if let Some(rest) = trimmed.strip_prefix('>') {
            rest.trim().parse::<i32>().is_ok_and(|limit| feet > limit)
        } else if let Some(rest) = trimmed.strip_prefix('<') {
            rest.trim().parse::<i32>().is_ok_and(|limit| feet < limit)
        } else if let Some((low, high)) = trimmed.split_once("..") {
            let low_ok = low.trim().parse::<i32>().is_ok_and(|l| feet >= l);
            let high_ok = high.trim().parse::<i32>().is_ok_and(|h| feet <= h);
            low_ok && high_ok
        } else {
            trimmed.parse::<i32>().is_ok_and(|exact| feet == exact)
        }
    }

    /// Evaluates whether an observed squawk matches the configured `--filter-squawk`.
    #[must_use]
    pub fn matches_squawk(&self, squawk_code: Option<u16>) -> bool {
        let Some(spec) = &self.filter_squawk else {
            return true;
        };
        let Some(code) = squawk_code else {
            return false;
        };

        u16::from_str_radix(spec.trim(), 8).is_ok_and(|expected| code == expected)
    }
}
