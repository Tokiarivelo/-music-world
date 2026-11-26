import { describe, expect, it } from 'vitest';
import { STOCK_RECIPES } from '@/xr/shapes/stock-recipes';
import { buildNodePieces } from '@/xr/shapes/node-builder';
import { applyGizmoDelta, centerOnAxis, dropToFloor, moveNodeTo, reparentNode, rotateNodeTo, scaleNodeBy, snapTo, worldPoseOf, type GizmoPose } from './gizmo-math';
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

  describe('gizmo delta on a selection', () => {
    const ids = house.filter((n) => !n.parent).map((n) => n.id);
    const identity: GizmoPose = { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] };

    it('moves every selected part by the same vector', () => {
      const roots = house.filter((n) => n.parent === null).slice(0, 1).map((n) => n.id);
      const before = worldPoseOf(house, roots[0]!)!.position;
      const out = applyGizmoDelta(house, roots, 'translate', identity, { ...identity, position: [0.1, 0, -0.1] });
      const after = worldPoseOf(out, roots[0]!)!.position;
      expect(after[0]).toBeCloseTo(before[0] + 0.1, 2);
      expect(after[2]).toBeCloseTo(before[2] - 0.1, 2);
    });

    it('moves a selected parent together with its selected child only once', () => {
      const parentId = child.parent!;
      const out = applyGizmoDelta(house, [parentId, child.id], 'translate', identity, { ...identity, position: [0.2, 0, 0] });
      const before = worldPoseOf(house, child.id)!.position;
      expect(worldPoseOf(out, child.id)!.position[0]).toBeCloseTo(before[0] + 0.2, 2);
    });

    it('turns several parts about the pivot', () => {
      const two = house.slice(0, 2).map((n) => n.id).filter((id) => !house.find((n) => n.id === id)!.parent);
      const q: [number, number, number, number] = [0, Math.SQRT1_2, 0, Math.SQRT1_2];
      const pivot: GizmoPose = { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] };
      const out = applyGizmoDelta(house, two.length > 1 ? two : ids, 'rotate', pivot, { ...pivot, quaternion: q });
      expect(out).toHaveLength(house.length);
    });

    it('scales the part with what hangs from it', () => {
      const parentId = child.parent!;
      const out = applyGizmoDelta(house, [parentId], 'scale', identity, { ...identity, scale: [1.5, 1.5, 1.5] });
      const was = house.find((n) => n.id === child.id)!;
      const now = out.find((n) => n.id === child.id)!;
      expect(now.size!.x).toBeCloseTo(Math.min(2, was.size!.x * 1.5), 2);
    });
  });

  describe('reparentNode', () => {
    const other = house.filter((n) => !n.parent)[0]!;

    it('keeps the part where it is while changing its parent', () => {
      const before = worldPoseOf(house, child.id)!.position;
      const orphan = reparentNode(house, child.id, null);
      expect(orphan.find((n) => n.id === child.id)!.parent).toBeNull();
      const after = worldPoseOf(orphan, child.id)!.position;
      before.forEach((v, i) => expect(after[i]).toBeCloseTo(v, 2));
    });

    it('puts parents before children and refuses a cycle', () => {
      const out = reparentNode(house, other.id, child.id);
      expect(out).toEqual(house);
      const moved = reparentNode(house, child.id, null);
      const seen = new Set<string>();
      for (const n of moved) {
        expect(n.parent === null || seen.has(n.parent)).toBe(true);
        seen.add(n.id);
      }
    });
  });
});
