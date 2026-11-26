"""Build the fantasy models of Music World headlessly with Blender (I40, "Enchanted Realm").

    python -I scripts/blender/build_fantasy.py [--out apps/web/public/models] [--only castle,dragon]

Same pipeline and licence as `build_models.py` / `build_ocean.py` (modelled from primitives, no third-party asset, MIT):
one bmesh per model, a vertex colour per part, seeded noise on organic parts, baked ambient occlusion, decimation to a
budget, one-mesh GLB. Length along +X, front toward +X, base at z = 0 (`forward: 'x'` in `model-catalog.ts`).
"""

from __future__ import annotations

import argparse
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_models as bm  # noqa: E402
from build_models import Builder, bpy, shade, tint  # noqa: E402
from build_ocean import chain, ell, lin, loft, mix  # noqa: E402
from mathutils import Vector  # noqa: E402

PI = math.pi
BUDGET = {
    "castle": 4200, "wizard_tower": 2600, "mushroom_house": 2200, "giant_mushroom": 2200, "crystal_cluster": 1800,
    "magic_tree": 3000, "dragon": 4200, "glow_flower": 1800,
}


def cone(b: Builder, base, height: float, r: float, color, seg=10, tip_r=0.012):
    b.cylinder(base, (base[0], base[1], base[2] + height), r, tip_r, color, seg=seg, cap=True)


def window(b: Builder, p, size=(0.09, 0.03, 0.15), color=None, rot_z=0.0):
    b.box(p, size, color or lin("#ffd27a"), bevel=0.004, rot_z=rot_z)


def round_tower(b: Builder, x, y, r, h, stone, roof, roof_h, flag=None, seg=12):
    b.cylinder((x, y, 0), (x, y, h), r, r * 0.92, stone, seg=seg)
    b.cylinder((x, y, h), (x, y, h + 0.07), r * 1.22, r * 1.18, shade(stone, 0.8), seg=seg)  # corbel ring
    cone(b, (x, y, h + 0.07), roof_h, r * 1.3, roof, seg=seg)
    for k in range(4):
        a = k * PI / 2 + 0.4
        window(b, (x + math.cos(a) * r * 0.93, y + math.sin(a) * r * 0.93, h * 0.62), rot_z=a)
    if flag:
        top = h + 0.07 + roof_h
        b.cylinder((x, y, top), (x, y, top + 0.28), 0.012, 0.01, lin("#3a3a48"), seg=5)
        b.box((x + 0.1, y, top + 0.22), (0.2, 0.012, 0.11), flag)


