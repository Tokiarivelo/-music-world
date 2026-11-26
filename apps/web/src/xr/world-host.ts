/**
 * Creates and tears down the IWSDK world. React only mounts a container and talks to the world through
 * the returned {@link WorldHandle} (see frontend.md: "3D stays out of React").
 *
 * IWSDK 1.1.0 API checked against the installed typings: `World.create`, `launchXR`, `exitXR`, `destroy`
 * (stops systems + render loop and runs system cleanups, which dispose the views; does not dispose the renderer, so
 * we do it here), `visibilityState` (signal, `'non-immersive'` outside XR), `xr.features.handTracking`.
 */
import type * as IWSDK from '@iwsdk/core';
import { EMPTY_EDITS, type LayoutEdits } from '@/engine/edits';
import { buildSpawnPlan, type SpawnPlan } from '@/engine/spawn-plan';
import type { EngineAnalysis, Vec3, WorldTemplate } from '@/engine/types';
import {
  DESKTOP_CAMERA_AZIMUTH_DEG,
  DESKTOP_CAMERA_ELEVATION_DEG,
  DESKTOP_CAMERA_FOV_DEG,
  HORIZON_FOV_DEG,
  WALK_FOV_DEG,
  NAV_DISTANCE_MAX_M,
  NAV_DISTANCE_MAX_WORLD_M,
  DESKTOP_CAMERA_TARGET_OFFSET,
  DESKTOP_REFERENCE_ASPECT,
  DIORAMA_POSITION,
  NAV_WHEEL_ZOOM,
} from './constants';
import { applyPaletteOverride, type PaletteOverride } from './palette-override';
import { cinematicDistance } from './navigation/orbit-camera';
import { obstaclesAt, type Circle } from './navigation/walk-camera';
import { activityAt, type Activity, type HiddenLayers } from '@/engine/layers';
import { DEFAULT_LAYOUT, type LayoutMode } from '@/engine/layout';
import { skyStore } from './sky-store';
import { domeStore } from './dome-store';
import type { LandscapeId } from '@/engine/landscapes';
import { weatherStore } from './weather-store';
import type { TimeMode, WeatherMode } from '@/engine/weather';
import { layerStore } from './layer-store';
import { EditController, type NoteEditEvent } from './interaction/edit-controller';
import { NoteSynth } from './audio/note-synth';
import { keyboardPad } from './keyboard-pad';
import { ScorePlayer, type ScoreNote } from './audio/score-player';
import { worldSpan } from '@/engine/city';
import { anchorPlacement, plateWidthM, rootScale, setWorldSpan, worldWidthM } from './scale';
import { bindNavigationInput } from './navigation/navigation-input';
import type { CameraMode, NavigationController, NavigationState, WalkMapView } from './navigation/navigation-controller';
import type { ViewPresetId } from './navigation/orbit-camera';
import type { MusicScene, WorldClock } from './systems/world-systems';
import type { WorldControls } from './systems/xr-systems';

export type { TemplateChoice, WorldControls } from './systems/xr-systems';

/** What the world shows: built once into a spawn plan, then rendered from `clock.now()` every frame. */
export interface WorldScene {
  analysis: EngineAnalysis;
  template: WorldTemplate;
  seed: number;
  clock: WorldClock;
}

/** What the host needs from the installed systems. */
export interface InstalledScene extends Pick<MusicScene, 'setScene' | 'setLightLevel' | 'setScaleMode'> {
  setControls(controls: WorldControls | null): void;
  /** Right controller ray and trigger drive the note editor (I9 task 8); null turns it off. */
  setEditRay?(target: { rayDown(r: { origin: Vec3; dir: Vec3 }): boolean; rayMove(r: { origin: Vec3; dir: Vec3 }): void; rayUp(): void } | null): void;
  /** Projects a point of the plan (plate metres) to canvas pixels; null behind the camera (I9 picking). */
  project?(p: Vec3): { x: number; y: number } | null;
  /** Desktop camera navigation (08-navigation-mode); the host binds its input to the canvas. */
  navigation: NavigationController;
  /** Called on dispose, after the input is unbound. */
  disposeNavigation(): void;
}

