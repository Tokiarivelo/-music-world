/**
 * Navigation state of one world (08-navigation-mode): camera mode, selected preset, current and goal poses, input.
 * Framework-free so it is tested without IWSDK; `NavigationSystem` calls {@link NavigationController.step} once per
 * frame and copies the pose to `world.camera`. Never reads the audio clock or the spawn plan (requirement 6.1).
 */
import { DESKTOP_REFERENCE_ASPECT, NAV_EASE_MAX_SEC } from '../constants';
import { NavigationInput, emptyDelta, type NavigationDelta } from './navigation-input';
import {
  VIEW_PRESETS,
  approachPose,
  cinematicPose,
  fly,
  orbit,
  pan,
  zoom,
  type OrbitPose,
  type ViewPresetId,
} from './orbit-camera';

export type CameraMode = 'cinematic' | 'explore';

export interface NavigationState {
  mode: CameraMode;
  /** Preset the camera is on (or moving to); null once the user moves the camera by hand. */
  preset: ViewPresetId | null;
}

export class NavigationController {
  readonly input = new NavigationInput();
  /** Snap instead of easing (prefers-reduced-motion, requirement 4.4). */
  reducedMotion = false;
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

  /** Input is taken only in the explore mode and outside XR (the system tells the controller about XR). */
  get acceptsInput(): boolean {
    return this.modeValue === 'explore' && !this.immersive;
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
    this.poseValue = cinematicPose(aspect);
    this.goal = this.poseValue;
  }

  setMode(mode: CameraMode): void {
    if (mode === this.modeValue) return;
    this.modeValue = mode;
    this.input.clear();
    if (mode === 'cinematic') {
      this.presetValue = null;
      this.moveTo(cinematicPose(this.aspect));
    } else {
      // Explore starts from where the camera is (requirement 1.2): no jump.
      this.presetValue = this.goal === VIEW_PRESETS.overview || this.isCinematicGoal() ? 'overview' : null;
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
    this.moveTo(id === 'overview' ? cinematicPose(this.aspect) : VIEW_PRESETS[id]);
    this.emit();
  }

  /** Back to the overview pose (requirement 4.3), in the current mode. */
  reset(): void {
    if (this.modeValue === 'explore') this.setPreset('overview');
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
    if (this.modeValue === 'explore' && d.moved) {
      // Direct manipulation from the shown pose: no lag behind the pointer, and any running ease stops.
      let p = this.poseValue;
      if (d.orbitX !== 0 || d.orbitY !== 0) p = orbit(p, d.orbitX, d.orbitY);
      if (d.panX !== 0 || d.panY !== 0) p = pan(p, d.panX, d.panY, viewportPx, fovDeg);
      if (d.zoom !== 1) p = zoom(p, d.zoom);
      p = fly(p, d.keys, dtSec);
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

  private moveTo(goal: OrbitPose): void {
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
