'use client';

import { useState } from 'react';
import { hashSeed } from '@/engine/prng';

const UINT32 = 0x100000000;

/** A random salt, drawn once per page view so two visits never replay the same sequence of arrangements. */
export function randomSalt(): number {
  return Math.floor(Math.random() * UINT32);
}

/**
 * World seed of one run of the song: `baseSeed` until the first Play, then a new seed for every run (each Play from
 * the beginning), so the objects of the world are arranged differently each time. Pausing and resuming keeps it.
 * The world stays a pure function of (analysis, template, seed): only the seed changes.
 */
export function usePlaySeed(run: number, baseSeed: number, salt: () => number = randomSalt): number {
  const [pageSalt] = useState(salt);
  return run === 0 ? baseSeed : hashSeed((baseSeed ^ pageSalt) >>> 0, `run:${run}`);
}
