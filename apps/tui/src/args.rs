//! Command-line argument parsing for `aerofoil-tui`.

use clap::Parser;

/// Terminal UI dashboard for aerofoil with Ratatui PPI radar and telemetry tables.
#[derive(Debug, Clone, Parser)]
#[command(name = "aerofoil-tui", version, about)]
pub struct TuiArgs {
    /// Remote host address for Beast TCP streams.
    #[arg(long, default_value = "127.0.0.1")]
    pub host: String,

    /// TCP port for 1090 MHz Mode S Beast stream.
    #[arg(long = "port-1090", default_value_t = 30005)]
    pub port_1090: u16,

    /// TCP port for 978 MHz UAT Beast stream.
    #[arg(long = "port-978", default_value_t = 30978)]
    pub port_978: u16,

    /// Connect to aerofoil-server WebSocket egress stream (e.g. ws://127.0.0.1:8080/ws).
    #[arg(long = "ws")]
    pub ws: Option<String>,

    /// Run standalone without connecting to external TCP or WebSocket streams.
    #[arg(long, default_value_t = false)]
    pub no_connect: bool,
}
