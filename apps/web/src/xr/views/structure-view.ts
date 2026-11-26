/**
 * StructureSystem view (task 4.3, requirements 3.5, 5.1): one InstancedMesh per shape kind of the plan, one instance
 * slot per `SpawnRecord.slot`. Each frame, live structures write their slot (scale.y = growth × height, color =
 * palette role or gradient × emissive); slots without a live structure collapse to zero scale (seek backwards).
 */
import {
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Euler,
  Quaternion,
  Vector3,
  type DataTexture,
  type Material,
  type MeshStandardMaterial,
} from 'three';
import { isRecordShown } from '@/engine/layers';
import { crowdItemsOf, crowdPosesAt, type CrowdItem } from '@/engine/crowd';
import { buildRoads, templateHasRoads } from '@/engine/roads';
import { BUILDING_VARIANT_FOOTPRINT, CITY_FOOTPRINT, BUILDING_VARIANT_HEIGHT, cityFront, cityOf, isCityKind, templateHasCity, worldSize, type City, COMPANION_SPREAD_SEC } from '@/engine/city';
import { buildRoadGeometry } from '../shapes/road-geometry';
import { buildingVariantGeometries, craneGeometry, scaffoldGeometry } from '../shapes/house-shapes';
import { revealMaterial, setReveal } from '../shapes/reveal-material';
import { CityView } from './city-view';
import { foliageTint } from './horizon-view';
import type { SpawnPlan } from '@/engine/spawn-plan';
import { recipeScale } from '@/engine/recipe-scale';
import type { ShapeKind, WorldTemplate } from '@/engine/types';
import type { StructureState, WorldState } from '@/engine/world-state';
import { layerStore } from '../layer-store';
import { KIND_HEIGHT, RECIPE_HEIGHT } from '@/engine/constants';
import { KIND_FOOTPRINT, RECIPE_FOOTPRINT } from '../constants';
import { objectScale, scaleStore } from '../scale';
import { lightness, structureColor } from '../palette';
import { buildShapeGeometry } from '../shapes/builtin-shapes';
import { recipeRoughness } from '../shapes/recipe-builder';
import { addPartTextures, TEXTURE_ATTRIBUTE } from '../shapes/part-textures';
import { fitModel, hasModel, isNaturalModel, loadModelGeometry, MODEL_VARIANTS, MODELS, variantOf } from '../shapes/model-catalog';
import { withLitAttributes } from '../shapes/lit-geometry';
import {
  applyDetailMaps,
  applySky,
  isPolishedKind,
  loadDetailMaps,
  loadSkyEnvironment,
  polishedMaterial,
  TEXTURE_SET,
} from '../shapes/polished-materials';
import { blobShadowMaterial, blobShadowTexture, buildingMaterial, foliageMaterial, spikeMaterial } from '../shapes/city-materials';
import type { WorldView } from './world-view';

