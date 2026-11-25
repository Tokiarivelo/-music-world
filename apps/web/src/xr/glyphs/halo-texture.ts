import { DataTexture, LinearFilter, RGBAFormat } from 'three';

const HALO_TEXTURE_SIZE = 32;

/**
 * Soft round alpha mask (bright centre, smooth falloff), generated in code: no image asset, works without a canvas.
 * Used as `alphaMap` (green channel) of halo quads and particles.
 */
export function radialAlphaTexture(size = HALO_TEXTURE_SIZE): DataTexture {
  const data = new Uint8Array(size * size * 4);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.min(1, Math.hypot(x - c, y - c) / c);
      const a = Math.round(255 * (1 - d) ** 2);
      data.set([a, a, a, 255], (y * size + x) * 4);
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Hard-edged round mask (a disc with a one-texel soft edge): the sharp body of the sun or the moon. */
export function diskAlphaTexture(size = 64): DataTexture {
  const data = new Uint8Array(size * size * 4);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = Math.round(255 * Math.min(1, Math.max(0, (c - Math.hypot(x - c, y - c)) / 1.5)));
      data.set([a, a, a, 255], (y * size + x) * 4);
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
