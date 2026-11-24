import type { WorldTemplate } from '@/engine/types';

/** Pure palette generation (I4): OKLCH math, harmonious schemes, seeded and deterministic. No `Math.random`. */
export type Palette = WorldTemplate['palette'];
export type PaletteRole = keyof Palette;
export const PALETTE_ROLES: readonly PaletteRole[] = [
  'background',
  'terrain',
  'primary',
  'accent',
  'secondary',
  'staff',
];

export type SchemeKind = 'analogous' | 'complementary' | 'triad' | 'split-complement';
const SCHEMES: readonly SchemeKind[] = ['analogous', 'complementary', 'triad', 'split-complement'];

export interface GenerateOptions {
  /** Background lightness range in OKLCH L (default 0.25–0.45: "not too dark"). */
  backgroundL?: readonly [number, number];
  locked?: Partial<Palette>;
}

type Rgb = [number, number, number];
type Lab = [number, number, number];

// ---------- seeded PRNG ----------

export function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number): () => number {
  let s = a >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A short shareable seed derived from a number, e.g. `4F2A9`. */
export function seedFromNumber(n: number): string {
  return (n >>> 0).toString(16).toUpperCase().slice(-5).padStart(5, '0');
}

// ---------- color math ----------

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255) as Rgb;
}

export function rgbToHex(rgb: Rgb): string {
  const to = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(rgb[0])}${to(rgb[1])}${to(rgb[2])}`;
}

export function rgbToOklab(rgb: Rgb): Lab {
  const [r, g, b] = rgb.map(toLinear) as Rgb;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToLinear([L, a, b]: Lab): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb: Rgb) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** OKLCH (h in degrees) → `#rrggbb`; chroma is reduced until the color fits in sRGB. */
export function oklchToHex(L: number, C: number, h: number): string {
  const rad = (h * Math.PI) / 180;
  let c = C;
  for (let i = 0; i < 24; i++) {
    const lin = oklabToLinear([L, c * Math.cos(rad), c * Math.sin(rad)]);
    if (inGamut(lin) || c < 1e-4) return rgbToHex(lin.map(fromLinear) as Rgb);
    c *= 0.9;
  }
  return rgbToHex(oklabToLinear([L, 0, 0]).map(fromLinear) as Rgb);
}

