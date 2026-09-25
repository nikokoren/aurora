# Aurora Watch

TRMNL e-ink recipe. Answers "can I see the northern lights tonight" for a
fixed latitude/longitude, with a 3-night forward look and a two-language,
two-voice text layer.

## Architecture

Single TRMNL private plugin, Polling strategy, no external backend (unlike
Nearby Nextbike, there is no Cloudflare Worker here; NOAA's endpoints are
called directly from TRMNL's own Serverless runtime).

- **Polling URL**: `https://services.swpc.noaa.gov/json/ovation_aurora_latest.json`
  (about 900 KB; TRMNL's 100 KB cap on polled data forces the Serverless
  step below).
- **Serverless function** (`serverless.js.txt`, paste into the plugin's
  Serverless tab, language Node): takes the polled OVATION payload as
  `input`, builds a 360x181 intensity grid, and reduces it to a small
  `aurora` object. Also makes two more of its own network calls: the 1
  minute Kp nowcast, and NOAA's 3 day Kp forecast (for the forecast
  strip). All three sources degrade independently: if OVATION fails the
  whole build throws and the plugin shows a localized error screen; if
  either Kp call fails, that one piece (footer Kp, or the forecast strip)
  is silently blank instead of the whole screen dying.
- **Markup** (`full.liquid.txt`, paste into the Full tab): renders the
  `aurora` object. Framework 3.3. Two visual modes behind a form-field
  toggle: an abstract polar chart drawn as inline SVG (default), or a
  real MapLibre map (`use_real_map` boolean) with the same halftone
  aurora dots projected onto it with `map.project()`.
- **Form fields** (`form_fields.yml.txt`, paste into the Form Builder):
  latitude, longitude, location_name, use_real_map, voice, language.

## Non-obvious decisions

These are the things a fresh read would plausibly "fix" back into bugs.

**Why a Serverless function at all.** The raw OVATION file is ~900 KB.
TRMNL rejects any polled/merged payload over 100 KB. The function is not
optional scaffolding, it is the only way this plugin can exist.

**The nowcast and the 3-night forecast are different data sources with
different honesty levels.** `ovation_aurora_latest.json` is NOAA's actual
modeled oval, roughly a 30 to 90 minute nowcast, and drives the hero
verdict/graphic. The 3-night strip instead uses NOAA's 3-day Kp forecast,
which is a single planetary number, converted to a rough "viewline"
magnetic latitude via a standard interpolation table (`KP_LAT`) and
compared to the viewer's own dipole magnetic latitude (`geomagLat`). This
is a real approximation, not a second oval model. Kp forecasts are also
documented as getting worse with lead time (NOAA's own verification
studies show over-forecasting at Kp>=3). Do not upgrade the forecast
strip to look as confident as the hero verdict without also improving
the underlying data.

**Magnetic midnight, not local midnight, drives the best-viewing window.**
The `mlt()` function computes magnetic local time via a low-precision sun
position plus a centered-dipole coordinate rotation (`geomagLon`,
`geomagLat`, pole approximated at 80.7N, 72.7W). Aurora activity peaks
near magnetic midnight, not clock midnight; at Munich's longitude these
differ by roughly an hour. This is deliberate, not a timezone bug.

**Kp forecast schema was never confirmed against a live fetch.** The
parser (`getKpForecast`) reads `noaa-planetary-k-index-forecast.json` as
an array of rows with a header row, and looks up the `time_tag`/`kp`
columns by name rather than trusting a fixed index, specifically because
the exact shape was inferred from NOAA documentation and third-party
tool descriptions, not verified live. If the forecast strip is silently
empty, check this first with Debug Logs before assuming the math is
wrong.

**`voice` and `language` are independent axes.** Four combinations exist
(facts/astrophysicist x en/de) and none of them special-case each other.
All user-facing strings live in one `LOCALES` object at the top of
`serverless.js.txt`, keyed by language, each with a `voices` branch (text
that differs by tone) and a `ui` branch (text that doesn't: labels,
connectives, the error screen, compass letters). Adding a language is
adding one key to `LOCALES` with the same shape as `en`/`de`; nothing
else in the file changes. An unrecognized `language` or `voice` value
falls back to English/facts rather than breaking.

**German compass letters are not a copy of the English ones.** East is
`O` (Ost) in German, not `E`. `coordLabel()` takes the resolved locale
object specifically so this doesn't get "simplified" back to hardcoded
N/S/E/W.

**Custom field value lookup checks three shapes.** `field()` checks
`trmnl.plugin_settings.custom_fields_values`, then a bare
`custom_fields_values`, then the raw input object itself. This was
defensive from the start (the exact input shape TRMNL hands the
Serverless function was not confirmed live either) and has kept working
across every change since; do not narrow it to one shape without testing
on a live plugin instance first.

**Random text picks are per-build, not per-day.** `pick()` uses
`Math.random()`, so two consecutive refreshes can show a different
phrase for the same verdict. This is intentional (avoids the screen
freezing on one line forever) but means the astrophysicist voice is not
reproducible for testing; pin `Math.random` in a test harness if you need
determinism.

**The MapLibre script/stylesheet load is required, not optional scaffolding.**
`full.liquid.txt` loads `maplibre-gl.js` and `maplibre-gl.css` from
`https://trmnl.com/js/maplibre-gl/5.24.0/` itself, scoped behind the
`use_real_map` toggle. TRMNL's plugin editor flags the stylesheet import
with an advisory warning ("can break this edit page's layout"). That
warning is real but is about the *editor's* own page, not the rendered
device screen, and it does not block saving. Removing the load on the
strength of Framework 3.3.1's release notes ("TRMNLMaps ships inside the
runtime") was tried and broke the map entirely: `window.maplibregl` is
not preloaded by the runtime. Confirmed by testing, not assumption. Leave
the load in place; if the editor warning needs addressing, look for a
way to inline the required CSS instead of dropping the import outright.

**The real-map aurora overlay is hand-drawn SVG, not a MapLibre layer.**
An earlier version tried a GeoJSON fill layer with `TRMNLPaint.series()`
dither patterns and it rendered solid black, because `TRMNLMaps`'
built-in layers register their pattern images with the map canvas and a
hand-added layer does not. The current approach projects each grid cell
with `map.project()` and draws plain SVG rects sized by intensity, the
same technique the abstract polar chart uses. Do not reintroduce a
custom MapLibre fill layer without also registering its pattern image.

