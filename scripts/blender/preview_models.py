"""Render a preview image of every GLB of a folder (and a contact sheet) to judge models before wiring them.

    python -I scripts/blender/preview_models.py <glb_dir> <out_dir> [--views 3q,side,top] [--size 360]

Uses Blender's Workbench renderer with vertex colors (what the GLB holds) on a water-blue background, so it needs no GPU
and no lights. Views: `3q` three-quarter, `side` profile (nose toward the right), `top` plan. If Pillow is installed
the images are also pasted into `<out_dir>/sheet-<view>.png`. Look at the sheet: silhouette, proportions, detached
parts, colours. This is a shape check, not the final lit look in the app.
"""

from __future__ import annotations

import argparse
import glob
import os
import sys

import bpy
from mathutils import Vector

VIEWS = {"3q": Vector((0.9, -1.0, 0.55)), "side": Vector((0.0, -1.0, 0.12)), "top": Vector((0.0, -0.05, 1.0))}


def render(path: str, out: str, view: str, size: int) -> str:
    name = os.path.basename(path)[:-4]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    centre, extent = (lo + hi) / 2, max((hi - lo).length, 0.1)
    # The GLB is Y-up: after import Blender turns it Z-up, nose toward +X, length along X.
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    bpy.context.scene.collection.objects.link(cam)
    cam.location = centre + VIEWS[view].normalized() * extent * 1.15
    cam.rotation_euler = (centre - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene = bpy.context.scene
    scene.camera = cam
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "VERTEX"
    scene.render.resolution_x = scene.render.resolution_y = size
    scene.view_settings.view_transform = "Standard"
    scene.world = bpy.data.worlds.new("water")
    scene.world.color = (0.05, 0.2, 0.32)
    target = os.path.join(out, f"{name}-{view}.png")
    scene.render.filepath = target
    bpy.ops.render.render(write_still=True)
    return target


def main() -> int:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument("glb_dir")
    ap.add_argument("out_dir")
    ap.add_argument("--views", default="3q")
    ap.add_argument("--size", type=int, default=360)
    ap.add_argument("--only", default="")
    args = ap.parse_args(argv)
    os.makedirs(args.out_dir, exist_ok=True)
    wanted = {n for n in args.only.split(",") if n}
    files = [f for f in sorted(glob.glob(os.path.join(args.glb_dir, "*.glb"))) if not wanted or os.path.basename(f)[:-4] in wanted]
    for view in args.views.split(","):
        done = [render(f, args.out_dir, view, args.size) for f in files]
        try:
            from PIL import Image
        except ImportError:
            print(f"{len(done)} {view} images in {args.out_dir} (install pillow for a contact sheet)")
            continue
        cols, cell = 6, 240
        sheet = Image.new("RGB", (cols * cell, ((len(done) + cols - 1) // cols) * cell))
        for i, f in enumerate(done):
            sheet.paste(Image.open(f).convert("RGB").resize((cell, cell)), ((i % cols) * cell, (i // cols) * cell))
        sheet.save(os.path.join(args.out_dir, f"sheet-{view}.png"))
        print(f"sheet-{view}.png: {len(done)} models")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
