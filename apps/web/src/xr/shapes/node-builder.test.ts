import { describe, expect, it } from "vitest";
import { buildNodeGeometries, plainMaterial, type PartNode } from "./node-builder";
import { buildRecipeGeometry, type ShapeRecipe } from "./recipe-builder";
import { triangleCount } from "./builtin-shapes";

const node = (extra: Partial<PartNode> & Pick<PartNode, "id">): PartNode =>
  ({
    name: extra.id,
    primitive: "box",
    hidden: false,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    size: { x: 1, y: 1, z: 1 },
    sides: 8,
    taper: 1,
    ...extra,
  }) as PartNode;

const bounds = (g: ReturnType<typeof buildNodeGeometries>[number]) => {
  g.computeBoundingBox();
  return g.boundingBox!;
};

describe("node builder", () => {
  it.each([
    ["box", 12],
    ["cylinder", 32],
    ["cone", 16],
    ["sphere", 80],
    ["prism", 32],
    ["gable", 8],
  ] as const)("%s has %i triangles and stands on y = 0", (primitive, tris) => {
    const [g] = buildNodeGeometries([node({ id: "a", primitive })]);
    expect(triangleCount(g!)).toBe(tris);
    const b = bounds(g!);
    expect(b.min.y).toBeCloseTo(0, 6);
    expect(b.max.y).toBeCloseTo(1, 6);
  });

  it("applies size, position and the parent frame, and skips hidden nodes but keeps their children", () => {
    const geoms = buildNodeGeometries([
      node({ id: "p", hidden: true, position: { x: 0.2, y: 0.1, z: 0 } }),
      node({
        id: "c",
        parent: "p",
        position: { x: 0, y: 0.5, z: 0 },
        size: { x: 0.2, y: 0.4, z: 0.2 },
      }),
    ]);
    expect(geoms).toHaveLength(1);
    const b = bounds(geoms[0]!);
    expect(b.min.x).toBeCloseTo(0.1, 6);
    expect(b.max.x).toBeCloseTo(0.3, 6);
    expect(b.min.y).toBeCloseTo(0.6, 6);
    expect(b.max.y).toBeCloseTo(1.0, 6);
  });

  it("rotates a child with its parent", () => {
    const [, child] = buildNodeGeometries([
      node({ id: "p", rotation: { x: 0, y: 90, z: 0 } }),
      node({
        id: "c",
        parent: "p",
        position: { x: 0.5, y: 0, z: 0 },
        size: { x: 0.1, y: 0.1, z: 0.1 },
      }),
    ]);
    const b = bounds(child!);
    expect(b.min.z).toBeCloseTo(-0.55, 5); // +x of the parent turns to -z with a 90° yaw
  });

  it("builds a recipe from nodes only, normalised to height 1", () => {
    const recipe = {
      name: "hut",
      nodes: [node({ id: "w", size: { x: 0.8, y: 0.4, z: 0.8 } })],
      parts: [],
    } as unknown as ShapeRecipe;
    const g = buildRecipeGeometry(recipe)!;
    const b = bounds(g);
    expect(b.max.y - b.min.y).toBeCloseTo(1, 6);
    expect(triangleCount(g)).toBe(12);
  });
});

describe('part look', () => {
  const base = (m: Partial<PartNode['material']>): PartNode => node({ id: 'x', material: { ...plainMaterial(), ...m } });

  it('gives no colour attribute to plain parts', () => {
    const [g] = buildNodeGeometries([base({})]);
    expect(g!.hasAttribute('color')).toBe(false);
  });

  it('tints a part from a hex, a palette role, and boosts a glowing one', () => {
    const [a, b, c] = buildNodeGeometries(
      [base({ color: '#ff0000' }), base({ colorRole: 'accent' }), base({ emissive: 1 })].map((n, i) => ({ ...n, id: `n${i}` })),
      { accent: '#00ff00' },
    );
    expect(a!.getAttribute('color').getX(0)).toBeGreaterThan(0.9);
    expect(a!.getAttribute('color').getY(0)).toBe(0);
    expect(b!.getAttribute('color').getY(0)).toBeGreaterThan(0.9);
    expect(b!.getAttribute('color').getX(0)).toBe(0);
    expect(c!.getAttribute('color').getX(0)).toBeCloseTo(1.6);
  });
});
