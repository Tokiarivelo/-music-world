import { describe, expect, it } from "vitest";
import { TemplateSchema } from "@/templates/generated";
import { NEON_NOCTURNE } from "@/templates/default";
import { triangleCount } from "./builtin-shapes";
import { buildRecipeGeometry } from "./recipe-builder";
import { STOCK_RECIPES } from "./stock-recipes";
import { SHAPE_TRIANGLE_BUDGET } from "../constants";

describe("stock recipes", () => {
  it.each(STOCK_RECIPES.map((r) => [r.name, r] as const))(
    "%s builds within the budget on the unit footprint",
    (_, recipe) => {
      const g = buildRecipeGeometry(recipe)!;
      expect(g).not.toBeNull();
      expect(triangleCount(g)).toBeLessThanOrEqual(SHAPE_TRIANGLE_BUDGET);
      g.computeBoundingBox();
      const { min, max } = g.boundingBox!;
      expect(min.y).toBeCloseTo(0, 6);
      expect(max.y).toBeCloseTo(1, 6);
      for (const v of [min.x, min.z, max.x, max.z])
        expect(Math.abs(v)).toBeLessThanOrEqual(0.5 + 1e-6);
    },
  );

  it("every id is unique per recipe and the whole set is a valid template", () => {
    for (const r of STOCK_RECIPES)
      expect(new Set(r.nodes.map((n) => n.id)).size).toBe(r.nodes.length);
    const parsed = TemplateSchema.safeParse({
      ...NEON_NOCTURNE,
      recipes: [...STOCK_RECIPES],
    });
    expect(parsed.success).toBe(true);
  });
});
