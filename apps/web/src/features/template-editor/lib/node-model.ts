import { plainMaterial } from '@/xr/shapes/node-builder';
import { PART_TEXTURES } from '@/xr/shapes/part-textures';
import type { Template } from '@/templates/generated';

/** Pure, immutable edits of a recipe's part tree (`recipe.nodes`, flat, parents first). Mirrors `shape.py` limits. */

export type Recipe = Template['recipes'][number];
export type PartNode = Recipe['nodes'][number];
export type NodePrimitive = PartNode['primitive'];
export type NodeField = 'px' | 'py' | 'pz' | 'rx' | 'ry' | 'rz' | 'sx' | 'sy' | 'sz' | 'sides' | 'taper';

export const MAX_NODES = 48;
export const MAX_NODE_DEPTH = 4;
export const NODE_NAME_MAX = 40;
export const PRIMITIVES: readonly NodePrimitive[] = ['box', 'cylinder', 'cone', 'sphere', 'prism', 'gable', 'extrude'];
export type NodeOperation = PartNode['operation'];
export type ProfilePoint = PartNode['profile'][number];
export const MAX_PROFILE_POINTS = 12;
export const MIN_PROFILE_POINTS = 3;
export const BEVEL_MAX = 0.45;
const SQUARE_PROFILE: ProfilePoint[] = [{ x: -0.5, z: -0.5 }, { x: 0.5, z: -0.5 }, { x: 0.5, z: 0.5 }, { x: -0.5, z: 0.5 }];

export const NODE_BOUNDS: Readonly<Record<NodeField, { min: number; max: number; integer?: boolean }>> = {
  px: { min: -2, max: 2 }, py: { min: -2, max: 2 }, pz: { min: -2, max: 2 },
  rx: { min: -180, max: 180 }, ry: { min: -180, max: 180 }, rz: { min: -180, max: 180 },
  sx: { min: 0.02, max: 2 }, sy: { min: 0.02, max: 2 }, sz: { min: 0.02, max: 2 },
  sides: { min: 3, max: 12, integer: true }, taper: { min: 0, max: 1 },
};

export function clampNode(field: NodeField, value: number): number {
  const { min, max, integer } = NODE_BOUNDS[field];
  if (!Number.isFinite(value)) return min;
  const v = Math.min(max, Math.max(min, value));
  return integer ? Math.round(v) : v;
}

export function nodeDepth(nodes: readonly PartNode[], id: string): number {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let depth = 1;
  for (let n = byId.get(id); n?.parent; n = byId.get(n.parent)) depth += 1;
  return depth;
}

/** `id` and every node below it, in list order. */
export function subtreeIds(nodes: readonly PartNode[], id: string): Set<string> {
  const ids = new Set([id]);
  for (const n of nodes) if (n.parent && ids.has(n.parent)) ids.add(n.id);
  return ids;
}

export function freshNodeId(nodes: readonly PartNode[], base: string): string {
  const stem = base.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_\d+$/, '').slice(0, 20) || 'part';
  const taken = new Set(nodes.map((n) => n.id));
  for (let i = 1; ; i += 1) {
    const id = `${stem}_${i}`;
    if (!taken.has(id)) return id;
  }
}

export function renameNode(nodes: readonly PartNode[], id: string, raw: string): PartNode[] {
  const name = raw.trim().slice(0, NODE_NAME_MAX);
  if (!name) return [...nodes];
  return nodes.map((n) => (n.id === id ? { ...n, name } : n));
}

/** Hiding a part hides what hangs from it in the viewport; the flag itself stays on the one node. */
export function toggleHidden(nodes: readonly PartNode[], id: string): PartNode[] {
  return nodes.map((n) => (n.id === id ? { ...n, hidden: !n.hidden } : n));
}

export function deleteNode(nodes: readonly PartNode[], id: string): PartNode[] {
  const gone = subtreeIds(nodes, id);
  return nodes.filter((n) => !gone.has(n.id));
}

/** Copies a part with its children right after the subtree, offset a little; unchanged when over the node limit. */
export function duplicateNode(nodes: readonly PartNode[], id: string): PartNode[] {
  const ids = subtreeIds(nodes, id);
  const copied = nodes.filter((n) => ids.has(n.id));
  if (copied.length === 0 || nodes.length + copied.length > MAX_NODES) return [...nodes];
  const rename = new Map<string, string>();
  const used = [...nodes];
  for (const n of copied) {
    const fresh = freshNodeId(used, n.id);
    rename.set(n.id, fresh);
    used.push({ ...n, id: fresh });
  }
  const copies = copied.map((n): PartNode => {
    const root = n.id === id;
    return {
      ...n,
      id: rename.get(n.id)!,
      name: root ? `${n.name} copy`.slice(0, NODE_NAME_MAX) : n.name,
      parent: n.parent && rename.has(n.parent) ? rename.get(n.parent)! : n.parent,
      position: root ? { ...n.position, x: clampNode('px', (n.position?.x ?? 0) + 0.1) } : n.position,
    };
  });
  const last = nodes.reduce((at, n, i) => (ids.has(n.id) ? i : at), -1);
  return [...nodes.slice(0, last + 1), ...copies, ...nodes.slice(last + 1)];
}

