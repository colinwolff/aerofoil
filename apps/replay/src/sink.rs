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
    addr: String,
    stream: Option<TcpStream>,
}

impl TcpClientSink {
    /// Connects to a remote TCP endpoint (e.g. `127.0.0.1:30005`).
    pub fn connect(addr: &str) -> io::Result<Self> {
        let stream = TcpStream::connect(addr)?;
        Ok(Self {
            addr: addr.to_string(),
            stream: Some(stream),
        })
    }

    fn ensure_connected(&mut self) -> io::Result<&mut TcpStream> {
        if self.stream.is_none() {
            let s = TcpStream::connect(&self.addr)?;
            self.stream = Some(s);
        }
        self.stream
            .as_mut()
            .ok_or_else(|| io::Error::other("unconnected socket"))
    }
}

impl ReplaySink for TcpClientSink {
    fn emit(&mut self, bytes: &[u8]) -> io::Result<()> {
        let stream = self.ensure_connected()?;
        if let Err(e) = stream.write_all(bytes).and_then(|()| stream.flush()) {
            if e.kind() == io::ErrorKind::BrokenPipe
                || e.kind() == io::ErrorKind::ConnectionReset
                || e.kind() == io::ErrorKind::ConnectionAborted
            {
                self.stream = None;
                let stream = self.ensure_connected()?;
                stream.write_all(bytes)?;
                return stream.flush();
            }
            return Err(e);
        }
        Ok(())
    }

    fn flush(&mut self) -> io::Result<()> {
        if let Some(stream) = self.stream.as_mut() {
            stream.flush()?;
        }
        Ok(())
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
