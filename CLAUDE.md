# Working in this repo

Read PROJECT.md first, it has the architecture and every non-obvious
decision. This file is the day-to-day rules.

## Working method (adopted 2026-09-27, applies to every TRMNL recipe)

1. **Never verify against input you invented.** Test payloads must be
   captured from the live API, or come from the fixture corpus built from
   captured responses. A bug found only in made-up data isn't a bug.
2. **Sweep the state space, don't spot-check.** Render every combination
   that matters (states x languages x voices x views x devices) and compare
   outputs. Report results as numbers (for example "6/6 identical before,
   0/6 after"); that number is also the proof of the fix.
3. **Re-fetch versioned docs; memory is stale.** Use unversioned URLs,
   stamp what was verified and when, and the web wins on disagreement.
4. **"Not there" needs proof, not recall.** Search every relevant place and
   say what was searched: "checked X and Y, zero hits" is a different claim
   from "I don't think so".
5. **Prove fixes, don't assert them.** Reproduce the failure, show it gone,
   and diff outputs before and after (for example "removed 3, added 0,
   kept 25"). Where only a device can prove it, say "not confirmed on
   device" instead of "fixed".
6. **Run real data through new copy before shipping it.** Every new phrase
   goes through real payloads in every state it can appear in, so
   contradictions show up before users see them.
7. **State corrections in one line, then move on.**
8. **Write memory down, dated, with a re-check instruction.** Agents have no
   memory across sessions; the repo is the memory. Every stated fact about
   an outside system carries its version, date, and "re-fetch before
   relying on this".
9. **Assume concurrent agents.** In a long session, re-read a file before
   editing it; don't trust your last-known main.

In this repo specifically: the files in `fixtures/` are synthetic (a
made-up storm for the store image), so they must never be used to verify
logic (point 1). Real verification data means captured NOAA responses,
which don't exist in the repo yet; start that corpus before the next
logic change. The sweep for point 2 here is 4 verdict tiers x 4 timing
states x 2 languages x 2 voices x 4 views, plus devices and orientations
for anything visual.

## No test suite yet, verify against real data

There is no CI. Development checks so far were offline Node scripts
mocking `fetch()`, and some of those mocks used invented response shapes,
which the working method above rules out: from now on, mocks replay
captured real responses only. Before calling a change done:

- `node --check` for syntax, at minimum;
- a sweep over captured real responses for logic (point 2);
- for anything visual, the actual TRMNL private plugin with Debug Logs on,
  and the result stated as "confirmed on device" or "not confirmed on
  device".

## Style

- No em dashes or en dashes anywhere, in code comments, commit messages,
  or generated text. Commas, periods, or restructure the sentence.
- Liquid templates are always delivered/kept as `.txt` files in this
  repo (`full.liquid.txt`, not `full.liquid`), matching the other TRMNL
  recipes. Paste the contents into TRMNL's own Liquid tabs; the `.txt`
  extension is just to keep this repo's files plain-text friendly.
- Native TRMNL Framework classes only (currently 3.3). No hand-rolled
  CSS for anything the framework already has a component or utility
  for. Check the unversioned docs at `https://trmnl.com/framework/docs/`
  before assuming a class name (verified 2026-09-27: it served 3.3; mirrors
  and cached release pages still called 3.1.1 "latest", so re-fetch before
  relying on any version number here, and the web wins on disagreement). Pick the
  arrangement component by what the content is (per the Columns and
  Grid pages, verified 2026-09-27):
  - **Grid** for a fixed, small set of equal cells, like the 3-night
    forecast strip: `grid--cols-N` gives equal widths, and the column
    count switches per view with size and orientation prefixes (for
    example `grid--cols-3 portrait:grid--cols-1 lg:grid--cols-1`), so
    cells stack where the slot is too narrow. An earlier version of this
    rule said Columns; that was wrong.
  - **Columns** for lists and feeds: many same-type items per column,
    distributed and overflow-hidden by the framework. It has no way to
    stack a handful of cells when space runs out; on narrow slots the
    three forecast labels overlapped.
  - **Flex** for content-sized arrangements inside a cell. Each forecast
    cell is `flex flex--col flex--center-x`: that centers the label on
    device, while `text--center` on a `.column` left it left-aligned.
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
- **`stretch-x` and `stretch-y` are literal axes, x horizontal, y
  vertical. They do NOT swap with layout direction.** An earlier version
  of this rule claimed they did, based on a misreading of the X Guide;
  device testing disproved it. Pick the one matching the parent's cross
  axis: `stretch-y` in `layout--row`, `stretch-x` in `layout--col`, and
  for a layout that reflows (`layout--row portrait:layout--col`) state
  both, `stretch-y portrait:stretch-x`. This matters most for an element
  with no intrinsic size of its own, like the map canvas (its only
  content is absolutely positioned): it gets its main-axis size from
  `grow` and its cross-axis size only from the stretch class. The wrong
  one gives it the main axis twice and the cross axis never, collapsing
  it to zero: space reserved, content invisible, no error anywhere.
  That exact symptom hit Half Vertical twice (`stretch-y` in a column).
  Prefer these over plain `stretch`; they include
  `min-width:0`/`min-height:0`, so don't add those inline alongside.

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
- **Script layout is the same in every view.** The `shrinkToFit` script
  is identical in all four files and sits after the final
  `{% endif %}`, so it also fits the error message. The map/polar chart
  script is also in all four views (Half Horizontal and Quadrant show
  the visual on the TRMNL X only), sits inside the `aurora.ok` branch
  (it has nothing to draw otherwise,
  and threw on the error path when it lived outside), and is
  byte-identical across all four. To propagate a change: find the
  block by its content (`var A = {{ aurora | json }}` for the map
  script, `function shrinkToFit` for the other), not by position,
  a first-match or fixed-index lookup has already shipped a no-op
  "fix" once. Verify by re-reading the file from disk. Never copy a
  whole file, the markup differs.
- **Handle a slow or failed MapLibre load visibly, don't poll forever.**
  MapLibre is a large blocking script; a renderer that captures before
  it loads, or before the map settles, needs something other than a
  blank canvas. The shared map script detects which library never
  showed up and says so, and an outer watchdog covers
  `TRMNLMaps.watch` never calling back. Borrowed from the Nearby
  Nextbike recipe. Confirmed working on device in Full (landscape and
  portrait).

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
| `half_horizontal.liquid.txt` | Half Horizontal view (800x240): verdict block plus 3-night strip in a row; on TRMNL X also the visual (map or polar chart) |
| `half_vertical.liquid.txt` | Half Vertical view (400x480): same visual modes as Full, stacked column layout |
| `quadrant.liquid.txt` | Quadrant view (400x240): verdict plus compact 3-night strip; on TRMNL X also the visual (map or polar chart) |
| `form_fields.yml.txt` | Plugin settings form: location (lat_lon field), map toggle, voice, language |
| `PROJECT.md` | Architecture and decisions, read this first |
| `CLAUDE.md` | This file |

## Two things that only broke in TRMNL's actual render pipeline, not in
## local testing or a browser preview

- **`data-value-fit` (the framework's own Fit Value runtime) does not
  reliably execute in TRMNL's actual render pipeline**, confirmed on
  device: a value overflowed its container despite the attribute being
  set correctly, on a fresh render, with no explanation found. Every
  element carrying `data-value-fit` is also shrunk by a homegrown
  `shrinkToFit()` in each view, code we know executes here. It selects
  on the framework's own `[data-value-fit]` attribute, not a class of
  ours, so the markup stays free of custom classes. For new text that
  might overflow: just add `data-value-fit="true"`, the local script
  picks it up automatically.
- **No custom classes, and inline styles only where no framework class
  can do the job.** Every class in the markup and in JS-built HTML is a
  framework class (positioning uses `relative`, `absolute`,
  `inset--0`, `top--0`, `left--0`). Exactly three inline styles remain,
  each commented in place: `overflow:hidden` on the canvas (the
  framework has no overflow utility, and it contains the polar chart's
  fixed-size fallback); `position:absolute;inset:0` on `#aurora-map`
  (MapLibre adds `.maplibregl-map` to that element and its own
  stylesheet sets `position:relative` there, loaded after the
  framework's, so the framework class would lose and collapse the map;
  checked against MapLibre 5.24.0's source CSS); and the font size
  `shrinkToFit` writes at render time. Don't "clean up" those three.
- **Device-specific elements use the Visibility utilities, e.g.
  `hidden lg:block`** (`lg:` matches only the TRMNL X today). Size
  prefixes follow the device, not the view slot, so an X Quadrant still
  counts as `lg`. Hiding is CSS only: scripts in a hidden element still
  run and script tags still download. The shared map script therefore
  waits for the canvas to be displayed (`whenShown`) and draws nothing
  if it never is. A size prefix on layout direction (`lg:layout--row`)
  is not documented, so don't rely on it; make the hidden element one
  more child of a row instead, as Half Horizontal and Quadrant do.
- **Never mutate the MapLibre style object `TRMNLMaps.options()`
  returns.** Chased a missing-borders/missing-water bug through five
  variants of rewriting `style.layers` before proving, with isolated
  throwaway test files, that any mutation at all broke rendering that
  worked perfectly when left untouched. TRMNLMaps already resolves
  colors correctly per device on its own; if a map ever needs
  different colors than the default preset gives it, that has to go
  through an actual compiled theme (see PROJECT.md), not a JS-side
  rewrite of the style before construction.

