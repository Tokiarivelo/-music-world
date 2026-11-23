import { BoxGeometry, Mesh, MeshStandardMaterial } from 'three';

/** One glowing cube in front of the user at table height (01-foundation task 2.2 smoke scene). */
export function createDemoCube(): { mesh: Mesh; dispose(): void } {
  const geometry = new BoxGeometry(0.3, 0.3, 0.3);
  const material = new MeshStandardMaterial({ color: 0x3fd8ff, emissive: 0x3fd8ff, emissiveIntensity: 1.5 });
  const mesh = new Mesh(geometry, material);
  mesh.position.set(0, 1.2, -1.2);
  mesh.rotation.set(Math.PI / 6, Math.PI / 4, 0);
  return {
    mesh,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
