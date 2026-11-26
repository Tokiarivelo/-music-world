import {
  AmbientLight,
  Box3,
  BufferGeometry,
  Camera,
  Color,
  DirectionalLight,
  EdgesGeometry,
  GridHelper,
  Group,
  HemisphereLight,
  Line,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Sphere,
  Vector2,
  Vector3,
  WebGLRenderer,
  Float32BufferAttribute,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { buildNodePieces, type PartPalette } from '@/xr/shapes/node-builder';
import { moveNodeTo, rotateNodeTo, scaleNodeBy, worldPoseOf } from './gizmo-math';
import { subtreeIds, type PartNode } from './node-model';

/**
 * The 3D stage of the object workspace (spec 12, phase 6): a Blender-like viewport on the part tree. Framework free (no
 * React): the component mounts it on a canvas and drives it through the setters. It only draws and reports; every edit
 * goes back to the caller as a new node list, so undo, validation and budgets stay in the editor's own model.
 */

export type StageTool = 'select' | 'translate' | 'rotate' | 'scale';
export type StageShading = 'solid' | 'wire' | 'xray';
export type StageView = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'free';
export type StageSpace = 'local' | 'world';

export interface StageCallbacks {
  /** A click picked a part (`null`: the click hit nothing). */
  onPick(id: string | null, additive: boolean): void;
  /** A gizmo drag ended: the node list with the new transform of the part. */
  onTransform(nodes: PartNode[], id: string): void;
  /** The scene changed: triangle count and the size of the object in metres. */
  onStats(stats: StageStats): void;
}

export interface StageStats {
  readonly triangles: number;
  readonly size: readonly [number, number, number];
}

export interface StageSettings {
  tool: StageTool;
  shading: StageShading;
  space: StageSpace;
  /** Edge lines on top of the faces. */
  edges: boolean;
  grid: boolean;
  /** Orthographic camera (front, side and top views are exact). */
  ortho: boolean;
  /** Draw only the selected part and its children. */
  isolate: boolean;
  /** Snap steps: metres, degrees, scale factor; 0 = free. */
  snap: { move: number; rotate: number; scale: number };
}

export const DEFAULT_SETTINGS: StageSettings = {
  tool: 'translate',
  shading: 'solid',
  space: 'local',
  edges: true,
  grid: true,
  ortho: false,
  isolate: false,
  snap: { move: 0.05, rotate: 15, scale: 0.1 },
};

const VIEW_DIRECTIONS: Readonly<Record<Exclude<StageView, 'free'>, readonly [number, number, number]>> = {
  front: [0, 0, 1],
  back: [0, 0, -1],
  right: [1, 0, 0],
  left: [-1, 0, 0],
  top: [0, 1, 0.0001],
  bottom: [0, -1, 0.0001],
};
const DEG = Math.PI / 180;
const CLICK_PIXELS = 4;

/** Everything of a part that has to be released: geometry, material and the edges child. */
interface PartMesh {
  readonly mesh: Mesh;
  readonly edges: LineSegments;
}

export class ObjectStage {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly perspective = new PerspectiveCamera(40, 1, 0.01, 100);
  private readonly orthographic = new OrthographicCamera(-1, 1, 1, -1, -50, 50);
  private camera: PerspectiveCamera | OrthographicCamera = this.perspective;
  private readonly orbit: OrbitControls;
  private readonly gizmo: TransformControls;
  private readonly pivot = new Object3D();
  private readonly group = new Group();
  private readonly parts = new Map<string, PartMesh>();
  private readonly grid = new GridHelper(4, 80, 0x888888, 0x444444);
  private readonly axes = new Group();
  private readonly raycaster = new Raycaster();
  private readonly resizeObserver: ResizeObserver;
  private nodes: readonly PartNode[] = [];
  private palette: PartPalette | undefined;
  private colors = { base: '#cccccc', accent: '#ffaa33' };
  private selected: string | null = null;
  private settings: StageSettings = { ...DEFAULT_SETTINGS, snap: { ...DEFAULT_SETTINGS.snap } };
  private startMatrix = new Matrix4();
  private frameHandle = 0;
  private dirty = true;
  private disposed = false;
  private down: { x: number; y: number } | null = null;
  private fitted = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly callbacks: StageCallbacks,
  ) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, typeof window === 'undefined' ? 1 : window.devicePixelRatio));
    this.perspective.position.set(1.6, 1.2, 1.8);
    this.orthographic.position.copy(this.perspective.position);
    this.scene.add(this.perspective, this.orthographic); // the lights hang on the cameras so the object is always lit from the view
    for (const camera of [this.perspective, this.orthographic]) {
      const key = new DirectionalLight(0xffffff, 2.2);
      key.position.set(1, 2, 1.5);
      camera.add(key);
    }
    this.scene.add(new HemisphereLight(0xffffff, 0x445566, 1.1), new AmbientLight(0xffffff, 0.35));
    this.scene.add(this.grid, this.group, this.pivot);
    this.buildAxes();
    this.orbit = new OrbitControls(this.camera, canvas);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.12;
    this.orbit.screenSpacePanning = true;
    this.orbit.addEventListener('change', this.invalidate);
    this.gizmo = new TransformControls(this.camera, canvas);
    this.gizmo.size = 0.8;
    this.scene.add(this.gizmo.getHelper());
    this.gizmo.addEventListener('change', this.onGizmoChange);
    this.gizmo.addEventListener('dragging-changed', this.onDragging);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointerup', this.onPointerUp);
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(canvas);
    this.resize();
    this.applySettings();
    this.loop();
  }

  // ---------------------------------------------------------------------------------------------- inputs

  /** The part tree to draw. Keeps the camera, the selection and the settings; rebuilds the meshes. */
  setNodes(nodes: readonly PartNode[], palette?: PartPalette, colors?: { base: string; accent: string }): void {
    this.nodes = nodes;
    this.palette = palette;
    if (colors) this.colors = colors;
    this.rebuild();
    if (!this.fitted && this.parts.size > 0) {
      this.frame(null);
      this.fitted = true;
    }
  }

  setSelection(id: string | null): void {
    this.selected = id !== null && this.nodes.some((n) => n.id === id) ? id : null;
    this.refreshLook();
    this.attachGizmo();
    if (this.settings.isolate) this.refreshVisibility();
    this.invalidate();
  }

  update(settings: Partial<StageSettings>): void {
    const before = this.settings;
    this.settings = { ...before, ...settings, snap: { ...before.snap, ...(settings.snap ?? {}) } };
    this.applySettings();
    if (before.ortho !== this.settings.ortho) this.swapCamera();
    this.refreshLook();
    this.refreshVisibility();
    this.attachGizmo();
    this.invalidate();
  }

  /** Looks at the object from one of the axes (orthographic cameras keep the current ortho setting). */
  setView(view: StageView): void {
    if (view === 'free') return;
    const target = this.orbit.target.clone();
    const distance = Math.max(0.5, this.camera.position.distanceTo(target));
    const d = new Vector3(...VIEW_DIRECTIONS[view]).normalize().multiplyScalar(distance);
    this.camera.position.copy(target).add(d);
    this.camera.up.set(0, 1, 0);
    this.orbit.update();
    this.invalidate();
  }

  /** Centres the orbit on a part (or on the whole object) and backs the camera off to fit it. */
  frame(id: string | null): void {
    const box = new Box3();
    const ids = id === null ? null : subtreeIds(this.nodes, id);
    for (const [partId, { mesh }] of this.parts) {
      if (ids && !ids.has(partId)) continue;
      mesh.geometry.computeBoundingBox();
      if (mesh.geometry.boundingBox) box.union(mesh.geometry.boundingBox);
    }
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new Sphere());
    const radius = Math.max(0.15, sphere.radius);
    const dir = this.camera.position.clone().sub(this.orbit.target).normalize();
    if (dir.lengthSq() === 0) dir.set(0.6, 0.45, 0.7).normalize();
    this.orbit.target.copy(sphere.center);
    const distance = radius / Math.sin((this.perspective.fov * DEG) / 2) * 1.15;
    this.camera.position.copy(sphere.center).addScaledVector(dir, distance);
    this.orthographic.zoom = 1 / (radius * 1.25);
    this.orthographic.updateProjectionMatrix();
    this.orbit.update();
    this.invalidate();
  }

  /** PNG of the current view (used to check the stage in tests and for a future thumbnail). */
  snapshot(): string {
    this.renderNow();
    return this.canvas.toDataURL('image/png');
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameHandle);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.gizmo.removeEventListener('change', this.onGizmoChange);
    this.gizmo.removeEventListener('dragging-changed', this.onDragging);
    this.gizmo.dispose();
    this.orbit.removeEventListener('change', this.invalidate);
    this.orbit.dispose();
    this.clearParts();
    this.grid.geometry.dispose();
    (this.grid.material as { dispose(): void }).dispose();
    this.axes.traverse((o) => {
      const line = o as Line;
      line.geometry?.dispose();
      (line.material as { dispose?(): void } | undefined)?.dispose?.();
    });
    this.renderer.dispose();
  }

  // ---------------------------------------------------------------------------------------------- scene

  private buildAxes(): void {
    const axis = (to: [number, number, number], color: number): Line => {
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute([0, 0.0005, 0, ...to], 3));
      return new Line(g, new LineBasicMaterial({ color }));
    };
    this.axes.add(axis([2, 0.0005, 0], 0xe24b4b), axis([0, 0.0005, 2], 0x4b7be2), axis([0, 1, 0], 0x4bd06b));
    this.scene.add(this.axes);
  }

  private clearParts(): void {
    for (const { mesh, edges } of this.parts.values()) {
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
      edges.geometry.dispose();
      (edges.material as LineBasicMaterial).dispose();
      this.group.remove(mesh);
    }
    this.parts.clear();
  }

  private rebuild(): void {
    this.clearParts();
    const pieces = buildNodePieces(this.nodes, this.palette);
    let triangles = 0;
    const box = new Box3();
    for (const piece of pieces) {
      const g = piece.geometry;
      const hasColor = g.hasAttribute('color');
      const mesh = new Mesh(g, new MeshStandardMaterial({ color: hasColor ? 0xffffff : new Color(this.colors.base), vertexColors: hasColor, roughness: 0.75, metalness: 0.02, flatShading: true }));
      mesh.userData.id = piece.id;
      const edges = new LineSegments(new EdgesGeometry(g, 28), new LineBasicMaterial({ color: 0x111418, transparent: true, opacity: 0.55 }));
      edges.raycast = () => undefined; // clicks pick the faces, not the outline
      mesh.add(edges);
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      this.parts.set(piece.id, { mesh, edges });
      triangles += g.getAttribute('position').count / 3;
      g.computeBoundingBox();
      if (g.boundingBox) box.union(g.boundingBox);
    }
    const size = box.isEmpty() ? new Vector3() : box.getSize(new Vector3());
    this.callbacks.onStats({ triangles, size: [size.x, size.y, size.z] });
    this.refreshLook();
    this.refreshVisibility();
    this.attachGizmo();
    this.invalidate();
  }

  private refreshLook(): void {
    const { shading, edges } = this.settings;
    const subtree = this.selected ? subtreeIds(this.nodes, this.selected) : new Set<string>();
    for (const [id, part] of this.parts) {
      const m = part.mesh.material as MeshStandardMaterial;
      const picked = id === this.selected;
      m.wireframe = shading === 'wire';
      m.transparent = shading === 'xray';
      m.opacity = shading === 'xray' ? 0.38 : 1;
      m.depthWrite = shading !== 'xray';
      m.emissive.set(picked ? this.colors.accent : '#000000');
      m.emissiveIntensity = picked ? 0.35 : 0;
      m.needsUpdate = true;
      part.edges.visible = edges && shading !== 'wire';
      const line = part.edges.material as LineBasicMaterial;
      line.color.set(picked ? this.colors.accent : subtree.has(id) ? '#ffffff' : '#111418');
      line.opacity = picked ? 1 : 0.55;
    }
  }

  private refreshVisibility(): void {
    const only = this.settings.isolate && this.selected ? subtreeIds(this.nodes, this.selected) : null;
    for (const [id, { mesh }] of this.parts) mesh.visible = only === null || only.has(id);
  }

  private applySettings(): void {
    const { tool, space, snap, grid } = this.settings;
    this.grid.visible = grid;
    this.axes.visible = grid;
    if (tool !== 'select') this.gizmo.setMode(tool);
    this.gizmo.setSpace(space);
    this.gizmo.setTranslationSnap(snap.move > 0 ? snap.move : null);
    this.gizmo.setRotationSnap(snap.rotate > 0 ? snap.rotate * DEG : null);
    this.gizmo.setScaleSnap(snap.scale > 0 ? snap.scale : null);
  }

  private swapCamera(): void {
    const next = this.settings.ortho ? this.orthographic : this.perspective;
    next.position.copy(this.camera.position);
    next.quaternion.copy(this.camera.quaternion);
    this.camera = next;
    this.orbit.object = next;
    this.gizmo.camera = next as Camera;
    this.resize();
    this.orbit.update();
  }

  /** The gizmo sits on the selected part, at its object-space pose. Nothing in `select` mode. */
  private attachGizmo(): void {
    const pose = this.selected ? worldPoseOf(this.nodes, this.selected) : null;
    if (!pose || this.settings.tool === 'select') {
      this.gizmo.detach();
      return;
    }
    this.pivot.position.set(...pose.position);
    this.pivot.quaternion.set(...pose.quaternion);
    this.pivot.scale.set(1, 1, 1);
    this.pivot.updateMatrixWorld(true);
    this.startMatrix.copy(this.pivot.matrixWorld);
    if (this.gizmo.object !== this.pivot) this.gizmo.attach(this.pivot);
  }

  // ---------------------------------------------------------------------------------------------- gizmo and picking

  /** While dragging, the selected part and its children follow the pivot (a preview; the edit lands on release). */
  private readonly onGizmoChange = (): void => {
    if (this.gizmo.dragging && this.selected) {
      this.pivot.updateMatrixWorld(true);
      const delta = this.pivot.matrixWorld.clone().multiply(this.startMatrix.clone().invert());
      for (const id of subtreeIds(this.nodes, this.selected)) this.parts.get(id)?.mesh.matrix.copy(delta);
    }
    this.invalidate();
  };

  private readonly onDragging = (event: { value?: unknown }): void => {
    this.orbit.enabled = !event.value;
    if (event.value || !this.selected) return;
    const id = this.selected;
    const mode = this.settings.tool;
    let next: PartNode[] = [...this.nodes];
    if (mode === 'translate') next = moveNodeTo(this.nodes, id, [this.pivot.position.x, this.pivot.position.y, this.pivot.position.z]);
    else if (mode === 'rotate') next = rotateNodeTo(this.nodes, id, [this.pivot.quaternion.x, this.pivot.quaternion.y, this.pivot.quaternion.z, this.pivot.quaternion.w]);
    else if (mode === 'scale') next = scaleNodeBy(this.nodes, id, [this.pivot.scale.x, this.pivot.scale.y, this.pivot.scale.z]);
    for (const { mesh } of this.parts.values()) mesh.matrix.identity();
    this.callbacks.onTransform(next, id);
  };

  private readonly onPointerDown = (e: PointerEvent): void => {
    this.down = { x: e.clientX, y: e.clientY };
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    const down = this.down;
    this.down = null;
    if (!down || e.button !== 0 || this.gizmo.dragging || this.gizmo.axis !== null) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_PIXELS) return; // an orbit or a pan, not a click
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const targets = [...this.parts.values()].filter((p) => p.mesh.visible).map((p) => p.mesh);
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    this.callbacks.onPick((hit?.object.userData.id as string | undefined) ?? null, e.shiftKey || e.ctrlKey);
  };

  // ---------------------------------------------------------------------------------------------- loop

  private readonly invalidate = (): void => {
    this.dirty = true;
  };

  private readonly resize = (): void => {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.perspective.aspect = aspect;
    this.perspective.updateProjectionMatrix();
    this.orthographic.left = -aspect;
    this.orthographic.right = aspect;
    this.orthographic.top = 1;
    this.orthographic.bottom = -1;
    this.orthographic.updateProjectionMatrix();
    this.invalidate();
  };

  private renderNow(): void {
    this.renderer.render(this.scene, this.camera);
    this.dirty = false;
  }

  private readonly loop = (): void => {
    if (this.disposed) return;
    this.frameHandle = requestAnimationFrame(this.loop);
    if (this.orbit.update()) this.dirty = true;
    if (this.dirty) this.renderNow();
  };
}

/** Unit direction from the target toward the camera for a preset view. */
export function viewDirection(view: Exclude<StageView, 'free'>): Vector3 {
  return new Vector3(...VIEW_DIRECTIONS[view]).normalize();
}
