/**
 * Weather of the infinite world: a sun (or a moon on dark palettes), drifting clouds, rain, lightning and flocks of
 * birds around the viewer, all driven by `weatherAt(plan, t)` (the music), never by wall-clock time. Seven draw calls:
 * sun sprite, cloud puffs (one InstancedMesh), rain (one LineSegments animated in the vertex shader), overcast / flash
 * dome, bolt (one Line) and birds (one InstancedMesh flapping in the vertex shader). Fixed in the world like the
 * environment, scaled with it (`environmentScale`). `prefers-reduced-motion`: no flash, no flapping, still clouds.
 * Counts are the `WEATHER_BUDGET`; lower them for weaker devices without touching anything else.
 */
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Texture,
  TextureLoader,
  Vector3,
} from 'three';
import { hashSeed, mulberry32 } from '@/engine/prng';
import type { SpawnPlan } from '@/engine/spawn-plan';
import { SKY_IDS, resolveTime, skyWeights, weatherAt, type SkyId, type Weather } from '@/engine/weather';
import type { WorldState } from '@/engine/world-state';
import { ENV_SKY_RADIUS_M } from '../constants';
import { radialAlphaTexture } from '../glyphs/halo-texture';
import { environmentColors } from '../palette';
import { environmentScale, scaleStore, type ScaleMode } from '../scale';
import { weatherStore } from '../weather-store';
import type { WorldView } from './world-view';

/** Instance and vertex counts: the whole cost of the weather, in one place. */
export const WEATHER_BUDGET = { clouds: 36, raindrops: 1400, birds: 24 } as const;
/** Number of draw calls of the weather view. */
export const WEATHER_DRAW_CALLS = 7;

const R = ENV_SKY_RADIUS_M;
const RAIN_RADIUS_M = 34;
const RAIN_HEIGHT_M = 30;
const RAIN_SPEED = 22;
const BIRD_SPAN_M = 0.9;
/** A bolt is a jagged trunk of 13 segments and three forks of 5 (the forked bolt of the reference photos). */
const BOLT_TRUNK = 13;
const BOLT_FORKS = 3;
const BOLT_FORK_LEN = 5;
const BOLT_SEGMENTS = BOLT_TRUNK + BOLT_FORKS * BOLT_FORK_LEN;

const RAIN_VERTEX = /* glsl */ `
attribute float aEnd;   // 0 = top of the streak, 1 = bottom
attribute float aSpeed;
uniform float uTime;
uniform float uSlant;
uniform float uHeight;
varying float vEnd;
void main() {
  vec3 p = position;
  float fall = uTime * aSpeed;
  p.y = mod(position.y - fall, uHeight);
  p.x += (uHeight - p.y) * uSlant;
  p.y -= aEnd * 1.1;
  vEnd = aEnd;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const RAIN_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vEnd;
void main() {
  gl_FragColor = vec4(uColor, uOpacity * (1.0 - 0.7 * vEnd));
  #include <colorspace_fragment>
}`;

const PHOTO_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const PHOTO_FRAGMENT = /* glsl */ `
uniform sampler2D uA;
uniform sampler2D uB;
uniform float uMix;
uniform float uFlash;
uniform vec3 uHaze;
varying vec3 vDir;
const float PI = 3.14159265;
void main() {
  vec3 d = normalize(vDir);
  vec2 uv = vec2(atan(d.z, d.x) / (2.0 * PI) + 0.5, asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5);
  vec3 col = mix(texture2D(uA, uv).rgb, texture2D(uB, uv).rgb, uMix);
  col = mix(uHaze, col, smoothstep(-0.04, 0.1, d.y)); // below and at the horizon the photo melts into the ground haze
  col += vec3(0.55, 0.62, 0.8) * uFlash * (0.4 + 0.6 * smoothstep(0.0, 0.5, d.y));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

/** Sky photos are shared by every view of the page and loaded the first time a weight asks for them. */
const skyTextures = new Map<SkyId, Texture>();
function skyTexture(id: SkyId, base = '/sky'): Texture {
  let texture = skyTextures.get(id);
  if (!texture) {
    texture = new TextureLoader().load(`${base}/${id}.jpg`);
    texture.colorSpace = SRGBColorSpace;
    skyTextures.set(id, texture);
  }
  return texture;
}
function skyLoaded(id: SkyId): boolean {
  const image = skyTextures.get(id)?.image as { width?: number } | undefined;
  return !!image && (image.width ?? 0) > 0;
}

const BIRD_VERTEX = /* glsl */ `
attribute float aWing; // -1 left tip, 0 body, 1 right tip
uniform float uTime;
uniform float uFlap;
void main() {
  float phase = instanceMatrix[3][0] * 0.7 + instanceMatrix[3][2] * 0.3;
  vec3 p = position;
  p.y += aWing * aWing * (sin(uTime * 8.0 + phase) * 0.5 + 0.15) * uFlap; // tips beat up and down, the elbow follows
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
}`;
const BIRD_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
void main() {
  gl_FragColor = vec4(uColor, 1.0);
  #include <colorspace_fragment>
}`;

