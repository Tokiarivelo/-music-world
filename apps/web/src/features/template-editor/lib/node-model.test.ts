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
});
