//! Dual-band TCP Beast ingest service.

use std::{
    io::{self, BufReader},
    net::{TcpListener, TcpStream},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread::{self, JoinHandle},
    time::Duration,
};

use aerofoil_tracker::Tracker;

use crate::{
    beast::BeastReader,
    cpr::CprResolver,
    dispatch::{dispatch_978, dispatch_1090},
    metrics::IngestMetrics,
    source::BandSource,
};

/// Dual-band multi-source TCP Beast ingest service.
#[derive(Debug)]
pub struct DualBandIngest {
    tracker: Arc<Tracker>,
    metrics: Arc<IngestMetrics>,
    cpr: Arc<CprResolver>,
    shutdown: Arc<AtomicBool>,
    port_1090: u16,
    port_978: u16,
    listeners: Vec<JoinHandle<()>>,
}

impl DualBandIngest {
    /// Binds TCP listeners for both bands and starts ingestion threads.
    pub fn start(
        tracker: Arc<Tracker>,
        src_1090: BandSource,
        src_978: BandSource,
    ) -> io::Result<Self> {
        let listener_1090 = TcpListener::bind(("0.0.0.0", src_1090.port))?;
        listener_1090.set_nonblocking(true)?;
        let bound_1090 = listener_1090.local_addr()?.port();

        let listener_978 = TcpListener::bind(("0.0.0.0", src_978.port))?;
        listener_978.set_nonblocking(true)?;
        let bound_978 = listener_978.local_addr()?.port();

        let shutdown = Arc::new(AtomicBool::new(false));
        let metrics = Arc::new(IngestMetrics::new());
        let cpr = Arc::new(CprResolver::new());

        let h_1090 = spawn_listener(
            listener_1090,
            Arc::clone(&tracker),
            Arc::clone(&metrics),
            Arc::clone(&cpr),
            Arc::clone(&shutdown),
            true,
        );

        let h_978 = spawn_listener(
            listener_978,
            Arc::clone(&tracker),
            Arc::clone(&metrics),
            Arc::clone(&cpr),
            Arc::clone(&shutdown),
            false,
        );

        Ok(Self {
            tracker,
            metrics,
            cpr,
            shutdown,
            port_1090: bound_1090,
            port_978: bound_978,
            listeners: vec![h_1090, h_978],
        })
    }

    /// Bound port for 1090 MHz Mode S ingest.
    #[must_use]
    pub fn port_1090(&self) -> u16 {
        self.port_1090
    }

    /// Bound port for 978 MHz UAT ingest.
    #[must_use]
    pub fn port_978(&self) -> u16 {
        self.port_978
    }

    /// Reference to live metrics counters.
    #[must_use]
    pub fn metrics(&self) -> &Arc<IngestMetrics> {
        &self.metrics
    }

    /// Reference to the shared aircraft tracker.
    #[must_use]
    pub fn tracker(&self) -> &Arc<Tracker> {
        &self.tracker
    }

    /// Reference to the CPR coordinate resolver.
    #[must_use]
    pub fn cpr(&self) -> &Arc<CprResolver> {
        &self.cpr
    }

    /// Shuts down all listener and client connection threads.
    pub fn shutdown(&self) {
        self.shutdown.store(true, Ordering::SeqCst);
    }
}

impl Drop for DualBandIngest {
    fn drop(&mut self) {
        self.shutdown();
        for h in self.listeners.drain(..) {
            let _ = h.join();
        }
    }
}

fn spawn_listener(
    listener: TcpListener,
    tracker: Arc<Tracker>,
    metrics: Arc<IngestMetrics>,
    cpr: Arc<CprResolver>,
    shutdown: Arc<AtomicBool>,
    is_1090: bool,
) -> JoinHandle<()> {
    thread::spawn(move || {
        while !shutdown.load(Ordering::Relaxed) {
            match listener.accept() {
                Ok((stream, _)) => {
                    let t = Arc::clone(&tracker);
                    let m = Arc::clone(&metrics);
                    let c = Arc::clone(&cpr);
                    let s = Arc::clone(&shutdown);
                    thread::spawn(move || {
                        handle_client(stream, t, m, c, s, is_1090);
                    });
                }
                Err(ref e) if e.kind() == io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(10));
                }
                Err(_) => break,
            }
        }
    })
}

fn handle_client(
    stream: TcpStream,
    tracker: Arc<Tracker>,
    metrics: Arc<IngestMetrics>,
    cpr: Arc<CprResolver>,
    shutdown: Arc<AtomicBool>,
    is_1090: bool,
) {
    let _ = stream.set_read_timeout(Some(Duration::from_millis(200)));
    let mut reader = BeastReader::new(BufReader::new(stream));

    while !shutdown.load(Ordering::Relaxed) {
        match reader.next_message() {
            Ok(Some(msg)) => {
                let payload = msg.payload_slice();
                if is_1090 {
                    dispatch_1090(payload, &tracker, &metrics, &cpr);
                } else {
                    dispatch_978(payload, &tracker, &metrics);
                }
            }
            Ok(None) => break,
            Err(ref e)
                if e.kind() == io::ErrorKind::TimedOut || e.kind() == io::ErrorKind::WouldBlock =>
            {
                continue;
            }
            Err(_) => {
                metrics.inc_errors();
                break;
            }
        }
    }
}
