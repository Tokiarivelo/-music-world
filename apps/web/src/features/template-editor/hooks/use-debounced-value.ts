'use client';

import { useEffect, useState } from 'react';

/** `value` after it has been stable for `delayMs` (the preview must not rebuild the world on every keystroke). */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
