import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { STOCK_RECIPES } from '@/xr/shapes/stock-recipes';
import * as m from './node-model';
import type { PartNode } from './node-model';

const house = STOCK_RECIPES.find((r) => r.name === 'house')!.nodes as PartNode[];

function valid(nodes: readonly PartNode[]): boolean {
  const seen = new Set<string>();
  for (const n of nodes) {
    if (seen.has(n.id) || (n.parent && !seen.has(n.parent))) return false;
    seen.add(n.id);
  }
  return nodes.length <= m.MAX_NODES && nodes.every((n) => m.nodeDepth(nodes, n.id) <= m.MAX_NODE_DEPTH);
}

describe('node-model', () => {
  it('renames, trims and refuses an empty name', () => {
    expect(m.renameNode(house, 'walls', '  Main  ').find((n) => n.id === 'walls')!.name).toBe('Main');
    expect(m.renameNode(house, 'walls', '   ')).toEqual(house);
  });

  it('hides one part without touching the others', () => {
    const out = m.toggleHidden(house, 'roof');
    expect(out.find((n) => n.id === 'roof')!.hidden).toBe(true);
    expect(out.filter((n) => n.hidden)).toHaveLength(1);
    expect(m.toggleHidden(out, 'roof')).toEqual(house);
  });

  it('deletes a part with its children', () => {
    const out = m.deleteNode(house, 'walls');
    expect(out).toHaveLength(0);
    const roof = m.deleteNode(house, 'roof');
    expect(roof.some((n) => n.id === 'roof')).toBe(false);
    expect(valid(roof)).toBe(true);
  });

  it('duplicates a subtree with fresh ids and remapped parents', () => {
    const out = m.duplicateNode(house, 'walls');
    expect(out).toHaveLength(house.length * 2);
    expect(valid(out)).toBe(true);
    const copyRoot = out.find((n) => n.name === 'Walls copy')!;
    expect(copyRoot.id).not.toBe('walls');
    expect(out.filter((n) => n.parent === copyRoot.id).length).toBe(house.filter((n) => n.parent === 'walls').length);
  });

  it('refuses to go over the node or depth limits', () => {
    let nodes: PartNode[] = [];
    for (let i = 0; i < m.MAX_NODES + 5; i += 1) nodes = m.addNode(nodes, 'box', null);
    expect(nodes).toHaveLength(m.MAX_NODES);
    expect(m.duplicateNode(nodes, nodes[0]!.id)).toHaveLength(m.MAX_NODES);
    let chain = m.addNode([], 'box', null);
    for (let i = 0; i < 6; i += 1) chain = m.addNode(chain, 'box', chain[chain.length - 1]!.id);
    expect(chain).toHaveLength(m.MAX_NODE_DEPTH);
    expect(valid(chain)).toBe(true);
  });

  it('adds a child right after its parent subtree', () => {
    const out = m.addNode(house, 'sphere', 'walls');
    expect(out[out.length - 1]!.parent).toBe('walls');
    expect(valid(out)).toBe(true);
  });

  it('swaps the primitive', () => {
    expect(m.setNodePrimitive(house, 'roof', 'cone').find((n) => n.id === 'roof')!.primitive).toBe('cone');
  });

  it('clamps numbers into the schema bounds', () => {
    fc.assert(
      fc.property(fc.constantFrom(...(Object.keys(m.NODE_BOUNDS) as m.NodeField[])), fc.double({ noNaN: false }), (field, value) => {
        const out = m.setNodeNumber(house, 'walls', field, value).find((n) => n.id === 'walls')!;
        const v = m.readNodeField(out, field);
        expect(v).toBeGreaterThanOrEqual(m.NODE_BOUNDS[field].min);
        expect(v).toBeLessThanOrEqual(m.NODE_BOUNDS[field].max);
      }),
    );
  });

  it('never mutates its input', () => {
    const before = JSON.stringify(house);
    m.duplicateNode(house, 'walls'); m.deleteNode(house, 'roof'); m.setNodeNumber(house, 'walls', 'sx', 1); m.addNode(house, 'box', null);
    expect(JSON.stringify(house)).toBe(before);
  });

  it('mirrors a subtree across an axis with fresh ids', () => {
    const base = m.addNode(house, 'box', null);
    const moved = m.setNodeNumber(m.setNodeNumber(base, 'box_1', 'px', 0.4), 'box_1', 'ry', 30);
    const out = m.mirrorNode(moved, 'box_1', 'x');
    const copy = out.find((n) => n.name === 'Box mirror')!;
    expect(copy.position?.x).toBeCloseTo(-0.4);
    expect(copy.rotation?.y).toBe(-30);
    expect(out).toHaveLength(moved.length + 1);
    expect(valid(out)).toBe(true);
  });

  it('arrays a part and keeps the tree valid', () => {
    const out = m.arrayNode(house, 'roof', 'x', 3, 0.2);
    expect(out).toHaveLength(house.length + 2 * m.subtreeIds(house, 'roof').size);
    expect(out.find((n) => n.name === 'Roof 3')!.position?.x).toBeCloseTo((house.find((n) => n.id === 'roof')!.position?.x ?? 0) + 0.4);
    expect(valid(out)).toBe(true);
  });

  it('refuses a mirror or array that would exceed the node limit', () => {
    let full = [...house];
    while (full.length < m.MAX_NODES) full = m.addNode(full, 'box', null);
    expect(m.mirrorNode(full, 'box_1', 'x')).toEqual(full);
    expect(m.arrayNode(full, 'box_1', 'x', 4, 0.1)).toEqual(full);
  });

  it('nudges within the bounds', () => {
    const out = m.nudgeNode(house, 'roof', 'y', 100);
    expect(out.find((n) => n.id === 'roof')!.position?.y).toBe(2);
  });

  it('sets the look of one part: hex clears the role, roles clear the hex, numbers clamp', () => {
    const a = m.setNodeMaterial(house, 'roof', { color: '#FF8800' });
    expect(a.find((n) => n.id === 'roof')!.material.color).toBe('#ff8800');
    const b = m.setNodeMaterial(a, 'roof', { colorRole: 'accent', emissive: 3, roughness: -1 });
    const roof = b.find((n) => n.id === 'roof')!.material;
    expect(roof).toMatchObject({ color: null, colorRole: 'accent', emissive: 1, roughness: 0 });
    expect(m.setNodeMaterial(b, 'roof', { color: 'nope' }).find((n) => n.id === 'roof')!.material.color).toBeNull();
    expect(b.find((n) => n.id === 'walls')!.material).toEqual(house.find((n) => n.id === 'walls')!.material);
  });

  it('sets a texture and ignores an unknown one', () => {
    const a = m.setNodeMaterial(house, 'roof', { texture: 'brick' });
    expect(a.find((n) => n.id === 'roof')!.material.texture).toBe('brick');
    const b = m.setNodeMaterial(a, 'roof', { texture: 'lava' as never });
    expect(b.find((n) => n.id === 'roof')!.material.texture).toBe('brick');
  });

  it('clamps the bevel and gives an extrusion a default outline', () => {
    expect(m.setNodeBevel(house, 'walls', 9).find((n) => n.id === 'walls')!.bevel).toBe(0.45);
    expect(m.setNodeBevel(house, 'walls', -1).find((n) => n.id === 'walls')!.bevel).toBe(0);
    const swapped = m.setNodePrimitive(house, 'walls', 'extrude').find((n) => n.id === 'walls')!;
    expect(swapped.profile).toHaveLength(4);
    expect(m.isConvexProfile(swapped.profile)).toBe(true);
    expect(m.addNode(house, 'extrude', null).at(-1)!.profile).toHaveLength(4);
  });

  it('edits an outline within its limits and tells convex from not convex', () => {
    let nodes = m.addNode(house, 'extrude', null);
    const id = nodes.at(-1)!.id;
    nodes = m.setProfile(nodes, id, m.regularProfile(6));
    expect(nodes.find((n) => n.id === id)!.profile).toHaveLength(6);
    for (let i = 0; i < 10; i += 1) nodes = m.addProfilePoint(nodes, id, 0);
    expect(nodes.find((n) => n.id === id)!.profile).toHaveLength(m.MAX_PROFILE_POINTS);
    for (let i = 0; i < 20; i += 1) nodes = m.removeProfilePoint(nodes, id, 0);
    expect(nodes.find((n) => n.id === id)!.profile).toHaveLength(m.MIN_PROFILE_POINTS);
    nodes = m.setProfilePoint(nodes, id, 0, 'x', 5);
    expect(nodes.find((n) => n.id === id)!.profile[0]!.x).toBe(0.5);
    const dent = [{ x: -0.5, z: -0.5 }, { x: 0, z: 0 }, { x: 0.5, z: -0.5 }, { x: 0, z: 0.5 }];
    expect(m.isConvexProfile(dent)).toBe(false);
  });

  it('combines a part with its parent only when the tree allows it', () => {
    expect(m.canCombine(house, 'walls')).toBe(false); // a root
    expect(m.canCombine(house, 'roof')).toBe(true);
    const cut = m.setNodeOperation(house, 'roof', 'subtract');
    expect(cut.find((n) => n.id === 'roof')!.operation).toBe('subtract');
    expect(m.setNodeOperation(house, 'walls', 'union')).toEqual(house);
    const withKnob = m.addNode(cut, 'box', 'roof');
    const knob = withKnob.find((n) => !cut.some((o) => o.id === n.id))!;
    expect(knob.parent).toBe('roof');
    expect(m.canCombine(withKnob, knob.id)).toBe(false); // its parent is combined
    expect(valid(cut)).toBe(true);
  });
});
