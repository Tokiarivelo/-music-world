'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DirectorProviders, DirectorResult, Template } from '@/templates/generated';
import { ApiError } from '@/lib/api-error';
import { generateWorld, getDirectorProviders } from '../api/director.api';
import type { DirectorSource, DirectorStatus, ProviderId } from '../interfaces/director.interfaces';

export interface DirectorApi {
  getProviders(): Promise<DirectorProviders>;
  generate(source: DirectorSource, provider: ProviderId): Promise<DirectorResult>;
}

const DEFAULT_API: DirectorApi = { getProviders: getDirectorProviders, generate: generateWorld };
const FALLBACK_PROVIDERS: DirectorProviders = {
  default: 'mock',
  providers: [{ id: 'mock', model: 'mock-director-1', configured: true }],
};

export interface DirectorState {
  status: DirectorStatus;
  errorKey: string | null;
  /** Configured providers only (requirement 1.2). */
  providers: DirectorProviders['providers'];
  provider: ProviderId;
  setProvider(id: ProviderId): void;
  generate(): void;
  /** Every generated template, oldest first; a new generation never replaces an earlier one. */
  templates: readonly Template[];
  results: readonly DirectorResult[];
  latest: DirectorResult | null;
}

/** Provider selection and world generation for one song (05-ai-world-director task 4). */
export function useDirector(source: DirectorSource, api: DirectorApi = DEFAULT_API): DirectorState {
  const [catalog, setCatalog] = useState<DirectorProviders | null>(null);
  const [provider, setProvider] = useState<ProviderId>('mock');
  const [status, setStatus] = useState<DirectorStatus>('loading');
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [results, setResults] = useState<readonly DirectorResult[]>([]);

  useEffect(() => {
    let alive = true;
    api
      .getProviders()
      .catch(() => FALLBACK_PROVIDERS) // the mock always answers server side; keep the button usable
      .then((list) => {
        if (!alive) return;
        setCatalog(list);
        setProvider(list.default);
        setStatus('idle');
      });
    return () => {
      alive = false;
    };
  }, [api]);

  const generate = useCallback(() => {
    setStatus('generating');
    setErrorKey(null);
    api.generate(source, provider).then(
      (result) => {
        setResults((prev) => [...prev.filter((r) => r.template.id !== result.template.id), result]);
        setStatus('idle');
      },
      (error: unknown) => {
        setErrorKey(error instanceof ApiError ? error.code : 'UNKNOWN');
        setStatus('error');
      },
    );
  }, [api, source, provider]);

  const providers = useMemo(() => (catalog?.providers ?? []).filter((p) => p.configured), [catalog]);
  const templates = useMemo(() => results.map((r) => r.template), [results]);
  const latest = results.length > 0 ? results[results.length - 1]! : null;
  return { status, errorKey, providers, provider, setProvider, generate, templates, results, latest };
}
