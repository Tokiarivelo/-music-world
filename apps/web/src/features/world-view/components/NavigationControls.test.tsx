import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NavigationControls } from "./NavigationControls";
import { useNavigationShortcuts } from "../hooks/use-navigation-shortcuts";

afterEach(cleanup);

function commands() {
  return { toggleExplore: vi.fn(), selectPreset: vi.fn(), reset: vi.fn() };
}

describe("NavigationControls", () => {
  it("shows only the Explore toggle in the cinematic mode, reporting aria-pressed", () => {
    const c = commands();
    render(
      <NavigationControls
        commands={c}
        state={{ mode: "cinematic", preset: null }}
      />,
    );
    const toggle = screen.getByRole("button", { name: "Explore" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByRole("button", { name: "Top" })).toBeNull();
    fireEvent.click(toggle);
    expect(c.toggleExplore).toHaveBeenCalledOnce();
  });

  it("offers presets and reset in the explore mode, marking the selected preset", () => {
    const c = commands();
    render(
      <NavigationControls
        commands={c}
        state={{ mode: "explore", preset: "staff" }}
      />,
    );
    expect(
      screen
        .getByRole("button", { name: "Explore" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "Staff" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "City" }).getAttribute("aria-pressed"),
    ).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "City" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset view" }));
    expect(c.selectPreset).toHaveBeenCalledWith("city");
    expect(c.reset).toHaveBeenCalledOnce();
  });
});

function Harness({
  c,
  enabled = true,
}: {
  c: ReturnType<typeof commands>;
  enabled?: boolean;
}) {
  useNavigationShortcuts(c, enabled);
  return <input aria-label="text" />;
}

describe("useNavigationShortcuts", () => {
  it("maps N, R and 1–4, ignoring modifiers and repeats", () => {
    const c = commands();
    render(<Harness c={c} />);
    fireEvent.keyDown(window, { code: "KeyN" });
    fireEvent.keyDown(window, { code: "KeyR" });
    fireEvent.keyDown(window, { code: "Digit4" });
    fireEvent.keyDown(window, { code: "KeyN", ctrlKey: true });
    fireEvent.keyDown(window, { code: "KeyN", repeat: true });
    expect(c.toggleExplore).toHaveBeenCalledOnce();
    expect(c.reset).toHaveBeenCalledOnce();
    expect(c.selectPreset).toHaveBeenCalledWith("top");
    expect(c.selectPreset).toHaveBeenCalledOnce();
  });

  it("does not fire from a text input or while disabled (VR)", () => {
    const c = commands();
    const { rerender } = render(<Harness c={c} />);
    fireEvent.keyDown(screen.getByLabelText("text"), { code: "KeyN" });
    expect(c.toggleExplore).not.toHaveBeenCalled();
    rerender(<Harness c={c} enabled={false} />);
    fireEvent.keyDown(window, { code: "KeyN" });
    expect(c.toggleExplore).not.toHaveBeenCalled();
  });
});
