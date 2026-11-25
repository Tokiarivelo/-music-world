"""Build the authored 3D models of Music World headlessly with Blender (the `bpy` module).

    python -I scripts/blender/build_models.py [--out apps/web/public/models] [--only tree,car]

Every model is modelled here from primitives (bevelled boxes, tapered cylinders, noise-displaced spheres, tori), so there
is no third-party asset: the output is MIT like the repository (see `apps/web/public/models/LICENSE.md`). Pipeline per
model: build in one bmesh with a vertex color per part, displace organic parts with seeded noise, bake a cheap ambient
occlusion into the vertex colors (darker toward the ground and in crevices), triangulate, merge close vertices,
decimate to the triangle budget, check, export one-mesh GLB (positions, normals, COLOR_0, no materials, no textures).

Axes in Blender (Z up): the GLB exporter turns +Z into +Y and +Y into -Z. Conventions of `xr/shapes/model-catalog.ts`:
trees, bicycle, airplane, cloud have their length along +X with the nose / front at +X (`forward: 'x'`); the car has its
length along Blender Y with the nose toward -Y (`forward: 'z'`).
"""

from __future__ import annotations

import argparse
import math
import os
import sys

import bpy  # first: it registers the bmesh and mathutils modules
import bmesh  # noqa: E402
from mathutils import Matrix, Vector, noise  # noqa: E402

BUDGET = {"tree": 1500, "conifer": 1200, "bush": 800, "cloud": 700, "car": 1800, "airplane": 1400, "bicycle": 1500}


