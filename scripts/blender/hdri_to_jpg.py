"""Tone-map Poly Haven equirectangular HDRIs (CC0) to sRGB JPEG sky photos with Blender's `bpy` and numpy.

    python -I scripts/blender/hdri_to_jpg.py <out_dir> <name=file.hdr[@target]> ...

Exposure is set per image so the 90th percentile luminance lands at `target` (default 0.55; a night sky uses 0.08), then a soft shoulder and the sRGB curve are
applied. The image keeps the equirectangular layout (2048 x 1024): three.js reads it as an equirectangular texture.
"""
import os
import sys

import bpy  # first: registers the other Blender modules
import numpy as np

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
for spec in sys.argv[2:]:
    name, path = spec.split("=", 1)
    target = float(path.split("@")[1]) if "@" in path else 0.55
    path = path.split("@")[0]
    img = bpy.data.images.load(path)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[:, :, :3]
    lum = px @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    k = target / max(float(np.percentile(lum, 90)), 1e-4)
    x = px * k
    x = x / (1.0 + 0.35 * x)  # soft shoulder keeps the sun and bright clouds from clipping
    x = np.clip(x * 1.35, 0.0, 1.0)
    srgb = np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)
    dst = bpy.data.images.new(name, w, h, alpha=False)
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[:, :, :3] = srgb
    dst.pixels.foreach_set(rgba.ravel())
    dst.file_format = "JPEG"
    dst.filepath_raw = os.path.join(out, f"{name}.jpg")
    scene = bpy.context.scene
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.quality = 86
    dst.save_render(os.path.join(out, f"{name}.jpg"), scene=scene)
    print(name, w, h, os.path.getsize(os.path.join(out, f"{name}.jpg")) // 1024, "KB")
