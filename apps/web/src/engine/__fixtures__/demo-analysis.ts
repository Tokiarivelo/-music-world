// Hand-made demo analysis (roadmap 1.7), parsed with the generated `music-world.analysis.v1` zod schema so every
// consumer gets the exact contract type (JSON imports widen enums to `string`).
import { AnalysisSchema, type Analysis } from '@/templates/generated';
import demo from './demo-analysis.json';

export const DEMO_ANALYSIS: Analysis = AnalysisSchema.parse(demo);
