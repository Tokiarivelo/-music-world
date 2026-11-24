export const WORLD_VIEW_TEXT = {
  enterVR: 'Enter VR',
  exitVR: 'Exit VR',
  loading: 'Loading world…',
  loadError: 'The 3D world could not be created in this browser.',
  canvasLabel: 'Music World 3D view',
} as const;

export const NAVIGATION_TEXT = {
  group: 'Camera',
  explore: 'Explore',
  exploreOn: 'Exploring',
  reset: 'Reset view',
  presetsLabel: 'View presets',
  hint: 'Drag to orbit · right-drag to pan · wheel to zoom · WASD to move · R to reset',
  presets: { overview: 'Overview', staff: 'Staff', city: 'City', top: 'Top' },
} as const;

/** Keys `1`–`4` select these presets (08-navigation-mode requirement 3.2). */
export const PRESET_KEYS = { Digit1: 'overview', Digit2: 'staff', Digit3: 'city', Digit4: 'top' } as const;