/**
 * Bird shape: a tapered body with a tail and two wings of two segments each (a gull-like "M" when the tips flap up), 8
 * triangles. `aWing` is 0 on the body and rises to 1 at the wing tip, so the vertex shader bends the outer part most.
 */
function birdGeometry(): BufferGeometry {
  const g = new BufferGeometry();
  const s = BIRD_SPAN_M;
  const v: number[] = [];
  const w: number[] = [];
  const tri = (a: number[], wa: number, b: number[], wb: number, c: number[], wc: number): void => {
    v.push(...a, ...b, ...c);
    w.push(wa, wb, wc);
  };
  for (const side of [-1, 1]) {
    const shoulderF: number[] = [side * 0.06 * s, 0, 0.1 * s];
    const shoulderB: number[] = [side * 0.06 * s, 0, -0.18 * s];
    const elbowF: number[] = [side * 0.5 * s, 0, 0.12 * s];
    const elbowB: number[] = [side * 0.5 * s, 0, -0.22 * s];
    const tip: number[] = [side * 1.0 * s, 0, -0.34 * s];
    tri(shoulderF, 0, elbowF, 0.5, shoulderB, 0);
    tri(shoulderB, 0, elbowF, 0.5, elbowB, 0.5);
    tri(elbowF, 0.5, tip, 1, elbowB, 0.5);
  }
  tri([0, 0, 0.3 * s], 0, [-0.06 * s, 0, 0.05 * s], 0, [0.06 * s, 0, 0.05 * s], 0); // head
  tri([0, 0, -0.18 * s], 0, [-0.1 * s, 0, -0.5 * s], 0, [0.1 * s, 0, -0.5 * s], 0); // tail
  g.setAttribute('position', new Float32BufferAttribute(v, 3));
  g.setAttribute('aWing', new Float32BufferAttribute(w, 1));
  return g;
}

export class WeatherView implements WorldView {
  readonly object = new Group();
  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly unsubscribe: () => void;
  private readonly reduced: boolean;
  private readonly dark: boolean;
  private readonly horizon: Color;
  private readonly sun: Sprite;
  private readonly clouds: InstancedMesh;
  private readonly cloudBase: Array<{ az: number; el: number; speed: number; w: number; h: number }> = [];
  private readonly rain: LineSegments;
  private readonly overcast: Mesh<SphereGeometry, MeshBasicMaterial>;
  private readonly bolt: LineSegments;
  private readonly boltGlow: Sprite;
  private readonly photo: Mesh<SphereGeometry, ShaderMaterial>;
  private readonly luminance: number;
  private readonly polished: boolean;
  private readonly birds: InstancedMesh;
  private readonly birdBase: Array<{ radius: number; height: number; phase: number; speed: number }> = [];
  private lastStrike = -1;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly pos = new Vector3();
  private readonly sc = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  private readonly tmp = new Color();

