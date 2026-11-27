/** 2D hit tests for the viewport's rectangle selection: does a projected triangle touch a rectangle? Pure, no three. */

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

type P = readonly [number, number];

const inRect = (p: P, r: Rect): boolean => p[0] >= r.x && p[0] <= r.x + r.w && p[1] >= r.y && p[1] <= r.y + r.h;

const cross = (o: P, a: P, b: P): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

function inTriangle(p: P, a: P, b: P, c: P): boolean {
  const d1 = cross(a, b, p);
  const d2 = cross(b, c, p);
  const d3 = cross(c, a, p);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

function segmentsCross(a: P, b: P, c: P, d: P): boolean {
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** True when the triangle `a b c` and the rectangle share at least one point (touching counts). */
export function triangleTouchesRect(a: P, b: P, c: P, rect: Rect): boolean {
  if (Math.max(a[0], b[0], c[0]) < rect.x || Math.min(a[0], b[0], c[0]) > rect.x + rect.w) return false;
  if (Math.max(a[1], b[1], c[1]) < rect.y || Math.min(a[1], b[1], c[1]) > rect.y + rect.h) return false;
  if (inRect(a, rect) || inRect(b, rect) || inRect(c, rect)) return true;
  const corners: P[] = [[rect.x, rect.y], [rect.x + rect.w, rect.y], [rect.x + rect.w, rect.y + rect.h], [rect.x, rect.y + rect.h]];
  if (corners.some((p) => inTriangle(p, a, b, c))) return true;
  const edges: [P, P][] = [[a, b], [b, c], [c, a]];
  for (const [p, q] of edges) for (let i = 0; i < 4; i += 1) if (segmentsCross(p, q, corners[i]!, corners[(i + 1) % 4]!)) return true;
  return false;
}