def castle() -> bpy.types.Object:
    """Fairy-tale castle: curtain walls with a gate, four round towers with cone roofs, a tall keep. About 4 x 4 x 4."""
    b = Builder()
    stone, stone_d, gold = lin("#c9c4d8"), lin("#9b96b3"), lin("#ffcf4d")
    violet, teal, rose = lin("#6a4fd6"), lin("#27b3c4"), lin("#e0559a")
    W = 1.9
    for sx, sy, sz, cx, cy in ((2 * W, 0.22, 0.75, 0, -W), (2 * W, 0.22, 0.75, 0, W), (0.22, 2 * W, 0.75, -W, 0), (0.22, 2 * W, 0.75, W, 0)):
        b.box((cx, cy, sz / 2), (sx, sy, sz), stone, bevel=0.012)
        n = int((sx if sx > 0.5 else sy) / 0.26)
        for i in range(n):  # battlements
            t = -((sx if sx > 0.5 else sy) / 2) + 0.13 + i * 0.26
            b.box((cx + (t if sx > 0.5 else 0), cy + (t if sx <= 0.5 else 0), sz + 0.07), (0.13 if sx > 0.5 else 0.25, 0.25 if sx > 0.5 else 0.13, 0.14), stone_d, bevel=0.01)
    # Gate: arch in the south wall, wooden door and two small lights.
    b.box((0, -W - 0.12, 0.34), (0.62, 0.1, 0.68), lin("#4a3328"), bevel=0.02)
    b.cylinder((0, -W - 0.12, 0.66), (0, -W - 0.12, 0.7), 0.31, 0.31, lin("#4a3328"), seg=14)
    ell(b, (0, -W - 0.12, 0.66), (0.31, 0.05, 0.22), lin("#4a3328"), seg=12, rings=4)
    b.box((0, -W - 0.2, 0.34), (0.05, 0.02, 0.66), gold)
    roofs = (violet, teal, rose, violet)
    for k, (x, y) in enumerate(((-W, -W), (W, -W), (W, W), (-W, W))):
        round_tower(b, x, y, 0.36, 1.45, stone, roofs[k], 0.95, flag=gold if k % 2 == 0 else lin("#e0559a"))
    # Central keep: square block, round top tower, cone roof, side turrets.
    b.box((0, 0, 0.9), (1.3, 1.3, 1.8), stone, bevel=0.03)
    for i in range(6):
        window(b, (-0.45 + i * 0.18, -0.67, 1.1), color=lin("#ffd27a"))
        window(b, (-0.45 + i * 0.18, -0.67, 0.55), color=lin("#ffd27a"))
    b.box((0, -0.67, 0.27), (0.34, 0.05, 0.54), lin("#4a3328"), bevel=0.02)
    round_tower(b, 0, 0, 0.5, 3.0, stone, violet, 1.7, flag=gold)
    for k in range(4):  # side turrets on the keep corners
        a = PI / 4 + k * PI / 2
        round_tower(b, math.cos(a) * 0.78, math.sin(a) * 0.78, 0.17, 2.15, stone_d, (teal, rose)[k % 2], 0.55)
    b.cylinder((0, 0, 4.72), (0, 0, 4.82), 0.03, 0.03, gold, seg=6)
    ell(b, (0, 0, 4.85), (0.07, 0.07, 0.07), gold, seg=8, rings=5)
    # Hill foot / courtyard stones.
    ell(b, (0, 0, 0.02), (2.3, 2.3, 0.06), lin("#6b9a4e"), seg=18, rings=3, amp=0.05, seed=2.0)
    return b.finish("castle", BUDGET["castle"], 0.4)


def wizard_tower() -> bpy.types.Object:
    """Leaning wizard tower: tapering shaft, twisting stairs, balcony, hat roof with a bent tip and a floating orb."""
    b = Builder()
    stone, roof, gold = lin("#b9b3d0"), lin("#4f3bb5"), lin("#ffcf4d")
    pts = [(0.05 * math.sin(i * 0.5), 0.03 * i * 0.2, i * 0.5) for i in range(7)]
    for i in range(6):
        r0, r1 = 0.52 - i * 0.045, 0.52 - (i + 1) * 0.045
        b.cylinder(pts[i], pts[i + 1], r0, r1, mix(stone, shade(stone, 0.85), i / 6), seg=12, cap=False)
    ell(b, (0, 0, 0.12), (0.62, 0.62, 0.2), lin("#7e7a96"), seg=12, rings=4, amp=0.1, seed=1.0)
    spiral = [(0.5 * math.cos(t * 0.9 + 0.5) * (0.5 - 0.035 * t * 0.5), 0.5 * math.sin(t * 0.9 + 0.5) * (0.5 - 0.035 * t * 0.5), 0.2 + t * 0.4) for t in range(0, 7)]
    chain(b, spiral, 0.035, 0.03, lin("#8b6a49"), seg=5)
    for k in range(7):
        a = k * 0.95 + 0.4
        window(b, (0.5 * math.cos(a) * (0.52 - 0.04 * (0.4 + k * 0.4) * 0.5), 0.5 * math.sin(a) * (0.52 - 0.04 * (0.4 + k * 0.4) * 0.5), 0.5 + k * 0.4), rot_z=a)
    b.cylinder((0.04, 0.02, 3.0), (0.04, 0.02, 3.08), 0.62, 0.6, lin("#7a5a3c"), seg=14)  # balcony
    for k in range(12):
        a = k * PI / 6
        b.cylinder((0.04 + 0.6 * math.cos(a), 0.02 + 0.6 * math.sin(a), 3.08), (0.04 + 0.6 * math.cos(a), 0.02 + 0.6 * math.sin(a), 3.28), 0.012, 0.012, lin("#7a5a3c"), seg=4)
    b.cylinder((0.04, 0.02, 3.0), (0.06, 0.02, 3.9), 0.42, 0.36, stone, seg=12)
    top = [(0.06, 0.02, 3.9), (0.1, 0.03, 4.4), (0.2, 0.05, 4.85), (0.38, 0.08, 5.15), (0.6, 0.1, 5.3)]
    for i in range(4):
        b.cylinder(top[i], top[i + 1], 0.52 - i * 0.16, 0.52 - (i + 1) * 0.16 if i < 3 else 0.02, mix(roof, lin("#7a5bff"), i / 4), seg=12, cap=(i == 3))
    ell(b, (0.04, 0.02, 3.92), (0.58, 0.58, 0.07), shade(roof, 0.8), seg=14, rings=3)
    ell(b, (0.5, 0.12, 5.5), (0.1, 0.1, 0.1), lin("#7ff4ff"), seg=10, rings=6)  # floating orb
    for k, (dx, dz) in enumerate(((0.2, -0.1), (-0.25, 0.06), (0.05, 0.22))):
        ell(b, (0.5 + dx, 0.12 + dz * 0.3, 5.5 + dz), (0.035, 0.035, 0.035), lin("#c9fbff"), seg=6, rings=4)
    return b.finish("wizard_tower", BUDGET["wizard_tower"], 0.4)