const MIN_SCALE = 1e-4;
const RIDGE_KIND: ShapeKind = 'terrain_ridge';
const RIDGE_PRIMARY_MIX = 0;
const RIDGE_LIGHT = 1.2;
const CITY_HILL = '#7a9a62';
const RIDGE_MIN_LUMINANCE = 0.09;
/** Equalizer needles are additive and thin: boost their instance color so they read as light (requirement 5.2). */
const SPIKE_GLOW = 2.2;
/** Objects (I8) that cast a blob shadow, and the foliage that sways in the wind. */
const SHADOW_KINDS: ReadonlySet<string> = new Set(['tree', 'conifer', 'bush', 'car', 'bicycle', 'airplane', 'cloud']);
const FOLIAGE_KINDS: ReadonlySet<string> = new Set(['tree', 'conifer', 'bush']);
/** Lit materials are shaded darker than unlit colors: lift the tint, and the sky reflection, to the same brightness. */
const POLISH_GAIN = 1.9;
const POLISH_REFLECTION = 2.2;
/** Natural-colour models (ocean life): share of the palette tint mixed into their own colours, and their brightness. */
const NATURAL_TINT = 0.18;
const NATURAL_GAIN = 1.5;
/** Rainbow of an object touched by a falling note: how long it lasts, blinks per second, hue turns per second, touch margin (m). */
const RAINBOW_SEC = 2.6;
const RAINBOW_BLINK_HZ = 3;
const RAINBOW_HUE_SPEED = 0.8;
const TOUCH_MARGIN = 0.15;
const SHADOW_OPACITY = 0.45;
const SHADOW_SIZE = 1.5; // shadow diameter / footprint
const SHADOW_LIFT = 0.004; // above the plate, against z-fighting
const SHADOW_SKY_SPREAD = 1.8; // sky objects: bigger and fainter
/** Construction (I39): a building rises floor by floor between these shares of its growth; the scaffold comes down at the end. */
const BUILD_FOUNDATION = 0.1;
const BUILD_FLOORS_END = 0.88;
const SCAFFOLD_END = 0.94;
const FLOOR_HEIGHT = 0.14;
const SITE_CAPACITY = 600;
/** Spots owned by one note are built one after another over this many seconds. */
const CONCRETE_TINT = new Color(0.62, 0.62, 0.6);
const CRANE_SWING = 0.45; // rad/s
const Y_UP = new Vector3(0, 1, 0);
const smooth = (x: number): number => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
/** Realistic colours of a city (I40): car paints, building facades; trees and bushes use `foliageTint`. */
const CAR_PAINTS = [
  [0.88, 0.88, 0.86], [0.88, 0.88, 0.86], [0.62, 0.64, 0.68], [0.62, 0.64, 0.68], [0.2, 0.2, 0.22], [0.2, 0.2, 0.22],
  [0.36, 0.37, 0.4], [0.68, 0.07, 0.07], [0.1, 0.2, 0.55], [0.06, 0.28, 0.17], [0.92, 0.68, 0.08], [0.72, 0.63, 0.48],
] as const;
const FACADES = [
  [0.58, 0.58, 0.62], [0.62, 0.32, 0.24], [0.76, 0.66, 0.46], [0.32, 0.52, 0.72], [0.86, 0.86, 0.84], [0.22, 0.28, 0.4],
  [0.72, 0.45, 0.3], [0.83, 0.74, 0.58], [0.55, 0.68, 0.5], [0.8, 0.55, 0.55], [0.45, 0.4, 0.5], [0.9, 0.8, 0.4],
  [0.35, 0.55, 0.55], [0.68, 0.3, 0.32], [0.3, 0.32, 0.3], [0.78, 0.78, 0.7], [0.85, 0.6, 0.4], [0.5, 0.6, 0.8],
] as const;
const NATURAL_CITY_KINDS: ReadonlySet<string> = new Set(['car', 'bicycle', 'tree', 'conifer', 'bush', 'building']);
const unitHash = (n: number): number => {
  const v = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return v - Math.floor(v);
};
const FLAT = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
const ZERO = new Matrix4().makeScale(0, 0, 0);
const WHITE = new Color(1, 1, 1);

export function footprintOf(kind: ShapeKind, template?: WorldTemplate): number {
  if (KIND_FOOTPRINT[kind] !== undefined) return KIND_FOOTPRINT[kind];
  return template ? recipeScale(template, kind).footprint : RECIPE_FOOTPRINT;
}

/** Instance height (m) of a kind before the per-note factor: what `engine/spawn-plan.ts` uses as base + extra / 2. */
function nominalHeightOf(kind: ShapeKind, template: WorldTemplate): number {
  const { base, extra } = KIND_HEIGHT[kind] ?? RECIPE_HEIGHT;
  const scale = kind.startsWith('recipe:') ? recipeScale(template, kind).heightScale : 1;
  return (base + extra / 2) * scale;
}

export class StructureView implements WorldView {
  /** Footprint of a kind here: smaller cars and trees in a city, where they must fit the streets and the houses. */
  private footprintIn(kind: ShapeKind): number {
    return (this.cityMode ? CITY_FOOTPRINT[kind] : undefined) ?? footprintOf(kind, this.plan.template);
  }

  readonly object = new Group();
  private readonly meshes = new Map<ShapeKind, InstancedMesh>();
  /** Extra InstancedMeshes of the body variants of a kind (models loaded for polished worlds only), same slots. */
  private readonly variantMeshes = new Map<ShapeKind, InstancedMesh[]>();
  private readonly materials = new Map<ShapeKind, Material>();
  private disposed = false;
  private readonly litKinds = new Set<ShapeKind>();
  private readonly ridgeColor: Color;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly euler = new Euler();
  private readonly rainbowColor = new Color();
  private readonly pos = new Vector3();
  private readonly scale = new Vector3();
  private readonly color = new Color();
  private shadows: InstancedMesh | null = null;
  private shadowMap: DataTexture | null = null;
  private lastT = Number.NaN;
  /** Moving records and their radius (half the footprint): the crowd keeps them apart (I31). */
  private crowd: readonly CrowdItem[] = [];
  /** When each object was last touched by a falling note (it then blinks in rainbow colours for a while). */
  private readonly touched = new Map<number, number>();
  private lastTouchT = 0;
  private roadMesh: Mesh | null = null;
  private cityView: CityView | null = null;
  /** Scaffolding and cranes of the buildings under construction (city templates). */
  private site: { scaffold: InstancedMesh; crane: InstancedMesh } | null = null;
  private readonly cityMode: boolean;
  private readonly city: City | null;
  /** Pool of virtual structures: the spots built around a note, reused every frame. */
  private readonly companions: StructureState[] = [];
  private readonly drawn: StructureState[] = [];
  private readonly siteM = new Matrix4();
  private readonly siteQ = new Quaternion();
  private readonly sitePos = new Vector3();
  private readonly siteScale = new Vector3();
  private readonly unsubscribe: () => void;