export type EditCommand =
  | { type: 'select'; direction: 1 | -1 }
  | { type: 'nudge'; steps: number }
  | { type: 'play' }
  | { type: 'cancel' };

export interface WorldHandle {
  /** Replaces the song, template, seed or clock (typed command API, frontend.md). */
  load(scene: WorldScene): void;
  /**
   * View-only colors on top of the template (I4 requirement 5): `null` restores the template. Never mutates the
   * template, never touches the clock or the audio; the views are rebuilt from the same plan data.
   */
  setPaletteOverride(override: PaletteOverride | null): void;
  /** Scene lights multiplier (I4b), 1 = the template look; view-only, no rebuild. */
  setLightLevel(level: number): void;
  /** Layers the viewer switched off (I5): view-only, no rebuild, redrawn at once even while paused. */
  setHiddenLayers(hidden: HiddenLayers): void;
  /** Arrangement of the structures (viewer choice): rebuilds the plan with the same seed. */
  setLayout(layout: LayoutMode): void;
  /** Northern-lights mode: notes hang in the sky and can be picked; view-only, no rebuild. */
  setAuroraSky(enabled: boolean): void;
  /**
   * Dome world: no plate, the camera stands inside an infinite-looking dome on a predefined landscape (walk mode,
   * confined to the dome). View-only, no rebuild. Turning it off returns to the overview.
   */
  setDome(dome: { enabled: boolean; landscape: LandscapeId }): void;
  /** Weather of the infinite world: `auto` follows the music, the others force a sky. View-only, no rebuild. */
  setWeather(mode: WeatherMode): void;
  /** Time of day and photographic sky of the dome (view-only, no rebuild). */
  setSky(sky: { time: TimeMode; realSky: boolean }): void;
  /**
   * Note edits on top of the analysis (I9): rebuilds the plan with the same seed, so the scenery does not move. The
   * document and its history live in the page; the world only displays it.
   */
  setEdits(edits: LayoutEdits): void;
  /** Turns the note editor on (only while the song is paused: the page decides) or off. */
  setEditMode(enabled: boolean): void;
  /** Hover, selection, drag and commit events of the editor. Returns an unsubscribe function. */
  onNoteEvent(listener: (event: NoteEditEvent) => void): () => void;
  /** "Play my edits": plays these notes with the synth in step with the song clock; `null` stops it. */
  setScore(notes: readonly ScoreNote[] | null): void;
  /** Keyboard commands of the editor (requirement 11): select, nudge the pitch, play. */
  editCommand(command: EditCommand): void;
  /** What each stem plays now, for the meters of the layers panel (null before a song is loaded). */
  activity(): Activity | null;
  enterVR(): void;
  exitVR(): void;
  /**
   * Player commands used in VR (controllers, spatial panel, pinch; 07-xr-mode requirements 3–5): the same functions
   * as the 2D player bar. Cheap: does not rebuild the world.
   */
  setControls(controls: WorldControls | null): void;
  /** Camera commands of the navigation mode (08-navigation-mode requirements 1, 4): never touch the world state. */
  setCameraMode(mode: CameraMode): void;
  setViewPreset(id: ViewPresetId): void;
  resetView(): void;
  /** Walk mode: area, walker and obstacles for the minimap (null outside the walk mode). */
  walkMap(): WalkMapView | null;
  /** Walk mode: drops the walker at a world position (pegman). */
  placeWalker(x: number, z: number): void;
  /** Calls `listener(state)` now and whenever the camera mode or selected preset changes. */
  onNavigationChange(listener: (state: NavigationState) => void): () => void;
  /** Calls `listener(immersive)` now and whenever an XR session starts or ends; returns an unsubscribe function. */
  onSessionChange(listener: (immersive: boolean) => void): () => void;
  isVRSupported(): Promise<boolean>;
  dispose(): void;
}

