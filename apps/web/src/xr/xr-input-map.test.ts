import { describe, expect, it } from 'vitest';
import { VR_SEEK_STEP_SEC } from './constants';
import { commandsFromPads, NO_EDGES } from './xr-input-map';

describe('commandsFromPads (07-xr-mode requirement 3)', () => {
  it('does nothing without edges', () => {
    expect(commandsFromPads([NO_EDGES, NO_EDGES])).toEqual([]);
  });

  it('toggles play on A or X', () => {
    expect(commandsFromPads([{ ...NO_EDGES, face: true }, NO_EDGES])).toEqual([{ kind: 'toggle' }]);
    expect(commandsFromPads([NO_EDGES, { ...NO_EDGES, face: true }])).toEqual([{ kind: 'toggle' }]);
  });

  it('cancels two face presses in the same frame', () => {
    expect(
      commandsFromPads([
        { ...NO_EDGES, face: true },
        { ...NO_EDGES, face: true },
      ]),
    ).toEqual([]);
  });

  it('seeks one step per thumbstick push, back on left and forward on right', () => {
    expect(commandsFromPads([{ ...NO_EDGES, stickLeft: true }])).toEqual([
      { kind: 'seek', deltaSec: -VR_SEEK_STEP_SEC },
    ]);
    expect(
      commandsFromPads([
        { ...NO_EDGES, stickRight: true },
        { ...NO_EDGES, stickRight: true },
      ]),
    ).toEqual([{ kind: 'seek', deltaSec: 2 * VR_SEEK_STEP_SEC }]);
  });

  it('recenters on squeeze, once even with both hands', () => {
    expect(
      commandsFromPads([
        { ...NO_EDGES, squeeze: true },
        { ...NO_EDGES, squeeze: true },
      ]),
    ).toEqual([{ kind: 'recenter' }]);
  });
});