  constructor(private readonly plan: SpawnPlan) {
    this.cityMode = templateHasCity(plan.template);
    this.city = this.cityMode ? cityOf(plan.template, plan.seed) : null;
    const sizeCrowd = (): void => {
      // Collision radii follow the size the instances are drawn at, which depends on the scale mode.
      const unit = objectScale(scaleStore.mode);
      this.crowd = crowdItemsOf(plan, (kind: string) => (this.footprintIn(kind as ShapeKind) / 2) * unit);
    };
    sizeCrowd();
    this.object.name = 'structures';
    const redraw = () => {
      this.lastT = Number.NaN; // redraw at once, even while paused
    };
    const offLayers = layerStore.subscribe(redraw);
    const offScale = scaleStore.subscribe(() => {
      sizeCrowd();
      redraw();
    });
    this.unsubscribe = () => {
      offLayers();
      offScale();
    };
    const { palette } = plan.template;
    // Ridges are mountains: terrain hue (lifted toward the primary), not the pitch gradient (requirement 2.4).
    this.ridgeColor = new Color(palette.terrain)
      .lerp(new Color(palette.primary), RIDGE_PRIMARY_MIX)
      .multiplyScalar(lightness(RIDGE_LIGHT));
    // In a daylight city the hills of the parks are grassy knolls, not the (near black) night terrain colour.
    if (this.cityMode) this.ridgeColor.set(CITY_HILL).multiplyScalar(lightness(1));
    // A night palette must not turn the hills into black cut-outs: keep them at a readable luminance.
    const lum = 0.2126 * this.ridgeColor.r + 0.7152 * this.ridgeColor.g + 0.0722 * this.ridgeColor.b;
    if (lum < RIDGE_MIN_LUMINANCE) this.ridgeColor.multiplyScalar(Math.min(8, RIDGE_MIN_LUMINANCE / Math.max(lum, 1e-3)));
    const polished = plan.template.fx.material === 'polished';
    for (const track of plan.tracks) {
      const capacity = this.capacityOf(track.kind, track.recordIndices.length);
      const built = buildShapeGeometry(track.kind, plan.template.recipes, plan.template.palette);
      const lit = polished && isPolishedKind(track.kind);
      const geometry = lit ? withLitAttributes(built) : built;
      if (geometry !== built) built.dispose();
      const material: Material =
        track.kind === 'building'
          ? buildingMaterial()
          : track.kind === 'spike'
            ? spikeMaterial()
            : lit
              ? polishedMaterial(track.kind, geometry.hasAttribute('color'), null, POLISH_REFLECTION, recipeRoughnessOf(track.kind, plan.template.recipes))
              : FOLIAGE_KINDS.has(track.kind)
                ? foliageMaterial()
                : new MeshBasicMaterial({ color: 0xffffff, vertexColors: geometry.hasAttribute('color') });
      if (geometry.hasAttribute(TEXTURE_ATTRIBUTE)) addPartTextures(material);
      this.materials.set(track.kind, material);
      if (lit) this.litKinds.add(track.kind);
      const mesh = new InstancedMesh(geometry, material, capacity);
      mesh.name = `structures:${track.kind}`;
      mesh.frustumCulled = false; // instances grow from zero scale; the initial bounding sphere is empty
      for (let i = 0; i < capacity; i++) {
        mesh.setMatrixAt(i, ZERO);
        mesh.setColorAt(i, this.color.set(0, 0, 0));
      }
      this.meshes.set(track.kind, mesh);
      this.object.add(mesh);
    }
    this.addShadows();
    if (templateHasRoads(plan.template)) {
      const geometry = buildRoadGeometry(buildRoads(plan.seed, worldSize(plan.template)));
      this.roadMesh = new Mesh(geometry, revealMaterial({ vertexColors: true }));
      this.roadMesh.name = 'roads';
      this.roadMesh.frustumCulled = false;
      this.object.add(this.roadMesh);
    }
    if (this.cityMode) this.addCity();
    if (polished) {
      for (const kind of this.litKinds) {
        if (hasModel(kind)) this.useModel(kind);
        const set = TEXTURE_SET[kind];
        const material = this.materials.get(kind) as MeshStandardMaterial;
        if (set) {
          void loadDetailMaps(set).then((maps) => {
            if (maps && !this.disposed) applyDetailMaps(material, maps);
          });
        }
      }
      void loadSkyEnvironment().then((sky) => {
        if (!sky || this.disposed) return;
        for (const material of this.materials.values()) if ((material as MeshStandardMaterial).isMeshStandardMaterial) applySky(material as MeshStandardMaterial, sky);
      });
    }
  }

