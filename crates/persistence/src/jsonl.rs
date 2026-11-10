//! Self-describing JSON-lines recording sink.

use std::{
    collections::VecDeque,
    io::Write,
    sync::{
        Arc, Condvar, Mutex,
        atomic::{AtomicU64, Ordering},
    },
    thread::{self, JoinHandle},
};

use crate::{
    frame::RecordedFrame,
    sink::{RecordSink, SinkError},
};

struct QueueState {
    queue: VecDeque<RecordedFrame>,
    capacity: usize,
    shutdown: bool,
    flush_req: u64,
    flush_ack: u64,
}

/// JSONL implementation of [`RecordSink`] with background worker and drop-oldest policy.
pub struct JsonlRecordSink {
    state: Arc<(Mutex<QueueState>, Condvar)>,
    drops: Arc<AtomicU64>,
    recorded: Arc<AtomicU64>,
    worker: Option<JoinHandle<Result<(), String>>>,
}

impl core::fmt::Debug for JsonlRecordSink {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.debug_struct("JsonlRecordSink")
            .field("drops", &self.drops())
            .field("recorded", &self.recorded())
            .finish()
    }
}

impl JsonlRecordSink {
    /// Default queue capacity of 10,000 frames before dropping oldest.
    pub const DEFAULT_CAPACITY: usize = 10_000;

    /// Creates a new [`JsonlRecordSink`] writing to `writer` with the default capacity.
    #[must_use]
    pub fn new<W: Write + Send + 'static>(writer: W) -> Self {
        Self::with_capacity(writer, Self::DEFAULT_CAPACITY)
    }

    /// Creates a new [`JsonlRecordSink`] with a custom queue capacity.
    #[must_use]
    pub fn with_capacity<W: Write + Send + 'static>(mut writer: W, capacity: usize) -> Self {
        let state = Arc::new((
            Mutex::new(QueueState {
                queue: VecDeque::with_capacity(capacity.min(1024)),
                capacity,
                shutdown: false,
                flush_req: 0,
                flush_ack: 0,
            }),
            Condvar::new(),
        ));
        let drops = Arc::new(AtomicU64::new(0));
        let recorded = Arc::new(AtomicU64::new(0));

        let worker_state = Arc::clone(&state);
        let worker_rec = Arc::clone(&recorded);

        let worker = thread::spawn(move || -> Result<(), String> {
            let (lock, cvar) = &*worker_state;
            let mut batch = Vec::with_capacity(64);

            loop {
                let mut guard = lock
                    .lock()
                    .map_err(|e| format!("mutex poisoned in worker: {e}"))?;

                while guard.queue.is_empty()
                    && !guard.shutdown
                    && guard.flush_req == guard.flush_ack
                {
                    guard = cvar
                        .wait(guard)
                        .map_err(|e| format!("cvar poisoned in worker: {e}"))?;
                }

                while let Some(item) = guard.queue.pop_front() {
                    batch.push(item);
                    if batch.len() >= 64 {
                        break;
                    }
                }

                let is_flush = guard.queue.is_empty() && guard.flush_req > guard.flush_ack;
                let is_shutdown = guard.shutdown && guard.queue.is_empty();
                drop(guard);

                for item in batch.drain(..) {
                    let mut json = serde_json::to_vec(&item)
                        .map_err(|e| format!("serialization error: {e}"))?;
                    json.push(b'\n');
                    writer.write_all(&json).map_err(|e| e.to_string())?;
                    worker_rec.fetch_add(1, Ordering::Relaxed);
                }

                if is_flush || is_shutdown {
                    writer.flush().map_err(|e| e.to_string())?;
                    let mut guard = lock
                        .lock()
                        .map_err(|e| format!("mutex poisoned on flush: {e}"))?;
                    if is_flush {
                        guard.flush_ack = guard.flush_req;
                    }
                    cvar.notify_all();
                    if is_shutdown {
                        break;
                    }
                }
            }
            Ok(())
        });

        Self {
            state,
            drops,
            recorded,
            worker: Some(worker),
        }
    }
}

impl RecordSink for JsonlRecordSink {
    fn record(&self, frame: RecordedFrame) -> Result<(), SinkError> {
        let (lock, cvar) = &*self.state;
        let mut guard = lock.lock().map_err(|_| SinkError::WorkerDisconnected)?;
        if guard.shutdown {
            return Err(SinkError::WorkerDisconnected);
        }
        if guard.queue.len() >= guard.capacity {
            let _ = guard.queue.pop_front();
            self.drops.fetch_add(1, Ordering::Relaxed);
        }
        guard.queue.push_back(frame);
        cvar.notify_one();
        Ok(())
    }

    fn flush(&self) -> Result<(), SinkError> {
        let (lock, cvar) = &*self.state;
        let mut guard = lock.lock().map_err(|_| SinkError::WorkerDisconnected)?;
        let target_req = guard.flush_req + 1;
        guard.flush_req = target_req;
        cvar.notify_one();

        while guard.flush_ack < target_req && !guard.shutdown {
            guard = cvar
                .wait(guard)
                .map_err(|_| SinkError::WorkerDisconnected)?;
        }
        Ok(())
    }

    fn drops(&self) -> u64 {
        self.drops.load(Ordering::Relaxed)
    }

    fn recorded(&self) -> u64 {
        self.recorded.load(Ordering::Relaxed)
    }
}

impl Drop for JsonlRecordSink {
    fn drop(&mut self) {
        if let Ok(mut guard) = self.state.0.lock() {
            guard.shutdown = true;
            self.state.1.notify_all();
        }
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}
