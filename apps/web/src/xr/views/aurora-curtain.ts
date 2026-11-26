/**
 * Aurora curtain (I6 requirement 1): one additive ribbon hanging along the staff path, bright at its lower edge and
 * fading into faint rays upward, undulating slowly. One draw call, about 1.2 k triangles, no texture. The shader is
 * cheap (two sines per vertex, a few per pixel, no noise loops); time is the song time handed in by the view, so a
 * pause freezes it and a seek gives the same picture.
 */
import { AdditiveBlending, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Mesh, ShaderMaterial, Vector3 } from 'three';
import { staffPoint, type StaffPath } from '@/engine/staff';

export const CURTAIN_COLUMNS = 96;
export const CURTAIN_ROWS = 6;
/** Number of triangles of the curtain (checked by the budget test). */
export const CURTAIN_TRIANGLES = CURTAIN_COLUMNS * CURTAIN_ROWS * 2;

/** Notes that light a ribbon at once (the nearest to the playhead). */
export const NOTE_LIGHTS = 20;

const VERTEX = /* glsl */ `
attribute vec2 aGrid; // x: along the staff (0..1), y: up the curtain (0..1)
attribute vec2 aNormal; // horizontal normal of the staff path
uniform float uTime;
uniform float uAmplitude;
varying vec2 vGrid;
void main() {
  vGrid = aGrid;
  float wave = sin(aGrid.x * 9.0 + uTime * 0.35 + aGrid.y * 1.7) + 0.5 * sin(aGrid.x * 21.0 - uTime * 0.23);
  vec3 p = position;
  p.xz += aNormal * wave * uAmplitude * aGrid.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform float uTime;
uniform float uGlow;
uniform float uSky;
uniform float uBands;
uniform vec3 uNotes[${NOTE_LIGHTS}]; // x: along the curtain (0..1), y: strength, z: height up the curtain (0..1), or -1 for a column at the foot
varying vec2 vGrid;
void main() {
  float shift = 0.5 + 0.5 * sin(vGrid.x * 3.0 + uTime * 0.12);
  vec3 col = mix(mix(uColorA, uColorB, vGrid.x), uColorC, shift * vGrid.y);
  // Real aurora (reference photos): green glow low, violet and magenta far up the rays.
  col = mix(col, mix(uColorA, uColorC, smoothstep(0.3, 1.0, vGrid.y)), uSky);
  float rays = 0.55 + 0.45 * sin(vGrid.x * 160.0 + sin(vGrid.x * 23.0 + uTime * 0.4) * 3.0);
  float fade = mix(pow(1.0 - vGrid.y, 1.6), pow(1.0 - vGrid.y, 1.1) * smoothstep(0.0, 0.08, vGrid.y), uSky); // sky: bright band above a soft lower edge
  float edge = smoothstep(0.0, 0.04, vGrid.x) * smoothstep(1.0, 0.96, vGrid.x);
  // Full-circle curtains: drifting patches of light with dark gaps between them, like the real sky.
  float lightPatch = smoothstep(0.1, 0.8, 0.5 + 0.28 * sin(vGrid.x * 6.2831 * uBands + uTime * 0.05) + 0.22 * sin(vGrid.x * 6.2831 * uBands * 2.3 - uTime * 0.03 + 1.7));
  float coverage = uBands > 0.5 ? lightPatch : edge;
  float alpha = fade * mix(1.0, rays, vGrid.y) * coverage * 0.42 * uGlow;
  // A note is a knot of the aurora: the light of the ribbon swells in a soft column over it (never a disc), rays
  // brightest at the foot and thinning upward, in the ribbon's own color.
  float lit = 0.0;
  for (int i = 0; i < ${NOTE_LIGHTS}; i++) {
    float d = (vGrid.x - uNotes[i].x) / 0.024;
    float up = uNotes[i].z < 0.0 ? pow(1.0 - vGrid.y, 0.9) : exp(-pow((vGrid.y - uNotes[i].z) / 0.16, 2.0));
    lit += uNotes[i].y * exp(-d * d) * up;
  }
  lit = min(lit, 1.0) * mix(1.0, rays, 0.5);
  alpha = clamp(alpha * (1.0 + 0.9 * lit) + 0.18 * lit * uGlow, 0.0, 0.65);
  col = mix(col, vec3(0.85, 1.0, 0.95), 0.18 * lit);
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}`;