  /** Instances a kind can show at once: a city kind has one per spot of its pool, anything else one per budget slot. */
  private capacityOf(kind: ShapeKind, records: number): number {
    const cls = this.city ? isCityKind(kind) : null;
    if (!this.city || cls === null) return Math.min(this.plan.budget, records);
    const pool = cls === 'building' ? this.city.lots : cls === 'garden' ? this.city.gardens : this.city.monuments;
    return Math.max(1, pool.length);
  }

  /**
   * The live structures plus, for a note that owns several spots of the city (see `SpawnRecord.siteFrom`), the others
   * built around it one after another: same colors and timing rules, each with its own look (variant, height, delay).
   */
  private withCompanions(state: WorldState): readonly StructureState[] {
    if (!this.city) return state.structures;
    const out = this.drawn;
    out.length = 0;
    let used = 0;
    const { lots, gardens, monuments } = this.city;
    for (const s of state.structures) {
      out.push(s);
      const r = this.plan.records[s.index]!;
      if (r.siteTo - r.siteFrom < 2) continue;
      const cls = isCityKind(r.kind);
      const pool = cls === 'building' ? lots : cls === 'garden' ? gardens : monuments;
      const baseHeight = r.height / (cls === 'building' ? (BUILDING_VARIANT_HEIGHT[r.variant] ?? 1) : 1);
      const span = r.siteTo - r.siteFrom;
      for (let j = r.siteFrom + 1; j < r.siteTo; j += 1) {
        const spot = pool[j];
        if (!spot) break;
        const delay = ((j - r.siteFrom) / span) * COMPANION_SPREAD_SEC;
        const elapsed = state.t - r.landAt - delay;
        if (elapsed < 0) continue;
        const h = Math.abs(Math.sin(j * 12.9898 + r.index * 78.233) * 43758.5453) % 1;
        const lot = cls === 'building' ? (spot as (typeof lots)[number]) : null;
        const growth = smooth(elapsed / r.growSec);
        const companion: StructureState = (this.companions[used] ??= {} as StructureState);
        Object.assign(companion, {
          index: s.index,
          kind: r.kind,
          slot: j,
          phase: elapsed < r.growSec ? 'growing' : 'alive',
          growth,
          position: { x: spot.x, y: 0, z: spot.z },
          yaw: lot ? lot.yaw : h * Math.PI * 2,
          variant: lot ? lot.variant : 0,
          height: 0,
          emissive: r.emissive,
          colorRole: r.colorRole,
          structureHex: r.structureHex,
          colorT: Math.min(1, Math.max(0, r.colorT + 0.35 * (h - 0.5))),
        });
        (companion as { full?: number }).full = baseHeight * (lot ? (BUILDING_VARIANT_HEIGHT[lot.variant] ?? 1) * (0.55 + 0.9 * h) : 0.7 + 0.6 * h);
        (companion as { height: number }).height = ((companion as { full?: number }).full ?? 0) * growth;
        out.push(companion);
        used += 1;
      }
    }
    return out;
  }

