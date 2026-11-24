/**
 * Controller bindings of the XR mode (07-xr-mode requirement 3). Pure: the system reads one edge snapshot per
 * controller per frame and this module turns it into commands, so the bindings are unit-tested without IWSDK.
 *
 * The trigger is not bound: it belongs to IWSDK's ray pointer (spatial panel clicks).
 */
import { VR_SEEK_STEP_SEC } from './constants';

export type XRCommand = { kind: 'toggle' } | { kind: 'seek'; deltaSec: number } | { kind: 'recenter' };

/** Button / stick edges of one controller during this frame (true only on the frame the edge happens). */
export interface PadEdges {
  /** A (right) or X (left) pressed. */
  face: boolean;
  squeeze: boolean;
  stickLeft: boolean;
  stickRight: boolean;
}

export const NO_EDGES: PadEdges = { face: false, squeeze: false, stickLeft: false, stickRight: false };

export function commandsFromPads(pads: readonly PadEdges[]): XRCommand[] {
  const commands: XRCommand[] = [];
  let toggles = 0;
  let seek = 0;
  let recenter = false;
  for (const pad of pads) {
    if (pad.face) toggles++;
    if (pad.stickLeft) seek -= VR_SEEK_STEP_SEC;
    if (pad.stickRight) seek += VR_SEEK_STEP_SEC;
    if (pad.squeeze) recenter = true;
  }
  // Two face buttons in the same frame cancel out; keep a single toggle for an odd count.
  if (toggles % 2 === 1) commands.push({ kind: 'toggle' });
  if (seek !== 0) commands.push({ kind: 'seek', deltaSec: seek });
  if (recenter) commands.push({ kind: 'recenter' });
  return commands;
}