**Location is the built-in `lat_lon` field, not two custom string fields.**
TRMNL ships a `lat_lon` field type that lets the user search any city,
address or postal code and returns a single `"lat,lon"` string (or lets
them type coordinates directly). `serverless.js.txt` splits that string
on the comma; it does not trust the two halves to be free of surrounding
whitespace (a place picked from the autocomplete can come back
"48.1351, 11.5820" with a space), so it runs both halves through
`parseFloat`, which tolerates leading whitespace, rather than a stricter
parse. Don't reintroduce separate `latitude`/`longitude` string fields,
that was the original design and the framework's own field type is
strictly better for users (search instead of typing decimals).

**Aurora dots are colored through `TRMNLPaint.bg()`, not device checks.**
Both draw functions (`drawPolar`'s squares, `buildAuroraOverlay`'s
stipple) paint mostly green with an occasional pink accent at the
highest intensity tier, resolved via `TRMNLPaint.bg("green", {el})` /
`TRMNLPaint.bg("pink", {el})`. This is deliberate: the Paint API's job is
exactly to make "what color renders on this specific panel" not this
plugin's problem. Green/pink automatically become gray shades on the
1-bit OG and whichever of black/white/red/yellow the framework maps them
to on a BWRY panel, with zero conditional markup. Do not add manual
device-type branching for color, that fight is already won by the
framework; hardcoding it here would just fight the cascade TRMNLPaint
reads from.

**Real map's `outline` preset stayed; a contrast casing on the dots fixed
the BWRY legibility problem, not switching presets.**
On the BWRY 4-color panel, water paints solid red (the framework was
tuned in 3.3.1 to make water read clearly against land), which left the
aurora dots, resolving to yellow, the nearest BWRY ink to green, hard to
separate from a red field, and confirmed on a real BWRY screenshot as
looking like red confetti, not aurora. First tried `preset: "blank"`
("land alone, for your own overlays") to remove the water fill entirely.
That was tried on device and did not fix it either, reverted. The actual
fix: every dot in `buildAuroraOverlay` now draws with a thin
paper()-colored stroke casing (`stroke-width` via `px(2)`), the same
two-pixel contrast ring technique `TRMNLMaps.dot()` itself uses for its
own markers ("so a marker holds up over a busy map," per the framework's
own map docs). This separates the dot from whatever's underneath on any
panel, not just ones where the hue itself happens to land somewhere
different from the water fill, and keeps `outline`'s roads and place
detail intact. Not yet re-verified on the real BWRY device, worth a
fresh screenshot.

**Base map is forced grayscale by rewriting the MapLibre style's own
colors, not a CSS filter.**
First attempt was `map.getCanvas().style.filter = "grayscale(1)"` on the
theory that a CSS filter on the canvas would flatten whatever colors
TRMNLMaps resolved before the screenshot. Tested on the actual BWRY OG on
the framework's own device-preview sandbox: did nothing, water rendered
in full red exactly as before. Whatever TRMNL's actual render pipeline
does, it does not appear to honor a CSS filter applied to a MapLibre
canvas element (unconfirmed why exactly, screenshotting pipelines are
usually a full-page capture that should honor it, but the observed
result says otherwise). Real fix: `grayscaleStyle()` walks the style
object `TRMNLMaps.options()` returns *before* constructing the map, and
desaturates every literal `*color` paint value (`grayColor()`, a plain
luminance conversion, 0.2126R+0.7152G+0.0722B) in place. This changes
what MapLibre actually paints with, so it does not depend on any
compositing step surviving intact. Left `fill-pattern` (1-bit dither
tiles, already monochrome) and any non-string paint values (zoom
expressions) untouched, TRMNLMaps' own docs say its layers are flat
solids or tile patterns, not complex expressions, so this covers what's
actually there. The canvas CSS filter line is still in the code too, as
a harmless second pass, but the style rewrite is what actually works.
`TRMNLMaps.dot()` for the user's own location marker draws onto the same
canvas, so it goes gray too, which is correct, it is not the aurora
signal.

**Pink/accent aurora threshold lowered for testability.**
Was `d >= 8` at 35% chance, meaning only the most extreme test data would
ever show the second color at all, easy to mistake "never triggered" for
"can't work." Lowered to `d >= 6` at 50% chance, both `drawPolar` and
`buildAuroraOverlay`. Still means green will be the large majority of
dots. Whether green and pink actually resolve to two visibly different
inks on BWRY (reasoned they should: pink is hue-adjacent to red, green
is hue-adjacent to yellow, so nearest-hue mapping should put them on
different inks) is not yet confirmed on device, worth checking with a
stronger synthetic Kp payload.

**Dot contrast casing is ink() (dark), not paper() (white).**
Started with a white casing, reasoned for separating dots from a colored
water fill. Broke on the 2-bit OG: a light fill (green/pink fall back to
a light gray on low-color devices) plus a white ring, sitting on white
land, is invisible, confirmed on a real 2-bit OG screenshot, dots near
the pole essentially vanished. White land is normal, ink() (dark)
separates from both white land and the gray water/tiles, so switched
both dot layers (the map overlay's circles and the abstract polar
chart's rects, the same light-on-white problem exists there too, just
not yet screenshotted) to a dark casing. If a future theme ever inverts
to dark land, this would need revisiting, not expected for e-ink.

**Info column text centering needed two different fixes, flex alignment
and `text--center`, they are not the same thing.**
First fix (`flex--center-y` -> `flex--center`) handled the flex *item*
itself, i.e. positioning the box as a unit in the container, still not
enough. `text-align` is a separate CSS property that controls how
wrapped text sits inside that box; without an explicit `text--center`, a
multi-line span like the verdict ("SLIM, BUT" / "POSSIBLE") still
left-aligns each of its own wrapped lines even though the box holding it
is centered. Confirmed on device with a real screenshot before adding
`text--center` to the info column (inherits to all descendants: labels,
verdict, time line, forecast strip). Both pieces are required together
whenever a flex column holds text that might wrap. Worth double-checking
any other flex--col block in this project for the same gap.

