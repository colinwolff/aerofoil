//! Main entry point for `aerofoil-replay`.

use std::{
    fs::File,
    io::{self, BufReader},
};

use clap::Parser;

use aerofoil_replay::{
    ReplayArgs, ReplayEngine, ReplaySink, StdoutSink, StreamPacer, TcpClientSink, TcpServerSink,
    load_frames,
};

fn main() -> io::Result<()> {
    let args = ReplayArgs::parse();

    let frames = if let Some(ref path) = args.input {
        let f = File::open(path)?;
        load_frames(BufReader::new(f), args.format)?
    } else {
        let stdin = io::stdin();
        load_frames(stdin.lock(), args.format)?
    };

    let sink: Box<dyn ReplaySink> = if let Some(ref addr) = args.tcp {
        Box::new(TcpClientSink::connect(addr)?)
    } else if let Some(ref bind_addr) = args.bind {
        Box::new(TcpServerSink::bind(bind_addr)?)
    } else {
        Box::new(StdoutSink)
    };

    let pacer = StreamPacer::new(args.speed);
    let mut engine = ReplayEngine::new(frames, pacer, sink, args.r#loop);

    let stats = engine.run()?;
    eprintln!(
        "aerofoil-replay: finished replay. Emitted {} frames ({} bytes) in {:.2?}",
        stats.frames_sent, stats.bytes_sent, stats.duration
    );

    Ok(())
}
