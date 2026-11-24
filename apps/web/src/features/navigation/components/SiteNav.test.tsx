import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SiteNav } from "./SiteNav";

afterEach(cleanup);

describe("SiteNav", () => {
  it("is a labelled nav with three real links", () => {
    render(<SiteNav />);
    const nav = screen.getByRole("navigation", { name: "Site navigation" });
    const links = [...nav.querySelectorAll("a")];
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Home", "/"],
      ["New song", "/upload"],
      ["Templates", "/templates"],
    ]);
  });

  it("collapses behind a menu button that toggles the links", () => {
    render(<SiteNav />);
    const button = screen.getByRole("button", { name: "Menu" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById("site-nav-links")?.className).toContain(
      "hidden",
    );
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById("site-nav-links")?.className).not.toMatch(
      /(^|\s)hidden(\s|$)/,
    );
  });

  it("keeps links keyboard reachable (no tabindex override)", () => {
    render(<SiteNav />);
    for (const a of screen.getAllByRole("link", { hidden: true }))
      expect(a.getAttribute("tabindex")).toBeNull();
  });
});