**Dot ring: mid-gray (`gray-35`) and thinner (`px(1)`), not
ink()/`px(2)`.**
The ink() casing fixed the white-land invisibility problem, but on a
real device screenshot it was too heavy, a thick black ring completely
dominating a dot this small, especially on the BWRY color panel where
every dot got the same bold outline regardless of fill color. Backed off
to a mid gray (`gray-35`) at half the stroke width. Still separates from
both white land and the gray water/tiles (that's what mid-gray steps are
for, per the framework's own v3 enhancement guide: "intermediate steps
... subtler contrasts ... especially on 2-bit and 4-bit displays") without
the ring itself becoming the most visually dominant part of the overlay.
Applies to both the map overlay's circles and the abstract polar chart's
rects (`stroke-width` 0.75 there, since those cells are smaller still).

**Tried a 14-step green lightness ramp keyed to intensity, reverted, still
open.**
Idea: instead of one flat `green` for every cell below the pink
threshold, resolve all 14 lightness steps (`green-10` darkest through
`green-75` lightest) via `TRMNLPaint.bg()` once and pick a step by `d`,
so color reinforces the same reading dot size already carries instead of
reading as basically uniform. Implemented as `greenRamp()` /
`auroraColor()` in both draw functions, but it didn't work on device,
reverted back to the flat `auroraGreen()`/`auroraPink()` two-tone
version, exact failure mode not yet diagnosed (unconfirmed whether
`green-NN` step tokens resolve at all via `TRMNLPaint.bg()`, that was
never independently verified, only inferred from the Colors doc listing
them as valid utility classes). Worth revisiting, but check the token
resolves before rebuilding the same approach.

**Quadrant view added (`quadrant.liquid.txt`).**
Smallest size, only ever shown inside a Mashup. Down to location as a
small label and the verdict as the big value, nothing else: no visual,
no time window, no forecast strip. Uses `data-value-fit="true"
data-value-fit-max-height="100"` on the verdict since its length varies
a lot across verdict tiers and there is no single font size that fits
"Unlikely" and "Excellent chance" equally well. The 100px max-height is
a first guess, not yet verified on device. Half Horizontal and Half
Vertical still to build; Half Vertical needs a decision on whether it
gets a shrunk version of the abstract polar chart or stays text-only
like Quadrant, not yet settled.

**Location name moved to the title bar, both views.**
Title bar's right side ("instance") used to show `aurora.footer` (Kp/
model text); now shows `aurora.name | upcase` instead, in both
`full.liquid.txt` and `quadrant.liquid.txt`. Since it's "moved" there,
the location label that used to sit above the verdict in the body is
gone from both views too, not duplicated. `aurora.footer` itself is
still computed server-side (harmless, still visible in Debug Logs if
ever useful), just not rendered anywhere now.

**Quadrant's 3-night strip: full label + written-out verdict, not
abbreviated label + Kp number.**
First pass guessed there wasn't room for full labels or verdict words at
this width and went with 3-letter abbreviations and a bare Kp number
instead. Wrong guess, confirmed on device (a German-language screenshot,
"HEU MOR SUN" / "Kp 2.7 Kp 2 Kp 2.3", with a lot of unused vertical
space below it) there's room for both full, same shape as Full's own
strip minus the Kp line. Lesson: don't pre-shrink content for a size
budget without checking the actual rendered space first, this view has
more headroom than it looks like on paper.

**Third forecast night's label was truncated server-side, not by the
quadrant template.**
Fixed the quadrant template to stop slicing labels to 3 letters, but
"Sun" kept showing anyway, because the label itself was already short:
`serverless.js` built the 3rd night's label with
`Intl.DateTimeFormat(..., { weekday: "short" })`. Changed to
`"long"`, so it comes through as "Sunday" / "Sonntag" instead of "Sun".
Tested both locales with a mocked Kp forecast fetch (the earlier
lat_lon test harness didn't cover the forecast array at all, had to add
a KP_FORECAST_URL mock, shape A: array-of-arrays with a header row, to
actually exercise this code path).

**Half Horizontal view added (`half_horizontal.liquid.txt`).**
Wide (800), short (240): verdict large on the left (`data-value-fit`,
same variable-length reasoning as Quadrant), time window + compass hint
compact on the right. No forecast strip, no visual, neither fits this
height without feeling cramped. Location in the title bar, consistent
with the other views. Not yet checked on device.

**Half Vertical view added (`half_vertical.liquid.txt`), gets the real
map/abstract chart toggle, not text-only.**
Explicitly asked and chosen over the other two options (shrunk chart
only, or text-only like the other small views): Half Vertical gets the
same `use_real_map` toggle Full has, full functionality, not a lighter
version. Layout is `layout--col` instead of Full's `layout--row`
(visual on top, verdict and forecast stacked below, since there is not
enough width at 400px to sit a map beside a text column the way Full
does at 800px). The whole `<script>` block (drawPolar, buildAuroraOverlay,
grayscaleStyle, every color/contrast helper) is copied verbatim from
`full.liquid.txt`, confirmed byte-identical, not reimplemented: those
functions already read the container's own `clientWidth`/`clientHeight`
rather than assuming Full's dimensions, so they work unchanged in a
narrower, taller box with zero adaptation needed. If a bug is ever found
in one of those draw functions, fix it in both files, there is no shared
include mechanism across TRMNL view templates, each is a fully
independent file. Not yet checked on device, particularly whether the
map's default zoom (3) still frames something sensible at this aspect
ratio, Full's aspect ratio is very different.

**Full's verdict had no overflow protection; that's what actually broke.**
Confirmed against the Value docs, not guessed: `value--xlarge` is a
fixed 74px, "that size holds on every device, bit depth, and font
bundle." No built-in shrink-or-wrap safety net, none of the twelve size
tiers have one, that's specifically what `data-value-fit` exists for.
Full was the one template that never got it (Quadrant, Half Horizontal
and Half Vertical all did, from the start). A long word at a fixed 74px
in a column that's narrower than it needs can run well past its own
box, seen on device: "UNGLAUBLICH" reaching into the screen's top-right
corner, overlapping whatever else is rendered there. Added
`data-value-fit="true" data-value-fit-max-height="200"` to Full's
verdict, matching the other three. 200 gives roughly 2 lines of headroom
at value--xlarge's natural 86px line height before the fit algorithm
needs to shrink it further.

