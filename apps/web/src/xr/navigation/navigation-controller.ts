/**
 * Navigation state of one world (08-navigation-mode): camera mode, selected preset, current and goal poses, input.
 * Framework-free so it is tested without IWSDK; `NavigationSystem` calls {@link NavigationController.step} once per
 * frame and copies the pose to `world.camera`. Never reads the audio clock or the spawn plan (requirement 6.1).
 */
import { DESKTOP_REFERENCE_ASPECT, NAV_DISTANCE_MAX_M, NAV_EASE_MAX_SEC, WALK_MARGIN_M } from '../constants';
import { startPose, look, walk, walkCamera, clampToBounds, pushOut, DOME_WALK_RATIO, WALKER_RADIUS_M, type Circle, type WalkBounds, type WalkPose } from './walk-camera';
import { NavigationInput, emptyDelta, type NavigationDelta } from './navigation-input';
import {
  VIEW_PRESETS,
  approachPose,
  cinematicPose,
  overviewPose,
  fly,
  orbit,
  pan,
  zoom,
  type OrbitPose,
  type ViewPresetId,
} from './orbit-camera';

export type CameraMode = 'cinematic' | 'explore' | 'walk';

export interface NavigationState {
  mode: CameraMode;
  /** Preset the camera is on (or moving to); null once the user moves the camera by hand. */
  preset: ViewPresetId | null;
}

export interface WalkMapView {
  cx: number;
  cz: number;
  /** Half side (square) or radius (round) of the walkable area, metres. */
  limit: number;
  round: boolean;
  pose: WalkPose;
  obstacles: readonly Circle[];
}

export class NavigationController {
  readonly input = new NavigationInput();
  /** Snap instead of easing (prefers-reduced-motion, requirement 4.4). */
  reducedMotion = false;
  private maxDistanceValue = NAV_DISTANCE_MAX_M;

  /** Farthest any camera pose may be (diorama metres); the host lowers it in the big world, inside the sky dome. */
  get maxDistance(): number {
    return this.maxDistanceValue;
  }

  set maxDistance(value: number) {
    if (value === this.maxDistanceValue) return;
    this.maxDistanceValue = value;
    this.poseValue = this.capped(this.poseValue);
    this.goal = this.capped(this.goal);
  }

  private capped(pose: OrbitPose): OrbitPose {
    return pose.distance > this.maxDistanceValue ? { ...pose, distance: this.maxDistanceValue } : pose;
  }
  private modeValue: CameraMode = 'cinematic';
  private presetValue: ViewPresetId | null = null;
  private poseValue: OrbitPose = cinematicPose();
  private goal: OrbitPose = this.poseValue;
  /** Seconds since the current ease started (snap after `NAV_EASE_MAX_SEC`). */
  private easeElapsed = 0;
  private readonly delta: NavigationDelta = emptyDelta();
  private readonly listeners = new Set<(state: NavigationState) => void>();

  get mode(): CameraMode {
    return this.modeValue;
  }

  get pose(): OrbitPose {
    return this.poseValue;
  }

  get state(): NavigationState {
    return { mode: this.modeValue, preset: this.presetValue };
  }

  /** Input is taken in the explore and walk modes, outside XR (the system tells the controller about XR). */
  get acceptsInput(): boolean {
    return this.modeValue !== 'cinematic' && !this.immersive;
  }

  private walkBounds: WalkBounds | null = null;
  private obstaclesOf: () => readonly Circle[] = () => [];
  private walkPoseValue: WalkPose | null = null;
  private walkDirty = false;

  /** Dome world: the walker is confined to the dome and starts at its centre; switches to the walk mode (and back). */
  setDome(on: boolean): void {
    if (this.walkBounds) this.walkBounds = { ...this.walkBounds, dome: on };
    if (on) {
      this.walkPoseValue = this.walkBounds ? startPose(this.walkBounds) : null;
      this.walkDirty = true;
      this.setMode('walk');
    } else if (this.modeValue === 'walk') this.setMode('cinematic');
  }

  /** The plate the walker stands on and the circles it cannot enter (set by the host, which knows the scale). */
  configureWalk(bounds: WalkBounds, obstacles: () => readonly Circle[]): void {
    this.walkBounds = bounds;
    this.obstaclesOf = obstacles;
    if (this.modeValue === 'walk') {
      this.walkPoseValue = startPose(bounds);
      this.walkDirty = true;
    }
  }

  /** Map of the walk area for the pegman minimap: plate, walker and obstacles (null outside the walk mode). */
  walkMap(): WalkMapView | null {
    const bounds = this.walkBounds;
    const pose = this.walkPoseValue;
    if (this.modeValue !== 'walk' || !bounds || !pose) return null;
    const limit = bounds.dome ? bounds.half * DOME_WALK_RATIO : bounds.half + WALK_MARGIN_M;
    return { cx: bounds.cx, cz: bounds.cz, limit, round: !!bounds.dome, pose, obstacles: this.obstaclesOf() };
  }

  /** Drops the walker at a world position (pegman drop): clamped to the area and pushed out of structures. */
  placeWalker(x: number, z: number): void {
    const bounds = this.walkBounds;
    if (!bounds || this.modeValue !== 'walk' || !this.walkPoseValue) return;
    const inside = clampToBounds(x, z, bounds);
    const free = pushOut(inside.x, inside.z, WALKER_RADIUS_M, this.obstaclesOf());
    const ok = clampToBounds(free.x, free.z, bounds);
    this.walkPoseValue = { ...this.walkPoseValue, x: ok.x, z: ok.z };
    this.walkDirty = true;
  }

