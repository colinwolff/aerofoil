/**
 * Core AerofoilClient for streaming ADS-B / UAT telemetry.
 */

import type { AerofoilClientOptions, SubscriptionFilter, TargetWire } from "./types";

export class AerofoilClient {
  private readonly baseUrl: string;
  private readonly reconnectIntervalMs: number;
  private readonly maxReconnectIntervalMs: number;
  private activeWs: WebSocket | null = null;
  private activeAbortControllers: Set<AbortController> = new Set();

  constructor(options: AerofoilClientOptions) {
    this.baseUrl = options.url.replace(/\/+$/, "");
    this.reconnectIntervalMs = options.reconnectIntervalMs ?? 1000;
    this.maxReconnectIntervalMs = options.maxReconnectIntervalMs ?? 10000;
  }

  /**
   * Subscribes to live aircraft targets over an auto-reconnecting WebSocket.
   * Returns an unsubscribe callback function that terminates the connection.
   */
  public subscribeWebSocket(
    onTarget: (target: TargetWire) => void,
    filter?: SubscriptionFilter,
  ): () => void {
    let closed = false;
    let backoff = this.reconnectIntervalMs;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const wsUrl = this.baseUrl
      .replace(/^http:\/\//i, "ws://")
      .replace(/^https:\/\//i, "wss://") + "/ws";

    const connect = () => {
      if (closed) return;

      try {
        const ws = new WebSocket(wsUrl);
        this.activeWs = ws;

        ws.onopen = () => {
          backoff = this.reconnectIntervalMs;
          if (filter && Object.keys(filter).length > 0) {
            ws.send(JSON.stringify(filter));
          }
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (Array.isArray(data)) {
              for (const item of data) {
                if (item && (item.schema === "aerofoil.target" || item.address)) {
                  onTarget(item as TargetWire);
                }
              }
            } else if (data && (data.schema === "aerofoil.target" || data.address)) {
              onTarget(data as TargetWire);
            }
          } catch {
            // Ignore malformed JSON frames
          }
        };

        ws.onclose = () => {
          if (!closed) {
            timer = setTimeout(connect, backoff);
            backoff = Math.min(backoff * 1.5, this.maxReconnectIntervalMs);
          }
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        if (!closed) {
          timer = setTimeout(connect, backoff);
          backoff = Math.min(backoff * 1.5, this.maxReconnectIntervalMs);
        }
      }
    };

    connect();

    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      if (this.activeWs) {
        this.activeWs.close();
        this.activeWs = null;
      }
    };
  }

  /**
   * Subscribes to live aircraft targets over an auto-reconnecting SSE stream.
   * Supports Last-Event-ID resumption.
   */
  public subscribeSse(
    onTarget: (target: TargetWire) => void,
    options?: { lastEventId?: string },
  ): () => void {
    let closed = false;
    let backoff = this.reconnectIntervalMs;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let currentLastEventId = options?.lastEventId ?? null;

    const sseUrl = this.baseUrl
      .replace(/^ws:\/\//i, "http://")
      .replace(/^wss:\/\//i, "https://") + "/events";

    const connect = async () => {
      if (closed) return;
      const abort = new AbortController();
      this.activeAbortControllers.add(abort);

      try {
        const headers: Record<string, string> = { Accept: "text/event-stream" };
        if (currentLastEventId) {
          headers["Last-Event-ID"] = currentLastEventId;
        }

        const res = await fetch(sseUrl, {
          headers,
          signal: abort.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`SSE fetch failed with status ${res.status}`);
        }

        backoff = this.reconnectIntervalMs;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!closed) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";

          for (const block of lines) {
            for (const line of block.split("\n")) {
              if (line.startsWith("id:")) {
                currentLastEventId = line.slice(3).trim();
              } else if (line.startsWith("data:")) {
                try {
                  const data = JSON.parse(line.slice(5).trim());
                  if (data && (data.schema === "aerofoil.target" || data.address)) {
                    onTarget(data as TargetWire);
                  }
                } catch {
                  // Ignore parse error
                }
              }
            }
          }
        }
      } catch {
        // Fall through to reconnect
      } finally {
        this.activeAbortControllers.delete(abort);
        if (!closed) {
          timer = setTimeout(connect, backoff);
          backoff = Math.min(backoff * 1.5, this.maxReconnectIntervalMs);
        }
      }
    };

    connect();

    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      for (const ctrl of this.activeAbortControllers) {
        ctrl.abort();
      }
      this.activeAbortControllers.clear();
    };
  }

  /**
   * Closes all active WebSocket connections and aborts ongoing SSE streams.
   */
  public close(): void {
    if (this.activeWs) {
      this.activeWs.close();
      this.activeWs = null;
    }
    for (const ctrl of this.activeAbortControllers) {
      ctrl.abort();
    }
    this.activeAbortControllers.clear();
  }
}