**Not yet using responsive breakpoint prefixes anywhere.**
The Value docs also describe `sm:`/`md:`/`lg:` prefixed size classes
(`value--small md:value--large lg:value--xlarge`) as the native way to
adapt the size tier itself to a genuinely different canvas (OG vs X,
landscape vs portrait), separate from what Fit Value does (handling
unpredictable string length within one fixed size). None of the four
views use this at all right now, every value/title/description size is
one hardcoded tier regardless of device. Flagged, not yet applied,
would touch every text element in all four files.

**Full's layout now reflows for portrait via `portrait:layout--col`, not
hardcoded to row.**
Screenshot showed the real bug behind the "UNGLAUBLICH" overflow: on a
portrait-oriented screen, Full's outer layout was still `layout--row`
unconditionally, so the map/chart and the text column stayed side by
side, squeezed into a narrow width instead of stacking, with the text
column overflowing past the right edge and a large dead gap below the
forecast strip (the leftover vertical space a stacked layout would have
used, a row layout has no way to). Fixed with the framework's own
documented pattern: `layout--row portrait:layout--col` on the outer
layout, `portrait:w--full` on the info column (`w--72` is a sane fixed
width for a side column next to a map in row mode, wrong once it
becomes a full-width block stacked below the map in portrait). This is
what "portrait:" prefixes are for on every layout/flex/size utility,
confirmed against the Responsive doc rather than hand-rolled: landscape
is the implicit default, only the portrait override needs stating.
Scoped to Full only, it's the one view that occupies the whole screen
and inherits the device's own orientation setting directly; Half
Horizontal, Half Vertical and Quadrant are fixed mashup-cell shapes
regardless of device orientation, this reflow concern doesn't apply to
them the same way. Not yet checked on device in actual portrait mode
(the screenshot that surfaced this was a squeezed/narrow render, not
confirmed to be genuine device portrait orientation vs. some other
narrow host container, worth confirming which).

**Map border/coastline lines clamped to a darker floor on their own,
separate from fills.**
`grayColor()` did a straight luminance conversion for every paint
property alike. Cartographic border and coastline lines are usually a
pale hairline by design, subtle against a colored base map on purpose,
and converting that pale color 1:1 keeps it just as pale; a fill's many
pixels can express that as a light dither pattern fine, a 1px line
can't, it just goes patchy or vanishes on 1-bit OG, confirmed on a real
screenshot: borders visibly missing. `grayscaleStyle()` now clamps any
`type: "line"` layer's color to at most a mid-dark gray (`rgb(90,90,90)`
floor via a `maxY` param on `grayColor()`), leaving fills to convert
naturally. Tested directly: a pale `#cccccc` border now clamps to
`rgb(90,90,90)`, an already-dark road (`#333`) stays at its own darker
value since it's already below the floor, and a fill's luminance
conversion is untouched.

**Reminder to self: Full and Half Vertical share the whole `<script>`
block verbatim, and it bit me applying this exact fix.**
Nearly shipped a broken `half_vertical.liquid.txt` by running `cp
full.liquid.txt half_vertical.liquid.txt`, which overwrites the whole
file, not just the shared script, Half Vertical's markup (column
layout) is not the same as Full's (row/portrait:col). Caught it by
diffing before syncing, rebuilt correctly (own markup + the freshly
extracted script), verified byte-identical scripts and Liquid balance
again before sync. Whenever a script-only fix lands in one file, extract
just the `<script>...</script>` block and splice it into the other,
never copy the whole file.

**The line/look pair hides entirely at rank 0 (Unlikely).**
`aurora.level` (the verdict's numeric rank, 0-3, already returned by the
serverless function) now gates both lines in Full, Half Horizontal and
Half Vertical: `{% if aurora.level > 0 %}` around both spans. At rank 0
those lines were never saying much anyway ("Dark now" / "Don't bother
looking up", states that exist mainly to fill the space rather than
report anything actionable), so now the verdict word stands alone with
nothing underneath it. Quadrant never showed these lines at all, no
change needed there. Scoped to just this line/look pair; the forecast
strip's own per-night verdict word was not touched, wasn't part of what
was asked.

**Voice content replaced (both languages, both voices), `lookNone`
dropped, two bugs caught integrating it.**
New hero/short/lookOverhead/lookToward phrasing supplied for facts and
astrophysicist, en and de. Dropped `lookNone` from all four voice
blocks: now genuinely dead, the line/look pair is hidden entirely at
rank 0, so a "nothing to see" phrase can never display. Simplified the
`look` computation to match (`if (level.rank > 0) { ... }`, no rank-0
branch left referencing a pool that no longer exists). Caught two real
bugs in the pasted content before integrating: astrophysicist's
`lookOverhead`/`lookToward` (both languages) were nested one level too
deep (`[[...]]` instead of `[...]`), which would have made `pick()`
return an array instead of a string; flattened to match `facts` and the
original shape. Tested all 16 language x voice x rank combinations
directly, `aurora.look` is a plain string in every case, empty at rank
0 as expected since it's not shown there anyway.

**Third forecast night's weekday label, second and third rounds: went
from wrong language to blank, both real bugs on the actual runtime,
neither reproducible locally.**
Round 1 (`{weekday:"long"}`): TRMNL's runtime apparently has English-
only ICU data and silently fell back to English for German. Fixed by
building the name ourselves instead of asking Intl for one: a
`WEEKDAY_NAMES` table plus `localDateKey().split("-")` parsed into
`Date.UTC(...).getUTCDay()`.
Round 2: that shipped and the label went from wrong-language to
completely blank, "Ruhig" and the Kp number still rendered fine for
that column, only the label vanished, meaning the object was pushed to
`forecast` fine, `label` alone came out falsy. Confirmed on device, not
reproducible locally with realistic dates either time. Root cause not
fully confirmed (can't run TRMNL's actual runtime to inspect), but the
`.split("-")` step was assuming `Intl`'s en-CA output is always exactly
"YYYY-MM-DD", an assumption worth distrusting on a runtime that's
already surprised us once. Rewrote `weekdayName()` to use
`formatToParts()` instead, pulling year/month/day by field type rather
than parsing a string by separator, wrapped in try/catch, with a final
fallback to the timestamp's raw UTC weekday (not TZ-aware, but never
blank) if the primary computation fails for any reason at all. Tested
the normal path and a simulated total `formatToParts` failure, both
produce "Sonntag" correctly.
If this breaks a third time, the next step is asking for whatever
TRMNL exposes as Debug Logs on an actual failing render, guessing
further from a local Node environment that can't reproduce either
failure mode isn't converging.

