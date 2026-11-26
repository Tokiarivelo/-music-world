import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildRecipeGeometry, type ShapeRecipe } from "./recipe-builder";
import { recipeToNodes } from "./recipe-nodes";
import { triangleCount } from "./builtin-shapes";

const FIXTURES = (
  JSON.parse(
    readFileSync(
      join(process.cwd(), "../api/tests/fixtures/shape-recipes.json"),
      "utf8",
    ),
  ) as {
    name: string;
    recipe: ShapeRecipe;
  }[]
).filter((c) => (c.recipe.parts ?? []).length > 0);

describe("recipeToNodes", () => {
  it.each(FIXTURES.map((c) => [c.name, c.recipe] as const))(
    "%s: same bounds and size as the operations",
    (_, recipe) => {
      const migrated = recipeToNodes(recipe)!;
      expect(migrated.parts).toEqual([]);
      const a = buildRecipeGeometry(recipe)!;
      const b = buildRecipeGeometry(migrated)!;
      const spikes = (recipe.parts ?? []).reduce(
        (n, p) =>
          n +
          (p.op === "spike" ? 1 : 0) +
          (p.op === "stack" || p.op === "cluster"
            ? p.of === "spike"
              ? p.op === "stack"
                ? (p.levels ?? 3)
                : (p.count ?? 4)
              : 0
            : 0),
        0,
      );
      expect(triangleCount(b)).toBe(triangleCount(a) + 4 * spikes);
      a.computeBoundingBox();
      b.computeBoundingBox();
      for (const k of ["x", "y", "z"] as const) {
        expect(b.boundingBox!.min[k]).toBeCloseTo(a.boundingBox!.min[k], 5);
        expect(b.boundingBox!.max[k]).toBeCloseTo(a.boundingBox!.max[k], 5);
      }
    },
  );

  it("refuses a tree over the node limit", () => {
    const big = {
      name: "x",
      parts: Array.from({ length: 8 }, () => ({ op: "stack", levels: 8 })),
    } as unknown as ShapeRecipe;
    expect(recipeToNodes(big)).toBeNull();
  });
});
