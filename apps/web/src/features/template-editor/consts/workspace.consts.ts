import type { StageShading, StageTool, StageView } from '../lib/object-stage';
import type { NodePrimitive } from '../lib/node-model';

export const TOOLS: readonly { tool: StageTool; key: string }[] = [
  { tool: 'select', key: 'Q' },
  { tool: 'translate', key: 'G' },
  { tool: 'rotate', key: 'R' },
  { tool: 'scale', key: 'S' },
];

export const SHADINGS: readonly StageShading[] = ['solid', 'wire', 'xray'];
export const VIEWS: readonly Exclude<StageView, 'free'>[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];
export const ADD_PRIMITIVES: readonly NodePrimitive[] = ['box', 'cylinder', 'cone', 'sphere', 'prism', 'gable', 'extrude'];

/** Snap steps offered in the workspace; 0 is free movement. */
export const MOVE_STEPS: readonly number[] = [0.01, 0.05, 0.1, 0.25];
export const ROTATE_STEPS: readonly number[] = [5, 15, 45, 90];
export const SCALE_STEPS: readonly number[] = [0.05, 0.1, 0.25];

/** Metres a key press moves the selected part. */
export const NUDGE_METRES = 0.05;
export const WORKSPACE_ID = 'object-workspace';
