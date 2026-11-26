import { describe, expect, it } from "vitest";
import { buildNodeGeometries, buildNodePieces, plainMaterial, type PartNode } from "./node-builder";

const node = (extra: Partial<PartNode> & Pick<PartNode, "id">): PartNode =>
  ({
    name: extra.id,
    primitive: "box",
    parent: null,
    hidden: false,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    size: { x: 1, y: 1, z: 1 },
    sides: 8,
    taper: 1,
    material: plainMaterial(),
    bevel: 0,
    profile: [],
    operation: "add",
    ...extra,
  }) as PartNode;

/** Volume of a closed triangle soup by signed tetrahedra (absolute, so the winding side does not matter). */
function volume(positions: ArrayLike<number>): number {
  let v = 0;
  for (let t = 0; t + 8 < positions.length; t += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = Array.from({ length: 9 }, (_, i) => positions[t + i]!);
    v += (ax! * (by! * cz! - bz! * cy!) - ay! * (bx! * cz! - bz! * cx!) + az! * (bx! * cy! - by! * cx!)) / 6;
  }
  return Math.abs(v);
}
const vol = (nodes: PartNode[]) => buildNodeGeometries(nodes).reduce((s, g) => s + volume(g.getAttribute("position").array), 0);
const tris = (nodes: PartNode[]) => buildNodeGeometries(nodes).reduce((s, g) => s + g.getAttribute("position").count / 3, 0);

describe("bevel and extrude", () => {
  it("builds a chamfered box of 44 triangles, smaller than the box and watertight in volume", () => {
    const plain = [node({ id: "a" })];
    const beveled = [node({ id: "a", bevel: 0.1 })];
    expect(tris(beveled)).toBe(44);
    // Cutting the 12 edges (0.1 each) and 8 corners removes 12 * 0.5 * 0.1^2 + corners: volume 1 - 0.06 + ...
    expect(vol(beveled)).toBeLessThan(vol(plain));
    expect(vol(beveled)).toBeGreaterThan(0.9);
  });

  it("extrudes a convex outline: 4n - 4 triangles and area x height volume", () => {
    const square = [{ x: -0.5, z: -0.5 }, { x: 0.5, z: -0.5 }, { x: 0.5, z: 0.5 }, { x: -0.5, z: 0.5 }];
    const a = [node({ id: "a", primitive: "extrude", profile: square, size: { x: 1, y: 2, z: 1 } })];
    expect(tris(a)).toBe(12);
    expect(vol(a)).toBeCloseTo(2, 5);
    const tri = [{ x: 0, z: -0.5 }, { x: 0.5, z: 0.5 }, { x: -0.5, z: 0.5 }];
    expect(tris([node({ id: "b", primitive: "extrude", profile: tri })])).toBe(8);
    expect(vol([node({ id: "b", primitive: "extrude", profile: tri })])).toBeCloseTo(0.5, 5);
  });
});

describe("union and subtract", () => {
  const wall = node({ id: "wall", size: { x: 1, y: 1, z: 1 } });

  it("cuts a box out of the middle: volume drops by the hole, no piece of its own for the cutter", () => {
    const hole = node({ id: "hole", parent: "wall", operation: "subtract", size: { x: 0.4, y: 0.4, z: 0.4 }, position: { x: 0, y: 0.3, z: 0 } });
    const pieces = buildNodePieces([wall, hole]);
    expect(pieces.map((p) => p.id)).toEqual(["wall"]);
    expect(vol([wall, hole])).toBeCloseTo(1 - 0.4 ** 3, 4);
  });

  it("cuts straight through: a 0.4 square tunnel along z", () => {
    const tunnel = node({ id: "t", parent: "wall", operation: "subtract", size: { x: 0.4, y: 0.4, z: 2 }, position: { x: 0, y: 0.3, z: 0 } });
    // The cutter is taller than the wall in z (2 > 1): the tunnel removes 0.4 * 0.4 * 1.
    expect(vol([wall, tunnel])).toBeCloseTo(1 - 0.4 * 0.4 * 1, 4);
  });

  it("two cuts that overlap remove their union, not their sum", () => {
    const a = node({ id: "a", parent: "wall", operation: "subtract", size: { x: 0.4, y: 0.4, z: 0.4 }, position: { x: 0, y: 0.3, z: 0 } });
    const b = node({ id: "b", parent: "wall", operation: "subtract", size: { x: 0.4, y: 0.4, z: 0.4 }, position: { x: 0.2, y: 0.3, z: 0 } });
    expect(vol([wall, a, b])).toBeCloseTo(1 - 0.6 * 0.4 * 0.4, 4);
  });

  it("union drops the hidden faces: the volume is the union of both solids", () => {
    const wing = node({ id: "wing", parent: "wall", operation: "union", size: { x: 1, y: 1, z: 1 }, position: { x: 0.5, y: 0, z: 0 } });
    const pieces = buildNodePieces([wall, wing]);
    expect(pieces.map((p) => p.id)).toEqual(["wall", "wing"]);
    expect(vol([wall, wing])).toBeCloseTo(1.5, 4);
  });

  it("a hidden cutter does nothing and a missing parent is treated as a plain part", () => {
    const hole = node({ id: "hole", parent: "wall", operation: "subtract", hidden: true, size: { x: 0.4, y: 0.4, z: 0.4 } });
    expect(vol([wall, hole])).toBeCloseTo(1, 5);
    const orphan = node({ id: "o", parent: "ghost", operation: "subtract" });
    expect(buildNodePieces([orphan]).map((p) => p.id)).toEqual(["o"]);
  });
});