type WorldLike = Pick<IWSDK.World, 'launchXR' | 'exitXR' | 'destroy'> & {
  camera: Pick<IWSDK.World['camera'], 'position' | 'lookAt' | 'fov' | 'aspect' | 'updateProjectionMatrix'>;
  renderer: Pick<
    IWSDK.World['renderer'],
    'dispose' | 'forceContextLoss' | 'domElement' | 'setPixelRatio' | 'setSize'
  >;
  session: XRSession | undefined;
  visibilityState: { readonly value: string; subscribe(fn: (value: string) => void): () => void };
};

export interface WorldHostDeps {
  installEmulator(): Promise<void>;
  createWorld(container: HTMLElement): Promise<WorldLike>;
  /** Registers the music systems on the world (`installMusicSystems`). */
  installScene(world: WorldLike): Promise<InstalledScene>;
  xr(): Pick<XRSystem, 'isSessionSupported'> | undefined;
}

let emulatorInstalled = false;
// IWSDK 1.1.0: two concurrent World.create calls leave one pending forever (seen with React StrictMode's
// double mount), so world creation is serialized.
let creationQueue: Promise<unknown> = Promise.resolve();

const defaultDeps: WorldHostDeps = {
  async installEmulator() {
    if (process.env.NODE_ENV !== 'development' || emulatorInstalled) return;
    // Desktop Chrome exposes a native navigator.xr without a headset: replace it with the emulator.
    // A real headset (Quest Browser) keeps its native runtime.
    const nativeVR = await navigator.xr?.isSessionSupported('immersive-vr').catch(() => false);
    if (nativeVR) return;
    const { XRDevice, metaQuest3 } = await import('iwer');
    const device = new XRDevice(metaQuest3);
    device.installRuntime({ forceInstall: true }); // before World.create; once per page
    // Development only: lets the IWER check script (07-xr-mode) drive the emulated controllers and hands.
    devHooks().__mwXRDevice = device;
    emulatorInstalled = true;
  },
  async createWorld(container) {
    const { World, SessionMode, ReferenceSpaceType } = await import('@iwsdk/core');
    return World.create(container, {
      xr: {
        sessionMode: SessionMode.ImmersiveVR,
        referenceSpace: ReferenceSpaceType.LocalFloor,
        offer: 'none',
        // Optional: controllers keep working when the runtime has no hand tracking (07-xr-mode requirement 1.2).
        features: { handTracking: true },
      },
    });
  },
  async installScene(world) {
    const { installMusicSystems } = await import('./systems/world-systems');
    const { installXRSystems } = await import('./systems/xr-systems');
    const { installXRPanel } = await import('./systems/xr-panel-system');
    const { installNavigation, disposeNavigation } = await import('./systems/navigation-system');
    // `?perf=1` logs draw calls and triangles once per second (04-default-template requirement 7.3).
    const perfLog = typeof location !== 'undefined' && new URLSearchParams(location.search).get('perf') === '1';
    const { Vector3 } = await import('three');
    const tmp = new Vector3();
    const scene = installMusicSystems(world as IWSDK.World, { perfLog });
    const rig = installXRSystems(world as IWSDK.World, scene.anchorEntity, scene.anchor);
    installXRPanel(world as IWSDK.World, scene.anchorEntity, rig);
    const navigation = installNavigation(
      world as IWSDK.World,
      world.camera,
      () => world.renderer.domElement.clientHeight || 1,
    );
    return {
      navigation,
      disposeNavigation: () => disposeNavigation(navigation),
      setScene: (plan, clock) => scene.setScene(plan, clock),
      setLightLevel: (level) => scene.setLightLevel(level),
      setScaleMode: (mode) => scene.setScaleMode(mode),
      setEditRay: (target) => {
        if (!target) {
          rig.editRay = null;
          return;
        }
        // World-space controller ray → the plan's space (the scene root), direction re-normalized (the root is scaled).
        const toPlan = (ray: { origin: Vec3; dir: Vec3 }) => {
          const root = scene.root;
          root.updateWorldMatrix(true, false);
          const o = root.worldToLocal(new Vector3(ray.origin.x, ray.origin.y, ray.origin.z));
          const tip = root.worldToLocal(new Vector3(ray.origin.x + ray.dir.x, ray.origin.y + ray.dir.y, ray.origin.z + ray.dir.z));
          const d = tip.sub(o).normalize();
          return { origin: { x: o.x, y: o.y, z: o.z }, dir: { x: d.x, y: d.y, z: d.z } };
        };
        rig.editRay = {
          rayDown: (ray) => target.rayDown(toPlan(ray)),
          rayMove: (ray) => target.rayMove(toPlan(ray)),
          rayUp: () => target.rayUp(),
        };
      },
      setControls: (controls) => {
        rig.controls = controls;
      },
      project: (p) => {
        const root = scene.root;
        root.updateWorldMatrix(true, false);
        tmp.set(p.x, p.y, p.z).applyMatrix4(root.matrixWorld).project((world as IWSDK.World).camera);
        if (tmp.z > 1 || tmp.z < -1) return null;
        const el = world.renderer.domElement;
        return { x: ((tmp.x + 1) / 2) * el.clientWidth, y: ((1 - tmp.y) / 2) * el.clientHeight };
      },
    };
  },
  xr: () => (typeof navigator === 'undefined' ? undefined : navigator.xr),
};

