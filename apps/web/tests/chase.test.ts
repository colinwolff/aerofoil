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
});
