// Generate TS types + zod validators from packages/schemas/*.schema.json
// into apps/web/src/templates/generated (one file per schema + index.ts).
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jsonSchemaToZod } from 'json-schema-to-zod';

const here = dirname(fileURLToPath(import.meta.url));
const schemasDir = join(here, '..');
const outDir = join(here, '../../../apps/web/src/templates/generated');
const HEADER =
  '// GENERATED — do not edit. Source: apps/api/music_world/schemas (run `make schemas`).\n';

// json-schema-to-zod 2.x turns `$ref` into `z.any()`: inline the pydantic `$defs` (never recursive here) first.
function inlineRefs(node, defs) {
  if (Array.isArray(node)) return node.map((item) => inlineRefs(item, defs));
  if (node === null || typeof node !== 'object') return node;
  if (typeof node.$ref === 'string') {
    const name = node.$ref.replace('#/$defs/', '');
    if (!(name in defs)) throw new Error(`unresolved $ref ${node.$ref}`);
    const { $ref, ...rest } = node;
    return inlineRefs({ ...defs[name], ...rest }, defs);
  }
  const out = {};
  for (const [key, value] of Object.entries(node)) if (key !== '$defs') out[key] = inlineRefs(value, defs);
  return out;
}

const pascal = (s) => s.replace(/(^|[-_.])(\w)/g, (_, __, c) => c.toUpperCase());

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const files = readdirSync(schemasDir).filter((f) => f.endsWith('.schema.json')).sort();
const index = [];
for (const file of files) {
  const raw = JSON.parse(readFileSync(join(schemasDir, file), 'utf8'));
  const schema = inlineRefs(raw, raw.$defs ?? {});
  const base = file.replace(/\.schema\.json$/, ''); // e.g. health.v1
  const typeName = pascal(base.replace(/\.v\d+$/, '')); // Health
  const code = jsonSchemaToZod(schema, { name: `${typeName}Schema`, module: 'esm', type: typeName });
  const idLine = `export const ${typeName}SchemaId = ${JSON.stringify(schema.$id)} as const;\n`;
  const tsFile = `${base.replace('.', '-')}.ts`; // health-v1.ts (kebab-case)
  writeFileSync(join(outDir, tsFile), `${HEADER}\n${code.trim()}\n\n${idLine}`);
  index.push(`export * from './${tsFile.replace(/\.ts$/, '')}';`);
  console.log(`[schemas] wrote ${join('apps/web/src/templates/generated', tsFile)}`);
}
writeFileSync(join(outDir, 'index.ts'), `${HEADER}\n${index.join('\n')}\n`);