/** The strip: `CURTAIN_COLUMNS` × `CURTAIN_ROWS` quads along the staff path, starting a line gap below the bottom line. */
export function buildCurtainGeometry(path: StaffPath, height: number): BufferGeometry {
  const positions: number[] = [];
  const grid: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (let c = 0; c <= CURTAIN_COLUMNS; c += 1) {
    const u = c / CURTAIN_COLUMNS;
    const p = staffPoint(path, u);
    const a = staffPoint(path, Math.max(0, u - 0.01));
    const b = staffPoint(path, Math.min(1, u + 0.01));
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const nx = -(b.z - a.z) / len;
    const nz = (b.x - a.x) / len;
    for (let r = 0; r <= CURTAIN_ROWS; r += 1) {
      const v = r / CURTAIN_ROWS;
      positions.push(p.x, p.y - path.lineGap + v * height, p.z);
      grid.push(u, v);
      normals.push(nx, nz);
    }
  }
  const stride = CURTAIN_ROWS + 1;
  for (let c = 0; c < CURTAIN_COLUMNS; c += 1) {
    for (let r = 0; r < CURTAIN_ROWS; r += 1) {
      const i = c * stride + r;
      indices.push(i, i + stride, i + 1, i + 1, i + stride, i + stride + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aGrid', new Float32BufferAttribute(grid, 2));
  geometry.setAttribute('aNormal', new Float32BufferAttribute(normals, 2));
  geometry.setIndex(indices);
  return geometry;
}

/** A closed curtain all the way round the viewer: `radius` and heights in plate units, base at `bottomY`. */
export function buildRingGeometry(radius: number, bottomY: number, height: number, columns = 192): BufferGeometry {
  const positions: number[] = [];
  const grid: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (let c = 0; c <= columns; c += 1) {
    const u = c / columns;
    const a = u * Math.PI * 2;
    for (let r = 0; r <= CURTAIN_ROWS; r += 1) {
      const v = r / CURTAIN_ROWS;
      positions.push(Math.cos(a) * radius, bottomY + v * height, Math.sin(a) * radius);
      grid.push(u, v);
      normals.push(Math.cos(a), Math.sin(a));
    }
  }
  const stride = CURTAIN_ROWS + 1;
  for (let c = 0; c < columns; c += 1) {
    for (let r = 0; r < CURTAIN_ROWS; r += 1) {
      const i = c * stride + r;
      indices.push(i, i + stride, i + 1, i + 1, i + stride, i + stride + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aGrid', new Float32BufferAttribute(grid, 2));
  geometry.setAttribute('aNormal', new Float32BufferAttribute(normals, 2));
  geometry.setIndex(indices);
  return geometry;
}

export interface AuroraCurtain {
  readonly mesh: Mesh<BufferGeometry, ShaderMaterial>;
  /** Song time in seconds; with `reducedMotion` the curtain stays still. */
  update(t: number): void;
  /** Lights the ribbon under the given notes: `x` along the staff (0..1), `strength` 0..1. At most `NOTE_LIGHTS`. */
  setNotes(notes: readonly { x: number; strength: number; y?: number }[]): void;
  dispose(): void;
}

export function createAuroraCurtain(
  path: StaffPath,
  palette: { primary: string; accent: string; secondary: string },
  plateSize: number,
  glow: number,
  reducedMotion: boolean,
  sky = false,
  ring?: { geometry: BufferGeometry; bands: number },
): AuroraCurtain {
  const geometry = ring?.geometry ?? buildCurtainGeometry(path, plateSize * 0.22);
  const material = new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      uTime: { value: 0 },
      uAmplitude: { value: reducedMotion ? 0 : plateSize * (sky ? 0.09 : 0.035) },
      uSky: { value: sky ? 1 : 0 },
      uBands: { value: ring?.bands ?? 0 },
      uNotes: { value: Array.from({ length: NOTE_LIGHTS }, () => new Vector3(0, 0, -1)) },
      uGlow: { value: glow },
      uColorA: { value: new Color(palette.primary) },
      uColorB: { value: new Color(palette.accent) },
      uColorC: { value: new Color(palette.secondary) },
    },
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
    fog: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'aurora-curtain';
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  return {
    mesh,
    update(t) {
      material.uniforms.uTime!.value = reducedMotion ? 0 : t;
    },
    setNotes(notes) {
      const lights = material.uniforms.uNotes!.value as Vector3[];
      for (let i = 0; i < NOTE_LIGHTS; i += 1) {
        const n = notes[i];
        if (n) lights[i]!.set(n.x, n.strength, n.y ?? -1);
        else lights[i]!.set(0, 0, -1);
      }
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
