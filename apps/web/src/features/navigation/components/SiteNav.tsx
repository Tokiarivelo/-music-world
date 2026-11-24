"use client";

import Link from "next/link";
import { useState } from "react";
import { useT } from "@/i18n";
import { NAV_LINKS } from "../consts/navigation.consts";

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mw-accent)]";
const LINK = `rounded-full px-3 py-1 text-sm hover:bg-white/10 ${FOCUS}`;

/** Compact top-left bar of the play pages: inline links on wide screens, one menu button on a phone. */
export function SiteNav() {
  const t = useT("common");
  const [open, setOpen] = useState(false);
  return (
    <nav
      aria-label={t("navLabel")}
      className="flex flex-wrap items-center gap-1 rounded-full bg-[var(--mw-bg)]/80 px-1 py-1"
    >
      <button
        aria-controls="site-nav-links"
        aria-expanded={open}
        aria-label={t("navMenu")}
        className={`rounded-full px-3 py-1 text-sm sm:hidden ${FOCUS}`}
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        ☰
      </button>
      <ul
        className={`${open ? "flex" : "hidden"} flex-col gap-1 sm:flex sm:flex-row`}
        id="site-nav-links"
      >
        {NAV_LINKS.map(({ href, key }) => (
          <li key={href}>
            <Link
              className={`block ${LINK}`}
              href={href}
              onClick={() => setOpen(false)}
            >
              {t(key)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
