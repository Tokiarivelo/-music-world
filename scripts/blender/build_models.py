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

BUDGET = {"tree": 700, "conifer": 600, "bush": 500, "cloud": 420, "car": 800, "airplane": 700, "bicycle": 800}


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


def tree() -> bpy.types.Object:
    b = Builder()
    bark, leaf = lin("#8f6742"), lin("#6cc45f")
    b.cylinder((0, 0, 0), (0.02, 0, 0.55), 0.075, 0.05, bark, seg=7)
    b.cylinder((0.02, 0, 0.5), (0.2, 0.05, 0.78), 0.035, 0.02, bark, seg=5)
    b.cylinder((0.02, 0, 0.55), (-0.18, -0.06, 0.82), 0.032, 0.018, bark, seg=5)
    for i, (c, r, s) in enumerate([((0.0, 0.0, 0.95), (0.34, 0.32, 0.3), 1), ((0.22, 0.06, 0.82), (0.24, 0.22, 0.2), 2), ((-0.2, -0.05, 0.86), (0.25, 0.23, 0.21), 3), ((0.02, 0.02, 1.2), (0.22, 0.2, 0.2), 4)]):
        shade = 1.0 + 0.12 * (i - 1.5) / 1.5
        b.sphere(c, r, tuple(min(1.0, v * shade) for v in leaf[:3]) + (1.0,), seg=9, rings=6, noise_amp=0.22, seed=s * 3.1)
    return b.finish("tree", BUDGET["tree"], 0.32)


def conifer() -> bpy.types.Object:
    b = Builder()
    bark, leaf = lin("#7a5636"), lin("#4fae68")
    b.cylinder((0, 0, 0), (0, 0, 0.3), 0.06, 0.045, bark, seg=6)
    for i in range(5):
        z = 0.18 + i * 0.27
        r = 0.46 - i * 0.075
        shade = 0.8 + 0.1 * i
        c = tuple(min(1.0, v * shade) for v in leaf[:3]) + (1.0,)
        b.cylinder((0, 0, z), (0.01 * i, 0, z + 0.42), r, 0.012, c, seg=9, cap=True)
    return b.finish("conifer", BUDGET["conifer"], 0.3)


def bush() -> bpy.types.Object:
    b = Builder()
    leaf = lin("#74c866")
    for i, (c, r, s) in enumerate([((0, 0, 0.22), (0.4, 0.34, 0.24), 1), ((0.28, 0.08, 0.17), (0.26, 0.24, 0.18), 2), ((-0.27, -0.06, 0.17), (0.28, 0.25, 0.18), 3), ((0.02, 0.2, 0.3), (0.2, 0.2, 0.16), 4), ((-0.04, -0.2, 0.28), (0.22, 0.2, 0.15), 5)]):
        shade = 0.9 + 0.08 * (i % 3)
        b.sphere(c, r, tuple(min(1.0, v * shade) for v in leaf[:3]) + (1.0,), seg=8, rings=5, noise_amp=0.2, seed=s * 2.3)
    return b.finish("bush", BUDGET["bush"], 0.32, flat_bottom=0.02)


def cloud() -> bpy.types.Object:
    b = Builder()
    white = lin("#f4f7ff")
    puffs = [((0, 0, 0.3), (0.5, 0.4, 0.3)), ((0.45, 0.05, 0.22), (0.38, 0.32, 0.22)), ((-0.46, -0.04, 0.2), (0.4, 0.33, 0.22)), ((0.14, 0.12, 0.5), (0.34, 0.3, 0.26)), ((-0.18, -0.1, 0.46), (0.3, 0.26, 0.22)), ((0.75, 0.0, 0.14), (0.24, 0.2, 0.14)), ((-0.8, 0.02, 0.13), (0.24, 0.2, 0.13))]
    for i, (c, r) in enumerate(puffs):
        b.sphere(c, r, white, seg=9, rings=6, noise_amp=0.12, seed=i * 4.7)
    return b.finish("cloud", BUDGET["cloud"], 0.35, flat_bottom=0.05)


def car() -> bpy.types.Object:
    # Length along Y, nose toward -Y, wheels on the ground (z = 0 is the ground).
    b = Builder()
    paint, glass, dark, tire, rim = lin("#d8dde6"), lin("#1c2430"), lin("#15171c"), lin("#101114"), lin("#b9c0cc")
    b.box((0, 0, 0.3), (0.74, 1.9, 0.26), paint, bevel=0.07)  # lower body
    b.box((0, 0.1, 0.52), (0.62, 0.95, 0.24), paint, bevel=0.08)  # cabin roof block
    b.box((0, 0.1, 0.52), (0.645, 0.9, 0.17), glass, bevel=0.05)  # glass band
    b.box((0, -0.62, 0.43), (0.7, 0.55, 0.06), paint, bevel=0.025)  # bonnet
    b.box((0, -0.97, 0.26), (0.68, 0.08, 0.1), dark, bevel=0.03)  # front bumper
    b.box((0, 0.97, 0.26), (0.68, 0.08, 0.1), dark, bevel=0.03)  # rear bumper
    for sx in (-0.26, 0.26):
        b.box((sx, -0.955, 0.34), (0.15, 0.05, 0.06), lin("#fff3b0", 1.3), bevel=0.015)  # headlights
        b.box((sx, 0.955, 0.34), (0.15, 0.05, 0.06), lin("#c8261e", 1.1), bevel=0.015)  # tail lights
    for sy in (-0.58, 0.6):
        for sx in (-0.4, 0.4):
            b.torus((sx, sy, 0.17), 0.12, 0.055, tire, axis="X", seg=14, ring=5)
            b.cylinder((sx - 0.02, sy, 0.17), (sx + 0.02, sy, 0.17), 0.1, 0.1, rim, seg=8)
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