def mushroom_house() -> bpy.types.Object:
    """Gnome house: a stout stem for the walls, a big red spotted cap for the roof, round door, lit windows, chimney."""
    b = Builder()
    cream, red, white, wood = lin("#f2e4c4"), lin("#d83a3f"), lin("#fff6e6"), lin("#6a452c")
    b.cylinder((0, 0, 0), (0, 0, 0.9), 0.62, 0.52, cream, seg=14)
    ell(b, (0, 0, 0.05), (0.62, 0.62, 0.1), lin("#6b9a4e"), seg=14, rings=3, amp=0.12, seed=3.0)
    ell(b, (0, 0, 1.05), (0.95, 0.95, 0.55), red, seg=16, rings=8, amp=0.04, seed=4.0)
    ell(b, (0, 0, 0.84), (0.86, 0.86, 0.09), shade(red, 0.8), seg=16, rings=3)  # rim of the cap
    for k, (a, r, z, s) in enumerate(((0.3, 0.55, 1.42, 0.17), (2.0, 0.7, 1.28, 0.14), (3.4, 0.5, 1.4, 0.15), (4.6, 0.72, 1.22, 0.12), (5.6, 0.38, 1.52, 0.1), (1.2, 0.9, 1.0, 0.11))):
        ell(b, (math.cos(a) * r, math.sin(a) * r, z), (s, s, s * 0.4), white, seg=8, rings=4, rot=(0, 0, a))
    b.box((0.5, 0, 0.3), (0.14, 0.34, 0.5), wood, bevel=0.02)
    ell(b, (0.5, 0, 0.55), (0.08, 0.17, 0.12), wood, seg=10, rings=4)
    ell(b, (0.56, 0, 0.3), (0.025, 0.025, 0.025), lin("#ffcf4d"), seg=5, rings=3)
    window(b, (0.33, 0.37, 0.5), (0.12, 0.12, 0.16), rot_z=0.9)
    window(b, (0.33, -0.37, 0.5), (0.12, 0.12, 0.16), rot_z=-0.9)
    b.cylinder((-0.45, 0.2, 1.3), (-0.45, 0.2, 1.72), 0.1, 0.085, lin("#8f5a3c"), seg=8)
    ell(b, (-0.45, 0.2, 1.8), (0.09, 0.09, 0.07), lin("#d8d8e8"), seg=8, rings=4, amp=0.2, seed=5.0)
    return b.finish("mushroom_house", BUDGET["mushroom_house"], 0.4)


