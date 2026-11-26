'use client';

import { useT } from '@/i18n';
import type { Zone } from '../consts/template-editor.consts';
import { zoneRect } from '../lib/zone-model';

const SIZE = 100;
const hue = (i: number) => (i * 67 + 200) % 360;

/** Top view of the plate with every zone drawn on it, numbered like the list below. Far edge at the top. */
export function ZoneMap({ zones }: { zones: readonly Zone[] }) {
  const t = useT('editor');
  return (
    <figure className="flex flex-col items-center gap-1">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-1 text-xs opacity-80">
        <span />
        <span className="text-center">{t('zone.mapFar')}</span>
        <span />
        <span>{t('zone.mapLeft')}</span>
        <svg role="img" aria-label={t('zone.mapLabel')} viewBox={`0 0 ${SIZE} ${SIZE}`} className="aspect-square w-48 rounded border border-white/30 bg-black/30">
          <line x1={SIZE / 2} y1="0" x2={SIZE / 2} y2={SIZE} stroke="currentColor" strokeOpacity="0.2" strokeDasharray="2 2" />
          <line x1="0" y1={SIZE / 2} x2={SIZE} y2={SIZE / 2} stroke="currentColor" strokeOpacity="0.2" strokeDasharray="2 2" />
          {zones.map((z, i) => {
            const r = zoneRect(z, SIZE);
            const color = `hsl(${hue(i)} 80% 60%)`;
            return (
              <g key={i}>
                <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={color} fillOpacity="0.3" stroke={color} strokeWidth="1" />
                <text x={r.x + 3} y={r.y + 9} fontSize="8" fill="currentColor">{i + 1}</text>
              </g>
            );
          })}
        </svg>
        <span>{t('zone.mapRight')}</span>
        <span />
        <span className="text-center">{t('zone.mapNear')}</span>
        <span />
      </div>
      <figcaption className="max-w-xs text-center text-xs opacity-70">{t('zone.mapHelp')}</figcaption>
    </figure>
  );
}