**Real map borders reportedly still broken in TRMNL's actual device
preview, though a separate "markup preview" shows them fixed. Not yet
diagnosed, need more information.**
The grayscaleStyle()/line-clamp fix mutates the MapLibre style object
before the map is constructed, so it isn't a timing race the way the
earlier CSS-filter attempt might have been, but if this is genuinely
the same class of problem (a difference between how "markup preview"
and "actual device preview" execute or capture the plugin, mirroring
the earlier CSS-filter-doesn't-survive-the-real-pipeline finding), the
current fix might not be reaching the real render pipeline at all for
some reason not yet understood. Alternatively this could be the same
kind of stale-preview/caching issue hit before (confirmed real for the
Sunday label once, false alarm for the quadrant abbreviation once), not
a code problem. Asked Niko what "device preview" specifically triggers
(fresh poll vs cached) to tell these apart; unresolved as of this note.

**Map border lines: solid black, not a clamped gray. The gray clamp was
itself the "trying to be clever" problem, not a fix.**
The `maxY: 90` clamp (previous entry) looked fine in a live browser
preview but the actual device apparently still showed missing/patchy
borders. Directly asked whether this was us overcomplicating the shade
handling, and yes: a live browser just paints an RGB value directly,
no dithering involved, so `rgb(90,90,90)` looks like a solid line
there regardless of width. The real device has to dither that gray
down to true 1-bit black/white, and a 1px line has essentially no
pixel budget for a dither pattern to land reliably on, so it can still
go patchy no matter how dark the clamp value is, that's likely the
same "looks right in a browser, wrong on the real pipeline" gap the
CSS-filter attempt hit earlier, just relocated. Fixed by not computing
a shade for lines at all: `grayscaleStyle()` now sets every line-type
layer's color straight to solid black (`rgb(0,0,0)`), no clamp, no
luminance math, nothing to dither since black is exactly representable
at any bit depth. `grayColor()` dropped its now-unused `maxY` parameter
back to a plain luminance conversion, used for fills only. Tested the
logic directly: a pale border, a paler coastline and an already-dark
road all now come out as flat black uniformly, fills still convert
naturally. Not yet re-confirmed on the actual device preview specifically
(the whole reason this needed fixing was that local/browser testing
doesn't reliably predict what that pipeline does), worth another look
there.

**RESOLVED, for real this time: the map-recoloring experiment itself was
the bug, not any particular color value. Reverted entirely.**
Chased this across five variants (CSS filter, style-object rewrite,
mid-gray clamp on lines, solid black on lines) with zero confirmed
effect until finally isolating it properly with three throwaway
diagnostic files, each adding back exactly one piece:
1. Bare "outline" preset, nothing of ours at all -> rendered correctly
   on its own, gray water, crisp dark borders, no intervention needed.
2. Same, plus a minimal absolutely-positioned overlay div with two
   plain circles (the same stacking pattern buildAuroraOverlay uses,
   no color logic) -> also fine. Rules out the overlay mechanism.
3. Same, plus grayscaleStyle() copied verbatim -> broke exactly like
   the real file: water gone entirely, borders faded to the thin
   default line.

That pins it definitively on grayscaleStyle(), and reframes the whole
thing: TRMNLMaps already resolves per-device colors correctly on its
own (proven by test 1 needing zero help from us), so the entire premise
that we needed to force-grayscale the map ourselves was wrong from the
start, at least on whatever device these tests ran against. Best guess
at the actual mechanism (unconfirmed, can't inspect TRMNLMaps' internals
from here): water's fill likely comes from a fill-pattern tile image
reference tied to some internal state, not the fill-color we thought we
were safely rewriting, and mutating style.layers in place disturbs
that, rather than the specific color values being wrong.

Removed `grayColor()`, `grayscaleStyle()`, the call site, and the dead
CSS filter line entirely from both full.liquid.txt and
half_vertical.liquid.txt (same script, kept identical as always). The
map preset is left completely untouched now, matching what test 1
proved works.

This reopens the *original* problem that motivated all of this (a
BWRY color panel's water rendering in a distracting red, competing with
the aurora dots), unresolved again. Worth revisiting separately if it's
still actually a problem after everything else that's changed since,
but not by mutating the style object, that whole approach is now known
to be unsafe on at least one real device. A CSS filter was confirmed
merely inert (no effect, not destructive) rather than broken the way
the style rewrite was, so that's a safer starting point if this comes
up again, though it never actually worked either.

Three scratch files were created purely for this diagnosis
(`aurora_watch_maptest.liquid.txt`, `_maptest2`, `_maptest3`), not real
views, delete them from the TRMNL project once confirmed no longer
needed, they aren't part of the plugin.

**Forecast strip per-night verdict word: same unprotected value--small bug
as Full's main headline, in three files this time.**
"Wird interessant" (German astrophysicist, rank 2) was overflowing its
column and getting visibly clipped mid-word ("nteressant", "interessar")
in Full, Half Vertical and Quadrant alike, all three share the same
per-night markup pattern. Same fix as before: `data-value-fit="true"
data-value-fit-max-height="80"` on the value span. Also added
`style="min-width:0"` to the column div itself: flex children default to
`min-width: auto`, which can let a long unbroken word force the column
wider than its share of the row instead of wrapping within it, a known
flexbox gotcha the framework's own stretch-x/stretch-y utilities patch
for automatically, that we don't use here since these are plain
flex--col columns. Belt and suspenders, not yet confirmed on device
which of the two pieces was actually load-bearing.

**Real map preset switched back to "blank", retried now that the actual
cause of the water/border bug is known.**
Asked whether the framework offers a way to keep water from competing
with the aurora for BWRY ink while still keeping it visible in a neutral
tone. That's what a proper theme does (repaint just the map-water slot),
but authoring one means going through the framework's own SCSS build
and linter and hosting the compiled stylesheet, a real build pipeline,
out of scope for a same-session file edit. Retried "blank" instead as
the quick option: removes water (and roads and place labels) from the
map entirely rather than recoloring it, so it isn't the same outcome as
a theme would give, but it directly solves "not red" by not drawing it
at all. Worth retrying now specifically because the earlier "blank
didn't work" result predates knowing our own grayscaleStyle mutation was
the actual destructive element; that confound is gone now. Not yet
confirmed on device whether blank alone is good enough, or whether the
proper theme route is worth pursuing after all.

**Map preset reverted back to "outline"; "blank" traded away too much.**
Retried blank given the actual bug (our own style mutation) was gone.
It ran without error this time, but the result wasn't useful: land and
water rendered as the same flat gray with no coastline or distinction
at all, worse than the problem it was meant to solve, since the whole
point of the real map view is showing geography. Reverted to outline
in both full.liquid.txt and half_vertical.liquid.txt. The original
"ocean shouldn't compete with the aurora for BWRY ink" question is
still open; a proper theme (see the earlier entry) is the real answer
if it's still worth pursuing, not another preset swap.

**data-value-fit (the framework's own built-in runtime) does not
appear to execute in TRMNL's actual render pipeline. Stopped depending
on it, replaced with our own shrink-to-fit in every view.**
Confirmed on a fresh device render: a forecast verdict word overflowed
its column exactly as before, despite data-value-fit being set
correctly and documented as running automatically with no setup
required. This is a different, more serious class of finding than the
earlier map bugs, those were our own code; this is a framework built-in
we can't fix or debug from here, and every verdict on every view
depends on it. Rather than trust it further, added a small `shrinkToFit`
homegrown function (shrink font-size in a loop until an element's
scrollWidth fits its parent's clientWidth, floor at 14px so text never
gets unreadably small) to a new, separate script block in all four
views, applied to every verdict-like span via a shared `.fit-text`
class (the main headline in all four, plus the per-night forecast word
in Full/Half Vertical/Quadrant, seven spans total). This script is
intentionally independent of the map-related script in Full/Half
Vertical (no whenReady gate, no MapLibre dependency), since text
shrinking has nothing to do with maps and shouldn't wait on map
libraries loading. `data-value-fit` attributes are left in place
everywhere, harmless, in case the framework runtime does fire in some
contexts; our own function is the one actually being relied on now.
Half Horizontal and Quadrant had no `<script>` tag before this, both
do now.
Tested the shrink algorithm's logic directly with mocked DOM
measurements (overflowing text shrinks until it fits, already-fitting
text is left untouched, text that can never fit stops cleanly at the
floor), confirmed Full and Half Vertical's shared script is still
byte-identical apart from one comment line. Not yet confirmed on device
whether our own script actually fixes the real bug, given script
execution generally has proven reliable throughout this project
(TRMNLPaint colors, MapLibre), there's good reason to expect it will,
but that's inference, not confirmation yet.

**Map view is now biased poleward, not centered on the user.**
The user's own location was dead center, wasting half the frame on the
equatorward side nobody's looking toward. Now recentered so it sits at
75% down the screen (bottom third) north of the equator, mirrored to
25% down (top third) south of it, `A.grid.hemi` decides which. The map
was already centered exactly on the user at load time, so the technique
is: unproject() the screen point that should become the new center
(same zoom, no rescaling), then setCenter() there; since panning at
fixed zoom is a pure pixel-space translation, this moves the user's own
location to the target screen fraction precisely. Verified the
algorithm itself with a mock linear projection (not real Mercator, but
enough to confirm the recenter math does what it claims) for both
hemispheres before writing it into the real file. Runs first in the
map's `load` handler, before buildAuroraOverlay and the "you are here"
marker, so both draw against the final, already-recentered view rather
than the original center. The 0.75/0.25 split is a first guess, not yet
seen on device; may need tuning once visible, especially at high
latitudes if it pushes the effective center close enough to the
Mercator pole limit to look distorted.

**German voice content: adopted the user's own edit as source of truth.**
Niko edited the German astrophysicist voice directly (not through a
request here) and pasted the resulting full file back. Diffed it
against what we had: only content changed (German `lookOverhead`/
`lookToward`/`hero` phrasing reworded, and notably `short[2]` went from
"Wird interessant" to "Spannend", which incidentally sidesteps the
forecast-strip clipping saga for that specific string, though the
general `.fit-text`/`shrinkToFit` protection added earlier still
matters for whatever else might be long). No structural or logic
changes. Adopted verbatim as the new file.

**Map recentering worked in Full, did nothing in Half Vertical, on
"load" vs "idle".**
Confirmed on device: same script (byte-identical between both files,
checked as always), but the shift only took effect in Full. The aurora
overlay and the "you are here" marker rendered correctly in both, so
MapLibre itself was fine, only the recenter call was a no-op in Half
Vertical specifically. Best-grounded explanation, not confirmed against
MapLibre's internals directly: Half Vertical's map gets its height from
"grow" filling whatever space the text below it leaves in a column
layout, which can settle later than a row layout's width does; `load`
fires once style and sources are ready, but not necessarily once the
container's final size has. Switched from `load` to `idle` (a stronger
guarantee, fires only once the map has fully finished rendering) with a
one-time guard (`idle` can fire more than once, including from our own
`setCenter`/`resize` below triggering a re-render), and added an
explicit `map.resize()` right before measuring, forcing MapLibre to
resync its internal canvas size with the container's current DOM
measurements regardless of exactly when either settled. Order within
the handler is unchanged and still matters: recenter first, then
buildAuroraOverlay and the "you are here" marker, since the overlay is
baked as static SVG at draw time from whatever the view is at that
moment, not dynamically re-projected if the map pans later.
Not yet confirmed on device that this actually fixes Half Vertical
specifically; the reasoning is sound but this is the second attempt at
this exact bug, so treat it as a real fix only once seen working.

**Forecast strip: switched from hand-rolled flex--row to the framework's
actual Columns component, not a shortcut this time.**
Confirmed on device: with varying content length across the three nights
("Getting interesting" vs "Maybe"), a `flex flex--row` of `flex--col`
children sized each column to its own content, so the long one claimed
most of the width and the other two got squeezed together. That is
correct default flex behavior, `flex: 0 1 auto` sizes to content, not to
an equal share; this was never a bug in Flex, it was the wrong tool for
this job. Read the actual v3 docs rather than guessing: TRMNL's Grid doc
says outright, "if you have lots of same-type data and want the system
to handle column distribution and overflow, use Columns", exactly this
case, three same-shaped items that should split evenly. Confirmed the
real class syntax from TRMNL's own quickstart example
(`docs.trmnl.com`): `class="columns"` on the container, `class="column"`
on each child, not `grid--cols-N` (that is Grid's own syntax, a
different component with a different purpose, fixed spans, not
even distribution). Applied to all three views with this strip (Full,
Half Vertical, Quadrant). Kept `.fit-text`/`shrinkToFit` on the verdict
span inside each column too, defense in depth: Columns' own overflow/
clamp pass is JS-driven per the Framework Runtime docs, and
`data-value-fit` already proved unreliable in this exact production
pipeline, so the width distribution itself (which columns handles via
plain CSS flex-basis, no JS required) is what actually fixes the
squeeze; text-length overflow within an already-equal column is still
our own homegrown code's job. Not yet confirmed on device.

**Half Horizontal restructured: reclaimed right column now holds a
3-night forecast strip, not wasted space.**
Original design (verdict left, growing; time/look right, fixed w--72
column) looked bad in both directions: mostly blank on a quiet night
(no time/look text at all, rank 0), awkwardly cramped on a busy one
(two lines squeezed into a narrow fixed column). Considered two
options: stack everything centered with nothing reserved (simplest), or
use the reclaimed space for something useful. Went with the latter: the
left block still grows and centers (verdict, then time/look stacked
directly underneath when there's anything to say), and the right side
is now a compact 3-night forecast strip, the same verdict + 3-night
shape Quadrant already proved works at this height, side by side here
rather than stacked since 800px has the width for it. Built with the
Columns component from the start this time (`class="columns"` /
`class="column"`), not hand-rolled flex, matching the lesson learned
fixing the other three views' forecast strips. The forecast block is
wrapped in its own `{% if aurora.forecast and aurora.forecast.size > 0
%}`, so the left block grows to the full width on its own when there's
no forecast data at all, not just when rank is 0. Not yet confirmed on
device.

**Portrait handling was Full-only; wrong assumption, mashup slot shapes
change with device orientation too.**
Assumed Half Horizontal/Half Vertical/Quadrant didn't need portrait
handling since they're fixed mashup-cell sizes, not the whole screen.
Wrong: confirmed against the actual Screen docs, `--half_horizontal-w/h`
etc. are calculated from `--screen-w/h`, which swap under
`screen--portrait`. Half Horizontal is not reliably 800x240, on a
portrait-oriented device it becomes a genuinely different, much
narrower and taller shape, not just a smaller version of the same one.
Added `portrait:layout--col` and `portrait:w--full` to
`half_horizontal.liquid.txt`, mirroring the exact pattern already
proven in `full.liquid.txt` (verdict-and-forecast row reflows to
stacked). Half Vertical and Quadrant were left alone since they're
already `layout--col` in both orientations, portrait just makes them
narrower/taller still, no row-to-col reflow needed there, though
Half Vertical's own map/canvas sizing math should be re-examined if it
ever looks wrong at very narrow portrait widths (240-ish px).

**Bare "stretch" replaced with axis-correct stretch-y on both map
canvases.**
Confirmed against the TRMNL X Guide: plain "stretch" is not the
axis-aware utility, `stretch-x`/`stretch-y` are, introduced specifically
for layouts that reflow between row and column. In `layout--row`,
`stretch-y` stretches vertically; in `layout--col` "the axes are
swapped" so the same class means horizontal stretch instead, no
separate portrait-specific class needed on the canvas itself, it just
tracks the cross axis whichever one that currently is. Also removes the
need for manually written `min-width:0;min-height:0` inline styles,
`stretch-x`/`stretch-y` include that protection built in per the same
guide; removed the redundant manual versions from both
`full.liquid.txt` and `half_vertical.liquid.txt`'s canvas divs.

**Forecast strip Columns migration and now the portrait reflow: two
rounds of "go reread the docs, no shortcuts", both real, not
overcautious.**
First round (`columns`/`column` instead of hand-rolled flex) fixed
content that actually broke on device. This round didn't have a
specific broken screenshot behind it, more a general "are we actually
using the framework everywhere" audit, but turned up a genuine,
previously wrong assumption (portrait scope) and a genuine unused
feature (stretch-x/stretch-y) rather than nothing. Worth taking these
prompts seriously rather than reflexively defending the existing code.
Not yet confirmed on device, none of this round has been seen rendered.

**Map loading made robust against a slow/failed MapLibre load, borrowed
from the Nearby Nextbike recipe, not designed from scratch.**
That recipe has already been through this exact problem (MapLibre is a
blocking ~1MB script tag) and handles it with patterns we didn't have at
all: explicit detection of which global never showed up
(`maplibregl`/`TRMNLMaps`) rather than polling forever with nothing to
show for it, a visible fallback message instead of a blank canvas if
nothing ever draws, and a watchdog for the case where `TRMNLMaps.watch`
itself never calls back (a different, outer failure mode from "the map
loaded but never settled"). Adopted all three: `whenReady()` now shows
"Map unavailable (...)" naming whichever library is missing if it gives
up after ~10s instead of silently doing nothing; a `mapFallback()`
helper shows a message in the map area rather than leaving it blank;
an outer watchdog fires at 6s if `watch`'s callback never ran at all.
Also added `<link rel="preconnect" href="https://trmnl.com" crossorigin>`
before the MapLibre script/stylesheet, cheap and safe, buys back DNS/TLS
round trips against a large blocking download.

Did not copy that recipe's event-triggering strategy directly: it treats
`load` and `styledata` as interchangeable triggers for the same setup
work, racing whichever fires first. We specifically know `load` is
unreliable for our recenter math in Half Vertical (that's the entire
reason `idle` was adopted a few commits back), so adding `load` back as
an equal alternative would risk it winning the race with a stale
container size and silently reintroducing that exact bug. Kept `idle`
as the only real trigger, backed by a flat 3s timeout as a safety net
for "idle never fires at all" rather than a second path that could fire
early with the same stale-size problem idle was chosen to avoid.
Extracted the setup work (resize, recenter, overlay, dot) the idle
handler and the timeout fallback both used to duplicate into one
`setup()` function with its own `initialized` guard, called from either
trigger, so exactly-once semantics hold regardless of which one fires
first; the previous version had this logic copy-pasted twice, a real
risk of the two drifting apart.

Tested the guard logic in isolation (not the real MapLibre behavior,
which needs a live browser) with mocked trigger orderings: idle-then-
timeout only runs setup once, timeout-only still runs it, and a `watch`
callback that never fires shows the fallback message and runs setup
zero times, all as intended. Not yet confirmed on device; this is meant
to make failure visible and graceful, not something a normal successful
render should ever exercise.

The `<link rel="stylesheet">`/`<script src>` "layout-risk" warning the
editor shows for the MapLibre import is not eliminated by any of this,
and does not appear to be avoidable: the Nearby Nextbike recipe uses the
identical pattern and presumably shows the same warning. It looks like
an inherent property of loading any external library this way, not
something either recipe did wrong; the point of this change is handling
the consequences gracefully, not suppressing the warning itself.

**Map went blank in portrait, stretch-y's automatic axis-swap doesn't
seem to handle a portrait:layout--col reflow correctly.**
Confirmed on device: space was still correctly reserved for the canvas
(grow's height allocation worked fine), but the map itself never
rendered visibly, not even our new fallback message, consistent with
the canvas collapsing to near-zero width rather than a JS failure
(a JS failure should have eventually shown the fallback text). Suspect
axis-correction keys off the literal `layout--col` class on the
ancestor, and since our markup keeps `layout--row` present at all
times (`portrait:layout--col` is a separate responsive class added
alongside it, a reflow override, not a replacement of the base class),
it may never recognize the computed direction has actually flipped.
Not confirmed against the framework's internals, this is the most
plausible read of the symptom, not a certainty.
Fixed by not depending on the automatic detection for this specific
combination: `stretch-y portrait:stretch-x` states explicitly what
should happen in portrait instead of inferring it from the ancestor's
class. Only `full.liquid.txt` needed this, `half_vertical.liquid.txt`
is always `layout--col`, no row-to-col switch happens there so there is
no ambiguous class combination for stretch-y's detection to get wrong
in the first place.
Not yet confirmed fixed on device, this is the second attempt at
portrait-mode map visibility specifically; treat as real only once
actually seen working in portrait.

**Half Vertical had the same blank-map-in-portrait bug, which
disproves the specific ambiguity theory used to fix Full, applied the
same fix anyway since Full's actual confirmed on device.**
Full's fix (explicit `portrait:stretch-x`) was confirmed working on
device. But Half Vertical showed the identical symptom despite having
no `layout--row` anywhere in its markup, unconditionally `layout--col`,
so the "ancestor still has the literal layout--row class" theory cannot
be the (sole) mechanism, something else common to both is going on,
most likely `screen--portrait` interacting badly with stretch-y's
automatic axis-swap regardless of layout direction, not specific to a
row/col ambiguity. Applied the same confirmed-working fix pattern
(explicit `portrait:stretch-x` instead of relying on the automatic
swap) to `half_vertical.liquid.txt` on that basis, pattern-matching
from a proven fix rather than a fully understood mechanism. A bare
diagnostic file (`aurora_watch_porttest.liquid.txt`, unconditional
layout--col, no portrait: override at all) was created to properly
isolate whether this is stretch-y/portrait specifically or something
in our own added code, not yet tested. Not yet confirmed fixed for
Half Vertical specifically.

**Half Vertical's map script reverted to the pre-stretch-y,
pre-robust-loading version, confirmed working on device. The two files'
map scripts are now genuinely different, not accidentally, and that's
worth taking seriously as a signal.**
Every "fix" applied to Half Vertical since the original idle-vs-load fix
(plain "stretch" -> stretch-y -> stretch-y portrait:stretch-x, then the
whole robust-loading rewrite: explicit missing-library detection,
mapFallback(), multi-layer watchdog, forced map.resize() calls) was
reported broken on device: "your half vertical code actually broke the
map." The version confirmed actually working is the simpler one from
right after the idle fix: plain `class="grow stretch"` (not stretch-y),
manual inline min-width:0/min-height:0 (not removed), and `map.on("idle",
...)` with no timeout fallback, no watchdog, no resize() forcing. Adopted
that version verbatim for `half_vertical.liquid.txt`, no further
tweaking on top of it.

This means the two files' map scripts are no longer byte-identical,
after several commits explicitly maintaining and verifying that they
were. That discipline is intentionally broken now, don't "fix" it by
re-syncing them without addressing the actual question first: why did
the same category of change work for Full (portrait:stretch-x was
confirmed fixing Full's blank-portrait-map bug) but broke Half Vertical?
Two live possibilities, neither confirmed: (a) something genuinely
different between the two files' situations (Full reflows row-to-col via
portrait:, Half Vertical is unconditionally col, so "the same fix"
was never actually the same change in effect), or (b) it was never
really about stretch-x/y at all, and the robust-loading rewrite (forced
resize(), extra timers) is what actually broke things, in which case
Full may be quietly carrying the same fragility and just hasn't been
retested since that layer was added.

Worth Niko retesting Full specifically before assuming it's still fine;
"portrait:stretch-x fixed Full" was confirmed before the robust-loading
rewrite landed on top of it, not after.

**The forecast strip's alignment in this reverted version (`flex
flex--col text--center fit-text` wrapper per night, `value--xsmall`, no
data-value-fit attributes at all) was called out as doing a better job
than the Columns-based version built earlier in this same session for
Full/Quadrant/Half Horizontal.** Not yet propagated to those other
three views; worth doing if this holds up, but given the pattern above
(several "improvements" in a row turning out to be regressions), better
to let Niko confirm this is genuinely better before changing three more
files to match it, rather than assuming.

## Known gaps / next steps

- Kp forecast JSON schema unverified live (see above); verify with Debug
  Logs on first real deploy.
- Forecast margin threshold (`-6` degrees in `FORECAST_LEVELS`) and the
  astrophysicist phrase pools are first-draft, meant to be tuned against
  a few real nights before calling this "done".
- Only `en`/`de` exist. Structure supports more; content doesn't yet.
- Half and quadrant Liquid views (for mashups) not built, only Full.
- No test suite; verification so far has been offline Node scripts
  mocking `fetch()`, not a live TRMNL render. See CLAUDE.md.
