# Aurora Watch: text content requirements

Purpose of this document: describe what each piece of user-facing text
needs to communicate and what constraints it has to satisfy, with no
wording included anywhere. It exists so that alternative phrasing can be
gathered from a fresh, unbiased source, translator, native-speaker
friend, brainstorm, whatever, without that source anchoring on the
existing German (or English) text.

The constraints below are almost all structural (driven by the code and
the physical screen space), not linguistic, so they apply to any
language a phrase gets written in, German included.

---

## The two voices

Every slot below exists twice, once per "voice." A voice is a
persona/register the whole plugin can be switched into; the underlying
facts are identical, only the framing differs.

**facts**: plain, neutral, minimal. One canonical phrase per slot, no
variation. Reads like a status readout or a label, not a sentence with
personality. Whatever is written for this voice should feel almost
deliberately unadorned, the opposite of trying to be interesting.

**astrophysicist**: a knowledgeable, casually excited persona. Reacts
proportionally to how strong the aurora chance is, calm and
low-energy at the low end of the scale, increasingly urgent and
exclamatory at the high end. Direct, informal address (the equivalent
of German's du-form) throughout. Several slots have more than one
possible phrasing that gets picked at random on each screen refresh,
specifically so a plugin somebody looks at daily doesn't always say the
exact same sentence, each alternative for a given slot must independently
read as a complete, self-contained line, never assume a previous
phrasing was seen first.

A note specific to this voice: it was previously described (by the
person who owns this project) as aiming for a "slightly understated but
genuinely excited" character, not over-the-top, not flat. Any new
phrasing for this voice should be judged against that description.

---

## Mechanical constraints that apply everywhere

- **Random selection.** Any slot with more than one phrasing option is
  chosen uniformly at random each time the screen renders. There is no
  guaranteed order and no memory of what was shown last time.
- **Case rendering differs by slot.** Some slots are displayed forced
  into ALL CAPS by the code, regardless of how they're written; others
  are displayed exactly as written (natural / mixed case). This is
  called out per slot below, because a phrase that reads fine in mixed
  case can read badly once forced uppercase, and vice versa (for
  example, a phrase that uses a deliberate capital letter for emphasis
  loses that distinction entirely once everything is capitalized).
- **No slot may assume another slot's content.** Several slots appear
  on screen at the same time, stacked directly above or below each
  other. Each one needs to add distinct information; none should
  restate what a neighboring slot already says. Which slots are
  neighbors is called out below.
- **Screen space is genuinely tight, and different per view.** This
  plugin renders at four different sizes (roughly: a full screen, a
  wide short strip, a narrow tall column, and a small quadrant), and
  the same text has to work at all of them. Some slots only appear on
  the larger sizes; the ones that appear everywhere (the headline, the
  per-night forecast word) have the least room to work with, especially
  on the small sizes. A specific past failure: a two-word phrase in the
  tightest slot (see "per-night forecast word" below) visibly overflowed
  and got cut off on screen; a short single word replaced it
  successfully. Treat that as a real, working ceiling on length for that
  slot specifically, not a hypothetical concern.
- **Placeholders must survive substitution.** A small number of slots
  have a value inserted into them at display time (a compass direction,
  a clock time). Any phrasing for those slots has to remain
  grammatically correct for every possible value that could be
  substituted in, not just the one that happens to be easiest to write
  around.

---

## Slot-by-slot requirements

### 1. Verdict headline

**What it communicates:** the single, top-line answer to "is there a
chance of seeing the aurora." This is the largest, most prominent text
in the entire plugin, shown at every screen size, always.

**Time scope: this describes right now, a single point-in-time
reading, not a forecast for the whole day or night.** The underlying
data behind this slot is a live snapshot of current aurora activity,
with no look-ahead across the day built into it at all. A phrase that
frames its whole claim around "today" or "tonight" (as a time span,
not just a passing mention) overstates what the data actually
supports, and can visibly contradict itself if the screen happens to
refresh again later the same day with a different reading, since
there's no guarantee the two readings agree. This was found by
inspection to be a real, existing problem, at least one current
phrasing in each of the two languages does this. A present-moment
framing ("right now", "currently", or simply no time reference at all)
doesn't have this problem; anything that frames the claim as spanning
a whole day or night does, regardless of language. Note this doesn't
apply to every slot with a day/night word in it: the timing line
(slot 3)'s "sky too bright" variant legitimately can make a whole-night
claim, because its underlying check actually looks ahead across a full
day before concluding there's no darkness at all; this slot has no
equivalent look-ahead, it's a single snapshot, full stop.

**Display:** always rendered in ALL CAPS regardless of how it's
written.

**Structure:** four tiers, from "essentially no chance" up to
"excellent chance." The facts voice has exactly one phrasing per tier.
The astrophysicist voice currently has three alternative phrasings per
tier; that count isn't fixed, but each tier needs at least one option
per voice.

**Length constraints:** this is the tightest-scrutinized slot in the
plugin. On the largest screen size it has generous room (comfortably
two lines of large text). Every screen size has an automatic
shrink-to-fit safety net if a line runs too wide, but shrinking is a
rescue, not a goal: a headline that only fits after being shrunk reads
noticeably smaller than its siblings. The narrow tall screen size
already uses a deliberately smaller headline font than the others, and
the smallest screen size has the least room overall; treat those two as
the binding constraint for this slot: if it fits comfortably there
without shrinking, it will fit everywhere.

**Tone/escalation:** for the astrophysicist voice specifically, the
four tiers should read as a genuine escalation, calm/muted at the low
end, unmistakably urgent at the high end, not four independently
interesting phrases that happen to be ordered.

**Punctuation note:** anything written here will be seen only in ALL
CAPS. A phrase that relies on a full stop or other punctuation to
create a pause or a beat should be checked specifically in its
all-caps form, since capitalization removes one of the usual visual
cues (the shift from a capital letter starting a new sentence) that
makes a mid-phrase full stop read naturally.

### 2. Per-night forecast word

**What it communicates:** the same four-tier verdict as the headline
above, but compressed to a single word (or very short phrase) for a
3-night-ahead forecast strip. Shown once per night (three times total,
side by side) at every screen size.

**Display:** shown in natural / mixed case, not forced uppercase (the
opposite of the headline above).

**Structure:** same four tiers as the headline, one phrasing per tier
per voice (no rotation pool for this slot currently).

**Length constraints:** the hardest constraint in the whole plugin.
Three of these render side by side in a column layout, at the smallest
screen sizes each column is only around 100 to 150 pixels wide. A
two-word phrase here has already caused a real, visible layout failure
(text overflowing its column and getting clipped mid-word) that was
only fixed by shortening it to a single, short word. Anything proposed
for this slot should be evaluated as if a single short word is the
expected shape, not a phrase.

**Relationship to the headline:** this slot and the verdict headline
above share the same four tiers and may occasionally show the same
tier at the same time on screen (though not guaranteed to, they come
from separate calculations). They don't need to avoid all overlap, but
this slot's phrasing for a given tier doesn't have to be a shortened
version of the headline's phrasing for that tier, they can be
independently written, this is really its own slot with its own length
budget, not a compressed copy of slot 1.

### 3. Timing line

**What it communicates:** when the best viewing window is, or an
explanation of why there isn't a clean window to state. This is a
family of four mutually exclusive phrasings, only one of which is ever
shown at a time, depending on the situation:

- there is a specific upcoming window, framed as "from [time] to
  [time]"
- it is dark right now, but no specific window was identified around
  it
- it is not dark yet, but will become dark later today, framed as
  "from [time]"
- it will not get properly dark at all in the lookout period (for
  example, near-solstice high latitudes)

**Display:** natural case, not forced uppercase.

**Neighbors:** this line sits directly above the "where to look" line
(slot 4) and directly below the verdict headline (slot 1). It should
handle timing only; it never needs to restate that there's a chance
(the headline directly above it has already established that) and it
shouldn't drift into saying where to look (that's the next line's job
entirely).

