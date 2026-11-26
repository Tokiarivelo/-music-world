/** One short plain-language line under a field (what it does, what the numbers mean); linked by `aria-describedby`. */
export function Hint({ id, children }: { id: string; children?: string }) {
  if (!children) return null;
  return (
    <p id={id} className="text-xs leading-snug opacity-70">
      {children}
    </p>
  );
}

/** `aria-describedby` of a control: its hint, then its error. */
export function describedBy(id: string, hint: string | undefined, hasError: boolean): string | undefined {
  const ids = [hint ? `${id}-hint` : '', hasError ? `${id}-error` : ''].filter(Boolean).join(' ');
  return ids || undefined;
}
