/** The "Search lyrics" action of a song without lyrics (provided by the page that owns the project). */
export interface LyricsSearch {
  /** A voice was detected in the song: only then is a search offered. */
  readonly voice: boolean;
  readonly status: "idle" | "searching" | "notFound" | "failed";
  /** `query`: the artist and title typed by the listener, for a file without usable tags. */
  start(query?: { artist: string; title: string }): void;
}
