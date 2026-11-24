'use client';

import { storeErrorText, STORE_TEXT } from '../consts/template-store.consts';
import { listStoreTemplates, type StorePage } from '../api/template-store.api';
import { useGallery } from '../hooks/use-gallery';
import { TemplateCard } from './TemplateCard';

interface TemplateGalleryProps {
  /** Injected in tests; defaults to `GET /api/templates`. */
  list?: (cursor: string | null, limit: number) => Promise<StorePage>;
  /** Signed-in viewers can report templates. */
  signedIn?: boolean;
}

/** `/templates`: the public gallery of published templates. */
export function TemplateGallery({ list = listStoreTemplates, signedIn = false }: TemplateGalleryProps) {
  const { status, errorKey, items, hasMore, loadMore } = useGallery(list);
  return (
    <section className="flex w-full flex-col gap-4">
      <header>
        <h1 className="text-3xl font-semibold text-[var(--mw-primary)]">{STORE_TEXT.galleryTitle}</h1>
        <p className="opacity-80">{STORE_TEXT.galleryIntro}</p>
      </header>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <TemplateCard key={item.id} item={item} canReport={signedIn} />
        ))}
      </div>
      {status === 'loading' && <p role="status">{STORE_TEXT.loading}</p>}
      {status === 'ready' && items.length === 0 && <p>{STORE_TEXT.empty}</p>}
      {status === 'error' && (
        <p role="alert" className="text-[var(--mw-accent)]">
          {storeErrorText(errorKey)}
        </p>
      )}
      {hasMore && status === 'ready' && (
        <button type="button" onClick={loadMore} className="self-center rounded-full border border-white/30 px-4 py-2">
          {STORE_TEXT.more}
        </button>
      )}
    </section>
  );
}
