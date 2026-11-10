//! HTTP/1.1 Egress server dispatching SSE, WebSocket, and static web UI requests.

use std::{
    io::{self, BufRead, BufReader},
    net::{TcpListener, TcpStream},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread::{self, JoinHandle},
    time::Duration,
};

use aerofoil_tracker::Tracker;

use crate::{sse::handle_sse_stream, web::serve_http_response, ws::handle_ws_client};

/// Default egress port for HTTP/SSE/WebSocket streaming.
pub const DEFAULT_EGRESS_PORT: u16 = 3000;

/// HTTP egress streaming server for aerofoil.
#[derive(Debug)]
pub struct EgressServer {
    tracker: Arc<Tracker>,
    shutdown: Arc<AtomicBool>,
    port: u16,
    accept_handle: Option<JoinHandle<()>>,
}

impl EgressServer {
    /// Binds the egress server on the requested port (or port 0 for dynamic allocation).
    pub fn start(tracker: Arc<Tracker>, port: u16) -> io::Result<Self> {
        let listener = TcpListener::bind(("0.0.0.0", port))?;
        listener.set_nonblocking(true)?;
        let bound_port = listener.local_addr()?.port();

        let shutdown = Arc::new(AtomicBool::new(false));
        let s = Arc::clone(&shutdown);
        let t = Arc::clone(&tracker);

        let accept_handle = thread::spawn(move || {
            while !s.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((stream, _)) => {
                        let tracker_clone = Arc::clone(&t);
                        let shutdown_clone = Arc::clone(&s);
                        thread::spawn(move || {
                            dispatch_http_client(stream, tracker_clone, shutdown_clone);
                        });
                    }
                    Err(ref e) if e.kind() == io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(10));
                    }
                    Err(_) => break,
                }
            }
        });

        Ok(Self {
            tracker,
            shutdown,
            port: bound_port,
            accept_handle: Some(accept_handle),
        })
    }

    /// Bound local port.
    #[must_use]
    pub fn port(&self) -> u16 {
        self.port
    }

    /// Reference to the shared aircraft tracker.
    #[must_use]
    pub fn tracker(&self) -> &Arc<Tracker> {
        &self.tracker
    }

    /// Shuts down the egress server.
    pub fn shutdown(&self) {
        self.shutdown.store(true, Ordering::SeqCst);
    }
}

impl Drop for EgressServer {
    fn drop(&mut self) {
        self.shutdown();
        if let Some(h) = self.accept_handle.take() {
            let _ = h.join();
        }
    }
}

fn dispatch_http_client(stream: TcpStream, tracker: Arc<Tracker>, shutdown: Arc<AtomicBool>) {
    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
    let _ = stream.set_nonblocking(false);

    let mut peek_buf = [0u8; 512];
    let mut n = 0;
    for _ in 0..100 {
        match stream.peek(&mut peek_buf) {
            Ok(bytes) if bytes > 0 => {
                n = bytes;
                break;
            }
            Ok(_) => thread::sleep(Duration::from_millis(5)),
            Err(ref e)
                if e.kind() == io::ErrorKind::WouldBlock || e.kind() == io::ErrorKind::TimedOut =>
            {
                thread::sleep(Duration::from_millis(5));
            }
            Err(_) => return,
        }
    }
    if n == 0 {
        return;
    }

    let peek_str = std::str::from_utf8(&peek_buf[..n]).unwrap_or("");
    let is_ws = peek_str.starts_with("GET /ws")
        || peek_str.to_ascii_lowercase().contains("upgrade: websocket");

    if is_ws {
        let _ = handle_ws_client(stream, tracker, shutdown);
        return;
    }

    let mut reader = BufReader::new(stream);
    let mut request_line = String::new();
    if reader.read_line(&mut request_line).is_err() || request_line.is_empty() {
        return;
    }

    let mut last_event_id: u64 = 0;
    let mut line = String::new();
    while reader.read_line(&mut line).is_ok() && line.trim() != "" {
        let lower = line.to_ascii_lowercase();
        if lower.starts_with("last-event-id:")
            && let Some(val) = line.split(':').nth(1)
        {
            last_event_id = val.trim().parse::<u64>().unwrap_or(0);
        }
        line.clear();
    }

    let raw_stream = reader.into_inner();

    if request_line.starts_with("GET /events") {
        let _ = handle_sse_stream(raw_stream, tracker, shutdown, last_event_id);
    } else {
        let _ = serve_http_response(raw_stream, &tracker, &request_line);
    }
}
