"""Reduce ambientCG (CC0) ground color maps to 512 x 512 JPEG tiles with Blender's `bpy`.

    python -I scripts/blender/ground_textures.py <out_dir> <name=color.jpg> [...]

The tiles are seamless in the source set; they are repeated over the dome ground by `xr/views/environment-view.ts`.
"""
import os
import sys

import bpy  # first: registers the other Blender modules

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
for spec in sys.argv[2:]:
    name, path = spec.split("=", 1)
    img = bpy.data.images.load(path)
    img.scale(512, 512)
    scene = bpy.context.scene
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.quality = 85
    dst = os.path.join(out, f"{name}.jpg")
    img.save_render(dst, scene=scene)
    print(name, os.path.getsize(dst) // 1024, "KB")
