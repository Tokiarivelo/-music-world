/**
 * Shared water animation state (view only): the clock of the ripples and the walker's position in plate units, so a
 * lake rings around the feet of whoever wanders through it. Written by the host each frame, read by the water material.
 */
export const waterState = { time: 0, walkerX: 0, walkerZ: 0, walking: 0 };

export function setWaterTime(seconds: number): void {
  waterState.time = seconds;
}

export function setWaterWalker(x: number, z: number, walking: boolean): void {
  waterState.walkerX = x;
  waterState.walkerZ = z;
  waterState.walking = walking ? 1 : 0;
}
