import { TemplateSchema, type Template } from '@/templates/generated';
import neonNocturneJson from './neon-nocturne.json';

/** The default look (`assets/reference-image-original.png`), validated like any other template. */
export const NEON_NOCTURNE: Template = TemplateSchema.parse(neonNocturneJson);
export const DEFAULT_TEMPLATE = NEON_NOCTURNE;
