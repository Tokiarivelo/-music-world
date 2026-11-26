"""Build the ocean models of Music World headlessly with Blender (I37).

    blender --background --python scripts/blender/build_ocean.py -- [--out apps/web/public/models] [--only shark,whale]
    python -I scripts/blender/build_ocean.py [--out ...]            (with the `bpy` module installed)

Same pipeline and licence as `build_models.py` (modelled from primitives here, no third-party asset, MIT): one bmesh per
model with a vertex color per part, seeded noise on organic parts, baked ambient occlusion, decimation to a budget,
one-mesh GLB. Animals follow the proportions and the colours of the real species (countershading: dark back, pale belly).

Axes in Blender (Z up): length along +X, nose / front toward +X, base near z = 0 (`forward: 'x'` in `model-catalog.ts`).
"""

from __future__ import annotations

import argparse
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_models as bm  # noqa: E402  (imports bpy, bmesh first)
from build_models import Builder, bmesh, bpy, noise, shade, tint  # noqa: E402
from mathutils import Euler, Matrix, Vector  # noqa: E402

BUDGET = {
    "whale": 2600, "shark": 2200, "dolphin": 2000, "manta_ray": 1800, "sea_turtle": 2400, "jellyfish": 1800,
    "octopus": 2600, "seahorse": 1800, "clownfish": 1200, "fish_school": 3600, "pufferfish": 1600, "kelp": 1800,
    "seagrass": 1400, "staghorn_coral": 2600, "brain_coral": 1600, "coral_fan": 1800, "tube_sponge": 1600,
    "sea_anemone": 2200, "starfish": 1000, "sea_urchin": 2200, "crab": 2200, "seashell": 1200, "shipwreck": 3000,
}
PI = math.pi


def lin(hex_color: str, gain: float = 1.0) -> tuple[float, float, float, float]:
    """`#rrggbb` as the raw value of the byte-colour layer. Blender stores that layer as sRGB bytes and the glTF
    exporter linearises it, so the file ends up with exactly the colour written here (no extra darkening)."""
    h = hex_color.lstrip("#")
    return (*(min(1.0, int(h[i : i + 2], 16) / 255 * gain) for i in (0, 2, 4)), 1.0)


def clamp01(v: float) -> float:
    return max(0.0, min(1.0, v))


def mix(a, b, t: float):
    t = clamp01(t)
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3)) + (1.0,)


def ell(b: Builder, c, r, color, rot=(0.0, 0.0, 0.0), seg=9, rings=6, amp=0.0, seed=0.0):
    """Ellipsoid centred on `c`, radii `r` (x, y, z), turned by the Euler angles `rot`; optional seeded noise."""
    m = Matrix.Translation(c) @ Euler(rot, "XYZ").to_matrix().to_4x4() @ Matrix.Diagonal((*r, 1.0))
    verts = b._add(bmesh.ops.create_uvsphere, m, color, u_segments=seg, v_segments=rings, radius=1.0)
    if amp:
        for v in verts:
            n = noise.noise(v.co * 1.7 + Vector((seed, seed * 0.7, seed * 1.3)))
            v.co += (v.co - Vector(c)).normalized() * n * amp * max(r)
    return verts


def chain(b: Builder, pts, r0: float, r1: float, color, seg=6, tip=None):
    """A tapered tube through `pts` (radius r0 at the first point, r1 at the last)."""
    n = len(pts) - 1
    for i in range(n):
        ra = r0 + (r1 - r0) * i / n
        rb = r0 + (r1 - r0) * (i + 1) / n
        col = color(i / max(1, n - 1)) if callable(color) else color
        b.cylinder(pts[i], pts[i + 1], ra, rb, col, seg=seg, cap=(i == n - 1))
        if i < n - 1:
            ell(b, pts[i + 1], (rb, rb, rb), col, seg=seg, rings=4)
    if tip is not None:
        ell(b, pts[-1], (r1 * 1.3,) * 3, tip, seg=seg, rings=4)


def loft(b: Builder, stations, color_fn, seg=12, amp=0.0):
    """Body through `stations` = (x, half-height, half-width, centre y, centre z) along +X; closed at zero radii."""
    rings = []
    for x, ry, rz, cy, cz in stations:
        if ry <= 0 and rz <= 0:
            rings.append([b.bm.verts.new((x, cy, cz))])
        else:
            rings.append([b.bm.verts.new((x, cy + rz * math.sin(2 * PI * k / seg), cz + ry * math.cos(2 * PI * k / seg))) for k in range(seg)])
    faces = []
    for i in range(len(rings) - 1):
        for k in range(seg):
            quad = [rings[i][k % len(rings[i])], rings[i][(k + 1) % len(rings[i])], rings[i + 1][(k + 1) % len(rings[i + 1])], rings[i + 1][k % len(rings[i + 1])]]
            uniq = list(dict.fromkeys(quad))
            if len(uniq) >= 3:
                faces.append(b.bm.faces.new(uniq))
    bmesh.ops.recalc_face_normals(b.bm, faces=faces)
    for f in faces:
        centre = f.calc_center_median()
        b._paint([f], color_fn(centre, f.normal))
    return faces


def countershade(back, belly, split=0.0, soft=0.55):
    """Colour by the face normal: dark back, pale belly, a soft transition on the flanks."""

    def fn(_p, n):
        return mix(back, belly, (-n.z - split) / soft + 0.5)

    return fn


