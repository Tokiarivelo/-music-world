import { Box3, Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { buildNodePieces, nodeWorldMatrices } from '@/xr/shapes/node-builder';
import { clampNode, type PartNode } from './node-model';

/** Pure maths behind the viewport gizmo: an object-space transform of a part becomes its local fields (spec 12, phase 6). */

const DEG = Math.PI / 180;

export interface WorldPose {
  readonly position: readonly [number, number, number];
  /** Quaternion x, y, z, w. */
  readonly quaternion: readonly [number, number, number, number];
}

/** Where a part stands in the object: its origin and its orientation. `null` for an unknown id. */
export function worldPoseOf(nodes: readonly PartNode[], id: string): WorldPose | null {
  const matrix = nodeWorldMatrices(nodes).get(id);
  if (!matrix) return null;
  const p = new Vector3();
  const q = new Quaternion();
  matrix.decompose(p, q, new Vector3());
  return { position: [p.x, p.y, p.z], quaternion: [q.x, q.y, q.z, q.w] };
}

function parentMatrix(nodes: readonly PartNode[], id: string): Matrix4 {
  const node = nodes.find((n) => n.id === id);
  return (node?.parent ? nodeWorldMatrices(nodes).get(node.parent) : undefined) ?? new Matrix4();
}

const round = (v: number): number => Math.round(v * 1000) / 1000;

/** Puts the part's origin at an object-space point (converted to its parent's frame, clamped to the field bounds). */
export function moveNodeTo(nodes: readonly PartNode[], id: string, position: readonly [number, number, number]): PartNode[] {
  const local = new Vector3(...position).applyMatrix4(parentMatrix(nodes, id).invert());
  return nodes.map((n) =>
    n.id === id
      ? { ...n, position: { x: round(clampNode('px', local.x)), y: round(clampNode('py', local.y)), z: round(clampNode('pz', local.z)) } }
      : n,
  );
}

/** Gives the part an object-space orientation (converted to its parent's frame; Euler order y, x, z like the builder). */
export function rotateNodeTo(nodes: readonly PartNode[], id: string, quaternion: readonly [number, number, number, number]): PartNode[] {
  const parentQ = new Quaternion();
  parentMatrix(nodes, id).decompose(new Vector3(), parentQ, new Vector3());
  const local = parentQ.invert().multiply(new Quaternion(...quaternion).normalize());
  const e = new Euler().setFromQuaternion(local, 'YXZ');
  return nodes.map((n) =>
    n.id === id
      ? { ...n, rotation: { x: round(clampNode('rx', e.x / DEG)), y: round(clampNode('ry', e.y / DEG)), z: round(clampNode('rz', e.z / DEG)) } }
      : n,
  );
}

/** Multiplies the part's size by per-axis factors (the gizmo's scale); results stay inside the size bounds. */
export function scaleNodeBy(nodes: readonly PartNode[], id: string, factor: readonly [number, number, number]): PartNode[] {
  return nodes.map((n) => {
    if (n.id !== id) return n;
    const s = n.size;
    return {
      ...n,
      size: {
        x: round(clampNode('sx', (s?.x ?? 0.5) * factor[0])),
        y: round(clampNode('sy', (s?.y ?? 0.5) * factor[1])),
        z: round(clampNode('sz', (s?.z ?? 0.5) * factor[2])),
      },
    };
  });
}

/** Snaps a value to a grid step (0 or less: no snap). */
export function snapTo(value: number, step: number): number {
  return step > 0 ? Math.round(value / step) * step : value;
}

/** Lowers or raises a part so the lowest point of its shape rests on the floor (`y = 0` of the object). */
export function dropToFloor(nodes: readonly PartNode[], id: string): PartNode[] {
  const piece = buildNodePieces(nodes).find((p) => p.id === id);
  if (!piece) return [...nodes];
  const box = new Box3().setFromBufferAttribute(piece.geometry.getAttribute('position') as never);
  piece.geometry.dispose();
  const pose = worldPoseOf(nodes, id);
  if (!pose || box.isEmpty()) return [...nodes];
  return moveNodeTo(nodes, id, [pose.position[0], pose.position[1] - box.min.y, pose.position[2]]);
}

/** Moves a part onto the vertical axis of the object (x and z of its origin to 0). */
export function centerOnAxis(nodes: readonly PartNode[], id: string): PartNode[] {
  const pose = worldPoseOf(nodes, id);
  return pose ? moveNodeTo(nodes, id, [0, pose.position[1], 0]) : [...nodes];
}
