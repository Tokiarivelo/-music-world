import type { AudioBufferSourceNodeLike, AudioContextLike } from '../interfaces/audio.interfaces';

/** Test double: `currentTime` only moves when the test calls `advance`. */
export class FakeAudioContext implements AudioContextLike {
  currentTime = 0;
  readonly destination = {};
  readonly sources: Array<AudioBufferSourceNodeLike & { started: [number, number] | null; stopped: boolean }> = [];

  advance(seconds: number): void {
    this.currentTime += seconds;
  }

  createBufferSource() {
    const node = {
      buffer: null,
      playbackRate: { value: 1 },
      onended: null,
      started: null as [number, number] | null,
      stopped: false,
      connect: () => undefined,
      disconnect: () => undefined,
      start(when = 0, offset = 0) {
        node.started = [when, offset];
      },
      stop() {
        node.stopped = true;
      },
    };
    this.sources.push(node);
    return node;
  }
}