def fish_profile(length, height, width, back, belly, accent=None, bands=(), nose=0.55):
    """Stations of a generic fish from tail (x = -L/2) to nose (x = +L/2) and the colour function of its body."""
    ts = [0.0, 0.08, 0.22, 0.4, 0.55, 0.7, 0.84, 0.94, 1.0]
    hs = [0.22, 0.28, 0.5, 0.9, 1.0, 0.92, 0.7, 0.38, 0.0]
    ws = [0.2, 0.24, 0.42, 0.85, 1.0, 0.9, 0.62, 0.32, 0.0]
    stations = [(-length / 2 + t * length, height * h / 2, width * w / 2, 0.0, 0.0) for t, h, w in zip(ts, hs, ws)]
    base = countershade(back, belly)

    def color(p, n):
        t = (p.x + length / 2) / length
        c = base(p, n)
        for t0, t1, band in bands:
            if t0 <= t <= t1:
                return band
        return c

    return stations, color


def fish(b: Builder, o, length, height, width, back, belly, fin, bands=(), yaw=0.0, eye=0.045, tail_h=1.0, dorsal=1.0, seed=0.0, seg=10, simple=False):
    """A fish at offset `o` (a Vector), nose toward +X; fins as flattened ellipsoids."""
    stations, color = fish_profile(length, height, width, back, belly, bands=bands)
    shifted = [(x + o[0], ry, rz, o[1], o[2]) for x, ry, rz, _y, _z in stations]
    loft(b, shifted, color, seg=seg)
    L, H = length, height
    ox, oy, oz = o
    ell(b, (ox - L * 0.55, oy, oz), (L * 0.11, L * 0.014, H * 0.42 * tail_h), fin, rot=(0, 0, 0), seg=7, rings=4)  # tail
    ell(b, (ox - L * 0.05, oy, oz + H * 0.5), (L * 0.2, L * 0.012, H * 0.3 * dorsal), fin, rot=(0, 0.35, 0), seg=7, rings=4)  # dorsal
    if simple:  # schools: the body, the tail and the dorsal fin read from afar, the rest costs triangles
        return
    ell(b, (ox - L * 0.1, oy, oz - H * 0.45), (L * 0.1, L * 0.012, H * 0.16), fin, rot=(0, -0.3, 0), seg=6, rings=4)  # anal
    for s in (-1, 1):
        ell(b, (ox + L * 0.12, oy + s * width * 0.45, oz - H * 0.15), (L * 0.09, L * 0.012, H * 0.14), fin, rot=(s * 0.5, 0.4, 0), seg=6, rings=4)
        ell(b, (ox + L * 0.38, oy + s * width * 0.3, oz + H * 0.1), (L * eye, L * eye * 0.6, L * eye), lin("#0a0a10"), seg=6, rings=4)


# ----------------------------------------------------------------------------------------------------------------
# Marine mammals and fish
# ----------------------------------------------------------------------------------------------------------------
def whale() -> bpy.types.Object:
    b = Builder()
    back, belly, fin = lin("#5a6b80"), lin("#c9ccd2"), lin("#46546a")
    ts = [0.0, 0.05, 0.12, 0.25, 0.42, 0.6, 0.78, 0.9, 0.97, 1.0]
    hs = [0.2, 0.24, 0.36, 0.62, 0.9, 1.0, 0.92, 0.72, 0.4, 0.0]
    ws = [0.14, 0.2, 0.3, 0.55, 0.85, 1.0, 0.95, 0.75, 0.42, 0.0]
    L, H, W = 4.0, 1.0, 0.95
    st = [(-L / 2 + t * L, H * h / 2, W * w / 2, 0.0, 0.0 + 0.04 * math.sin(t * PI)) for t, h, w in zip(ts, hs, ws)]
    loft(b, st, lambda p, n: mix(back, belly, (-n.z - 0.1) / 0.5 + 0.5 + (0.15 if p.x > 1.0 else 0)), seg=14)
    for s in (-1, 1):  # long pectoral flippers, white inside, and flukes
        ell(b, (0.5, s * 0.5, -0.2), (0.7, 0.05, 0.12), mix(fin, belly, 0.35), rot=(s * -0.6, 0.0, s * 0.45), seg=9, rings=5)
        ell(b, (-2.15, s * 0.36, 0.06), (0.3, 0.42, 0.04), fin, rot=(0, 0, s * 0.5), seg=9, rings=5)
    ell(b, (-1.0, 0, 0.52), (0.12, 0.03, 0.14), back, rot=(0, 0.5, 0), seg=7, rings=4)  # dorsal hump
    for i in range(7):  # knobs on the head (tubercles)
        ell(b, (1.55 + 0.05 * i, (i % 3 - 1) * 0.09, 0.3 + 0.012 * i), (0.04, 0.04, 0.035), shade(back, 1.25), seg=6, rings=4)
    for s in (-1, 1):  # ventral pleats
        for k in range(5):
            ell(b, (0.9 + 0.05 * k, s * 0.22, -0.4), (0.38, 0.012, 0.02), shade(belly, 0.82), seg=6, rings=3)
    return b.finish("whale", BUDGET["whale"], 0.25)