export type Axis = 'x' | 'y' | 'z';
export const AXES: readonly Axis[] = ['x', 'y', 'z'];
export const ARRAY_MIN = 2;
export const ARRAY_MAX = 8;

/** Copies of a subtree with fresh ids and remapped parents; `tweak` adjusts each copy (root flag given). */
function cloneSubtree(nodes: readonly PartNode[], id: string, used: PartNode[], tweak: (n: PartNode, root: boolean) => PartNode): PartNode[] {
  const ids = subtreeIds(nodes, id);
  const rename = new Map<string, string>();
  const copied = nodes.filter((n) => ids.has(n.id));
  for (const n of copied) {
    const fresh = freshNodeId(used, n.id);
    rename.set(n.id, fresh);
    used.push({ ...n, id: fresh });
  }
  return copied.map((n) => tweak({ ...n, id: rename.get(n.id)!, parent: n.parent && rename.has(n.parent) ? rename.get(n.parent)! : n.parent }, n.id === id));
}

function insertAfterSubtree(nodes: readonly PartNode[], id: string, copies: readonly PartNode[]): PartNode[] {
  const ids = subtreeIds(nodes, id);
  const last = nodes.reduce((at, n, i) => (ids.has(n.id) ? i : at), -1);
  return [...nodes.slice(0, last + 1), ...copies, ...nodes.slice(last + 1)];
}

/** Reflects a part and its children across the plane normal to `axis` (position negated, rotation flipped). */
export function mirrorNode(nodes: readonly PartNode[], id: string, axis: Axis): PartNode[] {
  const size = subtreeIds(nodes, id).size;
  if (size === 0 || !nodes.some((n) => n.id === id) || nodes.length + size > MAX_NODES) return [...nodes];
  const flip: Record<Axis, Axis[]> = { x: ['y', 'z'], y: ['x', 'z'], z: ['x', 'y'] };
  const copies = cloneSubtree(nodes, id, [...nodes], (n, root) => {
    const position = { x: n.position?.x ?? 0, y: n.position?.y ?? 0, z: n.position?.z ?? 0 };
    position[axis] = -position[axis];
    const rotation = { x: n.rotation?.x ?? 0, y: n.rotation?.y ?? 0, z: n.rotation?.z ?? 0 };
    for (const a of flip[axis]) rotation[a] = -rotation[a];
    return { ...n, name: root ? `${n.name} mirror`.slice(0, NODE_NAME_MAX) : n.name, position, rotation };
  });
  return insertAfterSubtree(nodes, id, copies);
}

/** `count` copies in all (the part plus `count - 1` more) spaced `step` metres apart along `axis`. */
export function arrayNode(nodes: readonly PartNode[], id: string, axis: Axis, count: number, step: number): PartNode[] {
  const n = Math.min(ARRAY_MAX, Math.max(ARRAY_MIN, Math.round(Number.isFinite(count) ? count : ARRAY_MIN)));
  const size = subtreeIds(nodes, id).size;
  if (!nodes.some((x) => x.id === id) || nodes.length + size * (n - 1) > MAX_NODES) return [...nodes];
  const bound = NODE_BOUNDS[`p${axis}` as NodeField];
  const used = [...nodes];
  const all: PartNode[] = [];
  for (let i = 1; i < n; i += 1) {
    all.push(...cloneSubtree(nodes, id, used, (c, root) => {
      if (!root) return c;
      const at = (c.position?.[axis] ?? 0) + i * (Number.isFinite(step) ? step : 0);
      return { ...c, name: `${c.name} ${i + 1}`.slice(0, NODE_NAME_MAX), position: { x: c.position?.x ?? 0, y: c.position?.y ?? 0, z: c.position?.z ?? 0, [axis]: Math.min(bound.max, Math.max(bound.min, at)) } };
    }));
  }
  return insertAfterSubtree(nodes, id, all);
}

/** Moves a part by `delta` metres along `axis` (clamped); the gizmo and the nudge buttons use it. */
export function nudgeNode(nodes: readonly PartNode[], id: string, axis: Axis, delta: number): PartNode[] {
  const node = nodes.find((n) => n.id === id);
  if (!node) return [...nodes];
  const field = `p${axis}` as NodeField;
  return setNodeNumber(nodes, id, field, readNodeField(node, field) + delta);
}

