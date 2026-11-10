//! Streaming sinks for writing replayed surveillance frames to network or stdout.

use std::{
    io::{self, Write},
    net::{TcpListener, TcpStream},
    sync::{Arc, Mutex},
    thread,
};

/// Interface for streaming output targets.
pub trait ReplaySink: Send + core::fmt::Debug {
    /// Emits a frame or sample byte buffer to the sink.
    fn emit(&mut self, bytes: &[u8]) -> io::Result<()>;

    /// Flushes any buffered bytes.
    fn flush(&mut self) -> io::Result<()>;
}

/// Standard output sink.
#[derive(Debug, Default)]
pub struct StdoutSink;

impl ReplaySink for StdoutSink {
    fn emit(&mut self, bytes: &[u8]) -> io::Result<()> {
        let stdout = io::stdout();
        let mut handle = stdout.lock();
        handle.write_all(bytes)?;
        handle.flush()
    }

    fn flush(&mut self) -> io::Result<()> {
        io::stdout().flush()
    }
}

/// TCP client sink connecting to an active ADS-B server or ingest socket.
#[derive(Debug)]
pub struct TcpClientSink {
    stream: TcpStream,
}

impl TcpClientSink {
    /// Connects to a remote TCP endpoint (e.g. `127.0.0.1:30005`).
    pub fn connect(addr: &str) -> io::Result<Self> {
        let stream = TcpStream::connect(addr)?;
        Ok(Self { stream })
    }
}

impl ReplaySink for TcpClientSink {
    fn emit(&mut self, bytes: &[u8]) -> io::Result<()> {
        self.stream.write_all(bytes)?;
        self.stream.flush()
    }

    fn flush(&mut self) -> io::Result<()> {
        self.stream.flush()
    }
}

/// TCP server sink that binds a local port and broadcasts frames to all connected clients.
#[derive(Debug)]
pub struct TcpServerSink {
    clients: Arc<Mutex<Vec<TcpStream>>>,
}

impl TcpServerSink {
    /// Binds a TCP listener on `bind_addr` and spawns a background thread accepting clients.
    pub fn bind(bind_addr: &str) -> io::Result<Self> {
        let listener = TcpListener::bind(bind_addr)?;
        listener.set_nonblocking(true)?;
        let clients = Arc::new(Mutex::new(Vec::new()));
        let clients_clone = Arc::clone(&clients);

        thread::spawn(move || {
            loop {
                match listener.accept() {
                    Ok((stream, _)) => {
                        let _ = stream.set_nonblocking(false);
                        if let Ok(mut lock) = clients_clone.lock() {
                            lock.push(stream);
                        }
                    }
                    Err(ref e) if e.kind() == io::ErrorKind::WouldBlock => {
                        thread::sleep(std::time::Duration::from_millis(20));
                    }
                    Err(_) => break,
                }
            }
        });

        Ok(Self { clients })
    }
}

impl ReplaySink for TcpServerSink {
    fn emit(&mut self, bytes: &[u8]) -> io::Result<()> {
        let mut lock = self
            .clients
            .lock()
            .map_err(|_| io::Error::other("poisoned lock in TcpServerSink"))?;

        lock.retain_mut(|client| {
            if client.write_all(bytes).is_ok() {
                client.flush().is_ok()
            } else {
                false
            }
        });

        Ok(())
    }

    fn flush(&mut self) -> io::Result<()> {
        let mut lock = self
            .clients
            .lock()
            .map_err(|_| io::Error::other("poisoned lock in TcpServerSink"))?;

        lock.retain_mut(|client| client.flush().is_ok());
        Ok(())
    }
}
