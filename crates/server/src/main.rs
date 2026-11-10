//! Entry point for `aerofoil-server`.

use std::{
    io,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::Duration,
};

use aerofoil_server::{BandSource, DEFAULT_PORT_978, DEFAULT_PORT_1090, DualBandIngest};
use aerofoil_tracker::Tracker;

fn main() -> io::Result<()> {
    let tracker = Arc::new(Tracker::new());
    let src_1090 = BandSource::mode_s_1090(DEFAULT_PORT_1090);
    let src_978 = BandSource::uat_978(DEFAULT_PORT_978);

    println!(
        "aerofoil-server: starting dual-band ingest (1090 on port {}, 978 on port {})",
        src_1090.port, src_978.port
    );

    let ingest = DualBandIngest::start(Arc::clone(&tracker), src_1090, src_978)?;

    let running = Arc::new(AtomicBool::new(true));
    let r = Arc::clone(&running);

    // Run until interrupted
    while r.load(Ordering::Relaxed) {
        thread::sleep(Duration::from_millis(500));
    }

    ingest.shutdown();
    Ok(())
}