  /** City template (I39): ground, bridges, lakes and lights; building variants; scaffolding and cranes. */
  private addCity(): void {
    this.cityView = new CityView(this.plan);
    this.object.add(this.cityView.object);
    const base = this.meshes.get('building');
    if (base) {
      const [tower, ...others] = buildingVariantGeometries();
      base.geometry.dispose();
      base.geometry = tower!;
      const list = others.map((geometry, i) => {
        const mesh = new InstancedMesh(geometry, base.material, base.instanceMatrix.count);
        mesh.name = `structures:building:${i + 1}`;
        mesh.frustumCulled = false;
        for (let k = 0; k < mesh.instanceMatrix.count; k++) {
          mesh.setMatrixAt(k, ZERO);
          mesh.setColorAt(k, this.color.set(0, 0, 0));
        }
        mesh.count = base.count;
        this.object.add(mesh);
        return mesh;
      });
      this.variantMeshes.set('building', list);
      const make = (geometry: ReturnType<typeof scaffoldGeometry>, color: number, name: string): InstancedMesh => {
        const mesh = new InstancedMesh(geometry, new MeshBasicMaterial({ color }), SITE_CAPACITY);
        mesh.name = name;
        mesh.frustumCulled = false;
        mesh.count = 0;
        this.object.add(mesh);
        return mesh;
      };
      this.site = { scaffold: make(scaffoldGeometry(), 0xe0b64f, 'structures:scaffold'), crane: make(craneGeometry(), 0xf08a24, 'structures:crane') };
    }
  }

  /** Swaps the procedural shape of `kind` for its authored model when the file has loaded. */
  private useModel(kind: ShapeKind): void {
    // The procedural shape is only a fallback: hidden while the model loads, so no old shape shows before (or inside) it.
    const first = this.meshes.get(kind);
    if (first) first.visible = false;
    void loadModelGeometry(kind).then((raw) => {
      const mesh = this.meshes.get(kind);
      if (mesh) mesh.visible = true; // loaded, or the file could not load and the procedural shape stays
      if (!raw || !mesh || this.disposed) return;
      const fitted = fitModel(raw, MODELS[kind]!, this.footprintIn(kind), nominalHeightOf(kind, this.plan.template));
      const geometry = withLitAttributes(fitted);
      if (geometry !== fitted) fitted.dispose();
      const old = mesh.geometry;
      mesh.geometry = geometry;
      old.dispose();
      const material = this.materials.get(kind) as MeshStandardMaterial;
      material.vertexColors = geometry.hasAttribute('color');
      geometry.computeBoundingBox();
      const height = material.userData.mwHeight as { value: number } | undefined;
      if (height) height.value = geometry.boundingBox!.max.y; // the body motion of ocean life is relative to it
      material.needsUpdate = true;
      this.lastT = Number.NaN; // redraw at once, even while paused
    });
    this.addVariants(kind);
  }

  /** Body variants (cars: coupe and retro): one more InstancedMesh each, sharing the kind's material and slots. */
  private addVariants(kind: ShapeKind): void {
    const files = MODEL_VARIANTS[kind];
    const base = this.meshes.get(kind);
    if (!files || !base) return;
    const list: InstancedMesh[] = [];
    for (const file of files) {
      const mesh = new InstancedMesh(base.geometry, base.material, base.instanceMatrix.count);
      mesh.name = `structures:${kind}:${file}`;
      mesh.frustumCulled = false;
      for (let i = 0; i < mesh.instanceMatrix.count; i++) {
        mesh.setMatrixAt(i, ZERO);
        mesh.setColorAt(i, this.color.set(0, 0, 0));
      }
      mesh.count = base.count;
      mesh.visible = false; // shares the procedural geometry until its own model has loaded
      list.push(mesh);
      this.object.add(mesh);
      void loadModelGeometry(file).then((raw) => {
        mesh.visible = true;
        if (!raw || this.disposed) return;
        const fitted = fitModel(raw, MODELS[file]!, this.footprintIn(kind), nominalHeightOf(kind, this.plan.template));
        const geometry = withLitAttributes(fitted);
        if (geometry !== fitted) fitted.dispose();
        mesh.geometry = geometry;
        this.lastT = Number.NaN;
      });
    }
    this.variantMeshes.set(kind, list);
  }

  /** The InstancedMesh that draws instance `slot` of `kind` (the kind's own mesh, or one of its body variants). */
  meshFor(kind: ShapeKind, slot: number, variant = 0): InstancedMesh | undefined {
    const base = this.meshes.get(kind);
    const v = this.cityMode && kind === 'building' ? variant : variantOf(kind, slot);
    return v === 0 || !base ? base : (this.variantMeshes.get(kind)?.[v - 1] ?? base);
  }

  /** One extra InstancedMesh (one draw call) of blob shadows under every object of the kinds above. */
  private addShadows(): void {
    const capacity = this.plan.tracks
      .filter((t) => SHADOW_KINDS.has(t.kind))
      .reduce((n, t) => n + this.capacityOf(t.kind, t.recordIndices.length), 0);
    if (capacity === 0) return;
    this.shadowMap = blobShadowTexture();
    const geometry = new PlaneGeometry(1, 1);
    const mesh = new InstancedMesh(geometry, blobShadowMaterial(this.shadowMap, SHADOW_OPACITY), capacity);
    mesh.name = 'structures:shadows';
    mesh.frustumCulled = false;
    mesh.count = 0;
    this.shadows = mesh;
    this.object.add(mesh);
  }