def shark() -> bpy.types.Object:
    b = Builder()
    back, belly, fin = lin("#82a0b4"), lin("#e9eef0"), lin("#6f8a9c")
    ts = [0.0, 0.06, 0.2, 0.38, 0.55, 0.72, 0.86, 0.95, 1.0]
    hs = [0.2, 0.24, 0.5, 0.88, 1.0, 0.9, 0.62, 0.3, 0.0]
    ws = [0.16, 0.2, 0.45, 0.82, 1.0, 0.85, 0.55, 0.25, 0.0]
    L, H, W = 2.6, 0.5, 0.42
    st = [(-L / 2 + t * L, H * h / 2, W * w / 2, 0.0, 0.0) for t, h, w in zip(ts, hs, ws)]
    loft(b, st, countershade(back, belly, 0.02, 0.35), seg=12)
    ell(b, (-1.3, 0, 0.12), (0.24, 0.025, 0.38), fin, rot=(0, 0.75, 0), seg=8, rings=5)  # upper caudal lobe
    ell(b, (-1.3, 0, -0.08), (0.18, 0.022, 0.2), fin, rot=(0, -0.6, 0), seg=8, rings=5)
    ell(b, (0.15, 0, 0.36), (0.26, 0.025, 0.3), fin, rot=(0, 0.7, 0), seg=8, rings=5)  # first dorsal fin
    ell(b, (-0.85, 0, 0.17), (0.08, 0.015, 0.1), fin, rot=(0, 0.6, 0), seg=6, rings=4)
    for s in (-1, 1):
        ell(b, (0.45, s * 0.25, -0.15), (0.34, 0.018, 0.1), fin, rot=(s * 0.7, 0.45, 0), seg=8, rings=5)
        ell(b, (-0.6, s * 0.12, -0.2), (0.12, 0.015, 0.06), fin, rot=(s * 0.4, 0.3, 0), seg=6, rings=4)
        ell(b, (1.0, s * 0.11, 0.07), (0.035, 0.03, 0.035), lin("#101216"), seg=6, rings=4)  # eyes
        for k in range(5):  # gill slits
            ell(b, (0.55 - 0.045 * k, s * 0.2, 0.05), (0.01, 0.014, 0.09), shade(back, 0.45), seg=5, rings=3)
    ell(b, (1.1, 0, -0.11), (0.14, 0.12, 0.03), shade(belly, 0.55), seg=8, rings=4)  # mouth
    return b.finish("shark", BUDGET["shark"], 0.25)


def dolphin() -> bpy.types.Object:
    b = Builder()
    back, belly, fin = lin("#6f8497"), lin("#e4ebef"), lin("#566a7b")
    ts = [0.0, 0.07, 0.2, 0.38, 0.55, 0.72, 0.85, 0.93, 1.0]
    hs = [0.2, 0.24, 0.45, 0.82, 1.0, 0.92, 0.6, 0.28, 0.0]
    ws = [0.16, 0.2, 0.42, 0.78, 1.0, 0.85, 0.5, 0.24, 0.0]
    L, H, W = 2.2, 0.5, 0.42
    st = [(-L / 2 + t * L, H * h / 2, W * w / 2, 0.0, 0.03 * math.sin(t * PI)) for t, h, w in zip(ts, hs, ws)]
    loft(b, st, countershade(back, belly, 0.0, 0.45), seg=12)
    b.cylinder((1.0, 0, -0.03), (1.38, 0, -0.04), 0.075, 0.045, mix(back, belly, 0.35), seg=8)  # beak
    ell(b, (1.4, 0, -0.04), (0.05, 0.045, 0.04), mix(back, belly, 0.35), seg=7, rings=4)
    ell(b, (-0.1, 0, 0.3), (0.22, 0.022, 0.24), fin, rot=(0, 0.95, 0), seg=8, rings=5)  # curved dorsal fin
    for s in (-1, 1):
        ell(b, (0.35, s * 0.2, -0.13), (0.22, 0.016, 0.07), fin, rot=(s * 0.7, 0.5, 0), seg=7, rings=4)
        ell(b, (-1.08, s * 0.14, 0.03), (0.15, 0.2, 0.02), fin, rot=(0, 0, s * 0.45), seg=8, rings=4)
        ell(b, (0.92, s * 0.1, 0.07), (0.03, 0.025, 0.03), lin("#0a0c10"), seg=6, rings=4)
    return b.finish("dolphin", BUDGET["dolphin"], 0.25)


def manta_ray() -> bpy.types.Object:
    b = Builder()
    top, under, fin = lin("#4b5f75"), lin("#e6eaee"), lin("#364659")
    for s in (-1, 1):  # wings: two swept ellipsoids
        ell(b, (0.05, s * 0.62, 0), (0.55, 0.62, 0.05), top, rot=(0, 0, s * 0.35), seg=12, rings=6)
        ell(b, (-0.25, s * 0.95, 0), (0.28, 0.42, 0.03), top, rot=(0, 0, s * 0.7), seg=10, rings=5)
        ell(b, (0.85, s * 0.2, 0.0), (0.14, 0.1, 0.05), top, rot=(0, 0, s * -0.4), seg=8, rings=4)  # cephalic fin
        ell(b, (0.88, s * 0.18, 0.0), (0.04, 0.03, 0.03), lin("#0a0c10"), seg=5, rings=3)
    ell(b, (0.2, 0, 0.03), (0.5, 0.28, 0.1), top, seg=12, rings=6)
    ell(b, (0.2, 0, -0.02), (0.46, 0.25, 0.07), under, seg=10, rings=5)  # white belly, patch behind the gills
    chain(b, [(-0.55, 0, 0), (-1.0, 0, 0.0), (-1.5, 0, 0.0), (-1.9, 0.0, 0.0)], 0.04, 0.008, fin, seg=5)
    ell(b, (-0.7, 0, 0.07), (0.07, 0.015, 0.06), fin, rot=(0, 0.5, 0), seg=6, rings=4)
    return b.finish("manta_ray", BUDGET["manta_ray"], 0.2)


