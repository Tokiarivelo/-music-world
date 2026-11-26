/**
 * macOS / iOS style scrollbars: thin, and visible only while the user scrolls. One capturing listener marks the element
 * that scrolls with `mw-scrolling` and clears it after a pause; the look itself is in `app/globals.css`.
 */
export const SCROLLING_CLASS = 'mw-scrolling';
export const SCROLL_IDLE_MS = 900;

export function installScrollbarAutoHide(root: Document = document, idleMs: number = SCROLL_IDLE_MS): () => void {
  const timers = new Map<Element, ReturnType<typeof setTimeout>>();
  const onScroll = (event: Event): void => {
    const target = event.target;
    const element = target instanceof Element ? target : root.documentElement; // the page scrolls: target is the document
    element.classList.add(SCROLLING_CLASS);
    if (element === root.documentElement) root.body?.classList.add(SCROLLING_CLASS);
    const pending = timers.get(element);
    if (pending) clearTimeout(pending);
    timers.set(
      element,
      setTimeout(() => {
        element.classList.remove(SCROLLING_CLASS);
        if (element === root.documentElement) root.body?.classList.remove(SCROLLING_CLASS);
        timers.delete(element);
      }, idleMs),
    );
  };
  root.addEventListener('scroll', onScroll, { capture: true, passive: true });
  return () => {
    root.removeEventListener('scroll', onScroll, { capture: true });
    timers.forEach((t, el) => {
      clearTimeout(t);
      el.classList.remove(SCROLLING_CLASS);
    });
    timers.clear();
  };
}