  /**
   * Height of a building at this moment of its construction: a slab first, then one floor after the other (each floor
   * rises smoothly, then the work pauses before the next), then the finished building.
   */
  private builtHeight(s: { index: number; growth: number; full?: number }): number {
    const full = s.full ?? this.plan.records[s.index]!.height;
    const g = s.growth;
    if (g >= BUILD_FLOORS_END) return full;
    if (g <= BUILD_FOUNDATION) return Math.min(full, 0.02) * (g / BUILD_FOUNDATION);
    const floors = Math.min(16, Math.max(2, Math.round(full / FLOOR_HEIGHT)));
    const f = ((g - BUILD_FOUNDATION) / (BUILD_FLOORS_END - BUILD_FOUNDATION)) * floors;
    const step = Math.floor(f);
    return Math.max(0.02, (full * (step + smooth(f - step))) / floors);
  }

  /** Scaffolding round the rising building and, for the tall ones, a tower crane that swings over it. */
  private addSite(
    s: { index: number; growth: number; yaw: number; variant: number; position: { x: number; z: number }; full?: number },
    built: number,
    footprint: number,
    unit: number,
    t: number,
    counts: { scaffold: number; crane: number },
  ): void {
    if (!this.site) return;
    const fade = 1 - smooth((s.growth - (SCAFFOLD_END - 0.1)) / 0.1);
    if (counts.scaffold < SITE_CAPACITY) {
      this.siteQ.setFromAxisAngle(Y_UP, s.yaw);
      this.siteM.compose(
        this.sitePos.set(s.position.x, 0, s.position.z),
        this.siteQ,
        this.siteScale.set(footprint * 1.16, Math.max(0.05, (built + 0.07) * unit * fade), footprint * 1.16),
      );
      this.site.scaffold.setMatrixAt(counts.scaffold++, this.siteM);
    }
    const full = s.full ?? this.plan.records[s.index]!.height;
    if (counts.crane < SITE_CAPACITY && full > 0.55 && s.variant !== 1 && s.variant !== 3 && s.variant !== 5 && s.variant !== 6) {
      const reach = footprint * 0.62;
      const c = Math.cos(s.yaw);
      const sn = Math.sin(s.yaw);
      const k = Math.max(0.4, built + 0.3) * unit * fade;
      const horizontal = Math.min(k, 0.8 * unit);
      this.siteQ.setFromAxisAngle(Y_UP, t * CRANE_SWING + s.index);
      this.siteM.compose(this.sitePos.set(s.position.x + reach * c - reach * sn, 0, s.position.z + reach * sn + reach * c), this.siteQ, this.siteScale.set(horizontal, k, horizontal));
      this.site.crane.setMatrixAt(counts.crane++, this.siteM);
    }
  }

  /** Real-world colour of a city object, from its own seed: car paint, facade, leaf green (with a little of the palette). */
  private naturalColor(kind: ShapeKind, seed: number, emissive: number): void {
    const u = unitHash(seed);
    if (kind === 'car' || kind === 'bicycle') {
      const p = CAR_PAINTS[Math.floor(u * CAR_PAINTS.length)]!;
      this.color.setRGB(p[0], p[1], p[2]).multiplyScalar(0.95);
    } else if (kind === 'building') {
      const f = FACADES[Math.floor(u * FACADES.length)]!;
      const j = unitHash(seed * 3.7 + 1);
      // Every building gets its own tone: the palette colour, a little lighter or darker and warmer or cooler.
      const light = 0.78 + 0.4 * j;
      const warm = (unitHash(seed * 5.1 + 2) - 0.5) * 0.14;
      this.color
        .setRGB(f[0] * (1 + warm), f[1], f[2] * (1 - warm))
        .multiplyScalar(light * (0.8 + 0.5 * Math.min(1, emissive)));
    } else {
      let n = 0;
      foliageTint(kind, () => unitHash(seed + ++n * 7.7), this.color).multiplyScalar(0.62);
    }
  }

  /** Marks an object as touched when a falling note passes through it. */
  private touch(s: { index: number }, state: WorldState, x: number, y: number, z: number, footprint: number): void {
    const r = footprint * 0.5 + TOUCH_MARGIN;
    for (const n of state.fallingNotes) {
      if (n.index === s.index || !this.plan.records[n.index]?.rainbow) continue; // only rainbow notes recolour what they touch
      const dx = n.position.x - x;
      const dy = n.position.y - y;
      const dz = n.position.z - z;
      if (dx * dx + dy * dy + dz * dz < r * r) {
        this.touched.set(s.index, state.t);
        return;
      }
    }
  }