def giant_mushroom() -> bpy.types.Object:
    """Glowing giant mushroom (violet cap, cyan spots, luminous gills) with two small ones at its foot."""
    b = Builder()
    stem, cap, spot, gill = lin("#efe6ff"), lin("#8a4cf0"), lin("#58f0e6"), lin("#ff8de0")

    def one(x, y, scale, hue):
        c = mix(cap, lin("#e04cc8"), hue)
        b.cylinder((x, y, 0), (x + 0.04 * scale, y, 1.0 * scale), 0.22 * scale, 0.14 * scale, stem, seg=10)
        ell(b, (x + 0.04 * scale, y, 1.0 * scale), (0.85 * scale, 0.85 * scale, 0.5 * scale), c, seg=16, rings=8, amp=0.05, seed=x * 3 + 1)
        ell(b, (x + 0.04 * scale, y, 0.98 * scale), (0.78 * scale, 0.78 * scale, 0.09 * scale), gill, seg=16, rings=3)
        for k in range(6):
            a = k * 1.1 + hue
            r = (0.3 + 0.35 * ((k * 7) % 5) / 5) * scale
            ell(b, (x + 0.04 * scale + math.cos(a) * r, y + math.sin(a) * r, (1.0 + 0.42 * math.sqrt(max(0.05, 1 - (r / (0.85 * scale)) ** 2))) * scale), (0.09 * scale, 0.09 * scale, 0.035 * scale), spot, seg=6, rings=3)

    one(0, 0, 1.0, 0.0)
    one(0.62, 0.32, 0.38, 0.6)
    one(-0.42, 0.5, 0.28, 0.3)
    ell(b, (0.1, 0, 0.03), (0.7, 0.7, 0.07), lin("#5e9a64"), seg=12, rings=3, amp=0.15, seed=2.0)
    return b.finish("giant_mushroom", BUDGET["giant_mushroom"], 0.35)


def crystal_cluster() -> bpy.types.Object:
    """Seven hexagonal crystals (magenta, cyan, violet) of different heights growing out of a rock."""
    b = Builder()
    rock = lin("#5e5878")
    ell(b, (0, 0, 0.1), (0.62, 0.55, 0.2), rock, seg=10, rings=5, amp=0.18, seed=6.0)
    specs = ((0, 0, 1.5, 0.15, 0.0, "#d94cff", 0.0), (0.28, 0.1, 1.0, 0.11, 0.35, "#4cf0ff", 1.0), (-0.25, 0.14, 0.95, 0.11, -0.4, "#8f6bff", 2.0),
             (0.08, -0.28, 0.8, 0.1, 0.2, "#ff6bd8", 3.0), (-0.12, -0.2, 0.6, 0.09, -0.3, "#4cf0ff", 4.0), (0.4, -0.12, 0.55, 0.08, 0.5, "#d94cff", 5.0), (-0.4, -0.08, 0.5, 0.07, -0.5, "#8f6bff", 6.0))
    for x, y, h, r, lean, hexcol, s in specs:
        base = Vector((x, y, 0.12))
        d = Vector((math.sin(lean), 0.15 * math.cos(s), math.cos(lean))).normalized()
        col = lin(hexcol)
        mid = base + d * h * 0.78
        top = base + d * h
        b.cylinder(base, mid, r, r * 0.92, mix(col, lin("#ffffff"), 0.1), seg=6)
        b.cylinder(mid, top, r * 0.92, 0.012, mix(col, lin("#ffffff"), 0.4), seg=6)
    return b.finish("crystal_cluster", BUDGET["crystal_cluster"], 0.3)