def lin(hex_color: str, gain: float = 1.0) -> tuple[float, float, float, float]:
    """`#rrggbb` (sRGB) to linear RGBA."""
    h = hex_color.lstrip("#")
    c = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    c = [((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c]
    return (c[0] * gain, c[1] * gain, c[2] * gain, 1.0)


class Builder:
    """One bmesh; every primitive gets a color layer value so parts keep their own look."""

    def __init__(self) -> None:
        self.bm = bmesh.new()
        self.layer = self.bm.loops.layers.color.new("Col")

    def _paint(self, faces, color) -> None:
        for f in faces:
            for loop in f.loops:
                loop[self.layer] = color

    def _add(self, geom_fn, matrix: Matrix, color, **kw):
        before = set(self.bm.verts)
        geom_fn(self.bm, matrix=matrix, **kw)
        verts = [v for v in self.bm.verts if v not in before]
        faces = {f for v in verts for f in v.link_faces}
        self._paint(faces, color)
        return verts

    def sphere(self, center, radii, color, seg=8, rings=6, noise_amp=0.0, seed=0.0, rot=(0, 0, 0)):
        m = Matrix.Translation(center) @ Matrix.Rotation(rot[2], 4, "Z") @ Matrix.Diagonal((*radii, 1.0))
        verts = self._add(bmesh.ops.create_uvsphere, m, color, u_segments=seg, v_segments=rings, radius=1.0)
        if noise_amp:
            for v in verts:
                n = noise.noise(v.co * 1.7 + Vector((seed, seed * 0.7, seed * 1.3)))
                v.co += (v.co - Vector(center)).normalized() * n * noise_amp * max(radii)
        return verts

    def cylinder(self, p0, p1, r0, r1, color, seg=8, cap=True):
        """Tapered cylinder from p0 (radius r0) to p1 (radius r1)."""
        a, b = Vector(p0), Vector(p1)
        d = b - a
        length = d.length
        rot = d.to_track_quat("Z", "Y").to_matrix().to_4x4()
        m = Matrix.Translation((a + b) / 2) @ rot
        verts = self._add(
            bmesh.ops.create_cone, m, color, cap_ends=cap, cap_tris=False, segments=seg, radius1=r0, radius2=r1, depth=length
        )
        return verts

    def box(self, center, size, color, bevel=0.0, rot_z=0.0):
        m = Matrix.Translation(center) @ Matrix.Rotation(rot_z, 4, "Z") @ Matrix.Diagonal((size[0] / 2, size[1] / 2, size[2] / 2, 1.0))
        verts = self._add(bmesh.ops.create_cube, m, color, size=2.0)
        if bevel > 0:
            edges = {e for v in verts for e in v.link_edges}
            res = bmesh.ops.bevel(self.bm, geom=list(edges) + verts, offset=bevel, segments=2, affect="EDGES", profile=0.6)
            self._paint(res["faces"], color)
        return verts

    def torus(self, center, major, minor, color, axis="Y", seg=14, ring=5):
        # A torus lying in the XZ plane (wheel turning around Y), built as a lathe of a small circle.
        verts = []
        for i in range(seg):
            a = 2 * math.pi * i / seg
            for j in range(ring):
                b = 2 * math.pi * j / ring
                r = major + minor * math.cos(b)
                v = self.bm.verts.new((r * math.cos(a), minor * math.sin(b), r * math.sin(a)))
                verts.append(v)
        for i in range(seg):
            for j in range(ring):
                v00 = verts[i * ring + j]
                v10 = verts[((i + 1) % seg) * ring + j]
                v11 = verts[((i + 1) % seg) * ring + (j + 1) % ring]
                v01 = verts[i * ring + (j + 1) % ring]
                f = self.bm.faces.new((v00, v10, v11, v01))
                self._paint([f], color)
        bmesh.ops.transform(self.bm, matrix=Matrix.Translation(center) @ (Matrix.Rotation(math.pi / 2, 4, "X") if axis == "X" else Matrix.Identity(4)), verts=verts)
        return verts

    def finish(self, name: str, budget: int, ao_strength: float = 0.45, flat_bottom: float | None = None):
        bm = self.bm
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        zs = [v.co.z for v in bm.verts]
        zmin, zmax = min(zs), max(zs)
        span = max(1e-6, zmax - zmin)
        for v in bm.verts:
            if flat_bottom is not None and v.co.z < zmin + flat_bottom:
                v.co.z = zmin + flat_bottom
        for f in bm.faces:
            for loop in f.loops:
                h = (loop.vert.co.z - zmin) / span
                up = max(0.0, f.normal.z)
                shade = (1.0 - ao_strength) + ao_strength * (0.55 * h + 0.45 * up)
                c = loop[self.layer]
                loop[self.layer] = (c[0] * shade, c[1] * shade, c[2] * shade, 1.0)
        mesh = bpy.data.meshes.new(name)
        bm.to_mesh(mesh)
        bm.free()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        for p in mesh.polygons:
            p.use_smooth = True
        tris = len(mesh.polygons)
        if tris > budget:
            bpy.context.view_layer.objects.active = obj
            mod = obj.modifiers.new("decimate", "DECIMATE")
            mod.ratio = budget / tris
            bpy.ops.object.modifier_apply(modifier=mod.name)
        return obj


def shade(color, k: float) -> tuple[float, float, float, float]:
    return (min(1.0, color[0] * k), min(1.0, color[1] * k), min(1.0, color[2] * k), 1.0)


def tint(color, seed: float, amount: float = 0.22) -> tuple[float, float, float, float]:
    """A seeded variation of a color (value and a slight hue drift toward yellow-green), like real foliage."""
    n = noise.noise(Vector((seed, seed * 1.7, seed * 0.6)))
    k = 1.0 + amount * n
    return (min(1.0, color[0] * (k + 0.08 * n)), min(1.0, color[1] * k), min(1.0, color[2] * (k - 0.1 * n)), 1.0)


def tree() -> bpy.types.Object:
    b = Builder()
    bark, leaf = lin("#8f6742"), lin("#6cc45f")
    # Trunk with a root flare and a slight lean, then six limbs reaching into the crown.
    b.cylinder((0, 0, -0.02), (0, 0, 0.12), 0.12, 0.085, bark, seg=9)
    b.cylinder((0, 0, 0.1), (0.03, 0.01, 0.62), 0.085, 0.055, bark, seg=9)
    limbs = [((0.03, 0.01, 0.5), (0.3, 0.1, 0.95)), ((0.03, 0.01, 0.55), (-0.27, -0.12, 0.98)), ((0.03, 0.01, 0.6), (0.06, 0.3, 1.0)), ((0.03, 0.01, 0.58), (-0.05, -0.28, 0.94)), ((0.03, 0.01, 0.6), (0.2, -0.2, 1.12)), ((0.03, 0.01, 0.62), (-0.18, 0.2, 1.15))]
    for p0, p1 in limbs:
        b.cylinder(p0, p1, 0.035, 0.016, bark, seg=6)
    crown = [((0.3, 0.1, 1.0), 0.2), ((-0.27, -0.12, 1.02), 0.21), ((0.06, 0.3, 1.04), 0.2), ((-0.05, -0.28, 0.98), 0.2), ((0.2, -0.2, 1.17), 0.19), ((-0.18, 0.2, 1.2), 0.19), ((0.03, 0.0, 1.22), 0.26), ((0.38, -0.05, 1.2), 0.16), ((-0.38, 0.05, 1.18), 0.17), ((0.0, 0.0, 1.45), 0.2), ((0.18, 0.12, 1.4), 0.16), ((-0.16, -0.1, 1.38), 0.16)]
    for i, (c, r) in enumerate(crown):
        height = (c[2] - 0.9) / 0.7
        col = tint(shade(leaf, 0.85 + 0.35 * max(0.0, min(1.0, height))), i * 5.3)
        b.sphere(c, (r, r * 0.95, r * 0.88), col, seg=10, rings=7, noise_amp=0.28, seed=i * 3.7)
    return b.finish("tree", BUDGET["tree"], 0.32)


def conifer() -> bpy.types.Object:
    b = Builder()
    bark, leaf = lin("#7a5636"), lin("#4fae68")
    b.cylinder((0, 0, 0), (0, 0, 0.35), 0.075, 0.05, bark, seg=7)
    tiers = 8
    for i in range(tiers):
        z = 0.2 + i * 0.2
        r = 0.5 - i * 0.055
        col = tint(shade(leaf, 0.78 + 0.05 * i), i * 2.9, 0.15)
        verts = b.cylinder((0, 0, z), (0.004 * i, 0.003 * i, z + 0.34), r, 0.015, col, seg=14, cap=True)
        for v in verts:  # ragged, drooping rim: the lower ring is pushed in and out and pulled down
            rim = v.co.z < z + 0.1
            if rim:
                n = noise.noise(Vector((v.co.x * 5 + i, v.co.y * 5, i * 1.3)))
                v.co.x *= 1.0 + 0.18 * n
                v.co.y *= 1.0 + 0.18 * n
                v.co.z -= 0.045 * (1 + n)
    return b.finish("conifer", BUDGET["conifer"], 0.3)


def bush() -> bpy.types.Object:
    b = Builder()
    leaf = lin("#74c866")
    clumps = [((0, 0, 0.22), (0.4, 0.34, 0.24)), ((0.28, 0.08, 0.17), (0.26, 0.24, 0.18)), ((-0.27, -0.06, 0.17), (0.28, 0.25, 0.18)), ((0.02, 0.2, 0.3), (0.2, 0.2, 0.16)), ((-0.04, -0.2, 0.28), (0.22, 0.2, 0.15)), ((0.15, -0.15, 0.14), (0.2, 0.18, 0.13)), ((-0.18, 0.14, 0.15), (0.2, 0.19, 0.13)), ((0.0, 0.0, 0.38), (0.22, 0.2, 0.15)), ((0.4, -0.02, 0.1), (0.15, 0.14, 0.1))]
    for i, (c, r) in enumerate(clumps):
        b.sphere(c, r, tint(shade(leaf, 0.82 + 0.06 * (i % 4)), i * 4.1), seg=9, rings=6, noise_amp=0.26, seed=i * 2.3)
    return b.finish("bush", BUDGET["bush"], 0.32, flat_bottom=0.02)


def cloud() -> bpy.types.Object:
    b = Builder()
    white = lin("#f4f7ff")
    puffs = [((0.3, 0.12, 0.6), (0.3, 0.26, 0.24)), ((-0.35, -0.12, 0.55), (0.28, 0.24, 0.22)), ((0, 0, 0.3), (0.5, 0.4, 0.3)), ((0.45, 0.05, 0.22), (0.38, 0.32, 0.22)), ((-0.46, -0.04, 0.2), (0.4, 0.33, 0.22)), ((0.14, 0.12, 0.5), (0.34, 0.3, 0.26)), ((-0.18, -0.1, 0.46), (0.3, 0.26, 0.22)), ((0.75, 0.0, 0.14), (0.24, 0.2, 0.14)), ((-0.8, 0.02, 0.13), (0.24, 0.2, 0.13))]
    for i, (c, r) in enumerate(puffs):
        b.sphere(c, r, white, seg=11, rings=7, noise_amp=0.16, seed=i * 4.7)
    return b.finish("cloud", BUDGET["cloud"], 0.35, flat_bottom=0.05)


def car() -> bpy.types.Object:
    """Length along Y, nose toward -Y, ground at z = 0. Body from a real side profile, extruded and bevelled."""
    b = Builder()
    paint, glass, dark, tire, rim = lin("#d8dde6"), lin("#18202c"), lin("#15171c"), lin("#101114"), lin("#b9c0cc")
    profile = [(-0.96, 0.17), (-0.97, 0.34), (-0.9, 0.42), (-0.45, 0.47), (-0.16, 0.72), (0.34, 0.74), (0.74, 0.52), (0.95, 0.47), (0.97, 0.3), (0.94, 0.17)]
    half = 0.38
    bm = b.bm
    left = [bm.verts.new((-half, y, z)) for y, z in profile]
    right = [bm.verts.new((half, y, z)) for y, z in profile]
    faces = [bm.faces.new(left[::-1]), bm.faces.new(right)]
    for i in range(len(profile)):
        j = (i + 1) % len(profile)
        faces.append(bm.faces.new((left[i], left[j], right[j], right[i])))
    for f in faces:
        b._paint([f], paint)
    edges = {e for f in faces for e in f.edges}
    res = bmesh.ops.bevel(bm, geom=list(edges), offset=0.045, segments=2, affect="EDGES", profile=0.6)
    b._paint(res["faces"], paint)
    # Windows: faces of the cabin (above the beltline, between the pillars) get the glass color.
    for f in bm.faces:
        c = f.calc_center_median()
        if c.z > 0.5 and -0.3 < c.y < 0.62 and (abs(f.normal.x) > 0.6 or abs(f.normal.y) > 0.3 and c.z < 0.72):
            b._paint([f], glass)
    b.box((0, -0.97, 0.26), (0.7, 0.07, 0.09), dark, bevel=0.03)  # front bumper
    b.box((0, 0.97, 0.26), (0.7, 0.07, 0.09), dark, bevel=0.03)  # rear bumper
    b.box((0, -0.975, 0.35), (0.3, 0.03, 0.07), dark, bevel=0.01)  # grille
    for sx in (-0.27, 0.27):
        b.box((sx, -0.965, 0.37), (0.15, 0.05, 0.06), lin("#fff3b0", 1.3), bevel=0.015)  # headlights
        b.box((sx, 0.965, 0.37), (0.15, 0.05, 0.06), lin("#c8261e", 1.1), bevel=0.015)  # tail lights
    for sx in (-0.41, 0.41):
        b.box((sx, -0.22, 0.52), (0.06, 0.09, 0.05), paint, bevel=0.015)  # mirrors
    for sy in (-0.58, 0.6):
        for sx in (-0.4, 0.4):
            b.torus((sx, sy, 0.17), 0.12, 0.055, tire, axis="X", seg=16, ring=6)
            b.cylinder((sx - 0.03, sy, 0.17), (sx + 0.03, sy, 0.17), 0.1, 0.1, rim, seg=10)
            for k in range(5):  # spokes
                a = k * 2 * math.pi / 5
                b.cylinder((sx, sy, 0.17), (sx + 0.04 * (1 if sx > 0 else -1), sy + 0.085 * math.cos(a), 0.17 + 0.085 * math.sin(a)), 0.008, 0.008, dark, seg=4)
    return rotate_axis(b.finish("car", BUDGET["car"], 0.4), "car")


def rotate_axis(obj, _name):
    return obj


def airplane() -> bpy.types.Object:
    # Nose at +X, wings along Y, up is +Z.
    b = Builder()
    body, wing, accent, glass = lin("#e9edf5"), lin("#cfd6e3"), lin("#c64a3a"), lin("#243044")
    b.sphere((0, 0, 0.0), (0.9, 0.15, 0.15), body, seg=12, rings=7)  # fuselage
    b.cylinder((-0.6, 0, 0.02), (-1.25, 0, 0.1), 0.13, 0.05, body, seg=8)  # tail cone
    b.sphere((0.55, 0, 0.1), (0.2, 0.11, 0.07), glass, seg=8, rings=5)  # cockpit
    b.box((0.1, 0, -0.03), (0.5, 1.9, 0.045), wing, bevel=0.015)  # main wing
    b.box((-1.12, 0, 0.03), (0.28, 0.7, 0.035), wing, bevel=0.01)  # tailplane
    b.box((-1.1, 0, 0.2), (0.3, 0.03, 0.34), accent, bevel=0.01)  # fin
    for sy in (-0.42, 0.42):
        b.cylinder((0.28, sy, -0.12), (-0.05, sy, -0.12), 0.07, 0.065, wing, seg=8)  # engines
        b.cylinder((0.3, sy, -0.12), (0.34, sy, -0.12), 0.06, 0.02, accent, seg=8)
    for i in range(6):
        b.box((0.28 - i * 0.12, 0.142, 0.06), (0.05, 0.01, 0.045), glass)
        b.box((0.28 - i * 0.12, -0.142, 0.06), (0.05, 0.01, 0.045), glass)
    return b.finish("airplane", BUDGET["airplane"], 0.3)


def bicycle() -> bpy.types.Object:
    # Front wheel at +X, wheels turning around Y, z = 0 is the ground.
    b = Builder()
    frame, tire, rim, seat = lin("#c64a3a"), lin("#101114"), lin("#aab2c0"), lin("#1b1c20")
    for x in (-0.55, 0.55):
        b.torus((x, 0, 0.32), 0.3, 0.025, tire, axis="Y", seg=18, ring=5)
        b.torus((x, 0, 0.32), 0.27, 0.008, rim, axis="Y", seg=18, ring=4)
        b.cylinder((x, -0.02, 0.32), (x, 0.02, 0.32), 0.03, 0.03, rim, seg=6)
    rear, front, seat_top, head, bottom = (-0.55, 0, 0.32), (0.55, 0, 0.32), (-0.18, 0, 0.78), (0.4, 0, 0.74), (0.0, 0, 0.3)
    for p0, p1, r in [(rear, seat_top, 0.014), (seat_top, head, 0.016), (rear, bottom, 0.014), (bottom, head, 0.016), (seat_top, bottom, 0.014), (head, front, 0.014), ((0.4, 0, 0.74), (0.4, 0, 0.84), 0.014)]:
        b.cylinder(p0, p1, r, r, frame, seg=5)
    b.box((-0.2, 0, 0.82), (0.17, 0.07, 0.03), seat, bevel=0.01)
    b.cylinder((0.4, -0.2, 0.86), (0.4, 0.2, 0.86), 0.012, 0.012, rim, seg=5)  # handlebar
    return b.finish("bicycle", BUDGET["bicycle"], 0.35)


MODELS = {"tree": tree, "conifer": conifer, "bush": bush, "cloud": cloud, "car": car, "airplane": airplane, "bicycle": bicycle}


def export(obj, out_dir: str) -> tuple[int, int]:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    path = os.path.join(out_dir, f"{obj.name}.glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_texcoords=False,
        export_normals=True,
        export_materials="NONE",
        export_vertex_color="ACTIVE",
        export_active_vertex_color_when_no_material=True,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
    )
    return len(obj.data.polygons), os.path.getsize(path)


def main() -> int:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="apps/web/public/models")
    ap.add_argument("--only", default="")
    args = ap.parse_args(argv)
    os.makedirs(args.out, exist_ok=True)
    wanted = [n for n in args.only.split(",") if n] or list(MODELS)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    ok = True
    for name in wanted:
        obj = MODELS[name]()
        tris, size = export(obj, args.out)
        flag = "ok" if tris <= BUDGET[name] * 1.05 else "OVER BUDGET"
        ok &= flag == "ok"
        print(f"{name:9s} {tris:5d} triangles  {size / 1024:6.1f} KB  {flag}")
        bpy.data.objects.remove(obj)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
