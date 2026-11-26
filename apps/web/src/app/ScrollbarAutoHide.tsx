'use client';

import { useEffect } from 'react';
import { installScrollbarAutoHide } from '@/lib/scrollbar-autohide';

/** Mounts the scroll listener that makes every scrollbar of the app appear only while scrolling. */
export function ScrollbarAutoHide() {
  useEffect(() => installScrollbarAutoHide(), []);
  return null;
}