**Placeholder handling:** two of the four variants have a clock time
inserted into them (one has two, a start and an end time; one has a
single time). The phrasing needs to read naturally with an inserted
time in that position, for any time of day.

**Family consistency:** because only one of these four ever displays at
once, and which one displays depends on circumstance rather than user
choice, the four should feel like a consistent family of statements
(the same kind of voice describing four different situations), not
four unrelated sentences that happen to share a slot.

**Frequency note:** all four variants only ever appear when there is
already some real chance indicated by the headline (a separate, lower
tier of the headline hides this entire line rather than showing a
"nothing to report" version of it). None of the four phrasings need to
hedge or soften for a no-chance case, that case never reaches this
slot at all.

### 4. Where-to-look line

**What it communicates:** which direction to physically face, or that
no direction is needed because the aurora would be directly overhead.
Two mutually exclusive variants:

- a direction to face (a compass direction gets inserted)
- directly overhead, no direction needed

**Display:** natural case, not forced uppercase.

**Neighbors:** sits directly below the timing line (slot 3), same
frequency rule (both are hidden together at the lowest verdict tier,
both only ever appear when there's already an established chance). This
line's job is direction only, not timing, that's the previous line's
job entirely.

**Placeholder handling:** the directional variant has a compass
direction (see slot 6 below) inserted into it. Any phrasing for this
variant has to remain grammatically correct regardless of which
compass direction gets substituted in, not just whichever one is
convenient to write around. The astrophysicist voice currently has
three alternative phrasings for the directional variant and a separate
set of three for the overhead variant; again, that count isn't fixed,
one option per variant per voice is the minimum.

**Distinction to preserve:** the overhead variant exists specifically
because, when the aurora is directly overhead, telling someone to face
a compass direction would be actively wrong or at least unhelpful,
these two variants need to stay clearly distinguishable in meaning, not
converge on similar-sounding phrasing.

### 5. Forecast day labels

**What it communicates:** which of the next three nights a forecast
column refers to (tonight, tomorrow night, or a specific weekday name
two nights out).

**Note on scope:** "tonight" and "tomorrow night" are the only two of
these three that are actual translatable phrases, the third slot is a
computed weekday name (Monday, Tuesday, etc.) generated from a fixed
list, not part of the voice content, and isn't in scope for
alternative phrasing here, only the "tonight" / "tomorrow night"
pair is.

**Display:** forced ALL CAPS regardless of how written.

**Voice:** shared across both voices, this label doesn't change based
on facts vs astrophysicist.

**Length constraints:** sits directly above the per-night forecast word
(slot 2) in the same tight column, same width budget applies. Currently
two words each; that has not caused a layout problem the way slot 2's
content did, but it's worth keeping in mind this shares the same
narrow column.

### 6. Compass directions

**What it communicates:** not a phrase in its own right, this is the
raw word substituted into the `{direction}` placeholder inside slot
4's directional variant (north / south).

**Grammatical constraint:** whatever word or word-form is chosen here
has to work correctly inside every one of slot 4's directional
phrasings, since the same word gets substituted into whichever
phrasing was randomly picked. If slot 4's phrasings are ever rewritten,
this needs to be checked against all of them again, not just one.

**Voice:** shared across both voices.

### 7. Error / data-unavailable state

**What it communicates:** a two-part message (a short title and a
longer explanatory line) shown when the underlying weather data
couldn't be fetched at all. The title states that aurora data is
unavailable; the explanatory line says the outside data source didn't
respond and that the screen will try again on its next refresh.

**Where it appears:** all four screen sizes show this message. On the
smaller sizes the title is set in a moderate font and shrinks to fit if
needed, so a short title still reads best; the explanatory line wraps
freely.

**Voice:** shared across both voices, this message doesn't change based
on facts vs astrophysicist.

### 8. Currently-unused strings

Three more strings exist in the content (a "Kp" data-source label, a
label for when the underlying model was last updated, and a phrase
for stale/old data) but are not currently displayed anywhere in the
plugin's visible screens; they were part of an earlier design and are
kept only for internal diagnostic logs a user would not normally see.
Not worth spending effort refining unless they get reinstated into a
visible screen at some point.

---

## Quick reference: which slots appear together on screen

- Slot 1 (headline) appears alone, or with slots 3 and 4 beneath it, or
  with slot 2's three-column strip beneath it, or both, depending on
  screen size and whether there's a chance to report at all.
- Slots 3 and 4 always appear together or not at all (same visibility
  condition), slot 3 above slot 4.
- Slot 2 and slot 5 always appear together (slot 5 as the label above
  slot 2's word, once per night, three times side by side).
- Slot 7 replaces everything else entirely, it's a distinct fallback
  screen, not something layered alongside the above.
