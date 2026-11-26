/**
 * XR systems of the music world (07-xr-mode): tabletop placement of the diorama and playback commands from the
 * controllers while an immersive session runs.
 *
 * The systems share one mutable {@link XRRig} stored on an entity (`XRRigComponent`). They never read or write the
 * song time: playback commands go to the player through `rig.controls`, and the world keeps reading `clock.now()`.
 *
 * IWSDK 1.1.0 API checked against the installed typings: `world.visibilityState` (signal of `VisibilityState`,
 * `NonImmersive` outside XR), `world.player.head` (viewer pose under the XR origin), `createSystem`,
 * `createComponent`, `Types.Object`, `this.input.xr.gamepads.{left,right}` (`StatefulGamepad.getButtonDown`,
 * `getAxesEnteringLeft/Right`), `InputComponent.{A_Button, X_Button, Squeeze, Thumbstick}`,
 * `input.xr.isPrimary('hand', side)`, `input.xr.visualAdapters.hand.left.getPinchStrength()` (0 open at 5 cm,
 * 1 at IWSDK's 8 mm select distance), `Hovered` tag.
 */
import {
  createComponent,
  createSystem,
  Hovered,
  InputComponent,
  Types,
  VisibilityState,
  type Entity,
  type StatefulGamepad,
  type World,
} from '@iwsdk/core';
import { Quaternion, Vector3, type Group } from 'three';
import { VR_MIN_HEAD_HEIGHT_M, VR_PANEL_OFFSET, VR_PANEL_TILT_DEG } from '../constants';
import { SNAP_TURN_RAD, SnapTurn, glide, onPlate, turnAround } from '../locomotion';
import { anchorPlacement, scaleStore, worldWidthM, type ScaleMode } from '../scale';
import { PinchGesture } from '../pinch';
import type { LayerId } from '@/engine/layers';
import { keyboardPad, mergeAxis, mergeStick } from '../keyboard-pad';
import { VR_SEEK_STEP_SEC } from '../constants';
import { commandsFromPads, type PadEdges, type XRCommand } from '../xr-input-map';
import { tabletopPose, yawFromQuaternion } from '../xr-placement';

/**
 * Playback commands of the world, implemented by the player (`useSongPlayer`): the same functions as the 2D player
 * bar, so there is one `AudioPlayer` and one clock (07-xr-mode requirement 3.4).
 */
export interface WorldControls {
  toggle(): void;
  seekBy(deltaSec: number): void;
  seek(sec: number): void;
  isPlaying(): boolean;
  /** Song duration in seconds (0 until decoded). */
  duration(): number;
  /** Shown in the spatial panel. */
  title: string;
  /** Resolved panel texts in the current language (the engine stays framework-free); English when absent. */
  labels?: PanelLabels;
  /** Template picker (07-xr-mode requirement 4.3). */
  templates: readonly TemplateChoice[];
  templateId: string;
  selectTemplate(id: string): void;
}

/** Texts of the spatial panel's fixed buttons (I3 requirement 8). */
export interface PanelLabels {
  restart: string;
  play: string;
  pause: string;
  template: string;
  recenter: string;
  exit: string;
  /** Heading of the layers rows and the short name of each layer chip. */
  layers: string;
  layerNames: Readonly<Record<LayerId, string>>;
}

export const DEFAULT_PANEL_LABELS: PanelLabels = {
  restart: 'Restart',
  play: 'Play',
  pause: 'Pause',
  template: 'Template',
  recenter: 'Recenter',
  layers: 'Layers',
  layerNames: {
    drums: 'Drums',
    bass: 'Bass',
    vocals: 'Vocals',
    other: 'Other',
    chords: 'Chords',
    lyrics: 'Lyrics',
    fx: 'Effects',
    staff: 'Staff',
  },
  exit: 'Exit VR',
};

export interface TemplateChoice {
  id: string;
  name: string;
}

/** Mutable state shared by the XR systems (one per world). */
/** What the right-hand ray drives: the note editor, with world-space rays (the host converts to the scene's space). */
export interface EditRayTarget {
  rayDown(ray: { origin: { x: number; y: number; z: number }; dir: { x: number; y: number; z: number } }): boolean;
  rayMove(ray: { origin: { x: number; y: number; z: number }; dir: { x: number; y: number; z: number } }): void;
  rayUp(): void;
}