def sea_turtle() -> bpy.types.Object:
    b = Builder()
    shell, shell2, skin, belly = lin("#8f8d4c"), lin("#6c6b36"), lin("#a8b878"), lin("#d8cf9a")
    ell(b, (0, 0, 0.16), (0.55, 0.42, 0.2), shell, seg=14, rings=8, amp=0.03, seed=2.0)
    for i in range(5):  # scutes: darker bumps along the shell
        ell(b, (0.28 - 0.14 * i, 0, 0.3 - 0.01 * i), (0.08, 0.13, 0.05), tint(shell2, i * 2.1, 0.3), seg=7, rings=4)
    for s in (-1, 1):
        for i in range(4):
            ell(b, (0.2 - 0.14 * i, s * 0.24, 0.24 - 0.02 * i), (0.07, 0.07, 0.04), tint(shell, i * 3.3 + s, 0.3), seg=6, rings=4)
    ell(b, (0, 0, 0.06), (0.5, 0.38, 0.09), belly, seg=12, rings=5)
    ell(b, (0.62, 0, 0.17), (0.17, 0.11, 0.11), skin, seg=10, rings=6)  # head
    for s in (-1, 1):
        ell(b, (0.7, s * 0.07, 0.2), (0.035, 0.02, 0.035), lin("#0a0a0c"), seg=6, rings=4)
        ell(b, (0.28, s * 0.4, 0.1), (0.3, 0.1, 0.035), skin, rot=(0, 0.2, s * -0.6), seg=9, rings=5)  # front flippers
        ell(b, (-0.42, s * 0.26, 0.09), (0.14, 0.06, 0.03), skin, rot=(0, 0, s * 0.5), seg=8, rings=4)
    ell(b, (-0.62, 0, 0.1), (0.1, 0.04, 0.03), skin, seg=7, rings=4)
    return b.finish("sea_turtle", BUDGET["sea_turtle"], 0.3)


def clownfish() -> bpy.types.Object:
    b = Builder()
    orange, white, black = lin("#f26a1b"), lin("#f6f2ea"), lin("#15110f")
    bands = ((0.66, 0.74, black), (0.67, 0.73, white), (0.4, 0.5, black), (0.41, 0.49, white))
    fish(b, Vector((0, 0, 0)), 0.6, 0.36, 0.2, orange, mix(orange, white, 0.15), shade(orange, 0.9), bands=bands, seed=1.0)
    return b.finish("clownfish", BUDGET["clownfish"], 0.2)


def pufferfish() -> bpy.types.Object:
    b = Builder()
    back, belly, fin = lin("#b79a58"), lin("#efe6c8"), lin("#9a8147")
    ell(b, (0, 0, 0.3), (0.34, 0.3, 0.3), back, seg=13, rings=9, amp=0.02, seed=3.0)
    ell(b, (0.0, 0, 0.2), (0.3, 0.26, 0.2), belly, seg=11, rings=6)
    for i in range(34):  # short spines
        a, c = i * 2.399, 0.96 - i * 0.056
        d = Vector((math.cos(a) * math.sqrt(max(0, 1 - c * c)), math.sin(a) * math.sqrt(max(0, 1 - c * c)), c))
        if d.z < -0.1:
            continue
        b.cylinder(Vector((0, 0, 0.3)) + d * 0.28, Vector((0, 0, 0.3)) + d * 0.36, 0.014, 0.002, shade(belly, 0.95), seg=4, cap=False)
    ell(b, (-0.38, 0, 0.3), (0.11, 0.015, 0.14), fin, seg=7, rings=4)
    for s in (-1, 1):
        ell(b, (0.27, s * 0.17, 0.4), (0.06, 0.05, 0.06), lin("#e8d27a"), seg=7, rings=4)
        ell(b, (0.3, s * 0.18, 0.4), (0.03, 0.025, 0.03), lin("#14110c"), seg=5, rings=3)
        ell(b, (0.05, s * 0.3, 0.26), (0.07, 0.015, 0.06), fin, rot=(s * 0.5, 0, 0), seg=6, rings=4)
    ell(b, (0.32, 0, 0.2), (0.05, 0.07, 0.03), shade(back, 0.55), seg=6, rings=4)
    return b.finish("pufferfish", BUDGET["pufferfish"], 0.25)


def fish_school() -> bpy.types.Object:
    """A horde of 36 small silver fish swimming the same way, in a loose ellipsoid (golden-angle spiral, no two alike)."""
    b = Builder()
    back, belly, fin = lin("#5a8fb0"), lin("#e6f1f6"), lin("#7aa5be")
    n = 36
    for i in range(n):
        a = i * 2.399
        c = 1 - 2 * (i + 0.5) / n
        r = math.sqrt(max(0.0, 1 - c * c))
        x, y, z = math.cos(a) * r * 1.0, math.sin(a) * r * 0.55, c * 0.3
        k = 1.0 + 0.14 * math.sin(i * 1.9)
        fish(b, Vector((x + 0.06 * math.sin(i * 3.1), y, 0.32 + z)), 0.26 * k, 0.085 * k, 0.05 * k, tint(back, i * 3.7, 0.12), belly, fin, seg=6, simple=True)
    return b.finish("fish_school", BUDGET["fish_school"], 0.12)


