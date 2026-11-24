import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generatePalette } from "@/xr/palette-generator";
import { createPaletteStore } from "../lib/palette-store";
import { ColorsPopover } from "./ColorsPopover";

afterEach(cleanup);

const TEMPLATE = generatePalette("TEMPLATE");

function setup() {
  let n = 0;
  const store = createPaletteStore({
    templateId: "t",
    templatePalette: TEMPLATE,
    storage: null,
    nextSeed: () => `K${++n}`,
  });
  render(<ColorsPopover store={store} templatePalette={TEMPLATE} />);
  fireEvent.click(screen.getByRole("button", { name: "Colors" }));
  return store;
}

describe("ColorsPopover", () => {
  it("opens with aria-expanded and closes on Escape", () => {
    setup();
    expect(screen.getByRole("button", { name: "Colors" }).getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(screen.getByRole("region", { name: "Scene colors" }), { key: "Escape" });
    expect(screen.queryByRole("region", { name: "Scene colors" })).toBeNull();
  });

  it("randomizes, shows the seed, undoes and resets", () => {
    const store = setup();
    expect(screen.getByText("Template colors")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Randomize" }));
    expect(screen.getByText("Scheme #K1")).toBeTruthy();
    expect(store.getState().override).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByText("Template colors")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset to the template" }));
    expect(store.getState().override).toBeNull();
  });

  it("edits a color and keeps a locked color when randomizing", () => {
    const store = setup();
    fireEvent.change(screen.getByLabelText("Primary"), { target: { value: "#123456" } });
    expect(store.getState().override?.primary).toBe("#123456");
    const lock = screen.getByRole("button", { name: "Lock Primary" });
    fireEvent.click(lock);
    expect(lock.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Randomize" }));
    expect(store.getState().override?.primary).toBe("#123456");
    expect((screen.getByLabelText("Primary") as HTMLInputElement).value).toBe("#123456");
  });
});

describe("ColorsPopover brightness", () => {
  it("applies the slider once it settles", () => {
    vi.useFakeTimers();
    const store = setup();
    const slider = screen.getByLabelText("Brightness");
    fireEvent.change(slider, { target: { value: "0.5" } });
    fireEvent.change(slider, { target: { value: "0.6" } });
    expect(store.getState().brightness).toBe(0);
    vi.advanceTimersByTime(130);
    expect(store.getState().brightness).toBe(0.6);
    vi.useRealTimers();
  });
});
