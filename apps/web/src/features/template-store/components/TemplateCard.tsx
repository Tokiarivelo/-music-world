import Link from 'next/link';
import type { StoreTemplate } from '@/templates/generated';
import { useT, type Translator } from '@/i18n';
import { STORE_ROUTES } from '../consts/template-store.consts';
import { EditCopyLink } from './EditCopyLink';
import { ReportTemplateButton } from './ReportTemplateButton';
import { TemplatePreview } from './TemplatePreview';

interface TemplateCardProps {
  item: StoreTemplate;
  /** Signed-in viewers can report community templates (not the launch templates). */
  canReport?: boolean;
}

function providerName(t: Translator<'store'>, id: string): string {
  return id === 'muse' || id === 'bedrock' || id === 'mock' ? t(`provider.${id}`) : id;
}

/** Name, author, license, AI label, thumbnail (or palette preview) and "Use this template". Text only. */
export function TemplateCard({ item, canReport = false }: TemplateCardProps) {
  const t = useT('store');
  const { template } = item;
  const generatedBy = template.meta?.generatedBy ?? null;
  return (
    <article className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/5 p-3">
      {item.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- same-origin API image, already small (≤ 128 KB)
        <img
          src={item.thumbnailUrl}
          alt={t('previewAlt', { name: template.name })}
          width={256}
          height={256}
          className="aspect-square w-full rounded object-cover"
        />
      ) : (
        <TemplatePreview template={template} />
      )}
      <h2 className="font-semibold">{template.name}</h2>
      <p className="text-xs opacity-80">
        {t('by', { author: item.author.displayName })} · {t('license', { license: template.license })}
      </p>
      <div className="flex flex-wrap gap-1 text-xs">
        {item.featured && (
          <span className="rounded-full bg-[var(--mw-accent)]/30 px-2 py-0.5">{t('featured')}</span>
        )}
        {generatedBy && (
          <span className="rounded-full bg-[var(--mw-secondary)]/30 px-2 py-0.5">
            {t('aiLabel', { provider: providerName(t, generatedBy.provider) })}
          </span>
        )}
      </div>
      <Link
        className="mt-auto rounded-full bg-[var(--mw-primary)] px-4 py-2 text-center text-sm font-medium text-black"
        href={STORE_ROUTES.play(item.id)}
      >
        {t('use')}
      </Link>
      <EditCopyLink template={template} className="text-center text-sm underline" />
      {canReport && !item.featured && <ReportTemplateButton storeId={item.id} />}
    </article>
  );
}
