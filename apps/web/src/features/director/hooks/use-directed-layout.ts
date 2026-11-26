'use client';

import { useEffect, useMemo, useState } from 'react';
import { worldPlanKind } from '@/engine/world-plan';
import type { Template } from '@/templates/generated';
import { directLayout } from '../api/director.api';

type Layout = NonNullable<Template['layout']>;

/** Layouts already written, per project and template: choosing a template again does not call the director again. */
const written = new Map<string, Layout>();

/**
 * The template the user chose, with the layout the AI director wrote for its inventory (where each object grows and
 * in which order the notes pick them). Until it arrives, or when the director is unreachable, the engine derives a
 * layout from the inventory, so the world is never blocked on the network. Worlds without grounded objects (cities,
 * open worlds) need no layout.
 */
export function useDirectedLayout(projectId: string, template: Template): Template {
  const wanted = !template.layout && ['reef', 'realm'].includes(worldPlanKind(template));
  const key = `${projectId}:${template.id}`;
  const [fetched, setFetched] = useState<{ key: string; layout: Layout } | null>(null);
  useEffect(() => {
    if (!wanted || written.has(key)) return;
    let live = true;
    directLayout(projectId, template)
      .then((result) => {
        written.set(key, result.layout);
        if (live) setFetched({ key, layout: result.layout });
      })
      .catch(() => undefined); // the derived layout stays
    return () => {
      live = false;
    };
  }, [wanted, key, projectId, template]);
  const layout = wanted ? (written.get(key) ?? (fetched?.key === key ? fetched.layout : undefined)) : undefined;
  return useMemo(() => (layout ? { ...template, layout } : template), [template, layout]);
}
