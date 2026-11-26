/**
 * IWSDK keeps its component registry for the whole page, but in development a hot reload evaluates a module again and
 * `createComponent` then throws "Component with id ... already exists". The component is kept on `globalThis` so a
 * second evaluation reuses it (the schema never changes between evaluations of the same source).
 */
const registry = ((
  globalThis as { __mwComponents?: Map<string, unknown> }
).__mwComponents ??= new Map());

export function cachedComponent<T>(id: string, make: () => T): T {
  if (!registry.has(id)) registry.set(id, make());
  return registry.get(id) as T;
}
