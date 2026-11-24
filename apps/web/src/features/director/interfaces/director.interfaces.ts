import type { Analysis, DirectorResult } from '@/templates/generated';

export type ProviderId = DirectorResult['provider'];

/** What the director reads: an uploaded project (server-side analysis) or the shipped demo song. */
export type DirectorSource = { kind: 'project'; projectId: string } | { kind: 'demo'; analysis: Analysis };

export type DirectorStatus = 'loading' | 'idle' | 'generating' | 'error';
