import { describe, expect, it } from 'vitest';
import { NAV_EASE_MAX_SEC } from '../constants';
import { NavigationController } from './navigation-controller';
import { VIEW_PRESETS, cinematicPose } from './orbit-camera';

const VIEWPORT = 800;
const FOV = 20;

describe('NavigationController (08-navigation-mode)', () => {
  it('starts cinematic on the cinematic pose and ignores input', () => {
    const c = new NavigationController();
    c.input.wheel(0.5);
    const pose = c.step(0.016, false, VIEWPORT, FOV);
    expect(pose).toEqual(cinematicPose());
    expect(c.acceptsInput).toBe(false);
  });

  it('enters the explore mode without a jump and clears the preset when the user drags', () => {
    const c = new NavigationController();
    c.setMode('explore');
    expect(c.pose).toEqual(cinematicPose());
    expect(c.state).toEqual({ mode: 'explore', preset: 'overview' });
    c.step(0.016, false, VIEWPORT, FOV);
    expect(c.acceptsInput).toBe(true);
    c.input.pointerDown(1, 0, 0, 0, false);
    c.input.pointerMove(1, 40, 10);
    const moved = c.step(0.016, false, VIEWPORT, FOV)!;
    expect(moved.yaw).not.toBe(cinematicPose().yaw);
    expect(c.state.preset).toBeNull();
  });

  it('eases to a preset, snaps after the time cap and snaps at once with reduced motion', () => {
    const c = new NavigationController();
    c.setPreset('top');
    expect(c.state.mode).toBe('explore');
    const first = c.step(0.016, false, VIEWPORT, FOV)!;
    expect(first).not.toEqual(VIEW_PRESETS.top);
    for (let t = 0; t < NAV_EASE_MAX_SEC + 0.2; t += 0.1) c.step(0.1, false, VIEWPORT, FOV);
    expect(c.pose).toEqual(VIEW_PRESETS.top);

    const r = new NavigationController();
    r.reducedMotion = true;
    r.setPreset('staff');
    expect(r.pose).toEqual(VIEW_PRESETS.staff);
  });

  it('returns to the cinematic pose when leaving explore, and reset goes to overview', () => {
    const c = new NavigationController();
    c.reducedMotion = true;
    c.setPreset('city');
    c.reset();
    expect(c.pose).toEqual(VIEW_PRESETS.overview);
    c.setMode('cinematic');
    expect(c.pose).toEqual(cinematicPose());
    expect(c.state).toEqual({ mode: 'cinematic', preset: null });
  });

  it('writes no pose and drops input during an immersive session, then resumes the explore pose', () => {
    const c = new NavigationController();
    c.setMode('explore');
    c.input.pointerDown(1, 0, 0, 0, false);
    c.input.pointerMove(1, 50, 0);
    const before = c.step(0.016, false, VIEWPORT, FOV)!;
    c.input.pointerMove(1, 90, 0);
    expect(c.step(0.016, true, VIEWPORT, FOV)).toBeNull();
    expect(c.acceptsInput).toBe(false);
    expect(c.step(0.016, false, VIEWPORT, FOV)).toBe(before);
  });

  it('notifies subscribers and stops after unsubscribe', () => {
    const c = new NavigationController();
    const seen: string[] = [];
    const off = c.subscribe((s) => seen.push(s.mode));
    c.setMode('explore');
    off();
    c.setMode('cinematic');
    expect(seen).toEqual(['cinematic', 'explore']);
  });

  it('re-fits the cinematic pose when the aspect changes, and leaves an explored pose alone', () => {
    const c = new NavigationController();
    c.setAspect(9 / 16);
    expect(c.pose).toEqual(cinematicPose(9 / 16));
    c.setAspect(16 / 9);
    expect(c.pose).toEqual(cinematicPose());
    c.setMode('explore');
    c.input.pointerDown(1, 100, 100, 0, false);
    c.input.pointerMove(1, 140, 100);
    c.input.pointerUp(1);
    c.step(0.016, false, VIEWPORT, FOV);
    const moved = c.pose;
    c.setAspect(1);
    expect(c.pose).toBe(moved);
    c.reset();
    c.step(NAV_EASE_MAX_SEC + 1, false, VIEWPORT, FOV);
    expect(c.pose).toEqual(cinematicPose(1));
  });
});