def magic_tree() -> bpy.types.Object:
    """Ancient magical tree: twisted trunk, buttress roots, a round canopy of teal and pink lobes with glowing fruit."""
    b = Builder()
    bark, bark_d = lin("#6b4a5e"), lin("#4a3345")
    trunk = [(0, 0, 0), (0.06, 0.04, 0.5), (-0.04, 0.08, 1.0), (0.05, 0.02, 1.5), (0.0, -0.04, 1.95)]
    chain(b, trunk, 0.3, 0.17, lambda t: mix(bark_d, bark, t), seg=9)
    for k in range(5):  # roots
        a = k * 1.26 + 0.3
        chain(b, [(0.1 * math.cos(a), 0.1 * math.sin(a), 0.25), (0.34 * math.cos(a), 0.34 * math.sin(a), 0.1), (0.58 * math.cos(a), 0.58 * math.sin(a), 0.02)], 0.1, 0.03, bark_d, seg=6)
    limbs = []
    for k in range(4):
        a = k * 1.57 + 0.5
        end = (0.75 * math.cos(a), 0.75 * math.sin(a), 2.55 + 0.1 * k % 3)
        chain(b, [(0.0, -0.04, 1.85), (0.3 * math.cos(a), 0.3 * math.sin(a), 2.15), end], 0.13, 0.06, bark, seg=6)
        limbs.append(end)
    teal, pink, deep = lin("#34f0c0", 1.0), lin("#ff6fd0"), lin("#4aa8ff")
    lobes = [(0, 0, 3.05, 1.0, 0.0), (0.85, 0.2, 2.85, 0.7, 0.8), (-0.8, 0.35, 2.9, 0.72, 0.4), (0.3, -0.85, 2.8, 0.68, 0.9), (-0.3, 0.85, 3.0, 0.65, 0.2), (0.0, 0.0, 3.65, 0.62, 0.6), (0.7, -0.5, 3.25, 0.55, 0.5), (-0.7, -0.4, 3.3, 0.55, 0.1)]
    for i, (x, y, z, r, hue) in enumerate(lobes):
        c = mix(mix(deep, teal, hue), pink, 0.5 * hue * hue)
        ell(b, (x, y, z), (r, r, r * 0.78), tint(c, i * 1.7, 0.1), seg=11, rings=7, amp=0.12, seed=i * 2.3)
    for i in range(14):  # glowing fruit and floating motes
        a = i * 2.4
        rr = 0.55 + 0.45 * ((i * 5) % 7) / 7
        z = 2.5 + 0.9 * ((i * 3) % 5) / 5
        ell(b, (math.cos(a) * rr * 1.3, math.sin(a) * rr * 1.3, z), (0.065, 0.065, 0.065), lin("#fff3a8") if i % 3 else lin("#c9fbff"), seg=6, rings=4)
    for k in range(5):  # vines
        a = k * 1.3 + 1.0
        chain(b, [(math.cos(a) * 1.0, math.sin(a) * 1.0, 2.7), (math.cos(a) * 1.08, math.sin(a) * 1.08, 2.2), (math.cos(a) * 1.1, math.sin(a) * 1.1, 1.75)], 0.025, 0.012, lin("#3fa87c"), seg=4)
    return b.finish("magic_tree", BUDGET["magic_tree"], 0.22)


