# I13 — Lyrics found or transcribed automatically

When the user uploads no `.lrc`, the analysis now looks for lyrics itself, in this order (a user `.lrc` always wins and is
applied when the analysis is read):

1. **Online catalog (LRCLIB)**: artist and title come from the file's tags (ffprobe), or from hints (the seed passes
   them). One request with artist, title and duration; the answer is kept only if its length is within 4 s of the audio
   (otherwise it is another version) and it looks like a whole song (at least 4 lines over 40 % of it). A catalog entry
   marked instrumental stops the search. `lyricsSource: "lrclib"`. Nothing else leaves the server and the text is never
   logged; `LYRICS_LOOKUP=false` turns it off.
2. **Speech recognition (faster-whisper, CPU, int8)** on the isolated vocal stem. `lyricsSource: "whisper"`.
   `LYRICS_ASR=false` turns it off. Lyrics are time-synced by the recogniser, so expect errors on sung text.

## Cost optimisation

- The catalog is tried first: free, exact timings, no CPU.
- Recognition is skipped when the user gave an `.lrc`, when the catalog says instrumental, and when the vocal stem is
  nearly silent (under 8 % of 50 ms frames above a speech floor).
- The model sees only the vocal stem (cleaner than the mix, less hallucination), with voice-activity filtering, greedy
  decoding (`beam_size=1`) and no conditioning on previous text; the language is detected once per song; the model is
  loaded once per worker; only the first 5 analysed minutes are processed.
- Repeats a recogniser produces on held vowels are dropped, and segments with a high no-speech probability or a low
  confidence are discarded.
- The outcome (source and lines) is cached with the other work files: a re-analysis neither queries nor transcribes again.

## Limits

First use downloads the Whisper model (about 150 MB for `base`) from the Hugging Face hub; without network the step
returns no lyrics and the analysis still succeeds. A song analysed without lyrics under one `.lrc` choice is cached by
audio hash: a later upload of the same audio without an `.lrc` reuses that analysis.
