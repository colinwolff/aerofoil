import { describe, expect, test } from "bun:test";
import { ChaseCameraManager } from "../src/components/ChaseCameraManager";
import type { TargetWire } from "@aerofoil-rs/sdk";

describe("ChaseCameraManager 3D Tracking", () => {
  test("activates chase mode and forces 3D viewport mode", () => {
    let modeSet = "";
    const mockToggleMgr = {
      getMode: () => "2D",
      setMode: (m: string) => {
        modeSet = m;
      },
      getActiveEngine: () => ({
        getZoom: () => 8,
        setView: () => {},
      }),
    };

    const mgr = new ChaseCameraManager(mockToggleMgr as any);
    expect(mgr.getMode()).toBe("off");

    mgr.startChase("4840D6");
    expect(mgr.getMode()).toBe("chase");
    expect(mgr.getTargetIcao()).toBe("4840D6");
    expect(modeSet).toBe("3D");

    // Toggle chase off
    const active = mgr.toggleChase("4840D6");
    expect(active).toBe(false);
    expect(mgr.getMode()).toBe("off");
    expect(mgr.getTargetIcao()).toBeNull();
  });

  test("locks camera behind aircraft heading and pitch on kinematic updates", () => {
    let easeToOpts: any = null;
    const mockMap = {
      easeTo: (opts: any) => {
        easeToOpts = opts;
      },
    };

    const mockToggleMgr = {
      getMode: () => "3D",
      setMode: () => {},
      getActiveEngine: () => ({
        map: mockMap,
        getZoom: () => 10,
        setView: () => {},
      }),
    };

    const mgr = new ChaseCameraManager(mockToggleMgr as any);
    mgr.startChase("UAL101");

    const target: TargetWire = {
      schema: "aerofoil.target",
      version: 1,
      address: "UAL101",
      lat: 47.4502,
      lon: -122.3088,
      heading: 160,
      altitude: 4500,
      ground_speed: 240,
      source: "ModeS1090",
      last_seen_ms: 1000,
    };

    mgr.onTargetUpdate(target);

    expect(easeToOpts).toBeDefined();
    expect(easeToOpts.center).toEqual([-122.3088, 47.4502]);
    expect(easeToOpts.bearing).toBe(160);
    expect(easeToOpts.pitch).toBe(72);
    expect(easeToOpts.zoom).toBeGreaterThanOrEqual(13);
  });

  test("ignores updates for non-tracked aircraft", () => {
    let easeToCalled = false;
    const mockMap = {
      easeTo: () => {
        easeToCalled = true;
      },
    };

    const mockToggleMgr = {
      getMode: () => "3D",
      setMode: () => {},
      getActiveEngine: () => ({
        map: mockMap,
        getZoom: () => 10,
        setView: () => {},
      }),
    };

    const mgr = new ChaseCameraManager(mockToggleMgr as any);
    mgr.startChase("DAL200");

    const otherTarget: TargetWire = {
      schema: "aerofoil.target",
      version: 1,
      address: "SWA300",
      lat: 32.0,
      lon: -96.0,
      heading: 90,
      source: "ModeS1090",
      last_seen_ms: 1000,
    };

    mgr.onTargetUpdate(otherTarget);
    expect(easeToCalled).toBe(false);
  });

  test("uses synchronous jumpTo with dead-reckoned position and damped bearing across frames", () => {
    const jumpCalls: any[] = [];
    const mockToggleMgr = {
      getMode: () => "3D",
      setMode: () => {},
      getActiveEngine: () => ({
        map: { jumpTo: (opts: any) => jumpCalls.push(opts) },
        getZoom: () => 11,
        setView: () => {},
      }),
    };

    const mgr = new ChaseCameraManager(mockToggleMgr as any);
    mgr.startChase("KLM101");

    const baseTarget: TargetWire = {
      schema: "aerofoil.target", version: 1, address: "KLM101",
      lat: 52.0, lon: 4.0, heading: 0, altitude: 30000, ground_speed: 450,
      source: "ModeS1090", last_seen_ms: 1000,
    };
    mgr.onTargetUpdate(baseTarget, 1000);
    expect(jumpCalls.length).toBe(1);
    expect(jumpCalls[0].center).toEqual([4.0, 52.0]);
    expect(jumpCalls[0].bearing).toBe(0);

    // 1 second later with no new packet: dead-reckons due North (~231m = ~0.00208 deg)
    mgr.stepFrame(2000);
    expect(jumpCalls.length).toBe(2);
    expect(jumpCalls[1].center[1]).toBeGreaterThan(52.0018);
    expect(jumpCalls[1].center[1]).toBeLessThan(52.0024);

    // New packet updates heading from 350 -> 10 deg via shortest-angle smoothing
    mgr.onTargetUpdate({ ...baseTarget, lat: 52.002, heading: 90 }, 2000);
    mgr.stepFrame(2100);
    expect(jumpCalls[jumpCalls.length - 1].bearing).toBeGreaterThan(0);
    expect(jumpCalls[jumpCalls.length - 1].bearing).toBeLessThan(90);
  });
});

