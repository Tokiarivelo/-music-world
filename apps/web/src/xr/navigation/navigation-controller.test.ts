import { describe, expect, it } from "vitest";
import { NAV_EASE_MAX_SEC } from "../constants";
import { NavigationController } from "./navigation-controller";
import { VIEW_PRESETS, cinematicPose, overviewPose } from "./orbit-camera";

const VIEWPORT = 800;
const FOV = 20;

describe("NavigationController (08-navigation-mode)", () => {
  it("starts cinematic on the cinematic pose and ignores input", () => {
    const c = new NavigationController();
    c.input.wheel(0.5);
    const pose = c.step(0.016, false, VIEWPORT, FOV);
    expect(pose).toEqual(cinematicPose());
    expect(c.acceptsInput).toBe(false);
  });

  it("enters the explore mode without a jump and clears the preset when the user drags", () => {
    const c = new NavigationController();
    c.setMode("explore");
    expect(c.pose).toEqual(cinematicPose());
    expect(c.state).toEqual({ mode: "explore", preset: "overview" });
    c.step(0.016, false, VIEWPORT, FOV);
    expect(c.acceptsInput).toBe(true);
    c.input.pointerDown(1, 0, 0, 0, false);
    c.input.pointerMove(1, 40, 10);
    const moved = c.step(0.016, false, VIEWPORT, FOV)!;
    expect(moved.yaw).not.toBe(cinematicPose().yaw);
    expect(c.state.preset).toBeNull();
  });

  it("eases to a preset, snaps after the time cap and snaps at once with reduced motion", () => {
    const c = new NavigationController();
    c.setPreset("top");
    expect(c.state.mode).toBe("explore");
    const first = c.step(0.016, false, VIEWPORT, FOV)!;
    expect(first).not.toEqual(VIEW_PRESETS.top);
    for (let t = 0; t < NAV_EASE_MAX_SEC + 0.2; t += 0.1)
      c.step(0.1, false, VIEWPORT, FOV);
    expect(c.pose).toEqual(VIEW_PRESETS.top);

    const r = new NavigationController();
    r.reducedMotion = true;
    r.setPreset("staff");
    expect(r.pose).toEqual(VIEW_PRESETS.staff);
  });

  it("returns to the cinematic pose when leaving explore, and reset goes to overview", () => {
    const c = new NavigationController();
    c.reducedMotion = true;
    c.setPreset("city");
    c.reset();
    expect(c.pose).toEqual(VIEW_PRESETS.overview);
    c.setMode("cinematic");
    expect(c.pose).toEqual(cinematicPose());
    expect(c.state).toEqual({ mode: "cinematic", preset: null });
  });

  it("writes no pose and drops input during an immersive session, then resumes the explore pose", () => {
    const c = new NavigationController();
    c.setMode("explore");
    c.input.pointerDown(1, 0, 0, 0, false);
    c.input.pointerMove(1, 50, 0);
    const before = c.step(0.016, false, VIEWPORT, FOV)!;
    c.input.pointerMove(1, 90, 0);
    expect(c.step(0.016, true, VIEWPORT, FOV)).toBeNull();
    expect(c.acceptsInput).toBe(false);
    expect(c.step(0.016, false, VIEWPORT, FOV)).toBe(before);
  });

  it("notifies subscribers and stops after unsubscribe", () => {
    const c = new NavigationController();
    const seen: string[] = [];
    const off = c.subscribe((s) => seen.push(s.mode));
    c.setMode("explore");
    off();
    c.setMode("cinematic");
    expect(seen).toEqual(["cinematic", "explore"]);
  });

  it("re-fits the cinematic pose when the aspect changes, and leaves an explored pose alone", () => {
    const c = new NavigationController();
    c.setAspect(9 / 16);
    expect(c.pose).toEqual(cinematicPose(9 / 16));
    c.setAspect(16 / 9);
    expect(c.pose).toEqual(cinematicPose());
    c.setMode("explore");
    c.input.pointerDown(1, 100, 100, 0, false);
    c.input.pointerMove(1, 140, 100);
    c.input.pointerUp(1);
    c.step(0.016, false, VIEWPORT, FOV);
    const moved = c.pose;
    c.setAspect(1);
    expect(c.pose).toBe(moved);
    c.reset();
    c.step(NAV_EASE_MAX_SEC + 1, false, VIEWPORT, FOV);
    expect(c.pose).toEqual(overviewPose(1));
  });
});

describe("walk mode (I7)", () => {
  const bounds = { cx: 0, cz: -30, half: 40 };

  it("starts at the plate edge, walks with the keys and returns to the start on reset", () => {
    const nav = new NavigationController();
    nav.configureWalk(bounds, () => []);
    nav.setMode("walk");
    expect(nav.state.mode).toBe("walk");
    expect(nav.consumeWalkCamera()).not.toBeNull();
    expect(nav.consumeWalkCamera()).toBeNull(); // nothing moved since
    const start = nav.walkPose!;
    nav.input.key("KeyW", true);
    nav.step(0.1, false, 800, 20);
    expect(nav.walkPose!.z).toBeLessThan(start.z);
    nav.reset();
    expect(nav.walkPose).toEqual(start);
  });

  it("takes no input in a VR session and gives the camera back to the orbit modes", () => {
    const nav = new NavigationController();
    nav.configureWalk(bounds, () => []);
    nav.setMode("walk");
    expect(nav.step(0.1, true, 800, 20)).toBeNull();
    nav.setMode("cinematic");
    expect(nav.consumeWalkCamera()).toBeNull();
    expect(nav.step(0.1, false, 800, 20)).not.toBeNull();
  });
});

describe("Superman landing", () => {
  it("walks only after landing on the spot, outside structures", () => {
    const c = new NavigationController();
    c.configureWalk({ cx: 0, cz: 0, half: 100 }, () => [
      { x: 10, z: 10, r: 5 },
    ]);
    c.landAt(30, -20);
    expect(c.mode).toBe("walk");
    expect(c.walkPose).toMatchObject({ x: 30, z: -20 });
    const first = c.consumeWalkCamera()!;
    expect(first.eye.y).toBeGreaterThan(30); // starts high in the sky
    c.step(5, false, 800, 60);
    const last = c.consumeWalkCamera()!;
    expect(last.eye.y).toBeCloseTo(1.6, 1);
    c.landAt(10, 10);
    const p = c.walkPose!;
    expect(Math.hypot(p.x - 10, p.z - 10)).toBeGreaterThanOrEqual(5.4 - 1e-6);
  });
});
