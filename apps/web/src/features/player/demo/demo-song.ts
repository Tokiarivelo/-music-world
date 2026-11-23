// The judges' demo (02-music-analysis task 10): a self-made, royalty-free song analysed offline by the real pipeline
// (`apps/api/scripts/analyze_file.py`), so `/play/demo` needs no backend and loads instantly.
import { AnalysisSchema, type Analysis } from '@/templates/generated';
import analysis from './neon-nocturne.analysis.json';

export interface DemoSong {
  readonly title: string;
  readonly audioUrl: string;
  readonly analysis: Analysis;
}

export const DEMO_SONG: DemoSong = {
  title: 'Neon Nocturne',
  audioUrl: '/demo/neon-nocturne.mp3',
  analysis: AnalysisSchema.parse(analysis),
};