def jellyfish() -> bpy.types.Object:
    b = Builder()
    bell, rim, arm, tent = lin("#d4a3e8"), lin("#f4d8ff"), lin("#f0b4d8"), lin("#e3b7f0")
    ell(b, (0, 0, 0.62), (0.34, 0.34, 0.26), bell, seg=14, rings=8, amp=0.015, seed=1.0)
    for k in range(14):  # scalloped rim
        a = 2 * PI * k / 14
        ell(b, (math.cos(a) * 0.33, math.sin(a) * 0.33, 0.45), (0.06, 0.06, 0.04), rim, seg=6, rings=4)
    for k in range(4):  # frilled oral arms
        a = PI / 4 + k * PI / 2
        pts = [(math.cos(a) * 0.08 * (1 + 0.2 * i), math.sin(a) * 0.08 * (1 + 0.2 * i) + 0.03 * math.sin(i * 1.4), 0.5 - 0.1 * i) for i in range(5)]
        chain(b, pts, 0.045, 0.012, arm, seg=6)
    for k in range(18):  # fine tentacles
        a = 2 * PI * k / 18
        r = 0.3
        pts = [(math.cos(a) * r * (1 - 0.05 * i) + 0.02 * math.sin(i * 1.6 + k), math.sin(a) * r * (1 - 0.05 * i) + 0.02 * math.cos(i * 1.3 + k), 0.46 - 0.105 * i) for i in range(6)]
        chain(b, pts, 0.012, 0.004, tent, seg=4)
    return b.finish("jellyfish", BUDGET["jellyfish"], 0.18)


def octopus() -> bpy.types.Object:
    b = Builder()
    skin, dark = lin("#c4562f"), lin("#8d3a22")
    ell(b, (0, 0, 0.48), (0.27, 0.22, 0.34), skin, rot=(0, 0.35, 0), seg=12, rings=8, amp=0.03, seed=5.0)
    ell(b, (0.12, 0, 0.3), (0.22, 0.24, 0.17), skin, seg=10, rings=6)
    for s in (-1, 1):
        ell(b, (0.25, s * 0.13, 0.4), (0.07, 0.04, 0.07), lin("#e9d9a4"), seg=7, rings=4)
        ell(b, (0.3, s * 0.14, 0.4), (0.03, 0.02, 0.05), lin("#0a0a0a"), seg=6, rings=3)
    for k in range(8):
        a = 2 * PI * k / 8 + 0.2
        ca, sa = math.cos(a), math.sin(a)
        pts = []
        for i in range(7):
            r = 0.18 + 0.12 * i
            lift = max(0.0, 0.3 - 0.17 * i) + (0.12 if k % 3 == 0 and i > 3 else 0.0) * (i - 3)
            curl = 0.1 * math.sin(i * 0.9 + k)
            pts.append((ca * r - sa * curl, sa * r + ca * curl, 0.06 + lift))
        chain(b, pts, 0.07, 0.012, lambda t, _k=k: mix(skin, dark, t * 0.7 + 0.1 * math.sin(_k)), seg=6)
        for i in range(1, 4):  # suckers
            p = pts[i]
            ell(b, (p[0], p[1], p[2] - 0.045), (0.022, 0.022, 0.012), lin("#f0cdb4"), seg=5, rings=3)
    return b.finish("octopus", BUDGET["octopus"], 0.3)


def seahorse() -> bpy.types.Object:
    b = Builder()
    body, belly, fin = lin("#e8b531"), lin("#f6df8c"), lin("#f2cc55")
    spine = [(0.0, 0, 0.35 + 0.1 * i) for i in range(7)]  # trunk bows forward
    for i, p in enumerate(spine):
        bow = 0.07 * math.sin(i / 6 * PI)
        r = 0.09 + 0.045 * math.sin(i / 6 * PI)
        ell(b, (p[0] + bow, 0, p[2]), (r, r * 0.85, 0.075), mix(body, belly, 0.4 if i % 2 else 0.0), seg=8, rings=5, amp=0.04, seed=i)
        ell(b, (p[0] - 0.01, 0, p[2]), (0.012, 0.03, 0.075), shade(body, 0.8), seg=5, rings=3)
    ell(b, (0.12, 0, 1.06), (0.12, 0.085, 0.1), body, rot=(0, -0.5, 0), seg=9, rings=6)  # head
    b.cylinder((0.18, 0, 1.0), (0.34, 0, 0.92), 0.034, 0.022, body, seg=7)
    ell(b, (0.14, 0.05, 1.1), (0.025, 0.02, 0.025), lin("#101010"), seg=5, rings=3)
    for i in range(3):  # crown
        b.cylinder((0.07 - 0.03 * i, 0, 1.12 + 0.01 * i), (0.04 - 0.03 * i, 0, 1.2 + 0.02 * i), 0.018, 0.004, body, seg=4)
    tail = []
    for i in range(10):  # curled prehensile tail
        a = i * 0.58
        tail.append((0.0 - 0.07 * math.sin(a) * (1 - i * 0.04), 0, 0.33 - 0.0 - 0.08 * i * 0.5 + 0.1 * (1 - math.cos(a)) * 0.6))
    tail = [(-0.02 - 0.12 * math.sin(i * 0.55), 0, 0.33 - 0.11 * i * (1 - i * 0.04) + 0.0) for i in range(8)]
    tail = [(0.0 - 0.14 * math.sin(i * 0.5) + 0.0, 0, 0.35 - 0.08 * i + 0.05 * (1 - math.cos(i * 0.5))) for i in range(10)]
    chain(b, tail, 0.07, 0.012, lambda t: mix(body, belly, 0.3 + 0.4 * (round(t * 8) % 2)), seg=6)
    ell(b, (-0.08, 0, 0.62), (0.01, 0.07, 0.1), fin, seg=6, rings=4)
    b.cylinder((0, 0, -0.02), (0, 0, 0.3), 0.02, 0.0, lin("#4a7a3a"), seg=4, cap=False)
    return b.finish("seahorse", BUDGET["seahorse"], 0.3)


