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
 * `getAxesEnteringLeft/Right`), `InputComponent.{A_Button, X_Button, Squeeze, Thumbstick}`.
 */
import {
  createComponent,
  createSystem,
  InputComponent,
  Types,
  VisibilityState,
  type Entity,
  type StatefulGamepad,
  type World,
} from '@iwsdk/core';
import { Quaternion, Vector3, type Group } from 'three';
import { DIORAMA_POSITION, VR_MIN_HEAD_HEIGHT_M } from '../constants';
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
  /** Template picker (07-xr-mode requirement 4.3). */
  templates: readonly TemplateChoice[];
  templateId: string;
  selectTemplate(id: string): void;
}

export interface TemplateChoice {
  id: string;
  name: string;
}

/** Mutable state shared by the XR systems (one per world). */
export interface XRRig {
  /** Unscaled diorama transform: position + yaw. */
  readonly anchor: Group;
  /** Set to place the plate again in front of the head on the next frame. */
  recenterRequested: boolean;
  /** True once the plate has been placed for the current session. */
  placed: boolean;
  /** Player commands; null until the player is ready. */
  controls: WorldControls | null;
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
      if (rig.placed && !rig.recenterRequested) continue;
      const head = this.player.head;
      head.getWorldPosition(this.headPosition);
      if (this.headPosition.y < VR_MIN_HEAD_HEIGHT_M) continue; // viewer pose not tracked yet
      head.getWorldQuaternion(this.headQuaternion);
      const pose = tabletopPose(this.headPosition, yawFromQuaternion(this.headQuaternion));
      rig.anchor.position.set(pose.position.x, pose.position.y, pose.position.z);
      rig.anchor.rotation.set(0, pose.yaw, 0);
      rig.placed = true;
      rig.recenterRequested = false;
    }
  }
}

export function restoreDesktopPlacement(rig: XRRig): void {
  rig.anchor.position.set(DIORAMA_POSITION.x, DIORAMA_POSITION.y, DIORAMA_POSITION.z);
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

/** Controller bindings (07-xr-mode requirement 3): A/X play-pause, thumbstick seek, squeeze recenter. */
export class XRControlSystem extends createSystem({ rigs: { required: [XRRigComponent] } }) {
  private readonly pads: [PadEdges, PadEdges] = [
    { face: false, squeeze: false, stickLeft: false, stickRight: false },
    { face: false, squeeze: false, stickLeft: false, stickRight: false },
  ];

  update(): void {
    if (!isImmersive(this.world)) return;
    const { left, right } = this.input.xr.gamepads;
    const leftEdge = readPad(left, InputComponent.X_Button, this.pads[0]);
    const rightEdge = readPad(right, InputComponent.A_Button, this.pads[1]);
    if (!leftEdge && !rightEdge) return; // steady state: no allocation
    for (const entity of this.queries.rigs.entities) {
      const rig = readRig(entity);
      if (rig) for (const command of commandsFromPads(this.pads)) runCommand(rig, command);
    }
  }
}

/** Registers the XR systems and the rig on the diorama anchor entity. */
export function installXRSystems(world: World, anchorEntity: Entity, anchor: Group): XRRig {
  const rig: XRRig = { anchor, recenterRequested: false, placed: false, controls: null };
  world.registerComponent(XRRigComponent);
  world.registerSystem(XRPlacementSystem);
  world.registerSystem(XRControlSystem);
  anchorEntity.addComponent(XRRigComponent, { rig });
  return rig;
}
