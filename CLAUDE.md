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
  training data is likely stale. This includes not defaulting to a
  generic `flex flex--row` when there is a more specific component for
  the job: for a row of same-shaped repeated items that should split
  evenly (a 3-night forecast strip, anything list-like), that is the
  Columns component (`class="columns"` / `class="column"`), not Flex,
  Flex sizes each child to its own content by default, which looks fine
  until two items have very different content lengths and one crowds
  out the other. Reach for Grid instead only when spans need to be
  unequal on purpose (`col--span-N`).
- **Mashup slot dimensions are not fixed, they are derived from the
  screen's own width/height, which swap under `screen--portrait`.** Do
  not assume Half Horizontal/Half Vertical/Quadrant only need to look
  right at their landscape numbers (800x240 / 400x480 / 400x240), a
  portrait-oriented device gives each of them a genuinely different
  shape, not a scaled-down version of the same one. Any view whose
  layout direction (row vs col) would look wrong once notably narrower
  and taller needs its own `portrait:layout--col` (or equivalent)
  reflow, the same pattern `full.liquid.txt` and
  `half_horizontal.liquid.txt` already use, not just Full.
- **Use `stretch-x`/`stretch-y`, never plain `stretch`,** on anything
  meant to fill the cross axis of a Layout that might reflow between
  row and column. They are axis-correct: `stretch-y` means vertical
  stretch in `layout--row` and automatically means horizontal stretch
  once `portrait:layout--col` takes over, no separate portrait-specific
  class needed. They also include `min-width:0`/`min-height:0`
  protection built in, so do not add that manually alongside them.
- **A MapLibre map's `load` event is not reliable for anything that
  measures the container** (recenter math, anything reading
  `clientWidth`/`clientHeight`). `idle` is: it fires once rendering has
  fully finished, `load` can fire before the container's final size has
  settled, especially in a column layout where the map gets its size
  from `grow` filling whatever the other children leave. Confirmed on
  device, not a guess: `load` did nothing for Half Vertical's recenter
  while `idle` worked correctly, both from byte-identical code.
  Don't add `load`/`styledata` back as alternative triggers racing
  `idle` for that same work, even for robustness, they can win the race
  with a stale size and silently reintroduce the bug `idle` fixed. A
  flat timeout backing up `idle` (not replacing it) is the right way to
  add a safety net without that risk.
- **`full.liquid.txt` and `half_vertical.liquid.txt`'s map scripts are
  no longer byte-identical, and that is deliberate, not an oversight to
  fix.** They were kept identical for a long stretch of this project,
  worth re-checking that discipline before assuming it, but every
  robustness layer added on top of the working idle-based fix (plain
  `stretch` -> `stretch-y` -> `stretch-y portrait:stretch-x`, then
  explicit missing-library detection, a fallback message, a watchdog,
  forced `map.resize()` calls) was confirmed to break Half Vertical's
  map on device, "your half vertical code actually broke the map."
  Half Vertical was reverted to the simpler version from right after
  the idle fix: plain `stretch`, manual inline
  `min-width:0`/`min-height:0`, `idle` with no timeout/watchdog/forced
  resize. Full still has all of that layered on, `portrait:stretch-x`
  was confirmed fixing Full's own blank-portrait-map bug, but that
  confirmation predates the robust-loading rewrite being added on top,
  it has not been separately reverified since. Before adding anything
  else to either file's map handling: confirm it actually helps on
  device first, several changes in a row here looked like reasonable
  improvements and were regressions instead. If in doubt, the simpler
  Half Vertical version is the one currently known to work.
- Handle a slow or failed MapLibre load visibly, don't just poll
  forever, when doing so doesn't risk the regression above. MapLibre is
  a large blocking script; a renderer that captures before it loads, or
  before the map ever settles, needs something other than a blank
  canvas. `full.liquid.txt` currently does this (detects which library
  never showed up and shows a message naming it, plus an outer watchdog
  for `TRMNLMaps.watch` never calling back), borrowed from the Nearby
  Nextbike recipe. `half_vertical.liquid.txt` does not, per the point
  above.

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