# ----------------------------------------------------------------------------------------------------------------
# Plants and reef
# ----------------------------------------------------------------------------------------------------------------
def blade(b: Builder, base, height: float, width: float, color, sway: float, phase: float, n: int = 6):
    """A flat leaf rising from `base`, waving with `sway`, wider at the middle, pointed at the tip."""
    for i in range(n):
        t0, t1 = i / n, (i + 1) / n
        x0 = base[0] + sway * math.sin(t0 * 2.4 + phase) * t0
        x1 = base[0] + sway * math.sin(t1 * 2.4 + phase) * t1
        w0 = width * math.sin(PI * (0.15 + 0.85 * t0 ** 0.8)) * (1 - 0.6 * t0)
        mid = ((x0 + x1) / 2, base[1] + 0.2 * sway * math.cos(t0 * 3 + phase), base[2] + height * (t0 + t1) / 2)
        seg_h = height / n * 0.62
        ell(b, mid, (max(0.004, w0), 0.006, seg_h), mix(color, shade(color, 1.35), t0), rot=(0, 0.5 * sway * math.cos(t0 * 2.4 + phase), 0.6 * math.sin(phase + t0)), seg=5, rings=3)


def kelp() -> bpy.types.Object:
    b = Builder()
    stipe, leaf = lin("#8f7a30"), lin("#bfb23c")
    ell(b, (0, 0, 0.03), (0.22, 0.2, 0.05), lin("#5c4a28"), seg=8, rings=4, amp=0.2, seed=3.0)  # holdfast
    for k in range(5):
        a = 2 * PI * k / 5 + 0.4
        base = (0.08 * math.cos(a), 0.08 * math.sin(a), 0.03)
        ph = k * 1.3
        pts = [(base[0] + 0.07 * math.sin(i * 0.6 + ph) * (i / 9), base[1] + 0.05 * math.cos(i * 0.7 + ph) * (i / 9), 0.03 + i * 0.22) for i in range(10)]
        chain(b, pts, 0.022, 0.01, stipe, seg=5)
        for i in range(1, 9):  # long wavy blades along the stipe
            p = pts[i]
            for s in (-1, 1):
                blade(b, (p[0] + s * 0.02, p[1], p[2]), 0.5, 0.15, tint(leaf, i * 1.7 + k), s * 0.14, ph + i, n=4)
    return b.finish("kelp", BUDGET["kelp"], 0.35)


def seagrass() -> bpy.types.Object:
    b = Builder()
    g = lin("#58a05a")
    for k in range(18):
        a = k * 2.399
        r = 0.05 + 0.2 * math.sqrt(k / 18)
        blade(b, (r * math.cos(a), r * math.sin(a), 0.0), 0.7 + 0.35 * math.sin(k * 1.7), 0.035, tint(g, k * 2.3, 0.2), 0.16 * (1 + 0.5 * math.sin(k)), k * 0.8, n=4)
    return b.finish("seagrass", BUDGET["seagrass"], 0.3)


def branch(b: Builder, p, d: Vector, length: float, r: float, depth: int, color, tip, seed: float):
    """Recursive coral branch: forks into two or three thinner branches."""
    end = Vector(p) + d * length
    b.cylinder(p, end, r, r * 0.72, mix(color, tip, 1 - depth / 3.0 * 0.0), seg=6, cap=depth == 0)
    if depth == 0:
        ell(b, end, (r * 0.8,) * 3, tip, seg=6, rings=4)
        return
    ell(b, end, (r * 0.74,) * 3, color, seg=6, rings=4)
    for j in range(2 if depth == 1 else 3):
        n = noise.noise(Vector((seed + j * 3.1 + depth, end.x * 3, end.y * 3)))
        ang = (j - 0.5 * (1 if depth == 1 else 2)) * 0.7 + 0.5 * n
        az = 2.4 * j + 5 * n
        nd = (d * math.cos(ang) + Vector((math.cos(az), math.sin(az), 0)) * math.sin(ang) + Vector((0, 0, 0.35))).normalized()
        branch(b, end, nd, length * 0.72, r * 0.72, depth - 1, color, tip, seed + j * 1.7)


def staghorn_coral() -> bpy.types.Object:
    b = Builder()
    col, tip = lin("#b79a72"), lin("#f0d6c8")
    for k in range(3):
        a = k * 2.1
        branch(b, (0.1 * math.cos(a), 0.1 * math.sin(a), 0.0), Vector((0.25 * math.cos(a), 0.25 * math.sin(a), 1.0)).normalized(), 0.32, 0.055, 3, tint(col, k * 2.0, 0.12), tip, k * 4.1)
    return b.finish("staghorn_coral", BUDGET["staghorn_coral"], 0.35)


def brain_coral() -> bpy.types.Object:
    b = Builder()
    col, groove = lin("#d2bb62"), lin("#7c7236")
    verts = ell(b, (0, 0, 0.18), (0.5, 0.46, 0.34), col, seg=26, rings=16)
    for v in verts:  # sinuous ridges: a band-pass of noise gives the maze of grooves
        n = noise.noise(v.co * 6.5 + Vector((3.0, 1.0, 2.0)))
        ridge = 1.0 - abs(n) * 2.0
        v.co += (v.co - Vector((0, 0, 0.18))).normalized() * 0.05 * ridge
    for f in b.bm.faces:
        for loop in f.loops:
            n = noise.noise(loop.vert.co * 6.5 + Vector((3.0, 1.0, 2.0)))
            loop[b.layer] = mix(groove, col, abs(n) * 5.0)
    return b.finish("brain_coral", BUDGET["brain_coral"], 0.4, flat_bottom=0.04)


