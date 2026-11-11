//! RTL-SDR TCP network streaming protocol client (`AF-84`).
//! Implements the 12-byte dongle handshake and 5-byte command protocol for `rtl_tcp`.

use std::io::{self, Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

/// 4-byte magic signature sent by `rtl_tcp` servers on connection establishment.
pub const RTL_TCP_MAGIC: [u8; 4] = *b"RTL0";

/// Commands defined by the `rtl_tcp` network protocol.
pub const CMD_SET_FREQ: u8 = 0x01;
pub const CMD_SET_SAMPLE_RATE: u8 = 0x02;
pub const CMD_SET_GAIN_MODE: u8 = 0x03;
pub const CMD_SET_GAIN: u8 = 0x04;
pub const CMD_SET_FREQ_CORRECTION: u8 = 0x05;

/// Initial 12-byte handshake header returned by `rtl_tcp`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RtlTcpHeader {
    pub magic: [u8; 4],
    pub tuner_type: u32,
    pub tuner_gain_count: u32,
}

impl RtlTcpHeader {
    /// Parses the initial 12-byte server greeting.
    #[must_use]
    pub fn parse(buf: &[u8; 12]) -> Option<Self> {
        let magic = [buf[0], buf[1], buf[2], buf[3]];
        if magic != RTL_TCP_MAGIC {
            return None;
        }
        let tuner_type = u32::from_be_bytes([buf[4], buf[5], buf[6], buf[7]]);
        let tuner_gain_count = u32::from_be_bytes([buf[8], buf[9], buf[10], buf[11]]);
        Some(Self {
            magic,
            tuner_type,
            tuner_gain_count,
        })
    }
}

/// Client for connecting to and streaming raw I/Q samples from an `rtl_tcp` server.
#[derive(Debug)]
pub struct RtlTcpClient {
    stream: TcpStream,
    header: RtlTcpHeader,
}

impl RtlTcpClient {
    /// Connects to a remote `rtl_tcp` server, validates the greeting, and initializes the client.
    pub fn connect(addr: impl ToSocketAddrs) -> io::Result<Self> {
        let stream = TcpStream::connect(addr)?;
        stream.set_read_timeout(Some(Duration::from_secs(5)))?;
        Self::from_stream(stream)
    }

    /// Wraps an established TCP stream and validates the 12-byte greeting header.
    pub fn from_stream(mut stream: TcpStream) -> io::Result<Self> {
        let mut hdr_buf = [0u8; 12];
        stream.read_exact(&mut hdr_buf)?;

        let header = RtlTcpHeader::parse(&hdr_buf).ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                "invalid rtl_tcp magic header signature",
            )
        })?;

        Ok(Self { stream, header })
    }

    /// Returns the parsed tuner hardware header.
    #[must_use]
    pub fn header(&self) -> &RtlTcpHeader {
        &self.header
    }

    /// Sends a 5-byte command payload to the `rtl_tcp` server.
    pub fn send_command(&mut self, cmd: u8, param: u32) -> io::Result<()> {
        let be = param.to_be_bytes();
        let payload = [cmd, be[0], be[1], be[2], be[3]];
        self.stream.write_all(&payload)?;
        self.stream.flush()
    }

    /// Configures central frequency (Hz) and sample rate (Hz).
    pub fn configure(&mut self, freq_hz: u32, sample_rate_hz: u32) -> io::Result<()> {
        self.send_command(CMD_SET_FREQ, freq_hz)?;
        self.send_command(CMD_SET_SAMPLE_RATE, sample_rate_hz)?;
        self.send_command(CMD_SET_GAIN_MODE, 0)?; // Auto-gain
        Ok(())
    }

    /// Reads interleaved 8-bit unsigned I/Q samples directly from the network stream.
    pub fn read_samples(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        self.stream.read(buf)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;
    use std::thread;

    #[test]
    #[allow(clippy::unwrap_used)]
    fn test_rtl_tcp_handshake_and_command() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();

        let handle = thread::spawn(move || {
            let (mut sock, _) = listener.accept().unwrap();
            // Send valid 12-byte header: RTL0, tuner=5, gains=29
            let mut hdr = [0u8; 12];
            hdr[0..4].copy_from_slice(b"RTL0");
            hdr[4..8].copy_from_slice(&5u32.to_be_bytes());
            hdr[8..12].copy_from_slice(&29u32.to_be_bytes());
            sock.write_all(&hdr).unwrap();

            // Read 5-byte command
            let mut cmd_buf = [0u8; 5];
            sock.read_exact(&mut cmd_buf).unwrap();
            assert_eq!(cmd_buf[0], CMD_SET_FREQ);
            let freq = u32::from_be_bytes([cmd_buf[1], cmd_buf[2], cmd_buf[3], cmd_buf[4]]);
            assert_eq!(freq, 1_090_000_000);
        });

        let mut client = RtlTcpClient::connect(addr).unwrap();
        assert_eq!(client.header().magic, RTL_TCP_MAGIC);
        assert_eq!(client.header().tuner_type, 5);
        assert_eq!(client.header().tuner_gain_count, 29);

        client.send_command(CMD_SET_FREQ, 1_090_000_000).unwrap();
        handle.join().unwrap();
    }
}
