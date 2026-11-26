"use client";

import { GLASS_PILL } from '@/lib/glass';
import Link from "next/link";
import { useState } from "react";
import { ModerationLink } from "@/features/moderation";
import { EditCopyLink } from "@/features/template-store";
import { useT } from "@/i18n";
import type { Template } from "@/templates/generated";
import { NAV_LINKS } from "../consts/navigation.consts";

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mw-accent)]";
const LINK = `rounded-full px-3 py-1 text-sm hover:bg-white/10 ${FOCUS}`;

interface SiteNavProps {
  template?: Template | null;
}

/** Compact top-left bar of the play pages: inline links on wide screens, one menu button on a phone. */
export function SiteNav({ template }: SiteNavProps = {}) {
  const t = useT("common");
  const [open, setOpen] = useState(false);
  return (
    <nav
      aria-label={t("navLabel")}
      className={`flex w-fit flex-wrap items-center gap-1 ${GLASS_PILL} px-1 py-1`}
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
        {template && (
          <li className="flex items-center">
            <EditCopyLink
              template={template}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-violet-600/30 text-violet-300 border border-violet-500/40 hover:bg-violet-600 hover:text-white hover:scale-105 active:scale-95 transition-all shadow-sm"
            />
          </li>
        )}
        <ModerationLink className={`block ${LINK}`} />
      </ul>
    </nav>
  );
}