/** Development-only globals read by the IWER check script (`scripts/xr-check.mjs`). */
function devHooks(): { __mwWorld?: unknown; __mwXRDevice?: unknown } {
  return globalThis as { __mwWorld?: unknown; __mwXRDevice?: unknown };
}

/** `VisibilityState.NonImmersive` of IWSDK (kept as a literal so this module does not load IWSDK eagerly). */
const NON_IMMERSIVE = 'non-immersive';

/** Device pixel ratio cap (I2 requirement 1): beyond 2 the fill cost grows with no visible gain. */
export const MAX_PIXEL_RATIO = 2;

/** Pixel ratio actually used for a device ratio. */
export function cappedPixelRatio(devicePixelRatio: number): number {
  return Math.min(MAX_PIXEL_RATIO, Math.max(1, Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1));
}

type Point = { x: number; y: number; z: number };

/** Desktop isometric pose (04-default-template requirement 1): azimuth / elevation around the diorama centre. */
export function desktopCameraPose(aspect: number = DESKTOP_REFERENCE_ASPECT): { position: Point; target: Point } {
  const az = (DESKTOP_CAMERA_AZIMUTH_DEG * Math.PI) / 180;
  const el = (DESKTOP_CAMERA_ELEVATION_DEG * Math.PI) / 180;
  const target = {
    x: DIORAMA_POSITION.x + DESKTOP_CAMERA_TARGET_OFFSET.x,
    y: DIORAMA_POSITION.y + DESKTOP_CAMERA_TARGET_OFFSET.y,
    z: DIORAMA_POSITION.z + DESKTOP_CAMERA_TARGET_OFFSET.z,
  };
  const r = cinematicDistance(aspect);
  return {
    position: {
      x: target.x + r * Math.cos(el) * Math.sin(az),
      y: target.y + r * Math.sin(el),
      z: target.z + r * Math.cos(el) * Math.cos(az),
    },
    target,
  };
}

export function createMusicWorld(container: HTMLDivElement, deps: WorldHostDeps = defaultDeps): Promise<WorldHandle> {
  const run = creationQueue.then(() => buildWorld(container, deps));
  creationQueue = run.catch(() => undefined);
  return run;
}