def dragon() -> bpy.types.Object:
    """Emerald dragon perched with half-raised wings: long neck, horned head, folded legs, spiked back, long spade tail."""
    b = Builder()
    green, belly, horn, wing, wing_d = lin("#2f9a6a"), lin("#e7c86b"), lin("#f3e6c4"), lin("#8a4cc2"), lin("#5b2f93")
    L = 2.2
    st = [(-L / 2, 0.0, 0.0, 0.0, 0.62), (-L / 2 + 0.2, 0.28, 0.24, 0.0, 0.7), (-0.35, 0.42, 0.34, 0.0, 0.82), (0.1, 0.46, 0.36, 0.0, 0.86),
          (0.5, 0.4, 0.3, 0.0, 0.86), (0.8, 0.3, 0.22, 0.0, 0.9), (0.95, 0.0, 0.0, 0.0, 0.92)]
    loft(b, st, lambda p, n: mix(green, belly, 0.8 * clamp(-n.z, 0.0, 1.0)), seg=12, amp=0.0)
    tail = [(-1.0, 0, 0.62), (-1.45, 0.08, 0.5), (-1.95, -0.05, 0.32), (-2.5, 0.12, 0.22), (-2.95, 0.02, 0.28)]
    chain(b, tail, 0.26, 0.04, lambda t: mix(green, shade(green, 0.7), t), seg=8)
    ell(b, (-3.12, 0.02, 0.3), (0.16, 0.05, 0.2), wing_d, seg=6, rings=4, rot=(0, 0, 0))  # spade
    neck = [(0.8, 0, 0.9), (1.05, 0.02, 1.2), (1.2, 0, 1.55), (1.38, 0.0, 1.85), (1.58, 0, 1.98)]
    chain(b, neck, 0.23, 0.15, lambda t: mix(green, belly, 0.0), seg=8)
    ell(b, (1.8, 0, 2.0), (0.3, 0.17, 0.15), green, seg=10, rings=6)  # skull
    ell(b, (2.05, 0, 1.94), (0.22, 0.12, 0.09), shade(green, 1.1), seg=9, rings=5)  # snout
    ell(b, (1.95, 0, 1.84), (0.24, 0.12, 0.04), belly, seg=8, rings=3)  # jaw
    for s in (-1, 1):
        ell(b, (1.85, s * 0.13, 2.08), (0.045, 0.03, 0.045), lin("#ffd23a"), seg=6, rings=4)
        chain(b, [(1.7, s * 0.1, 2.12), (1.5, s * 0.22, 2.32), (1.28, s * 0.32, 2.38)], 0.045, 0.012, horn, seg=5)
    for i in range(9):  # dorsal spikes
        t = i / 8
        x, z = -0.85 + 1.85 * t, 0.98 + 0.05 * math.sin(t * 3)
        cone(b, (x, 0, z), 0.2 - 0.07 * abs(t - 0.4), 0.05, mix(horn, green, 0.3), seg=5)
    for s in (-1, 1):  # legs: thigh, shin, foot with claws
        for hx, th in ((0.55, 0.9), (-0.55, 1.0)):
            chain(b, [(hx, s * 0.3, 0.6), (hx + 0.05 * th, s * 0.42, 0.32), (hx + 0.12, s * 0.38, 0.06)], 0.13, 0.06, green, seg=6)
            ell(b, (hx + 0.2, s * 0.38, 0.04), (0.17, 0.09, 0.04), shade(green, 0.85), seg=7, rings=3)
            for c in (-1, 0, 1):
                chain(b, [(hx + 0.3, s * 0.38 + c * 0.05, 0.05), (hx + 0.4, s * 0.38 + c * 0.06, 0.03)], 0.02, 0.005, horn, seg=4)
    for s in (-1, 1):  # wings: arm, three fingers, membrane panels
        root = Vector((0.15, s * 0.3, 1.15))
        elbow = Vector((-0.1, s * 0.95, 1.85))
        wrist = Vector((-0.35, s * 1.75, 2.35))
        chain(b, [tuple(root), tuple(elbow), tuple(wrist)], 0.075, 0.045, green, seg=6)
        tips = [Vector((0.25, s * 2.55, 2.25)), Vector((-0.55, s * 2.6, 1.7)), Vector((-1.05, s * 2.2, 1.1))]
        for tpt in tips:
            chain(b, [tuple(wrist), tuple(wrist.lerp(tpt, 0.5) + Vector((0, 0, 0.12))), tuple(tpt)], 0.035, 0.01, green, seg=5)
        # Membrane: one skin from the shoulder along the arm and the three fingers back to the flank.
        outline = [tuple(root), tuple(elbow), tuple(wrist), tuple(tips[0]), tuple(wrist.lerp(tips[0], 0.5).lerp(wrist.lerp(tips[1], 0.5), 0.5) - Vector((0, 0, 0.1))),
                   tuple(tips[1]), tuple(wrist.lerp(tips[1], 0.5).lerp(wrist.lerp(tips[2], 0.5), 0.5) - Vector((0, 0, 0.1))), tuple(tips[2]), (-0.75, s * 0.35, 0.85)]
        membrane(b, outline, wing)
    return b.finish("dragon", BUDGET["dragon"], 0.4)