def coral_fan() -> bpy.types.Object:
    b = Builder()
    col, tip = lin("#a8386a"), lin("#e27aa0")
    b.cylinder((0, 0, 0), (0, 0, 0.22), 0.045, 0.03, shade(col, 0.7), seg=6)
    for k in range(13):  # radiating ribs in a flat fan, crossed by fine connecting bars
        a = (k / 12 - 0.5) * 2.0
        pts = [(0.02 * math.sin(i), a * 0.12 * (i + 1) * 0.55 + 0.02 * math.sin(i * 2 + k), 0.22 + 0.17 * i * (1 - 0.12 * abs(a))) for i in range(6)]
        chain(b, pts, 0.016, 0.006, lambda t: mix(col, tip, t), seg=4)
    for i in range(1, 6):
        z = 0.22 + 0.17 * i * 0.9
        w = 0.12 * (i + 1) * 0.55 * 2.0
        b.cylinder((0, -w, z), (0, w, z), 0.005, 0.005, mix(col, tip, i / 6), seg=4)
    return b.finish("coral_fan", BUDGET["coral_fan"], 0.3)


def tube_sponge() -> bpy.types.Object:
    b = Builder()
    outer, inner = lin("#b873d4"), lin("#3a1c4a")
    for i, (x, y, h, r) in enumerate([(0, 0, 0.9, 0.11), (0.2, 0.08, 0.65, 0.09), (-0.17, 0.12, 0.72, 0.1), (0.08, -0.2, 0.5, 0.08), (-0.14, -0.14, 0.4, 0.07), (0.28, -0.12, 0.34, 0.06)]):
        verts = b.cylinder((x, y, 0), (x, y, h), r * 1.25, r, tint(outer, i * 3.1, 0.18), seg=10, cap=False)
        ell(b, (x, y, h - 0.01), (r * 0.9, r * 0.9, 0.012), inner, seg=10, rings=3)
        ell(b, (x, y, h * 0.5), (r * 1.05, r * 1.05, h * 0.5), tint(outer, i * 1.1, 0.2), seg=9, rings=5, amp=0.04, seed=i)
        _ = verts
    return b.finish("tube_sponge", BUDGET["tube_sponge"], 0.35)


def sea_anemone() -> bpy.types.Object:
    b = Builder()
    base, tent, tip = lin("#9c4e7c"), lin("#d478a8"), lin("#fbe0ee")
    b.cylinder((0, 0, 0), (0, 0, 0.2), 0.2, 0.16, base, seg=12)
    for ring, (n, r, h) in enumerate([(22, 0.15, 0.55), (16, 0.09, 0.62), (9, 0.04, 0.5)]):
        for k in range(n):
            a = 2 * PI * k / n + ring * 0.3
            lean = 0.25 + 0.2 * ring
            p0 = (math.cos(a) * r * 0.7, math.sin(a) * r * 0.7, 0.2)
            p1 = (math.cos(a) * (r + 0.07), math.sin(a) * (r + 0.07), 0.2 + h * 0.5)
            p2 = (math.cos(a) * (r + 0.07 + lean * 0.5) + 0.03 * math.sin(k * 2), math.sin(a) * (r + 0.07 + lean * 0.5), 0.2 + h * 0.95)
            chain(b, [p0, p1, p2], 0.022, 0.008, lambda t: mix(tent, tip, t * t), seg=4, tip=tip)
    return b.finish("sea_anemone", BUDGET["sea_anemone"], 0.3)


def starfish() -> bpy.types.Object:
    b = Builder()
    col, bump = lin("#ec7f2b"), lin("#f6b66b")
    ell(b, (0, 0, 0.06), (0.14, 0.14, 0.07), col, seg=10, rings=5)
    for k in range(5):
        a = 2 * PI * k / 5
        ca, sa = math.cos(a), math.sin(a)
        for i in range(5):
            r = 0.1 + 0.11 * i
            w = 0.085 * (1 - i / 5.6)
            ell(b, (ca * r, sa * r, 0.05 + 0.02 * (4 - i) * 0.4), (0.075, w, 0.04 * (1 - i / 7)), tint(col, k + i, 0.12), rot=(0, 0, a), seg=7, rings=4)
            ell(b, (ca * r, sa * r, 0.09 + 0.012 * (4 - i) * 0.4), (0.014, 0.014, 0.012), bump, seg=4, rings=3)
    return b.finish("starfish", BUDGET["starfish"], 0.35, flat_bottom=0.0)


def sea_urchin() -> bpy.types.Object:
    b = Builder()
    shell, spine = lin("#3a2447"), lin("#5b3a6e")
    ell(b, (0, 0, 0.2), (0.17, 0.17, 0.15), shell, seg=10, rings=7)
    for i in range(70):
        a, c = i * 2.399, 0.97 - i * 0.0285
        s = math.sqrt(max(0.0, 1 - c * c))
        d = Vector((math.cos(a) * s, math.sin(a) * s, c * 0.9))
        d.normalize()
        if d.z < -0.15:
            continue
        L = 0.3 + 0.05 * math.sin(i * 1.3)
        b.cylinder(Vector((0, 0, 0.2)) + d * 0.14, Vector((0, 0, 0.2)) + d * (0.14 + L), 0.014, 0.003, mix(spine, lin("#9c7bb0"), 0.4 * (i % 3) / 2), seg=4, cap=False)
    return b.finish("sea_urchin", BUDGET["sea_urchin"], 0.3)