  get walkPose(): WalkPose | null {
    return this.walkPoseValue;
  }

  /** Camera of the walk mode once per change (null when not walking or nothing moved). */
  consumeWalkCamera(): ReturnType<typeof walkCamera> | null {
    if (this.modeValue !== 'walk' || !this.walkPoseValue || !this.walkDirty) return null;
    this.walkDirty = false;
    return walkCamera(this.walkPoseValue);
  }

  private immersive = false;
  private aspect = DESKTOP_REFERENCE_ASPECT;

  /**
   * Viewport aspect ratio (I2 requirement 4). When the camera is on the cinematic / overview pose it is re-fitted at
   * once (a resize is not animated); any other pose is left alone.
   */
  setAspect(aspect: number): void {
    if (!Number.isFinite(aspect) || aspect <= 0 || aspect === this.aspect) return;
    const onOverview = this.goal === this.poseValue && this.isCinematicGoal();
    this.aspect = aspect;
    if (!onOverview) return;
    this.poseValue = this.capped(cinematicPose(aspect));
    this.goal = this.poseValue;
  }

  setMode(mode: CameraMode): void {
    if (mode === this.modeValue) return;
    this.modeValue = mode;
    this.input.clear();
    if (mode === 'walk') {
      this.presetValue = null;
      this.walkPoseValue = this.walkBounds ? startPose(this.walkBounds) : null;
      this.walkDirty = true;
    } else if (mode === 'cinematic') {
      this.presetValue = null;
      this.moveTo(cinematicPose(this.aspect));
    } else {
      // Explore starts from where the camera is (requirement 1.2), eased: from the cinematic framing it rises to the
      // global view, so the whole scene is in the frame.
      const onOverview = this.goal === VIEW_PRESETS.overview || this.isCinematicGoal();
      this.presetValue = onOverview ? 'overview' : null;
      if (onOverview) this.moveTo(overviewPose(this.aspect));
    }
    this.emit();
  }

  /** Moves to a preset; switches to the explore mode if needed (requirement 4.2). */
  setPreset(id: ViewPresetId): void {
    if (this.modeValue !== 'explore') {
      this.modeValue = 'explore';
      this.input.clear();
    }
    this.presetValue = id;
    this.moveTo(id === 'overview' ? overviewPose(this.aspect) : VIEW_PRESETS[id]);
    this.emit();
  }

  /** Back to the overview pose (requirement 4.3), in the current mode; in the walk mode, back to the start. */
  reset(): void {
    if (this.modeValue === 'walk') {
      this.walkPoseValue = this.walkBounds ? startPose(this.walkBounds) : null;
      this.walkDirty = true;
    } else if (this.modeValue === 'explore') this.setPreset('overview');
    else this.moveTo(cinematicPose(this.aspect));
  }

  subscribe(listener: (state: NavigationState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * One frame: applies the input (explore mode), eases toward the goal and returns the pose to show, or null while an
   * immersive session runs (the headset owns the camera, requirement 5.1).
   */
  step(dtSec: number, immersive: boolean, viewportPx: number, fovDeg: number): OrbitPose | null {
    this.immersive = immersive;
    if (immersive) {
      this.input.clear();
      return null;
    }
    const d = this.input.drain(this.delta);
    if (this.modeValue === 'walk') {
      const bounds = this.walkBounds;
      let w = this.walkPoseValue;
      if (bounds && w && d.moved) {
        if (d.orbitX !== 0 || d.orbitY !== 0) w = look(w, d.orbitX, d.orbitY);
        w = walk(w, d.keys, dtSec, bounds, this.obstaclesOf());
        this.walkPoseValue = w;
        this.walkDirty = true;
      }
      return null; // the system reads `consumeWalkCamera()`
    }
    if (this.modeValue === 'explore' && d.moved) {
      // Direct manipulation from the shown pose: no lag behind the pointer, and any running ease stops.
      let p = this.poseValue;
      if (d.orbitX !== 0 || d.orbitY !== 0) p = orbit(p, d.orbitX, d.orbitY);
      if (d.panX !== 0 || d.panY !== 0) p = pan(p, d.panX, d.panY, viewportPx, fovDeg);
      if (d.zoom !== 1) p = zoom(p, d.zoom);
      p = fly(p, d.keys, dtSec);
      p = this.capped(p);
      this.poseValue = p;
      this.goal = p;
      if (this.presetValue !== null) {
        this.presetValue = null;
        this.emit();
      }
      return p;
    }
    if (this.poseValue !== this.goal) {
      this.easeElapsed += Math.max(0, dtSec);
      this.poseValue =
        this.reducedMotion || this.easeElapsed >= NAV_EASE_MAX_SEC
          ? this.goal
          : approachPose(this.poseValue, this.goal, dtSec);
    }
    return this.poseValue;
  }

  private moveTo(target: OrbitPose): void {
    const goal = this.capped(target);
    this.goal = goal;
    this.easeElapsed = 0;
    if (this.reducedMotion) this.poseValue = goal;
  }

  private isCinematicGoal(): boolean {
    const c = cinematicPose(this.aspect);
    const g = this.goal;
    return g.yaw === c.yaw && g.pitch === c.pitch && g.distance === c.distance && g.target.x === c.target.x;
  }

  private emit(): void {
    const state = this.state;
    for (const listener of this.listeners) listener(state);
  }
}
