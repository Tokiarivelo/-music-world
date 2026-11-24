import type { Template } from '@/templates/generated';

/** Saves the template as `<id>.json` (a plain data file; works signed out). */
export function downloadTemplate(template: Template): void {
  const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${template.id}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
