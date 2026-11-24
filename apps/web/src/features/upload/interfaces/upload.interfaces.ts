import type { AnalysisStageId } from '../consts/upload.consts';

export type StageState = 'done' | 'active' | 'pending';

export interface StageView {
  readonly id: AnalysisStageId;
  readonly state: StageState;
}

export type UploadPhase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'uploading' }
  | { readonly kind: 'analysing'; readonly projectId: string; readonly jobId: string }
  | { readonly kind: 'ready'; readonly projectId: string }
  | { readonly kind: 'error'; readonly messageKey: string };