/** A new part under `parent` (null: a root). Unchanged when the tree is full or too deep. */
export function addNode(nodes: readonly PartNode[], primitive: NodePrimitive, parent: string | null): PartNode[] {
  if (nodes.length >= MAX_NODES) return [...nodes];
  if (parent !== null && (!nodes.some((n) => n.id === parent) || nodeDepth(nodes, parent) >= MAX_NODE_DEPTH)) return [...nodes];
  const id = freshNodeId(nodes, primitive);
  const node: PartNode = {
    id,
    name: `${primitive[0]!.toUpperCase()}${primitive.slice(1)}`,
    primitive,
    parent,
    hidden: false,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    size: { x: 0.3, y: 0.3, z: 0.3 },
    sides: 8,
    taper: 1,
    material: plainMaterial(), bevel: 0, profile: primitive === 'extrude' ? SQUARE_PROFILE.map((q) => ({ ...q })) : [], operation: 'add' as const,
  };
  if (parent === null) return [...nodes, node];
  const end = nodes.reduce((at, n, i) => (subtreeIds(nodes, parent).has(n.id) ? i : at), -1);
  return [...nodes.slice(0, end + 1), node, ...nodes.slice(end + 1)];
}

export function setNodePrimitive(nodes: readonly PartNode[], id: string, primitive: NodePrimitive): PartNode[] {
  return nodes.map((n) => {
    if (n.id !== id) return n;
    const profile = primitive === 'extrude' && n.profile.length < MIN_PROFILE_POINTS ? SQUARE_PROFILE.map((q) => ({ ...q })) : n.profile;
    return { ...n, primitive, profile };
  });
}

const edit = (nodes: readonly PartNode[], id: string, change: (n: PartNode) => PartNode): PartNode[] => nodes.map((n) => (n.id === id ? change(n) : n));

/** Chamfer of a box's edges, 0 (sharp) to 0.45 (a share of each side). */
export function setNodeBevel(nodes: readonly PartNode[], id: string, raw: number): PartNode[] {
  const v = Math.min(BEVEL_MAX, Math.max(0, Number.isFinite(raw) ? raw : 0));
  return edit(nodes, id, (n) => ({ ...n, bevel: v }));
}

/** Whether `id` may be combined into its parent: it needs a parent that is a plain part, and no combined child of its own. */
export function canCombine(nodes: readonly PartNode[], id: string): boolean {
  const node = nodes.find((n) => n.id === id);
  const parent = node?.parent ? nodes.find((n) => n.id === node.parent) : undefined;
  return !!node && !!parent && parent.operation === 'add' && !nodes.some((n) => n.parent === id && n.operation !== 'add');
}

/** Sets how a part meets its parent: its own solid (add), merged into it (union) or cut out of it (subtract). */
export function setNodeOperation(nodes: readonly PartNode[], id: string, operation: NodeOperation): PartNode[] {
  if (operation !== 'add' && !canCombine(nodes, id)) return [...nodes];
  return edit(nodes, id, (n) => ({ ...n, operation }));
}

/** True when the outline turns the same way at every corner (collinear points allowed) and has an area (mirrors `shape.py`). */
export function isConvexProfile(points: readonly ProfilePoint[]): boolean {
  const n = points.length;
  if (n < MIN_PROFILE_POINTS) return false;
  let sign = 0;
  let area2 = 0;
  for (let i = 0; i < n; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    const c = points[(i + 2) % n]!;
    const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
    area2 += a.x * b.z - b.x * a.z;
    if (Math.abs(cross) < 1e-9) continue;
    const step = cross > 0 ? 1 : -1;
    if (sign && step !== sign) return false;
    sign = step;
  }
  return Math.abs(area2) > 1e-6;
}

const clampPoint = (v: number) => Math.min(0.5, Math.max(-0.5, Number.isFinite(v) ? v : 0));

/** A regular outline of `sides` corners inside the unit footprint. */
export function regularProfile(sides: number): ProfilePoint[] {
  const n = Math.min(MAX_PROFILE_POINTS, Math.max(MIN_PROFILE_POINTS, Math.round(sides)));
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: Number((0.5 * Math.cos(a)).toFixed(4)), z: Number((0.5 * Math.sin(a)).toFixed(4)) };
  });
}

export function setProfile(nodes: readonly PartNode[], id: string, profile: readonly ProfilePoint[]): PartNode[] {
  return edit(nodes, id, (n) => ({ ...n, profile: profile.map((p) => ({ x: clampPoint(p.x), z: clampPoint(p.z) })) }));
}