export interface XRRig {
  /** Unscaled diorama transform: position + yaw. */
  readonly anchor: Group;
  /** Set to place the plate again in front of the head on the next frame. */
  recenterRequested: boolean;
  /** True once the plate has been placed for the current session. */
  placed: boolean;
  /** Scale mode the plate was placed for: a change places it again. */
  placedScale: ScaleMode;
  /** Player commands; null until the player is ready. */
  controls: WorldControls | null;
  /** Note editor driven by the right controller's ray and trigger (I9); null while editing is off. */
  editRay?: EditRayTarget | null;
  /** Spatial panel entity (a pinch while it is hovered is a panel click, not a play toggle). */
  panel: Entity | null;
  /** Immersive scale: where the panel hangs in the tracking space (it stays there while the plate moves). */
  panelWorld: Vector3 | null;
}

export const XRRigComponent = createComponent(
  'mw-xr-rig',
  { rig: { type: Types.Object, default: null } },
  'Music World XR rig: diorama anchor and placement state',
);

export function readRig(entity: Entity): XRRig | null {
  return (entity.getValue(XRRigComponent, 'rig') as XRRig | null) ?? null;
}

export function isImmersive(world: Pick<World, 'visibilityState'>): boolean {
  return world.visibilityState.value !== VisibilityState.NonImmersive;
}

/** Places the diorama in front of the head when a session starts or on recenter; restores it when it ends. */
export class XRPlacementSystem extends createSystem({ rigs: { required: [XRRigComponent] } }) {
  private readonly headPosition = new Vector3();
  private readonly headQuaternion = new Quaternion();

  update(): void {
    const immersive = isImmersive(this.world);
    for (const entity of this.queries.rigs.entities) {
      const rig = readRig(entity);
      if (!rig) continue;
      if (!immersive) {
        if (rig.placed) restoreDesktopPlacement(rig);
        continue;
      }
      const mode = scaleStore.mode;
      if (rig.placed && !rig.recenterRequested && rig.placedScale === mode) continue;
      if (mode === 'immersive') {
        // The viewer stands on the plate: it is placed from the tracking origin, not in front of the head.
        const at = anchorPlacement(mode);
        rig.anchor.position.set(at.x, at.y, at.z);
        rig.anchor.rotation.set(0, 0, 0);
        rig.panelWorld = PANEL_WORLD_DEFAULT.clone();
        applyPanelPlacement(rig);
        rig.placed = true;
        rig.placedScale = mode;
        rig.recenterRequested = false;
        continue;
      }
      const head = this.player.head;
      head.getWorldPosition(this.headPosition);
      if (this.headPosition.y < VR_MIN_HEAD_HEIGHT_M) continue; // viewer pose not tracked yet
      head.getWorldQuaternion(this.headQuaternion);
      const pose = tabletopPose(this.headPosition, yawFromQuaternion(this.headQuaternion));
      rig.anchor.position.set(pose.position.x, pose.position.y, pose.position.z);
      rig.anchor.rotation.set(0, pose.yaw, 0);
      rig.panelWorld = null;
      applyPanelPlacement(rig);
      rig.placed = true;
      rig.placedScale = mode;
      rig.recenterRequested = false;
    }
  }
}

const PANEL_WORLD_DEFAULT = new Vector3(0, 1.15, -0.75);
const PANEL_TILT_RAD = (VR_PANEL_TILT_DEG * Math.PI) / 180;
const panelLocal = new Vector3();

/** Keeps the spatial panel where the viewer can reach it: on the plate's side in the diorama, in the room when immersive. */
export function applyPanelPlacement(rig: XRRig): void {
  const object = rig.panel?.object3D;
  if (!object) return;
  object.rotation.order = 'YXZ';
  if (!rig.panelWorld) {
    object.position.set(VR_PANEL_OFFSET.x, VR_PANEL_OFFSET.y, VR_PANEL_OFFSET.z);
    object.rotation.set(-PANEL_TILT_RAD, 0, 0);
    return;
  }
  rig.anchor.updateMatrixWorld(true);
  object.position.copy(rig.anchor.worldToLocal(panelLocal.copy(rig.panelWorld)));
  object.rotation.set(-PANEL_TILT_RAD, -rig.anchor.rotation.y, 0);
}

export function restoreDesktopPlacement(rig: XRRig): void {
  rig.panelWorld = null;
  applyPanelPlacement(rig);
  const at = anchorPlacement(scaleStore.mode);
  rig.anchor.position.set(at.x, at.y, at.z);
  rig.anchor.rotation.set(0, 0, 0);
  rig.placed = false;
  rig.recenterRequested = false;
}

