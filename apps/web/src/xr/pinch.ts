/**
 * Pinch detection with hysteresis (07-xr-mode requirement 5). Pure state machine fed once per frame with the hand's
 * pinch strength (0 = open hand, 1 = closed pinch). Pressing needs `PINCH_PRESS` (never 0.5: pointing gestures reach
 * it on Quest), releasing needs the strength to fall under `PINCH_RELEASE`, so jitter around one threshold does not
 * produce repeated presses.
 */
import { PINCH_PRESS, PINCH_RELEASE } from './constants';

export type PinchEdge = 'press' | 'release' | null;

export class PinchGesture {
  private pinched = false;

  constructor(
    private readonly press = PINCH_PRESS,
    private readonly release = PINCH_RELEASE,
  ) {
    if (!(press > 0.5 && press <= 1 && release < press && release >= 0)) {
      throw new RangeError(`invalid pinch thresholds press=${press} release=${release}`);
    }
  }

  get isPinched(): boolean {
    return this.pinched;
  }

  /** Feeds this frame's strength; returns the edge that happened, if any. Non-finite values count as open. */
  update(strength: number): PinchEdge {
    const s = Number.isFinite(strength) ? strength : 0;
    if (!this.pinched && s >= this.press) {
      this.pinched = true;
      return 'press';
    }
    if (this.pinched && s < this.release) {
      this.pinched = false;
      return 'release';
    }
    return null;
  }

  reset(): void {
    this.pinched = false;
  }
}