  /** Blinking rainbow colour of a touched object, or null once it has calmed down (fades out over `RAINBOW_SEC`). */
  private rainbow(index: number, t: number): Color | null {
    const since = t - (this.touched.get(index) ?? Number.NEGATIVE_INFINITY);
    if (!(since >= 0) || since >= RAINBOW_SEC) return null;
    const fade = 1 - (since / RAINBOW_SEC) ** 2;
    const blink = 0.7 + 0.3 * Math.sin(t * RAINBOW_BLINK_HZ * Math.PI * 2);
    this.rainbowColor.setHSL((t * RAINBOW_HUE_SPEED + index * 0.07) % 1, 1, 0.55);
    return this.rainbowColor.multiplyScalar(blink * (0.5 + 0.5 * fade));
  }

  /** Number of InstancedMeshes (one draw call each). */
  drawCalls(): number {
    let variants = 0;
    for (const list of this.variantMeshes.values()) variants += list.length;
    return this.meshes.size + variants + (this.shadows ? 1 : 0) + (this.roadMesh ? 1 : 0) + (this.cityView ? this.cityView.drawCalls() : 0) + (this.site ? 2 : 0);
  }

  mesh(kind: ShapeKind): InstancedMesh | undefined {
    return this.meshes.get(kind);
  }

  /** The mesh of `kind` and all its variant meshes (building variants, car bodies). */
  meshesOf(kind: ShapeKind): InstancedMesh[] {
    const base = this.meshes.get(kind);
    return base ? [base, ...(this.variantMeshes.get(kind) ?? [])] : [];
  }

