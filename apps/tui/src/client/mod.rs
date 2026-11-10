//! Dual-mode background streaming supervisor for Beast TCP and WebSocket ingestion.

pub mod beast;
pub mod ws;

use std::{
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread::{self, JoinHandle},
};

use aerofoil_tracker::Tracker;

use crate::args::TuiArgs;
pub use beast::process_raw_beast;
pub use ws::apply_ws_update;

/// Active streaming client supervisor.
#[derive(Debug)]
pub struct StreamClient {
    shutdown: Arc<AtomicBool>,
    threads: Vec<JoinHandle<()>>,
}

impl StreamClient {
    /// Starts background ingest threads according to the provided [`TuiArgs`].
    #[must_use]
    pub fn start(tracker: Arc<Tracker>, args: &TuiArgs) -> Self {
        let shutdown = Arc::new(AtomicBool::new(false));
        let mut threads = Vec::new();

        if args.no_connect {
            return Self { shutdown, threads };
        }

        if let Some(ref ws_url) = args.ws {
            let url = ws_url.clone();
            let trk = Arc::clone(&tracker);
            let sdn = Arc::clone(&shutdown);
            threads.push(thread::spawn(move || ws::run_ws_loop(&url, &trk, &sdn)));
        } else {
            let trk1 = Arc::clone(&tracker);
            let sdn1 = Arc::clone(&shutdown);
            let host1 = args.host.clone();
            let p1090 = args.port_1090;
            threads.push(thread::spawn(move || {
                beast::run_beast_loop(&host1, p1090, &trk1, &sdn1, true)
            }));

            let trk2 = Arc::clone(&tracker);
            let sdn2 = Arc::clone(&shutdown);
            let host2 = args.host.clone();
            let p978 = args.port_978;
            threads.push(thread::spawn(move || {
                beast::run_beast_loop(&host2, p978, &trk2, &sdn2, false)
            }));
        }

        Self { shutdown, threads }
    }

    /// Signals all background streaming threads to terminate and waits for them to finish.
    pub fn stop(&mut self) {
        self.shutdown.store(true, Ordering::Relaxed);
        for h in self.threads.drain(..) {
            let _ = h.join();
        }
    }
}
