//! Standalone multi-tier surveillance and RF sample replay engine (`docs/SPEC.md` §5).

pub mod args;
pub mod engine;
pub mod kinematics;
pub mod pacer;
pub mod reader;
pub mod sink;

pub use args::{InputFormat, PacingSpeed, ReplayArgs};
pub use engine::{ReplayEngine, ReplayStats};
pub use kinematics::{
    AircraftSimState, FlightCategory, FlightProfile, generate_terminal_hub_profiles,
};
pub use pacer::StreamPacer;
pub use reader::{ReplayFrame, detect_format, load_frames};
pub use sink::{ReplaySink, StdoutSink, TcpClientSink, TcpServerSink};