async function buildWorld(container: HTMLDivElement, deps: WorldHostDeps): Promise<WorldHandle> {
  await deps.installEmulator();
  const world = await deps.createWorld(container);
  const scene = await deps.installScene(world);
  if (process.env.NODE_ENV === 'development') devHooks().__mwWorld = world; // read by scripts/xr-check.mjs
  // Desktop isometric view of the diorama; in XR the headset pose drives the camera (restored on exit by IWSDK).
  const aspect = container.clientWidth / Math.max(1, container.clientHeight);
  const { position, target } = desktopCameraPose(aspect > 0 ? aspect : undefined);
  world.camera.fov = DESKTOP_CAMERA_FOV_DEG;
  world.camera.updateProjectionMatrix();
  world.camera.position.set(position.x, position.y, position.z);
  world.camera.lookAt(target.x, target.y, target.z);
  let disposed = false;
  const nav = scene.navigation;
  // The canvas follows its container (I2 requirement 1); in XR the headset owns the drawing buffer size.
  const fit = (): void => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (disposed || world.session || width < 1 || height < 1) return;
    world.renderer.setPixelRatio(cappedPixelRatio(globalThis.devicePixelRatio ?? 1));
    world.renderer.setSize(width, height);
    world.camera.aspect = width / height;
    world.camera.updateProjectionMatrix();
    nav.setAspect(width / height);
  };
  fit();
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
  resizeObserver?.observe(container);
  // Scale (I7): the world around the viewer in VR and in the walk mode, the diorama otherwise.
  let inSession = false;
  // The horizon preset opens the lens (the 20 degree tele lens only frames the plate); any other preset restores it.
  let wide = false;
  const applyScale = (): void => {
    // The dome world is the big world in every mode: the orbit camera (explore, cinematic) is mapped to it by
    // `viewToWorld`, so the whole landscape around the plate is in the frame.
    const big = inSession || nav.mode === 'walk' || domeStore.enabled;
    scene.setScaleMode(big ? 'immersive' : 'diorama');
    nav.maxDistance = big ? NAV_DISTANCE_MAX_WORLD_M : NAV_DISTANCE_MAX_M;
    if (nav.state.preset === 'horizon') wide = true;
    else if (nav.state.preset !== null || nav.mode === 'cinematic') wide = false;
    const fov = nav.mode === 'walk'
      ? WALK_FOV_DEG
      : wide && !inSession
        ? HORIZON_FOV_DEG
        : !inSession && (nav.mode === 'explore' || domeStore.enabled)
          ? 52
          : DESKTOP_CAMERA_FOV_DEG;
    if (!world.session && world.camera.fov !== fov) {
      world.camera.fov = fov;
      world.camera.updateProjectionMatrix();
    }
  };
  const offSession = world.visibilityState.subscribe((state) => {
    inSession = state !== NON_IMMERSIVE;
    applyScale();
    if (state === NON_IMMERSIVE) fit(); // back from XR: restore the window size
  });
  const offScale = nav.subscribe(applyScale);
  const canvas = world.renderer.domElement;
  nav.reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let loaded: { analysis: EngineAnalysis; template: WorldTemplate; seed: number } | null = null;
  let edits: LayoutEdits = EMPTY_EDITS;
  const noteListeners = new Set<(event: NoteEditEvent) => void>();
  const synth = new NoteSynth();
  const projector = scene.project;
  const scorePlayer = new ScorePlayer(synth, {
    now: () => baseClock?.now() ?? 0,
    isPlaying: () => baseClock?.isPlaying?.() ?? false,
    rate: () => baseClock?.rate?.() ?? 1,
  });
  const editor = new EditController({
    plan: () => basePlan,
    now: () => baseClock?.now() ?? 0,
    hidden: () => layerStore.hidden,
    project: (p) => (projector ? projector(p) : null),
    synth,
    emit: (event) => noteListeners.forEach((l) => l(event)),
  });
  const local = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  // Capture phase: a press on a note belongs to the editor, so the camera does not orbit (requirement 1).
  const onDown = (e: PointerEvent): void => {
    if (e.button === 0 && editor.pointerDown(local(e), e.shiftKey)) {
      e.stopImmediatePropagation();
      canvas.setPointerCapture?.(e.pointerId);
    }
  };
  const onMove = (e: PointerEvent): void => {
    editor.pointerMove(local(e));
    if (editor.capturing) e.stopImmediatePropagation();
  };
  const onUp = (e: PointerEvent): void => {
    if (editor.capturing) e.stopImmediatePropagation();
    editor.pointerUp();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') editor.cancel();
  };
  canvas.addEventListener('pointerdown', onDown, true);
  canvas.addEventListener('pointermove', onMove, true);
  canvas.addEventListener('pointerup', onUp, true);
  canvas.addEventListener('pointercancel', onUp, true);
  globalThis.addEventListener?.('keydown', onKey);
  const detachKeyboard = keyboardPad.attach(window, () => inSession);
  const unbindNav = bindNavigationInput(canvas, nav.input, () => nav.acceptsInput, {
    wheelPerPixel: NAV_WHEEL_ZOOM,
    // Walk mode: hold the right button anytime, or the left one while the song plays (paused, it picks and drags notes).
    lockLook: (button) => nav.mode === 'walk' && (button === 2 || (button === 0 && baseClock?.isPlaying?.() === true)),
  });
  const unbind = (): void => {
    unbindNav();
    detachKeyboard();
    canvas.removeEventListener('pointerdown', onDown, true);
    canvas.removeEventListener('pointermove', onMove, true);
    canvas.removeEventListener('pointerup', onUp, true);
    canvas.removeEventListener('pointercancel', onUp, true);
    globalThis.removeEventListener?.('keydown', onKey);
    editor.setEnabled(false);
    scorePlayer.stop();
    synth.dispose();
  };
  // `touch-action: none` only while exploring, so the cinematic page scrolls as before (requirement 2.4).
  const offTouch = nav.subscribe((state) => {
    canvas.style.touchAction = state.mode !== 'cinematic' ? 'none' : '';
  });

  let basePlan: SpawnPlan | null = null;
  let baseClock: WorldClock | null = null;
  // Walk mode: the plate and the structures that have landed (recomputed twice a second at most).
  const centre = anchorPlacement('immersive');
  let cache: { plan: SpawnPlan; slot: number; circles: readonly Circle[] } | null = null;
  const walkBounds = { cx: centre.x, cz: centre.z, half: plateWidthM('immersive') / 2 };
  nav.configureWalk(walkBounds, () => {
    if (!basePlan || !baseClock) return [];
    setWorldSpan(worldSpan(basePlan.template));
    walkBounds.half = worldWidthM('immersive') / 2;
    const slot = Math.floor(baseClock.now() * 2);
    if (cache?.plan !== basePlan || cache.slot !== slot) {
      const scale = rootScale('immersive', basePlan.template.terrain.size);
      cache = { plan: basePlan, slot, circles: obstaclesAt(basePlan, baseClock.now(), scale, centre) };
    }
    return cache.circles;
  });
  const withFrameHook = (c: WorldClock): WorldClock => ({
    now: () => c.now(),
    isPlaying: c.isPlaying ? () => c.isPlaying!() : undefined,
    rate: c.rate ? () => c.rate!() : undefined,
    onFrame: () => scorePlayer.frame(),
  });
  let override: PaletteOverride | null = null;
  let layout: LayoutMode = DEFAULT_LAYOUT;
  const show = (): void => {
    if (basePlan && baseClock) scene.setScene(applyPaletteOverride(basePlan, override), withFrameHook(baseClock));
  };

  return {
    load({ analysis, template, seed, clock }) {
      if (disposed) return;
      // A color choice belongs to one template: a different template starts from its own colors.
      const newWorld = !basePlan || basePlan.template.id !== template.id;
      if (basePlan && basePlan.template.id !== template.id) override = null;
      loaded = { analysis, template, seed };
      basePlan = buildSpawnPlan(analysis, template, seed, edits, layout);
      baseClock = clock;
      show();
      // A polished world with the photographic sky starts low and far, so the horizon and the dome are in the frame.
      if (newWorld && template.fx.material === 'polished' && weatherStore.settings.realSky && nav.mode === 'cinematic') nav.setPreset('horizon');
    },
    setEdits(next) {
      if (disposed) return;
      edits = next;
      if (!loaded) return;
      basePlan = buildSpawnPlan(loaded.analysis, loaded.template, loaded.seed, edits, layout);
      show();
    },
    setScore(notes) {
      if (disposed) return;
      if (notes === null) {
        scorePlayer.stop();
        return;
      }
      scorePlayer.setScore(notes);
      scorePlayer.start();
    },
    setEditMode(enabled) {
      if (disposed) return;
      editor.setEnabled(enabled);
      scene.setEditRay?.(enabled ? editor : null);
    },
    onNoteEvent(listener) {
      noteListeners.add(listener);
      return () => noteListeners.delete(listener);
    },
    editCommand(command) {
      if (disposed) return;
      if (command.type === 'select') editor.selectRelative(command.direction);
      else if (command.type === 'nudge') editor.nudge(command.steps);
      else if (command.type === 'play') editor.playSelected();
      else editor.cancel();
    },
    setLightLevel(level) {
      if (!disposed) scene.setLightLevel(level);
    },
    activity() {
      return basePlan && baseClock ? activityAt(basePlan, baseClock.now()) : null;
    },
    setLayout(next) {
      if (disposed || next === layout) return;
      layout = next;
      if (!loaded) return;
      basePlan = buildSpawnPlan(loaded.analysis, loaded.template, loaded.seed, edits, layout);
      show();
    },
    setWeather(mode) {
      if (!disposed) weatherStore.set(mode);
    },
    setSky(sky) {
      if (!disposed) weatherStore.patch({ time: sky.time, realSky: sky.realSky });
    },
    setDome(dome) {
      if (disposed) return;
      const was = domeStore.enabled;
      domeStore.set({ enabled: dome.enabled, landscape: dome.landscape });
      if (dome.enabled !== was) nav.setDome(dome.enabled);
    },
    setAuroraSky(enabled) {
      if (!disposed) skyStore.set(enabled);
    },
    setHiddenLayers(hidden) {
      if (!disposed) layerStore.set(hidden);
    },
    setPaletteOverride(next) {
      if (disposed) return;
      override = next;
      show();
    },
    setControls(controls) {
      if (!disposed) scene.setControls(controls);
    },
    setCameraMode(mode) {
      if (!disposed) nav.setMode(mode);
    },
    setViewPreset(id) {
      if (!disposed) nav.setPreset(id);
    },
    resetView() {
      if (!disposed) nav.reset();
    },
    walkMap: () => (disposed ? null : nav.walkMap()),
    placeWalker(x, z) {
      if (!disposed) nav.placeWalker(x, z);
    },
    onNavigationChange: (listener) => nav.subscribe(listener),
    enterVR: () => world.launchXR(),
    exitVR: () => world.exitXR(),
    onSessionChange(listener) {
      // `subscribe` calls the listener at once with the current value, then on every change.
      return world.visibilityState.subscribe((state) => listener(state !== NON_IMMERSIVE));
    },
    async isVRSupported() {
      const xr = deps.xr();
      return xr ? xr.isSessionSupported('immersive-vr').catch(() => false) : false;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unbind();
      offTouch();
      resizeObserver?.disconnect();
      offSession();
      offScale();
      scene.disposeNavigation();
      if (world.session) world.exitXR();
      world.destroy();
      world.renderer.dispose();
      world.renderer.forceContextLoss();
      world.renderer.domElement.remove();
      if (devHooks().__mwWorld === world) delete devHooks().__mwWorld;
    },
  };
}
