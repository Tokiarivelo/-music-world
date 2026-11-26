/**
 * Boolean union and subtract of the solids of a part tree, with `three-bvh-csg` (MIT, with `three-mesh-bvh`).
 *
 * Pure and deterministic for the same input. Each solid is a closed, non-indexed triangle soup in object space. Triangles
 * keep a material group (the result numbers the solids in chain order) so the look of a part stays on its own faces:
 * what remains of the base and the walls of every cut keep the base's look, the visible faces of a union keep the look of
 * the part that was added.
 */
import { BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute } from "three";
import { ADDITION, Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";

export interface BooleanOperand {
  readonly operation: "union" | "subtract";
  readonly positions: ArrayLike<number>;
}

function brushOf(positions: ArrayLike<number>, materialIndex: number): Brush {
  const count = Math.floor(positions.length / 3);
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(Float32Array.from(positions as ArrayLike<number>), 3));
  g.setIndex(new Uint32BufferAttribute(Uint32Array.from({ length: count }, (_, i) => i), 1));
  g.clearGroups();
  g.addGroup(0, count, materialIndex);
  const brush = new Brush(g);
  brush.updateMatrixWorld(true);
  return brush;
}

/**
 * Combines a base solid with its union / subtract children, in order. Returns the triangles that keep the base's look
 * (`base`) and, per operand, the triangles that keep that operand's look (`children`, empty for a subtract).
 */
export function combine(
  basePositions: ArrayLike<number>,
  operands: readonly BooleanOperand[],
): { base: number[]; children: number[][] } {
  const evaluator = new Evaluator();
  evaluator.attributes = ["position"];
  evaluator.useGroups = true;
  let result = brushOf(basePositions, 0);
  operands.forEach((op, k) => {
    const next = brushOf(op.positions, op.operation === "union" ? k + 1 : 0);
    result = evaluator.evaluate(result, next, op.operation === "union" ? ADDITION : SUBTRACTION);
    result.updateMatrixWorld(true);
  });
  const g = result.geometry;
  const pos = g.getAttribute("position");
  const index = g.getIndex();
  const base: number[] = [];
  const children: number[][] = operands.map(() => []);
  const groups = g.groups.length > 0 ? g.groups : [{ start: 0, count: index ? index.count : pos.count, materialIndex: 0 }];
  for (const { start, count, materialIndex } of groups) {
    // With groups, the result numbers the solids in chain order: 0 is the base, k + 1 is operand k. A cutter's faces are
    // the walls of the hole: they keep the base's look.
    const owner = materialIndex === 0 ? undefined : operands[(materialIndex ?? 1) - 1];
    const into = !owner || owner.operation === "subtract" ? base : children[(materialIndex ?? 1) - 1];
    if (!into) continue;
    for (let i = start; i < start + count; i++) {
      const v = index ? index.getX(i) : i;
      into.push(pos.getX(v), pos.getY(v), pos.getZ(v));
    }
  }
  result.geometry.dispose();
  return { base, children };
}