def crab() -> bpy.types.Object:
    b = Builder()
    shell, leg, claw = lin("#c9482b"), lin("#b13a22"), lin("#e0603a")
    ell(b, (0, 0, 0.16), (0.3, 0.22, 0.11), shell, seg=12, rings=7, amp=0.03, seed=4.0)
    ell(b, (0.27, 0, 0.14), (0.06, 0.15, 0.05), shade(shell, 0.85), seg=8, rings=4)
    for s in (-1, 1):
        for k in range(4):  # four walking legs per side
            x = 0.16 - 0.1 * k
            knee = (x + 0.04, s * 0.3, 0.3 - 0.01 * k)
            foot = (x - 0.05 + 0.04 * (k % 2), s * (0.5 + 0.03 * k), 0.0)
            chain(b, [(x, s * 0.19, 0.18), knee, foot], 0.03, 0.012, leg, seg=5)
        arm = [(0.22, s * 0.18, 0.2), (0.38, s * 0.28, 0.24), (0.5, s * 0.22, 0.2)]
        chain(b, arm, 0.04, 0.034, leg, seg=6)
        ell(b, (0.6, s * 0.2, 0.19), (0.12, 0.08, 0.06), claw, rot=(0, 0, s * -0.2), seg=9, rings=5)  # big pincer
        ell(b, (0.69, s * 0.14, 0.2), (0.07, 0.025, 0.035), claw, rot=(0, 0, s * -0.55), seg=7, rings=4)
        b.cylinder((0.26, s * 0.06, 0.24), (0.28, s * 0.07, 0.31), 0.012, 0.01, leg, seg=4)
        ell(b, (0.28, s * 0.07, 0.32), (0.025, 0.025, 0.025), lin("#0a0a0a"), seg=5, rings=3)
    return b.finish("crab", BUDGET["crab"], 0.3, flat_bottom=0.0)


def seashell() -> bpy.types.Object:
    b = Builder()
    pink, cream = lin("#f1b7a8"), lin("#fbeee0")
    verts = ell(b, (0, 0, 0.12), (0.4, 0.42, 0.13), pink, rot=(0, 0.35, 0), seg=26, rings=9)
    for v in verts:  # radial ribs of a scallop
        a = math.atan2(v.co.y, v.co.x - 0.0)
        v.co += (v.co - Vector((0, 0, 0.2))).normalized() * 0.05 * math.sin(a * 9)
    for f in b.bm.faces:
        for loop in f.loops:
            a = math.atan2(loop.vert.co.y, loop.vert.co.x)
            loop[b.layer] = mix(pink, cream, 0.5 + 0.5 * math.sin(a * 9))
    ell(b, (-0.2, 0, 0.12), (0.07, 0.14, 0.05), shade(cream, 0.9), seg=8, rings=4)
    return b.finish("seashell", BUDGET["seashell"], 0.35, flat_bottom=0.03)


def shipwreck() -> bpy.types.Object:
    b = Builder()
    wood, dark, algae = lin("#94714c"), lin("#5e4531"), lin("#5f9a55")
    L = 2.4
    ts = [0.0, 0.12, 0.3, 0.5, 0.7, 0.88, 1.0]
    hs = [0.1, 0.5, 0.85, 1.0, 0.9, 0.55, 0.0]
    ws = [0.1, 0.6, 0.95, 1.0, 0.9, 0.55, 0.05]
    st = [(-L / 2 + t * L, 0.28 * h, 0.5 * w, 0.0, 0.3) for t, h, w in zip(ts, hs, ws)]
    faces = loft(b, st, lambda p, n: mix(wood, algae, 0.25 + 0.35 * (n.z > 0.2)), seg=12)
    for k in range(7):  # exposed ribs where planks are gone
        x = -0.85 + 0.28 * k
        for s in (-1, 1):
            chain(b, [(x, s * 0.22, 0.45), (x + 0.02, s * 0.45, 0.62), (x + 0.04, s * 0.55, 0.9)], 0.028, 0.018, dark, seg=5)
    b.cylinder((0.3, 0, 0.4), (0.15, 0, 1.55), 0.045, 0.03, wood, seg=6)  # broken mast
    b.cylinder((0.18, 0, 1.35), (0.55, 0.05, 1.28), 0.022, 0.018, dark, seg=5)
    b.box((-1.05, 0, 0.9), (0.28, 0.3, 0.32), wood, bevel=0.015)  # stern castle
    ell(b, (0.0, 0.0, 0.3), (0.9, 0.35, 0.12), tint(algae, 1.0, 0.2), seg=9, rings=4, amp=0.15, seed=2.0)
    _ = faces
    return b.finish("shipwreck", BUDGET["shipwreck"], 0.35)


OCEAN = {
    "whale": whale, "shark": shark, "dolphin": dolphin, "manta_ray": manta_ray, "sea_turtle": sea_turtle,
    "jellyfish": jellyfish, "octopus": octopus, "seahorse": seahorse, "clownfish": clownfish, "fish_school": fish_school,
    "pufferfish": pufferfish, "kelp": kelp, "seagrass": seagrass, "staghorn_coral": staghorn_coral,
    "brain_coral": brain_coral, "coral_fan": coral_fan, "tube_sponge": tube_sponge, "sea_anemone": sea_anemone,
    "starfish": starfish, "sea_urchin": sea_urchin, "crab": crab, "seashell": seashell, "shipwreck": shipwreck,
}


def main() -> int:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="apps/web/public/models")
    ap.add_argument("--only", default="")
    args = ap.parse_args(argv)
    os.makedirs(args.out, exist_ok=True)
    wanted = [n for n in args.only.split(",") if n] or list(OCEAN)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    ok = True
    for name in wanted:
        obj = OCEAN[name]()
        obj.name = name
        tris, size = bm.export(obj, args.out)
        flag = "ok" if tris <= BUDGET[name] * 1.05 else "OVER BUDGET"
        ok &= flag == "ok"
        print(f"{name:15s} {tris:5d} triangles  {size / 1024:6.1f} KB  {flag}")
        bpy.data.objects.remove(obj)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
