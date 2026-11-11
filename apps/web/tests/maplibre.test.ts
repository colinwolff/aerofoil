import { describe, expect, test } from "bun:test";
import { MapLibreTrajectoryManager } from "../src/layers/MapLibreTrajectoryManager";

describe("MapLibreTrajectoryManager", () => {
  test("maintains circular coordinate buffer per aircraft", () => {
    const mgr = new MapLibreTrajectoryManager();
    const address = "A1234F";

    for (let i = 0; i < 75; i++) {
      mgr.addCoordinate(address, -122.0 + i * 0.001, 37.0 + i * 0.001, 1000 + i * 10, 500);
    }

    const traj = (mgr as any).trajectories.get(address);
    expect(traj).toBeDefined();
    expect(traj.points.length).toBe(60); // Clamped to MAX_HISTORY_POINTS
    expect(traj.verticalRateFpm).toBe(500);
  });

  test("deduplicates identical coordinates", () => {
    const mgr = new MapLibreTrajectoryManager();
    const address = "C0FFEE";

    mgr.addCoordinate(address, 4.9041, 52.3676, 2500, 0);
    mgr.addCoordinate(address, 4.9041, 52.3676, 2500, 0);

    const traj = (mgr as any).trajectories.get(address);
    expect(traj.points.length).toBe(1);
  });

  test("removes stale target trajectories on removal", () => {
    const mgr = new MapLibreTrajectoryManager();
    mgr.addCoordinate("TARGET1", 10.0, 20.0, 5000, -300);
    expect((mgr as any).trajectories.has("TARGET1")).toBe(true);

    mgr.removeTarget("TARGET1");
    expect((mgr as any).trajectories.has("TARGET1")).toBe(false);
  });
});
