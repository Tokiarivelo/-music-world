import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_VIEW } from "../lib/view-storage";
import { ViewPopover } from "./ViewPopover";

afterEach(cleanup);

function setup(prefs = DEFAULT_VIEW) {
  const onChange = vi.fn();
  render(<ViewPopover onChange={onChange} prefs={prefs} />);
  fireEvent.click(screen.getByRole("button", { name: "View" }));
  return onChange;
}

describe("ViewPopover", () => {
  it("toggles the northern lights mode", () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole("button", { name: "Northern lights mode" }));
    expect(onChange).toHaveBeenCalledWith({ aurora: true });
  });

  it("picks an arrangement and shows the current one as pressed", () => {
    const onChange = setup({ layout: "ring", aurora: false });
    expect(screen.getByRole("button", { name: "Ring", pressed: true })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Spiral" }));
    expect(onChange).toHaveBeenCalledWith({ layout: "spiral" });
  });
});