import { deadReckonInto, computeFixError, isActivelyExtrapolating } from "../src/layers/KinematicDeadReckoning";
import { MapLibre3dModelLayer } from "../src/layers/MapLibre3dModelLayer";

describe("KinematicDeadReckoning 60 FPS extrapolation", () => {
  test("extrapolates airborne targets, clamps horizon at 2s, and ignores parked targets", () => {
    const out = { lon: 0, lat: 0, altMeters: 0 };
    const parked = { lon: 4.0, lat: 52.0, altMeters: 0, heading: 90, groundSpeedKts: 5, updatedAtMs: 1000 };
    expect(isActivelyExtrapolating(parked, 1500)).toBe(false);
    deadReckonInto(parked, 2000, out);
    expect(out).toEqual({ lon: 4.0, lat: 52.0, altMeters: 0 });

    const jet = { lon: 4.0, lat: 52.0, altMeters: 1000, heading: 0, groundSpeedKts: 400, verticalRateFpm: 2000, updatedAtMs: 1000 };
    expect(isActivelyExtrapolating(jet, 2500)).toBe(true);
    expect(isActivelyExtrapolating(jet, 3500)).toBe(false);

    // Horizon capped at 2.0s even if nowMs = 10000
    deadReckonInto(jet, 3000, out);
    const latAt2s = out.lat;
    const altAt2s = out.altMeters;
    deadReckonInto(jet, 10000, out);
    expect(out.lat).toBeCloseTo(latAt2s, 8);
    expect(out.altMeters).toBeCloseTo(altAt2s, 6);
    expect(altAt2s).toBeGreaterThan(1015);
  });

  test("smoothly absorbs fix offset via computeFixError without jumps", () => {
    const prev = { lon: 4.0, lat: 52.0, altMeters: 1000, heading: 0, groundSpeedKts: 360, updatedAtMs: 1000 };
    const predAt1500 = { lon: 0, lat: 0, altMeters: 0 };
    deadReckonInto(prev, 1500, predAt1500);

    const err = computeFixError(prev, 4.0, 52.0005, 1000, 1500);
    const blended = { lon: 4.0, lat: 52.0005, altMeters: 1000, heading: 0, groundSpeedKts: 360, updatedAtMs: 1500, ...err };
    const out0 = { lon: 0, lat: 0, altMeters: 0 };
    deadReckonInto(blended, 1500, out0);
    expect(out0.lat).toBeCloseTo(predAt1500.lat, 6);
  });

  test("triggers MapLibre repaint only when airborne targets are actively extrapolating", () => {
    const layer = new MapLibre3dModelLayer();
    let repaints = 0;
    const fakeGl = {
      VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, ARRAY_BUFFER: 3, ELEMENT_ARRAY_BUFFER: 4,
      STATIC_DRAW: 5, DYNAMIC_DRAW: 6, DEPTH_TEST: 7, LEQUAL: 8, CULL_FACE: 9, BLEND: 10,
      SRC_ALPHA: 11, ONE_MINUS_SRC_ALPHA: 12, FLOAT: 13, TRIANGLES: 14, LINES: 15, UNSIGNED_SHORT: 16,
      createShader: () => ({}), shaderSource: () => {}, compileShader: () => {}, createProgram: () => ({}),
      attachShader: () => {}, linkProgram: () => {}, getUniformLocation: () => "u", getAttribLocation: () => 0,
      bindVertexArray: () => {}, useProgram: () => {}, enable: () => {}, depthFunc: () => {}, disable: () => {},
      blendFunc: () => {}, enableVertexAttribArray: () => {}, disableVertexAttribArray: () => {},
      createBuffer: () => ({}), bindBuffer: () => {}, bufferData: () => {}, vertexAttribPointer: () => {},
      uniformMatrix4fv: () => {}, uniformMatrix3fv: () => {}, uniform4fv: () => {}, drawElements: () => {},
    } as any;
    const fakeMap = {
      getZoom: () => 10, getTerrain: () => null,
      triggerRepaint: () => { repaints++; },
      getContainer: () => ({ classList: { contains: () => false } }),
    } as any;

    layer.onAdd(fakeMap, fakeGl);
    layer.updateTarget("A1", 4.9, 52.3, 3000, 90, 0, 0, "Jet", undefined, 0, 0);
    layer.render(fakeGl, [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    expect(repaints).toBe(0);

    layer.updateTarget("A1", 4.9, 52.3, 3000, 90, 0, 0, "Jet", undefined, 450, 500);
    layer.render(fakeGl, [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    expect(repaints).toBe(1);
  });
});
