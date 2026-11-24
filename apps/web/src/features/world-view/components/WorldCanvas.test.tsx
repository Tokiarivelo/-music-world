import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const created: { dispose: ReturnType<typeof vi.fn> }[] = [];
vi.mock("@/xr/world-host", () => ({
  createMusicWorld: vi.fn(async () => {
    const handle = {
      dispose: vi.fn(),
      isVRSupported: async () => false,
      load: vi.fn(),
      setControls: vi.fn(),
      setPaletteOverride: vi.fn(),
      setLightLevel: vi.fn(),
      setHiddenLayers: vi.fn(),
      activity: vi.fn(() => null),
      onSessionChange: () => () => undefined,
      onNavigationChange: () => () => undefined,
      setCameraMode: vi.fn(),
      setViewPreset: vi.fn(),
      resetView: vi.fn(),
    };
    created.push(handle);
    return handle;
  }),
}));

import { createMusicWorld } from "@/xr/world-host";
import WorldCanvas from "./WorldCanvas";

afterEach(() => {
  cleanup();
  created.length = 0;
  vi.mocked(createMusicWorld).mockClear();
});

describe("WorldCanvas lifecycle (I1 requirement 3)", () => {
  it("disposes the world on unmount, also when unmounted before it was created", async () => {
    const first = render(<WorldCanvas />);
    await waitFor(() => expect(created).toHaveLength(1));
    first.unmount();
    first.unmount();
    expect(created[0]?.dispose).toHaveBeenCalledTimes(1);

    const early = render(<WorldCanvas />);
    early.unmount(); // leaves the page before createMusicWorld resolved
    await waitFor(() => expect(created).toHaveLength(2));
    await waitFor(() => expect(created[1]?.dispose).toHaveBeenCalledTimes(1));
  });

  it("creates exactly one world per mount", async () => {
    const view = render(<WorldCanvas />);
    await waitFor(() => expect(created).toHaveLength(1));
    view.unmount();
    render(<WorldCanvas />);
    await waitFor(() => expect(created).toHaveLength(2));
    expect(createMusicWorld).toHaveBeenCalledTimes(2);
    expect(created[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(created[1]?.dispose).not.toHaveBeenCalled();
  });
});