  constructor(private readonly plan: SpawnPlan) {
    this.object.name = 'weather';
    this.reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const colors = environmentColors(plan.template.palette);
    this.horizon = colors.horizon;
    const bg = new Color(plan.template.palette.background);
    this.luminance = 0.2126 * bg.r + 0.7152 * bg.g + 0.0722 * bg.b;
    this.dark = this.luminance < 0.05;
    this.polished = plan.template.fx.material === 'polished';
    const rng = mulberry32(hashSeed(plan.seed, 'weather'));
    const puff = radialAlphaTexture(64);
    this.disposables.push(puff);

    // Sun (or moon): one additive sprite with a soft glow.
    const sunMaterial = new SpriteMaterial({
      color: this.dark ? '#cfe3ff' : '#fff2c4',
      alphaMap: puff,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.sun = new Sprite(sunMaterial);
    this.sun.scale.setScalar(R * (this.dark ? 0.12 : 0.28));
    this.sun.renderOrder = -8;
    this.disposables.push(sunMaterial);

    // Overcast / lightning dome: darkens the sky with the cloud cover, whitens it on a flash.
    this.overcast = new Mesh(
      new SphereGeometry(R * 0.985, 24, 12),
      new MeshBasicMaterial({ color: '#232830', transparent: true, opacity: 0, side: BackSide, depthWrite: false, fog: false }),
    );
    this.overcast.renderOrder = -9;
    this.overcast.frustumCulled = false;
    this.disposables.push(this.overcast.geometry, this.overcast.material);

    // Photographic sky: two equirectangular photos crossfaded by the weather and the time of day.
    const placeholder = new Texture();
    this.photo = new Mesh(
      new SphereGeometry(R * 0.99, 48, 24),
      new ShaderMaterial({
        vertexShader: PHOTO_VERTEX,
        fragmentShader: PHOTO_FRAGMENT,
        uniforms: { uA: { value: placeholder }, uB: { value: placeholder }, uMix: { value: 0 }, uFlash: { value: 0 }, uHaze: { value: this.horizon.clone() } },
        side: BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    this.photo.renderOrder = -9;
    this.photo.frustumCulled = false;
    this.photo.visible = false;
    this.disposables.push(this.photo.geometry, this.photo.material, placeholder);

    // Clouds: soft puffs on the dome, facing the viewer, drifting around it at their own slow speed.
    const puffGeometry = new PlaneGeometry(1, 1);
    const cloudMaterial = new MeshBasicMaterial({
      color: '#ffffff',
      alphaMap: puff,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      fog: false,
      side: DoubleSide,
    });
    this.clouds = new InstancedMesh(puffGeometry, cloudMaterial, WEATHER_BUDGET.clouds);
    this.clouds.count = 0;
    this.clouds.frustumCulled = false;
    this.clouds.renderOrder = -7;
    this.disposables.push(puffGeometry, cloudMaterial);
    // Clouds come in banks of three puffs sharing a place on the dome, low enough to sit above the horizon.
    for (let i = 0; i < WEATHER_BUDGET.clouds; i += 3) {
      const az = rng() * Math.PI * 2;
      const el = 0.03 + 0.34 * rng();
      const speed = 0.002 + 0.004 * rng();
      const w = R * (0.13 + 0.15 * rng());
      for (let k = 0; k < 3; k += 1) {
        const pw = w * (0.7 + 0.5 * rng());
        this.cloudBase.push({ az: az + (rng() - 0.5) * 0.16, el: el + (rng() - 0.5) * 0.05, speed, w: pw, h: pw * (0.4 + 0.15 * rng()) });
      }
    }

    // Rain: vertical streaks in a cylinder around the plate, wrapped and slanted in the vertex shader.
    const drops = WEATHER_BUDGET.raindrops;
    const positions = new Float32Array(drops * 2 * 3);
    const ends = new Float32Array(drops * 2);
    const speeds = new Float32Array(drops * 2);
    for (let i = 0; i < drops; i += 1) {
      const a = rng() * Math.PI * 2;
      const r = RAIN_RADIUS_M * Math.sqrt(rng());
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = rng() * RAIN_HEIGHT_M;
      const speed = RAIN_SPEED * (0.8 + 0.4 * rng());
      for (let e = 0; e < 2; e += 1) {
        positions.set([x, y, z], (i * 2 + e) * 3);
        ends[i * 2 + e] = e;
        speeds[i * 2 + e] = speed;
      }
    }
    const rainGeometry = new BufferGeometry();
    rainGeometry.setAttribute('position', new BufferAttribute(positions, 3));
    rainGeometry.setAttribute('aEnd', new BufferAttribute(ends, 1));
    rainGeometry.setAttribute('aSpeed', new BufferAttribute(speeds, 1));
    const rainMaterial = new ShaderMaterial({
      vertexShader: RAIN_VERTEX,
      fragmentShader: RAIN_FRAGMENT,
      uniforms: { uTime: { value: 0 }, uSlant: { value: 0 }, uHeight: { value: RAIN_HEIGHT_M }, uColor: { value: new Color('#bcd2ff') }, uOpacity: { value: 0 } },
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    this.rain = new LineSegments(rainGeometry, rainMaterial);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.rain.renderOrder = 5;
    this.disposables.push(rainGeometry, rainMaterial);

    // Lightning bolt: a jagged line, re-drawn (seeded) when a new strike starts.
    const boltGeometry = new BufferGeometry();
    boltGeometry.setAttribute('position', new BufferAttribute(new Float32Array(BOLT_SEGMENTS * 2 * 3), 3));
    const boltMaterial = new LineBasicMaterial({ color: '#efe6ff', transparent: true, opacity: 0, fog: false, depthWrite: false, blending: AdditiveBlending });
    this.bolt = new LineSegments(boltGeometry, boltMaterial);
    const glowMaterial = new SpriteMaterial({ color: '#b9a8ff', alphaMap: puff, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, fog: false });
    this.boltGlow = new Sprite(glowMaterial);
    this.boltGlow.visible = false;
    this.disposables.push(glowMaterial);
    this.bolt.frustumCulled = false;
    this.bolt.visible = false;
    this.disposables.push(boltGeometry, boltMaterial);

    // Birds: one flat V each, flapping in the vertex shader, flying circles around the plate.
    const birdMaterial = new ShaderMaterial({
      vertexShader: BIRD_VERTEX,
      fragmentShader: BIRD_FRAGMENT,
      uniforms: { uTime: { value: 0 }, uFlap: { value: this.reduced ? 0 : 1 }, uColor: { value: new Color(this.dark ? '#aab6d0' : '#1c1f26') } },
      side: DoubleSide,
      fog: false,
    });
    const birdGeo = birdGeometry();
    this.birds = new InstancedMesh(birdGeo, birdMaterial, WEATHER_BUDGET.birds);
    this.birds.count = 0;
    this.birds.frustumCulled = false;
    this.disposables.push(birdGeo, birdMaterial);
    for (let i = 0; i < WEATHER_BUDGET.birds; i += 1) {
      this.birdBase.push({ radius: 16 + 34 * rng(), height: 10 + 18 * rng(), phase: rng() * Math.PI * 2, speed: (0.12 + 0.1 * rng()) * (rng() < 0.5 ? 1 : -1) });
    }

    this.object.visible = plan.template.fx.environment !== 'underwater'; // no sky, sun, clouds or rain under the sea
    this.object.add(this.photo, this.overcast, this.sun, this.clouds, this.rain, this.bolt, this.boltGlow, this.birds);
    this.applyScale(scaleStore.mode);
    const offScale = scaleStore.subscribe((mode) => this.applyScale(mode));
    this.unsubscribe = offScale;
  }

  private applyScale(mode: ScaleMode): void {
    this.object.scale.setScalar(environmentScale(mode));
  }

  update(state: WorldState): void {
    if (!this.object.visible) return;
    const settings = weatherStore.settings;
    const w = weatherAt(this.plan, state.t, settings.mode);
    const t = state.t;
    const photo = this.updatePhoto(w, settings.realSky && this.polished, resolveTime(settings.time, this.luminance));
    this.updateSky(w, t);
    this.updateClouds(w, t);
    // A real sky already has its sun, clouds and overcast: the drawn ones only stay as the fallback.
    if (photo) {
      this.sun.visible = false;
      this.clouds.visible = false;
      this.overcast.visible = false;
    }
    this.updateRain(w, t);
    this.updateBolt(w);
    this.updateBirds(w, t);
  }

  /** Shows the photographic sky and returns true when it is drawn (its photos are loaded). */
  private updatePhoto(w: Weather, enabled: boolean, time: 'day' | 'sunset' | 'night'): boolean {
    if (!enabled) {
      this.photo.visible = false;
      return false;
    }
    const weights = skyWeights(w, time);
    for (const id of SKY_IDS) if (weights[id] > 0.001) skyTexture(id); // start loading what the weather is heading to
    const ranked = [...SKY_IDS].sort((a, b) => weights[b] - weights[a]);
    const [first, second] = [ranked[0]!, ranked[1]!];
    const a = skyTexture(first);
    const b = skyTexture(second);
    if (!skyLoaded(first) || !skyLoaded(second)) {
      this.photo.visible = false;
      return false;
    }
    const total = weights[first] + weights[second];
    const u = this.photo.material.uniforms;
    u.uA!.value = a;
    u.uB!.value = b;
    u.uMix!.value = total > 0 ? weights[second] / total : 0;
    u.uFlash!.value = this.reduced ? 0 : w.flash * 0.6;
    this.photo.visible = true;
    return true;
  }

  private updateSky(w: Weather, t: number): void {
    // The sun climbs from the horizon to its peak and down again over the song; behind the clouds it fades.
    const progress = this.plan.durationSec > 0 ? Math.min(1, Math.max(0, t / this.plan.durationSec)) : 0.5;
    const a = Math.PI * (0.12 + 0.76 * progress);
    this.sun.position.set(Math.cos(a) * R * 0.8, Math.sin(a) * R * 0.62 + R * 0.04, -R * 0.35);
    (this.sun.material as SpriteMaterial).opacity = (this.dark ? 0.55 : 0.95) * w.sun;
    this.sun.visible = w.sun > 0.01;
    const flash = this.reduced ? 0 : w.flash;
    const mat = this.overcast.material;
    mat.color.set('#232830').lerp(this.tmp.set('#dfe8ff'), Math.min(1, flash * 1.4));
    mat.opacity = Math.max(w.cloudCover * (0.18 + 0.4 * w.storm), flash * 0.7);
    this.overcast.visible = mat.opacity > 0.004;
  }

  private updateClouds(w: Weather, t: number): void {
    const n = Math.round(w.cloudCover * WEATHER_BUDGET.clouds);
    const drift = this.reduced ? 0 : t;
    for (let i = 0; i < n; i += 1) {
      const c = this.cloudBase[i]!;
      const az = c.az + c.speed * drift * (0.5 + w.wind);
      const r = R * 0.9;
      this.pos.set(Math.cos(az) * Math.cos(c.el) * r, Math.sin(c.el) * r * 0.75 + R * 0.03, Math.sin(az) * Math.cos(c.el) * r);
      // Face the viewer at the centre: a plane whose normal (+z) points at the origin.
      this.q.setFromUnitVectors(new Vector3(0, 0, 1), this.sc.copy(this.pos).negate().normalize());
      this.m.compose(this.pos, this.q, this.sc.set(c.w, c.h, 1));
      this.clouds.setMatrixAt(i, this.m);
    }
    this.clouds.count = n;
    this.clouds.instanceMatrix.needsUpdate = true;
    this.clouds.visible = n > 0;
    // White in fair weather, slate grey in storms; a night palette keeps them dim.
    const grey = Math.min(1, 0.25 * w.cloudCover + 0.6 * w.storm + 0.35 * w.rain);
    const base = this.dark ? 0.5 : 1.6;
    (this.clouds.material as MeshBasicMaterial).color.setScalar(base * (1 - 0.65 * grey)).lerp(this.horizon, this.dark ? 0.25 : 0.1);
  }

  private updateRain(w: Weather, t: number): void {
    const visible = w.rain > 0.02;
    this.rain.visible = visible;
    if (!visible) return;
    const material = this.rain.material as ShaderMaterial;
    material.uniforms.uTime!.value = this.reduced ? 0 : t;
    material.uniforms.uSlant!.value = 0.04 + 0.22 * w.wind * (0.4 + w.storm);
    material.uniforms.uOpacity!.value = 0.12 + 0.4 * w.rain;
    this.rain.geometry.setDrawRange(0, Math.max(2, Math.round(w.rain * WEATHER_BUDGET.raindrops)) * 2);
  }

  private updateBolt(w: Weather): void {
    const on = !this.reduced && w.flash > 0.25 && w.strike >= 0;
    this.bolt.visible = on;
    this.boltGlow.visible = on;
    if (!on) return;
    (this.bolt.material as LineBasicMaterial).opacity = Math.min(1, w.flash * 1.6);
    (this.boltGlow.material as SpriteMaterial).opacity = Math.min(0.9, w.flash * 1.1);
    if (w.strike === this.lastStrike) return;
    this.lastStrike = w.strike;
    const rng = mulberry32(hashSeed(this.plan.seed, `bolt:${w.strike}`));
    const az = rng() * Math.PI * 2;
    const dist = 38 + 24 * rng();
    const bx = Math.cos(az) * dist;
    const bz = Math.sin(az) * dist;
    const top = 38 + 8 * rng();
    const step = top / BOLT_TRUNK;
    const attr = this.bolt.geometry.getAttribute('position') as BufferAttribute;
    const trunk: Array<[number, number, number]> = [];
    let x = bx;
    let z = bz;
    for (let i = 0; i <= BOLT_TRUNK; i += 1) {
      trunk.push([x, top - i * step, z]);
      x += (rng() - 0.5) * 6;
      z += (rng() - 0.5) * 6;
    }
    let seg = 0;
    const put = (a: [number, number, number], b: [number, number, number]): void => {
      attr.setXYZ(seg * 2, ...a);
      attr.setXYZ(seg * 2 + 1, ...b);
      seg += 1;
    };
    for (let i = 0; i < BOLT_TRUNK; i += 1) put(trunk[i]!, trunk[i + 1]!);
    for (let f = 0; f < BOLT_FORKS; f += 1) {
      // A fork leaves the trunk in the upper two thirds and spreads sideways while it falls.
      const start = trunk[2 + Math.floor(rng() * (BOLT_TRUNK - 6))]!;
      const dir = rng() * Math.PI * 2;
      let p: [number, number, number] = [...start];
      for (let i = 0; i < BOLT_FORK_LEN; i += 1) {
        const q: [number, number, number] = [p[0] + Math.cos(dir) * (2 + 3 * rng()), p[1] - step * (0.6 + 0.5 * rng()), p[2] + Math.sin(dir) * (2 + 3 * rng())];
        put(p, q);
        p = q;
      }
    }
    attr.needsUpdate = true;
    this.boltGlow.position.set(bx, top * 0.55, bz);
    this.boltGlow.scale.setScalar(top * 0.9);
  }

  private updateBirds(w: Weather, t: number): void {
    const n = Math.round(w.birds * WEATHER_BUDGET.birds);
    const time = this.reduced ? 0 : t;
    for (let i = 0; i < n; i += 1) {
      const b = this.birdBase[i]!;
      const a = b.phase + b.speed * time;
      this.pos.set(Math.cos(a) * b.radius, b.height + Math.sin(a * 3 + b.phase) * 1.2, Math.sin(a) * b.radius);
      // Heading along the circle (the bird's nose is +z).
      this.q.setFromAxisAngle(this.up, -a + (b.speed > 0 ? Math.PI : 0));
      this.m.compose(this.pos, this.q, this.sc.set(1, 1, 1));
      this.birds.setMatrixAt(i, this.m);
    }
    this.birds.count = n;
    this.birds.instanceMatrix.needsUpdate = true;
    this.birds.visible = n > 0;
    (this.birds.material as ShaderMaterial).uniforms.uTime!.value = time;
  }

  dispose(): void {
    this.unsubscribe();
    for (const d of this.disposables) d.dispose();
    this.clouds.dispose();
    this.birds.dispose();
    this.object.removeFromParent();
  }
}
