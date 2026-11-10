//! Standalone multi-tier surveillance and RF sample replay engine (`docs/SPEC.md` §5).

pub mod args;
pub mod engine;
pub mod pacer;
pub mod reader;
pub mod sink;

pub use args::{InputFormat, PacingSpeed, ReplayArgs};
pub use engine::{ReplayEngine, ReplayStats};
pub use pacer::StreamPacer;
pub use reader::{ReplayFrame, detect_format, load_frames};
pub use sink::{ReplaySink, StdoutSink, TcpClientSink, TcpServerSink};