  update(state: WorldState): void {
    if (state.t === this.lastT) return; // paused: nothing changed, skip the GPU upload
    this.lastT = state.t;
    for (const mesh of [...this.meshes.values(), ...[...this.variantMeshes.values()].flat()]) {
      for (let i = 0; i < mesh.count; i++) mesh.setMatrixAt(i, ZERO);
    }
    const palette = this.plan.template.palette;
    const hidden = layerStore.hidden;
    for (const material of this.materials.values()) {
      const time = material.userData.mwTime as { value: number } | undefined;
      if (time) time.value = state.t;
    }
    if (state.t < this.lastTouchT) this.touched.clear(); // seek backwards: forget what was touched later
    this.lastTouchT = state.t;
    const unit = objectScale(scaleStore.mode);
    const poses = this.crowd.length > 0 ? crowdPosesAt(this.plan, this.crowd, state.t) : null;
    let shadowCount = 0;
    const siteCounts = { scaffold: 0, crane: 0 };
    for (const s of this.withCompanions(state)) {
      if (!isRecordShown(this.plan, s.index, hidden)) continue;
      const own = this.plan.records[s.index];
      if (own?.rainbow && !this.touched.has(s.index)) this.touched.set(s.index, own.landAt); // a rainbow note lights what it builds
      const mesh = this.meshFor(s.kind, s.slot, s.variant);
      if (!mesh || s.slot >= mesh.count) continue;
      const site = this.cityMode && s.kind === 'building';
      const footprint = site
        ? (BUILDING_VARIANT_FOOTPRINT[s.variant] ?? 0.4) * unit
        : this.footprintIn(s.kind) * (0.6 + 0.4 * s.growth) * unit;
      const built = site ? this.builtHeight(s) : s.height;
      this.scale.set(footprint, Math.max(MIN_SCALE, built) * unit, footprint);
      const pose = poses?.get(s.index) ?? null;
      if (pose?.hidden) continue; // this animal, plane or car has left: its kind shows only its most recent ones
      if (pose) this.q.setFromEuler(this.euler.set(pose.roll ?? 0, -pose.yaw, pose.pitch ?? 0, 'YZX')); // yaw, then nose pitch, then bank
      else this.q.setFromAxisAngle(Y_UP, s.yaw);
      this.m.compose(
        pose ? this.pos.set(pose.x, pose.y, pose.z) : this.pos.set(s.position.x, s.position.y, s.position.z),
        this.q,
        this.scale,
      );
      mesh.setMatrixAt(s.slot, this.m);
      if (site && s.growth < SCAFFOLD_END) this.addSite(s, built, footprint, unit, state.t, siteCounts);
      this.touch(s, state, this.m.elements[12]!, this.m.elements[13]! + (s.height * unit) / 2, this.m.elements[14]!, footprint);
      if (this.shadows && SHADOW_KINDS.has(s.kind) && shadowCount < this.shadows.instanceMatrix.count) {
        const sky = pose ? pose.y > 1 : false;
        const d = footprint * SHADOW_SIZE * (sky ? SHADOW_SKY_SPREAD : 1);
        this.scale.set(d, d, 1);
        this.m.compose(this.pos.set(this.m.elements[12]!, SHADOW_LIFT, this.m.elements[14]!), FLAT, this.scale);
        this.shadows.setMatrixAt(shadowCount++, this.m);
      }
      if (s.kind === RIDGE_KIND) mesh.setColorAt(s.slot, this.color.copy(this.ridgeColor));
      else if (this.cityMode && NATURAL_CITY_KINDS.has(s.kind) && !s.structureHex) {
        this.naturalColor(s.kind, s.index * 131 + s.slot, s.emissive);
        if (s.kind === 'building' && s.growth < 1) this.color.lerp(CONCRETE_TINT, (1 - smooth(s.growth * 1.15)) * 0.75);
        if (s.kind === 'building' && s.growth < BUILD_FLOORS_END) this.color.multiplyScalar(2.4); // roofs are dark in the shader: a slab or an open floor reads as pale concrete
        const rainbow = this.rainbow(s.index, state.t);
        if (rainbow) this.color.copy(rainbow).multiplyScalar(POLISH_GAIN);
        else if (this.litKinds.has(s.kind)) this.color.multiplyScalar(POLISH_GAIN);
        mesh.setColorAt(s.slot, this.color);
      } else {
        if (s.structureHex) this.color.set(s.structureHex).multiplyScalar(s.emissive);
        else structureColor(palette, s.colorRole, s.colorT, s.emissive, this.color);
        if (site && s.growth < 1) this.color.lerp(CONCRETE_TINT, (1 - smooth(s.growth * 1.15)) * 0.75); // bare concrete until finished
        const rainbow = this.rainbow(s.index, state.t);
        if (rainbow) this.color.copy(rainbow).multiplyScalar(POLISH_GAIN);
        else if (this.litKinds.has(s.kind) && isNaturalModel(s.kind)) {
          // The animal keeps its own colours; the palette (water hue) tints it a little so it belongs to the scene.
          this.color.lerp(WHITE, 1 - NATURAL_TINT).multiplyScalar(NATURAL_GAIN * (0.85 + 0.15 * Math.min(1.4, s.emissive)));
        } else if (this.litKinds.has(s.kind)) this.color.multiplyScalar(POLISH_GAIN);
        mesh.setColorAt(s.slot, s.kind === 'spike' ? this.color.multiplyScalar(SPIKE_GLOW) : this.color);
      }
    }
    if (this.site) {
      for (const key of ['scaffold', 'crane'] as const) {
        this.site[key].count = siteCounts[key];
        this.site[key].instanceMatrix.needsUpdate = true;
      }
    }
    if (this.cityView) this.cityView.update(state);
    if (this.roadMesh && this.cityView) setReveal(this.roadMesh.material as MeshBasicMaterial, cityFront(this.cityView.city, state.t, this.plan.durationSec));
    if (this.shadows) {
      this.shadows.count = shadowCount;
      this.shadows.instanceMatrix.needsUpdate = true;
    }
    for (const mesh of [...this.meshes.values(), ...[...this.variantMeshes.values()].flat()]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.unsubscribe();
    for (const mesh of [...this.meshes.values(), ...[...this.variantMeshes.values()].flat()]) mesh.geometry.dispose();
    for (const material of this.materials.values()) material.dispose();
    if (this.shadows) {
      this.shadows.geometry.dispose();
      (this.shadows.material as MeshBasicMaterial).dispose();
    }
    this.shadowMap?.dispose();
    this.cityView?.dispose();
    if (this.site) {
      for (const mesh of [this.site.scaffold, this.site.crane]) {
        mesh.geometry.dispose();
        (mesh.material as MeshBasicMaterial).dispose();
      }
    }
    if (this.roadMesh) {
      this.roadMesh.geometry.dispose();
      (this.roadMesh.material as MeshBasicMaterial).dispose();
    }
  }
}

function recipeRoughnessOf(kind: string, recipes: readonly Parameters<typeof recipeRoughness>[0][] = []): number | undefined {
  const recipe = recipes.find((r) => `recipe:${r.name}` === kind);
  return (recipe && recipeRoughness(recipe)) ?? undefined;
}
