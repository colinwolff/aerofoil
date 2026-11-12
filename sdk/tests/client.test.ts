import { describe, expect, test } from "bun:test";
import { AerofoilClient } from "../src/client";
import type { TargetWire } from "../src/types";

describe("AerofoilClient", () => {
  test("constructs client with normal URL", () => {
    const client = new AerofoilClient({ url: "http://127.0.0.1:8080/" });
    expect(client).toBeDefined();
  });

  test("subscribes to mock WebSocket server and receives target", async () => {
    let receivedTarget: TargetWire | null = null;
    let serverWs: any = null;

    // Start a mock Bun WebSocket server
    const server = Bun.serve({
      port: 0,
      fetch(req, server) {
        if (server.upgrade(req)) {
          return;
        }
        return new Response("Not a websocket", { status: 400 });
      },
      websocket: {
        open(ws) {
          serverWs = ws;
          const sample: TargetWire = {
            schema: "aerofoil.target",
            version: 1,
            address: "4840D6",
            address_type: "Icao",
            callsign: "KLM1023",
            altitude: 38000,
            source: "ModeS1090",
            last_seen_ms: 1000000,
          };
          ws.send(JSON.stringify(sample));
        },
        message(ws, msg) {},
      },
    });

    const client = new AerofoilClient({
      url: `http://127.0.0.1:${server.port}`,
    });

    const unsubscribe = client.subscribeWebSocket((target) => {
      receivedTarget = target;
    });

    // Wait briefly for delivery
    for (let i = 0; i < 20; i++) {
      if (receivedTarget) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    unsubscribe();
    client.close();
    server.stop(true);

    expect(receivedTarget).not.toBeNull();
    expect(receivedTarget?.address).toBe("4840D6");
    expect(receivedTarget?.callsign).toBe("KLM1023");
    expect(receivedTarget?.altitude).toBe(38000);
  });

  test("subscribes to mock SSE server and parses stream", async () => {
    let receivedTarget: TargetWire | null = null;

    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === "/events") {
          const stream = new ReadableStream({
            start(controller) {
              const payload: TargetWire = {
                schema: "aerofoil.target",
                version: 1,
                address: "40621D",
                address_type: "Icao",
                callsign: "BAW142",
                source: "ModeS1090",
                last_seen_ms: 2000000,
              };
              const sseData = `id: 101\nevent: target\ndata: ${JSON.stringify(payload)}\n\n`;
              controller.enqueue(new TextEncoder().encode(sseData));
              controller.close();
            },
          });
          return new Response(stream, {
            headers: { "Content-Type": "text/event-stream" },
          });
        }
        return new Response("Not found", { status: 404 });
      },
    });

    const client = new AerofoilClient({
      url: `http://127.0.0.1:${server.port}`,
    });

    const unsubscribe = client.subscribeSse((target) => {
      receivedTarget = target;
    });

    for (let i = 0; i < 20; i++) {
      if (receivedTarget) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    unsubscribe();
    client.close();
    server.stop(true);

    expect(receivedTarget).not.toBeNull();
    expect(receivedTarget?.address).toBe("40621D");
    expect(receivedTarget?.callsign).toBe("BAW142");
  });

  test("unpacks coalesced WebSocket JSON array batches in order", async () => {
    const received: TargetWire[] = [];
    const server = Bun.serve({
      port: 0,
      fetch(req, srv) {
        return srv.upgrade(req) ? undefined : new Response("no", { status: 400 });
      },
      websocket: {
        open(ws) {
          ws.send(JSON.stringify([
            { schema: "aerofoil.target", version: 1, address: "4840D6", callsign: "KLM1", source: "ModeS1090", last_seen_ms: 1 },
            { schema: "aerofoil.target", version: 1, address: "A00001", callsign: "UAL2", source: "ModeS1090", last_seen_ms: 2 },
          ]));
        },
        message() {},
      },
    });

    const client = new AerofoilClient({ url: `http://127.0.0.1:${server.port}` });
    const unsub = client.subscribeWebSocket((t) => received.push(t));
    for (let i = 0; i < 20 && received.length < 2; i++) {
      await new Promise((r) => setTimeout(r, 25));
    }
    unsub();
    client.close();
    server.stop(true);

    expect(received.map((t) => t.address)).toEqual(["4840D6", "A00001"]);
  });
});
