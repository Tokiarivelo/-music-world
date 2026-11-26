import { describe, expect, it } from 'vitest';
import { STOCK_RECIPES } from '@/xr/shapes/stock-recipes';
import { buildNodePieces } from '@/xr/shapes/node-builder';
import { centerOnAxis, dropToFloor, moveNodeTo, rotateNodeTo, scaleNodeBy, snapTo, worldPoseOf } from './gizmo-math';
import type { PartNode } from './node-model';
import { Box3 } from 'three';

const house = STOCK_RECIPES.find((r) => r.name === 'house')!.nodes as PartNode[];
const child = house.find((n) => n.parent)!;

describe('gizmo-math', () => {
  it('moves a root part to an object-space point and reads it back', () => {
    const root = house.find((n) => !n.parent)!;
    const out = moveNodeTo(house, root.id, [0.2, 0.3, -0.1]);
    expect(worldPoseOf(out, root.id)!.position).toEqual([0.2, 0.3, -0.1]);
  });

  it('keeps a child where the gizmo put it, whatever its parent does', () => {
    const parentId = child.parent!;
    const parentTurned = rotateNodeTo(house, parentId, [0, Math.SQRT1_2, 0, Math.SQRT1_2]);
    const target: [number, number, number] = [0.1, 0.4, 0.2];
    const out = moveNodeTo(parentTurned, child.id, target);
    const got = worldPoseOf(out, child.id)!.position;
    target.forEach((v, i) => expect(got[i]).toBeCloseTo(v, 2));
  });

  it('turns a part to an object-space orientation', () => {
    const q: [number, number, number, number] = [0, Math.SQRT1_2, 0, Math.SQRT1_2]; // 90 degrees around y
    const out = rotateNodeTo(house, child.id, q);
    const got = worldPoseOf(out, child.id)!.quaternion;
    q.forEach((v, i) => expect(Math.abs(got[i]!)).toBeCloseTo(Math.abs(v), 2));
  });

  it('scales the size by a factor and stays inside the bounds', () => {
    const before = child.size!.x;
    expect(scaleNodeBy(house, child.id, [2, 1, 1]).find((n) => n.id === child.id)!.size!.x).toBeCloseTo(Math.min(2, before * 2), 3);
    expect(scaleNodeBy(house, child.id, [100, 100, 100]).find((n) => n.id === child.id)!.size!.y).toBeLessThanOrEqual(2);
    expect(scaleNodeBy(house, child.id, [0, 0, 0]).find((n) => n.id === child.id)!.size!.z).toBeGreaterThanOrEqual(0.02);
  });

  it('does not touch the other parts', () => {
    const out = moveNodeTo(house, child.id, [0, 0.5, 0]);
    expect(out.filter((n, i) => n !== house[i])).toHaveLength(1);
  });

  it('drops a part so its lowest point rests on the floor', () => {
    const lifted = moveNodeTo(house, child.id, [0, 1.2, 0]);
    const out = dropToFloor(lifted, child.id);
    const piece = buildNodePieces(out).find((p) => p.id === child.id)!;
    const box = new Box3().setFromBufferAttribute(piece.geometry.getAttribute('position') as never);
    expect(box.min.y).toBeCloseTo(0, 2);
  });

  it('centres a part on the vertical axis and keeps its height', () => {
    const root = house.find((n) => !n.parent)!;
    const off = moveNodeTo(house, root.id, [0.5, 0.25, 0.4]);
    expect(worldPoseOf(centerOnAxis(off, root.id), root.id)!.position).toEqual([0, 0.25, 0]);
  });

  it('snaps to a step, or not at all', () => {
    expect(snapTo(0.37, 0.25)).toBeCloseTo(0.25);
    expect(snapTo(0.37, 0)).toBe(0.37);
  });
});
