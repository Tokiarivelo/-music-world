import type { Locale } from './config';
import enAuth from './messages/en/auth.json';
import enCommon from './messages/en/common.json';
import enDirector from './messages/en/director.json';
import enEditor from './messages/en/editor.json';
import enModeration from './messages/en/moderation.json';
import enPlayer from './messages/en/player.json';
import enStore from './messages/en/store.json';
import enUpload from './messages/en/upload.json';
import enWorld from './messages/en/world.json';
import enXr from './messages/en/xr.json';
import frAuth from './messages/fr/auth.json';
import frCommon from './messages/fr/common.json';
import frDirector from './messages/fr/director.json';
import frEditor from './messages/fr/editor.json';
import frModeration from './messages/fr/moderation.json';
import frPlayer from './messages/fr/player.json';
import frStore from './messages/fr/store.json';
import frUpload from './messages/fr/upload.json';
import frWorld from './messages/fr/world.json';
import frXr from './messages/fr/xr.json';
import mgAuth from './messages/mg/auth.json';
import mgCommon from './messages/mg/common.json';
import mgDirector from './messages/mg/director.json';
import mgEditor from './messages/mg/editor.json';
import mgModeration from './messages/mg/moderation.json';
import mgPlayer from './messages/mg/player.json';
import mgStore from './messages/mg/store.json';
import mgUpload from './messages/mg/upload.json';
import mgWorld from './messages/mg/world.json';
import mgXr from './messages/mg/xr.json';

const en = {
  common: enCommon,
  upload: enUpload,
  player: enPlayer,
  world: enWorld,
  auth: enAuth,
  store: enStore,
  director: enDirector,
  editor: enEditor,
  moderation: enModeration,
  xr: enXr,
};

export type Namespace = keyof typeof en;
/** Typed keys: a key that is not in the `en` catalog of that namespace is a TypeScript error. */
export type MessageKey<N extends Namespace> = Extract<keyof (typeof en)[N], string>;
export type Catalog = { [N in Namespace]: Record<MessageKey<N>, string> };

/** Every locale must provide every key of `en` (a missing key is a compile error; the parity test checks the rest). */
export const CATALOGS: Record<Locale, Catalog> = {
  en,
  fr: {
    common: frCommon,
    upload: frUpload,
    player: frPlayer,
    world: frWorld,
    auth: frAuth,
    store: frStore,
    director: frDirector,
    editor: frEditor,
  moderation: frModeration,
    xr: frXr,
  },
  mg: {
    common: mgCommon,
    upload: mgUpload,
    player: mgPlayer,
    world: mgWorld,
    auth: mgAuth,
    store: mgStore,
    director: mgDirector,
    editor: mgEditor,
  moderation: mgModeration,
    xr: mgXr,
  },
};