export function hexToOklch(hex: string): { L: number; C: number; h: number } {
  const [L, a, b] = rgbToOklab(hexToRgb(hex));
  return { L, C: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
}

/** WCAG relative luminance of a `#rrggbb` color. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Perceptual distance in OKLab, scaled by 100 (ΔE ≈ 12 is clearly different). */
export function deltaE(a: string, b: string): number {
  const x = rgbToOklab(hexToRgb(a));
  const y = rgbToOklab(hexToRgb(b));
  return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

// ---------- constraints ----------

export const MIN_STAFF_LUMINANCE_DIFF = 0.2;
export const MIN_LABEL_CONTRAST = 4.5;
export const MIN_ROLE_DELTA_E = 12;

export function isAcceptable(palette: Palette): boolean {
  if (Math.abs(relativeLuminance(palette.staff) - relativeLuminance(palette.background)) < MIN_STAFF_LUMINANCE_DIFF)
    return false;
  if (contrastRatio(palette.staff, palette.background) < MIN_LABEL_CONTRAST) return false;
  for (let i = 0; i < PALETTE_ROLES.length; i++) {
    for (let j = i + 1; j < PALETTE_ROLES.length; j++) {
      if (deltaE(palette[PALETTE_ROLES[i]!], palette[PALETTE_ROLES[j]!]) < MIN_ROLE_DELTA_E) return false;
    }
  }
  return true;
}

// ---------- generation ----------

function hues(kind: SchemeKind, base: number, rng: () => number): [number, number, number] {
  const jitter = () => (rng() - 0.5) * 12;
  switch (kind) {
    case 'analogous':
      return [base, base + 30 + jitter(), base + 60 + jitter()];
    case 'complementary':
      return [base, base + 180 + jitter(), base + 30 + jitter()];
    case 'triad':
      return [base, base + 120 + jitter(), base + 240 + jitter()];
    case 'split-complement':
      return [base, base + 150 + jitter(), base + 210 + jitter()];
  }
}

function attempt(rng: () => number, options: GenerateOptions): Palette {
  const [lo, hi] = options.backgroundL ?? [0.25, 0.45];
  const kind = SCHEMES[Math.floor(rng() * SCHEMES.length)]!;
  const base = rng() * 360;
  const [h1, h2, h3] = hues(kind, base, rng);
  const chroma = () => 0.08 + rng() * 0.14; // saturation 0.08–0.22
  const bgL = lo + rng() * (hi - lo);
  return {
    background: oklchToHex(bgL, 0.08 + rng() * 0.04, base),
    terrain: oklchToHex(Math.min(0.62, bgL + 0.14), 0.08 + rng() * 0.05, h1),
    primary: oklchToHex(0.68 + rng() * 0.08, Math.max(0.14, chroma()), h1),
    accent: oklchToHex(0.76 + rng() * 0.08, Math.max(0.14, chroma()), h2),
    secondary: oklchToHex(0.8 + rng() * 0.08, Math.max(0.12, chroma()), h3),
    staff: oklchToHex(0.95, 0.08, h1),
  };
}

/** Same seed → same palette on every device. Locked roles are kept as given. */
export function generatePalette(seed: string, options: GenerateOptions = {}): Palette {
  const rng = mulberry32(hashSeed(seed));
  let best = attempt(rng, options);
  for (let i = 0; i < 60 && !isAcceptable(lockMerge(best, options.locked)); i++) best = attempt(rng, options);
  return lockMerge(best, options.locked);
}

/** Keep the locked colors of `previous` over a freshly generated palette. */
export function lockMerge(generated: Palette, locked?: Partial<Palette>): Palette {
  return { ...generated, ...(locked ?? {}) };
}

/**
 * Brightness lift: `amount` in [-1, 1] scales OKLCH lightness of background and terrain only; the staff keeps its
 * contrast against the lifted background (the background is capped so the 0.2 luminance gap always holds).
 */
export function liftBrightness(palette: Palette, amount: number): Palette {
  const k = Math.max(-1, Math.min(1, amount));
  const scale = (hex: string, cap: number) => {
    const { L, C, h } = hexToOklch(hex);
    return oklchToHex(Math.min(cap, Math.max(0.05, L * (1 + 0.6 * k))), C, h);
  };
  let background = scale(palette.background, 0.6);
  for (let i = 0; i < 20 && contrastRatio(palette.staff, background) < MIN_LABEL_CONTRAST; i++) {
    const { L, C, h } = hexToOklch(background);
    background = oklchToHex(L * 0.95, C, h);
  }
  return { ...palette, background, terrain: scale(palette.terrain, 0.7) };
}

const NEON_ROLES = ['primary', 'accent', 'secondary', 'staff'] as const;

/**
 * Contrast: `amount` in [-1, 1] widens (+) or narrows (-) the lightness gap between the dark base (background,
 * terrain) and the neon roles. Staff vs background keeps its 4.5:1 label contrast whatever the amount.
 */
export function applyContrast(palette: Palette, amount: number): Palette {
  const k = Math.max(-1, Math.min(1, amount));
  if (k === 0) return palette;
  const shift = (hex: string, delta: number, lo: number, hi: number) => {
    const { L, C, h } = hexToOklch(hex);
    return oklchToHex(Math.min(hi, Math.max(lo, L + delta)), C, h);
  };
  const next: Palette = { ...palette };
  next.background = shift(palette.background, -0.12 * k, 0.08, 0.7);
  next.terrain = shift(palette.terrain, -0.1 * k, 0.1, 0.75);
  for (const role of NEON_ROLES) next[role] = shift(palette[role], 0.1 * k, 0.3, 0.98);
  for (let i = 0; i < 20 && contrastRatio(next.staff, next.background) < MIN_LABEL_CONTRAST; i++) {
    next.background = shift(next.background, -0.03, 0.04, 0.7);
  }
  return next;
}

/** Light level for a brightness in [-1, 1]: multiplies the scene lights, capped for Quest fill rate. */
export function lightLevelFor(brightness: number): number {
  const k = Math.max(-1, Math.min(1, brightness));
  return 1 + 0.4 * k;
}
