//! Band-tagged ingestion source descriptors.

use aerofoil_common::TransponderSource;

/// Default TCP Beast ingest port for 1090 MHz Mode S.
pub const DEFAULT_PORT_1090: u16 = 30005;

/// Default TCP Beast ingest port for 978 MHz UAT.
pub const DEFAULT_PORT_978: u16 = 30978;

/// Metadata configuration identifying a band-tagged receiver ingest source.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BandSource {
    /// Human-readable identifier for this input feed.
    pub name: String,
    /// RF transmission protocol band.
    pub band: TransponderSource,
    /// TCP listen port.
    pub port: u16,
}

impl BandSource {
    /// Creates a 1090 MHz Mode S Beast source on the standard port (30005).
    #[must_use]
    pub fn mode_s_1090(port: u16) -> Self {
        Self {
            name: "1090ES".to_string(),
            band: TransponderSource::ModeS1090,
            port,
        }
    }

    /// Creates a 978 MHz UAT Beast source on the standard port (30978).
    #[must_use]
    pub fn uat_978(port: u16) -> Self {
        Self {
            name: "UAT978".to_string(),
            band: TransponderSource::Uat978,
            port,
        }
    }
}