/** Runs one XR command against the rig (playback goes to the player, recenter to the placement system). */
export function runCommand(rig: XRRig, command: XRCommand): void {
  if (command.kind === 'recenter') rig.recenterRequested = true;
  else if (command.kind === 'toggle') rig.controls?.toggle();
  else rig.controls?.seekBy(command.deltaSec);
}

function readPad(pad: StatefulGamepad | undefined, face: InputComponent, out: PadEdges): boolean {
  out.face = !!pad?.getButtonDown(face);
  out.squeeze = !!pad?.getButtonDown(InputComponent.Squeeze);
  out.stickLeft = !!pad?.getAxesEnteringLeft(InputComponent.Thumbstick);
  out.stickRight = !!pad?.getAxesEnteringRight(InputComponent.Thumbstick);
  return out.face || out.squeeze || out.stickLeft || out.stickRight;
}

/**
 * Controller bindings (07-xr-mode requirement 3): A/X play-pause, thumbstick seek, squeeze recenter; and the left-hand
 * pinch (requirement 5): play-pause unless a pointer hovers the spatial panel.
 */
export class XRControlSystem extends createSystem({ rigs: { required: [XRRigComponent] } }) {
  private readonly pinch = new PinchGesture();

  private readonly pads: [PadEdges, PadEdges] = [
    { face: false, squeeze: false, stickLeft: false, stickRight: false },
    { face: false, squeeze: false, stickLeft: false, stickRight: false },
  ];

  update(): void {
    if (!isImmersive(this.world)) {
      keyboardPad.clear();
      this.pinch.reset();
      return;
    }
    this.updatePinch();
    const { left, right } = this.input.xr.gamepads;
    this.runKeyboard();
    const leftEdge = readPad(left, InputComponent.X_Button, this.pads[0]);
    const rightEdge = readPad(right, InputComponent.A_Button, this.pads[1]);
    if (scaleStore.mode === 'immersive') {
      // The sticks move and turn the viewer there (XRLocomotionSystem); seeking stays on the spatial panel.
      for (const pad of this.pads) {
        pad.stickLeft = false;
        pad.stickRight = false;
      }
    }
    if (!leftEdge && !rightEdge) return; // steady state: no allocation
    if (!this.pads.some((p) => p.face || p.squeeze || p.stickLeft || p.stickRight)) return;
    for (const entity of this.queries.rigs.entities) {
      const rig = readRig(entity);
      if (rig) for (const command of commandsFromPads(this.pads)) runCommand(rig, command);
    }
  }

  /** Keyboard twin of the controller buttons (see `keyboard-pad.ts`): play / pause, seek, recenter, scale. */
  private runKeyboard(): void {
    for (const edge of keyboardPad.takeEdges()) {
      if (edge === 'scale') {
        scaleStore.set(scaleStore.mode === 'immersive' ? 'diorama' : 'immersive');
        continue;
      }
      for (const entity of this.queries.rigs.entities) {
        const rig = readRig(entity);
        if (!rig) continue;
        if (edge === 'toggle') runCommand(rig, { kind: 'toggle' });
        else if (edge === 'recenter') runCommand(rig, { kind: 'recenter' });
        else runCommand(rig, { kind: 'seek', deltaSec: edge === 'seekBack' ? -VR_SEEK_STEP_SEC : VR_SEEK_STEP_SEC });
      }
    }
  }

  private updatePinch(): void {
    const xr = this.input.xr;
    const strength = xr.isPrimary('hand', 'left') ? xr.visualAdapters.hand.left.getPinchStrength() : 0;
    if (this.pinch.update(strength) !== 'press') return;
    for (const entity of this.queries.rigs.entities) {
      const rig = readRig(entity);
      if (rig && !rig.panel?.hasComponent(Hovered)) rig.controls?.toggle();
    }
  }
}

const REDUCED_MOTION_STEP_M = 3;
const SCALE_TOGGLE_BUTTON = 5; // B / Y on the xr-standard gamepad mapping
const STICK_X = 2;
const STICK_Y = 3;

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Locomotion in the immersive scale (I7 requirement 2): left stick glides (≤ 2 m/s; reduced motion: 3 m steps), right
 * stick turns in 30° snaps, B / Y switches between the diorama on the table and the world around you. It moves the
 * plate around the head, so the tracked floor stays under the viewer.
 */
export class XRLocomotionSystem extends createSystem({ rigs: { required: [XRRigComponent] } }) {
  private readonly head = new Vector3();
  private readonly headQuaternion = new Quaternion();
  private readonly turn = new SnapTurn();
  private readonly step = new SnapTurn();
  private toggleHeld = false;

