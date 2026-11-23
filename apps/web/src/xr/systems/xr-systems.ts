/**
 * XR systems of the music world (07-xr-mode): tabletop placement of the diorama while an immersive session runs.
 *
 * The systems share one mutable {@link XRRig} stored on an entity (`XRRigComponent`). They never read or write the
 * song time: playback commands go to the player through `rig.controls`, and the world keeps reading `clock.now()`.
 *
 * IWSDK 1.1.0 API checked against the installed typings: `world.visibilityState` (signal of `VisibilityState`,
 * `NonImmersive` outside XR), `world.player.head` (viewer pose under the XR origin), `createSystem`,
 * `createComponent`, `Types.Object`.
 */
import { createComponent, createSystem, Types, VisibilityState, type Entity, type World } from '@iwsdk/core';
import { Quaternion, Vector3, type Group } from 'three';
import { DIORAMA_POSITION, VR_MIN_HEAD_HEIGHT_M } from '../constants';
import { tabletopPose, yawFromQuaternion } from '../xr-placement';

/** Mutable state shared by the XR systems (one per world). */
export interface XRRig {
  /** Unscaled diorama transform: position + yaw. */
  readonly anchor: Group;
  /** Set to place the plate again in front of the head on the next frame. */
  recenterRequested: boolean;
  /** True once the plate has been placed for the current session. */
  placed: boolean;
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

/** Registers the XR systems and the rig on the diorama anchor entity. */
export function installXRSystems(world: World, anchorEntity: Entity, anchor: Group): XRRig {
  const rig: XRRig = { anchor, recenterRequested: false, placed: false };
  world.registerComponent(XRRigComponent);
  world.registerSystem(XRPlacementSystem);
  anchorEntity.addComponent(XRRigComponent, { rig });
  return rig;
}