def membrane(b: Builder, pts, color, thick=0.014):
    """A thin double-sided skin: a fan of triangles around the centre of the polygon `pts`, with a thin back face."""
    c = sum((Vector(p) for p in pts), Vector()) / len(pts)
    off = Vector((0, 0, thick))
    for i in range(len(pts)):
        a, d = Vector(pts[i]), Vector(pts[(i + 1) % len(pts)])
        top = b.bm.faces.new([b.bm.verts.new(c + off), b.bm.verts.new(a + off), b.bm.verts.new(d + off)])
        bot = b.bm.faces.new([b.bm.verts.new(c - off), b.bm.verts.new(d - off), b.bm.verts.new(a - off)])
        b._paint([top, bot], mix(color, shade(color, 0.75), i / max(1, len(pts) - 1)))


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def glow_flower() -> bpy.types.Object:
    """A cluster of three tall bell flowers with glowing hearts and a few floating motes."""
    b = Builder()
    stem, petal_a, petal_b, glow = lin("#3da870"), lin("#ff7ad0"), lin("#7aa8ff"), lin("#fff3a8")
    for k, (x, y, h, lean, col) in enumerate(((0, 0, 1.15, 0.12, petal_a), (0.3, 0.12, 0.8, -0.18, petal_b), (-0.25, 0.2, 0.65, 0.2, petal_a))):
        pts = [(x, y, 0), (x + lean * 0.5, y, h * 0.5), (x + lean, y, h)]
        chain(b, pts, 0.04, 0.025, stem, seg=5)
        for leaf in (-1, 1):
            ell(b, (x + lean * 0.2 + leaf * 0.12, y, h * 0.25), (0.14, 0.03, 0.05), shade(stem, 1.15), seg=6, rings=3, rot=(0, 0.5 * leaf, 0))
        top = (x + lean, y, h)
        for p in range(6):  # petals
            a = p * PI / 3
            ell(b, (top[0] + math.cos(a) * 0.09, top[1] + math.sin(a) * 0.09, top[2] + 0.07), (0.07, 0.035, 0.13), mix(col, lin("#ffffff"), 0.15 * (p % 2)), seg=6, rings=4, rot=(0.0, 0.35 * math.cos(a), a))
        ell(b, (top[0], top[1], top[2] + 0.02), (0.065, 0.065, 0.065), glow, seg=8, rings=5)
    for i in range(7):
        a = i * 0.9
        ell(b, (0.55 * math.cos(a), 0.45 * math.sin(a), 0.7 + 0.15 * i), (0.03, 0.03, 0.03), lin("#c9fbff"), seg=5, rings=3)
    ell(b, (0, 0, 0.03), (0.5, 0.4, 0.06), lin("#5e9a64"), seg=10, rings=3, amp=0.15, seed=4.0)
    return b.finish("glow_flower", BUDGET["glow_flower"], 0.3)


FANTASY = {
    "castle": castle, "wizard_tower": wizard_tower, "mushroom_house": mushroom_house, "giant_mushroom": giant_mushroom,
    "crystal_cluster": crystal_cluster, "magic_tree": magic_tree, "dragon": dragon, "glow_flower": glow_flower,
}


def main() -> int:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="apps/web/public/models")
    ap.add_argument("--only", default="")
    args = ap.parse_args(argv)
    os.makedirs(args.out, exist_ok=True)
    wanted = [n for n in args.only.split(",") if n] or list(FANTASY)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    ok = True
    for name in wanted:
        obj = FANTASY[name]()
        obj.name = name
        tris, size = bm.export(obj, args.out)
        flag = "ok" if tris <= BUDGET[name] * 1.05 else "OVER BUDGET"
        ok &= flag == "ok"
        print(f"{name:16s} {tris:5d} triangles  {size / 1024:6.1f} KB  {flag}")
        bpy.data.objects.remove(obj)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
