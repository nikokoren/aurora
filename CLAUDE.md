# Working in this repo

Read PROJECT.md first, it has the architecture and every non-obvious
decision. This file is the day-to-day rules.

## No test suite, verify against the live plugin

Everything so far has been checked with offline Node scripts that mock
`fetch()` (see the sanity checks used during development, not committed
here) plus manual review of the rendered screen. There is no CI. Before
calling a change done, either:

- run the relevant piece through `node --check` at minimum for syntax,
  and a mocked-fetch script for logic, or
- push to the actual TRMNL private plugin and force-refresh with Debug
  Logs on, and read the real output.

Don't assume a change is correct just because it looks right.

## Style

- No em dashes or en dashes anywhere, in code comments, commit messages,
  or generated text. Commas, periods, or restructure the sentence.
- Liquid templates are always delivered/kept as `.txt` files in this
  repo (`full.liquid.txt`, not `full.liquid`), matching the other TRMNL
  recipes. Paste the contents into TRMNL's own Liquid tabs; the `.txt`
  extension is just to keep this repo's files plain-text friendly.
- Native TRMNL Framework classes only (currently 3.3). No hand-rolled
  CSS for anything the framework already has a component or utility
  for. Check `https://trmnl.com/framework/docs/3.3` before assuming a
  class name; the framework has moved fast (v2 to v3.3 in one year) and
  training data is likely stale.

## Adding or editing user-facing text

All of it lives in the `LOCALES` object at the top of
`serverless.js.txt`. Never hardcode a string into the middle of `build()`
again, route it through `LOCALES[lang].ui` or `.voices[voice]` instead,
even if it's only needed in one language today.

- Every phrase list needs matching entries across all present languages
  and both voices, same array shape. `node --check` will not catch a
  missing key, a runtime read of `undefined` will just print
  "undefined" on the screen.
- Voice pools should have more than one variant per rank where
  reasonable. Neutral/facts doesn't need variety (it's meant to be
  boring and precise); astrophysicist does.
- If you add German copy, or copy in a new language, it has not been
  read by a native speaker of that language as of this repo's initial
  commit. Flag anything you're unsure of rather than guessing silently,
  the way the habedere project's phrase-by-phrase review worked.

## TRMNL specifics learned so far

- Serverless functions get 128 MB and 5 seconds. The OVATION grid build
  plus two extra fetches (Kp nowcast, Kp forecast) comfortably fits in
  that budget, but don't add a fourth network call without checking
  timing.
- Custom field values may arrive under
  `trmnl.plugin_settings.custom_fields_values`, or flattened as
  `custom_fields_values`, or flattened onto the input root, depending on
  context (Polling vs. Serverless vs. Studio preview). `field()` in
  `serverless.js.txt` already checks all three; keep using it rather
  than reading a field directly.
- Select field values are the option string as written in
  `form_fields.yml.txt` (currently plain `en`/`de`/`facts`/
  `astrophysicist`, not snake_cased labels), confirmed by the fallback
  logic (`LOCALES[key] || LOCALES.en`) actually being reachable in
  testing. If TRMNL ever changes this, the fallback silently hides it,
  so if a language selection seems to do nothing, log `voiceKey`/
  `key` before assuming the field is broken.
- A private plugin's polled/merged data is capped at 100 KB; this is why
  a Serverless function exists at all here. If you ever add a bigger
  data source, check the returned payload size, not just the source
  file size.

## Repo layout

| Path | Role |
|---|---|
| `serverless.js.txt` | Serverless function: NOAA fetch, Kp forecast, geomagnetic math, all `LOCALES` text |
| `full.liquid.txt` | Full view, both visual modes (polar chart / real map), poleward-biased map centering |
| `half_horizontal.liquid.txt` | Half Horizontal view (800x240): verdict left, time/direction compact right, no visual |
| `half_vertical.liquid.txt` | Half Vertical view (400x480): same visual modes as Full, stacked column layout |
| `quadrant.liquid.txt` | Quadrant view (400x240): verdict plus compact 3-night strip, no visual |
| `form_fields.yml.txt` | Plugin settings form: location (lat_lon field), map toggle, voice, language |
| `PROJECT.md` | Architecture and decisions, read this first |
| `CLAUDE.md` | This file |

## Two things that only broke in TRMNL's actual render pipeline, not in
## local testing or a browser preview

- **`data-value-fit` (the framework's own Fit Value runtime) does not
  reliably execute in TRMNL's actual render pipeline**, confirmed on
  device: a value overflowed its container despite the attribute being
  set correctly, on a fresh render, with no explanation found. Every
  verdict-like span in every view now has its own `.fit-text` class and
  is shrunk by a homegrown `shrinkToFit()` function in each file's own
  script instead, code we know executes reliably here. `data-value-fit`
  attributes are left in place too, harmless, in case the framework
  runtime does fire in some contexts, but do not rely on it alone for
  new text that might overflow, add `.fit-text` and let the local
  script handle it.
- **Never mutate the MapLibre style object `TRMNLMaps.options()`
  returns.** Chased a missing-borders/missing-water bug through five
  variants of rewriting `style.layers` before proving, with isolated
  throwaway test files, that any mutation at all broke rendering that
  worked perfectly when left untouched. TRMNLMaps already resolves
  colors correctly per device on its own; if a map ever needs
  different colors than the default preset gives it, that has to go
  through an actual compiled theme (see PROJECT.md), not a JS-side
  rewrite of the style before construction.