export function setProfilePoint(nodes: readonly PartNode[], id: string, index: number, axis: 'x' | 'z', raw: number): PartNode[] {
  return edit(nodes, id, (n) => ({ ...n, profile: n.profile.map((p, i) => (i === index ? { ...p, [axis]: clampPoint(raw) } : p)) }));
}

/** Adds a corner after `index` (halfway to the next one). Unchanged at 12 corners. */
export function addProfilePoint(nodes: readonly PartNode[], id: string, index: number): PartNode[] {
  return edit(nodes, id, (n) => {
    if (n.profile.length >= MAX_PROFILE_POINTS || index < 0 || index >= n.profile.length) return n;
    const a = n.profile[index]!;
    const b = n.profile[(index + 1) % n.profile.length]!;
    const mid = { x: Number(((a.x + b.x) / 2).toFixed(4)), z: Number(((a.z + b.z) / 2).toFixed(4)) };
    return { ...n, profile: [...n.profile.slice(0, index + 1), mid, ...n.profile.slice(index + 1)] };
  });
}

/** Removes a corner. Unchanged at 3 corners. */
export function removeProfilePoint(nodes: readonly PartNode[], id: string, index: number): PartNode[] {
  return edit(nodes, id, (n) => (n.profile.length <= MIN_PROFILE_POINTS ? n : { ...n, profile: n.profile.filter((_, i) => i !== index) }));
}

export function readNodeField(node: PartNode, field: NodeField): number {
  switch (field) {
    case 'px': return node.position?.x ?? 0;
    case 'py': return node.position?.y ?? 0;
    case 'pz': return node.position?.z ?? 0;
    case 'rx': return node.rotation?.x ?? 0;
    case 'ry': return node.rotation?.y ?? 0;
    case 'rz': return node.rotation?.z ?? 0;
    case 'sx': return node.size?.x ?? 0.5;
    case 'sy': return node.size?.y ?? 0.5;
    case 'sz': return node.size?.z ?? 0.5;
    case 'sides': return node.sides ?? 8;
    case 'taper': return node.taper ?? 1;
  }
}

export function setNodeNumber(nodes: readonly PartNode[], id: string, field: NodeField, raw: number): PartNode[] {
  const v = clampNode(field, raw);
  return nodes.map((n) => {
    if (n.id !== id) return n;
    switch (field) {
      case 'px': case 'py': case 'pz': return { ...n, position: { ...n.position, [field[1]!]: v } };
      case 'rx': case 'ry': case 'rz': return { ...n, rotation: { ...n.rotation, [field[1]!]: v } };
      case 'sx': case 'sy': case 'sz': return { ...n, size: { ...n.size, [field[1]!]: v } };
      case 'sides': return { ...n, sides: v };
      case 'taper': return { ...n, taper: v };
    }
  });
}

/** Applies a node-list change to recipe `index` of the template. */
export function updateNodes(template: Template, index: number, change: (nodes: readonly PartNode[]) => PartNode[]): Template {
  const recipe = template.recipes[index];
  if (!recipe) return template;
  return { ...template, recipes: template.recipes.map((r, i) => (i === index ? { ...r, nodes: change(r.nodes ?? []) } : r)) };
}

export type NodeMaterial = PartNode['material'];
export type MaterialPatch = Partial<Pick<NodeMaterial, 'color' | 'colorRole' | 'emissive' | 'roughness' | 'texture'>>;
export { PART_TEXTURES };
export const PART_ROLES = ['primary', 'accent', 'secondary', 'staff', 'line'] as const;
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Changes the look of one part. Invalid hex becomes null; numbers are clamped to 0..1; a hex clears the role. */
export function setNodeMaterial(nodes: readonly PartNode[], id: string, patch: MaterialPatch): PartNode[] {
  const unit = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
  return nodes.map((n) => {
    if (n.id !== id) return n;
    const next: NodeMaterial = { ...n.material };
    if ('color' in patch) {
      next.color = patch.color && HEX.test(patch.color) ? patch.color.toLowerCase() : null;
      if (next.color) next.colorRole = null;
    }
    if ('colorRole' in patch) {
      next.colorRole = patch.colorRole ?? null;
      if (next.colorRole) next.color = null;
    }
    if (patch.emissive !== undefined) next.emissive = unit(patch.emissive);
    if ('roughness' in patch) next.roughness = patch.roughness === null || patch.roughness === undefined ? null : unit(patch.roughness);
    if (patch.texture !== undefined && (PART_TEXTURES as readonly string[]).includes(patch.texture)) next.texture = patch.texture;
    return { ...n, material: next };
  });
}