  update(delta: number): void {
    if (!isImmersive(this.world)) return;
    const session = this.world.renderer.xr.getSession?.();
    if (!session) return;
    let glideStick = { x: 0, y: 0 };
    let turnX = 0;
    let toggle = false;
    for (const source of session.inputSources) {
      const pad = source.gamepad;
      if (!pad) continue;
      if (source.handedness === 'left') glideStick = { x: pad.axes[STICK_X] ?? 0, y: pad.axes[STICK_Y] ?? 0 };
      if (source.handedness === 'right') {
        turnX = pad.axes[STICK_X] ?? 0;
        toggle = !!pad.buttons[SCALE_TOGGLE_BUTTON]?.pressed;
      }
    }
    glideStick = mergeStick(glideStick, keyboardPad.stick());
    turnX = mergeAxis(turnX, keyboardPad.turn());
    if (toggle && !this.toggleHeld) scaleStore.set(scaleStore.mode === 'immersive' ? 'diorama' : 'immersive');
    this.toggleHeld = toggle;
    if (scaleStore.mode !== 'immersive') return;
    const reduced = prefersReducedMotion();
    const snap = this.turn.update(turnX);
    const stepDir = reduced ? this.step.update(glideStick.y) : 0;
    for (const entity of this.queries.rigs.entities) {
      const rig = readRig(entity);
      if (!rig?.placed) continue;
      this.world.player.head.getWorldPosition(this.head);
      this.world.player.head.getWorldQuaternion(this.headQuaternion);
      const yaw = yawFromQuaternion(this.headQuaternion);
      const a = rig.anchor;
      let pose = { x: a.position.x, z: a.position.z, yaw: a.rotation.y };
      if (snap !== 0) pose = turnAround(pose, this.head, -snap * SNAP_TURN_RAD);
      const move = reduced
        ? { dx: -Math.sin(yaw) * -stepDir * REDUCED_MOTION_STEP_M, dz: -Math.cos(yaw) * -stepDir * REDUCED_MOTION_STEP_M }
        : glide(glideStick, yaw, delta);
      // The viewer goes one way, so the plate goes the other.
      const next = { ...pose, x: pose.x - move.dx, z: pose.z - move.dz };
      if (onPlate(next, this.head, worldWidthM('immersive') / 2)) pose = next;
      a.position.x = pose.x;
      a.position.z = pose.z;
      a.rotation.y = pose.yaw;
      applyPanelPlacement(rig);
    }
  }
}

const rayPos = new Vector3();
const rayQuat = new Quaternion();
const rayFwd = new Vector3();

/** Right controller ray + trigger (select) drive note picking and dragging while the editor is on (I9 task 8). */
export class XREditRaySystem extends createSystem({ rigs: { required: [XRRigComponent] } }) {
  private down = false;

  update(): void {
    let rig: XRRig | null = null;
    for (const entity of this.queries.rigs.entities) rig = readRig(entity) ?? rig;
    const target = rig?.editRay;
    if (!rig || !target || !isImmersive(this.world)) {
      if (this.down) target?.rayUp();
      this.down = false;
      return;
    }
    const space = this.player.raySpaces.right;
    space.getWorldPosition(rayPos);
    space.getWorldQuaternion(rayQuat);
    rayFwd.set(0, 0, -1).applyQuaternion(rayQuat);
    const ray = { origin: rayPos, dir: rayFwd };
    const pad = this.input.xr.gamepads.right;
    const trigger = !!pad?.getButtonPressed(InputComponent.Trigger);
    if (trigger && !this.down) this.down = target.rayDown(ray);
    else if (this.down && !trigger) {
      target.rayUp();
      this.down = false;
    } else target.rayMove(ray);
  }
}

/** Registers the XR systems and the rig on the diorama anchor entity. */
export function installXRSystems(world: World, anchorEntity: Entity, anchor: Group): XRRig {
  const rig: XRRig = { anchor, recenterRequested: false, placed: false, placedScale: 'diorama', controls: null, panel: null, panelWorld: null };
  world.registerComponent(XRRigComponent);
  world.registerSystem(XRPlacementSystem);
  world.registerSystem(XRControlSystem);
  world.registerSystem(XRLocomotionSystem);
  world.registerSystem(XREditRaySystem);
  anchorEntity.addComponent(XRRigComponent, { rig });
  return rig;
}
