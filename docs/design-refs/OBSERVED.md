# Observed Design Details (from Zoom Workplace screenshots)

Transcribed from the reference screenshots supplied by the user. Where this file
disagrees with BLUEPRINT.md, **this file wins** — it is a direct observation of the
target UI, whereas the blueprint was written from memory.

---

## 1. App chrome (all screenshots)

- **Top-left wordmark**: two lines, `zoom` (small, ~13px, regular) stacked above
  **`Workplace`** (~17px, bold). Sits in the chrome to the LEFT of the rail column,
  i.e. the wordmark occupies the top-left corner, above the rail — the rail's grey
  and the top bar's grey are one continuous surface.
- **Nav cluster is CENTER-adjacent, not left**: `‹ ›` chevrons + a history clock
  glyph sit immediately left of the search pill, as a group, roughly centered in the
  window — NOT pinned to the far left as blueprint §6.0's ASCII sketch implies.
- **Search pill**: centered, rounded-full (not `--r-md`), grey fill, magnifier glyph
  on the left, placeholder text `Search ⌘ + K` centered in the pill.
- **Upgrade button**: blue, rounded-full pill, top-right.
- **Avatar**: 36px rounded-full photo, immediately right of Upgrade, with a **green
  presence dot** at bottom-right. In-meeting screenshots show a small **red/orange
  camera badge** on the avatar instead of/alongside the dot.
- **Black OS strip** runs across the very top, full width, ~22px.
- **Content card**: white, rounded on **all visible corners** (not just top), inset
  from the chrome on left/top/right/bottom with a small gap (~6-8px). The grey chrome
  is visible as a thin frame around it.

## 2. Left icon rail

- Items top-to-bottom: **Home, Meetings, Chat, More**. Settings gear pinned bottom.
- Each item: ~22px outline glyph over an ~11px label, centered.
- **Active state** = white rounded-rect pill behind the item (see Home in screenshot 1).
- **More, when open** = a **blue 2px outline** rounded-rect (not a white fill) —
  distinct from the active-route pill. Worth reproducing.
- Rail width reads ~113px as blueprint says.

## 3. More flyout (screenshot 1)

- White panel, rounded, soft shadow, anchored to the right of the rail, vertically
  positioned starting around the "More" item.
- **3-column grid**, items are icon-over-label, label ~12px:
  - Row 1: Scheduler · Hub · Canvas
  - Row 2: Paper · Sheets · Slides
  - Row 3: Whiteboards · Clips · Tasks
  - Row 4: Notes · Contacts *(only 2 items — grid is left-aligned, not justified)*
- **Hub** carries a small blue-outlined **`NEW`** pill, positioned up-and-right of
  its glyph, overlapping the icon's top-right.
- Footer, separated by a 1px divider: grey text `Drag to pin or remove from toolbar`
  on the left, blue **`Reset`** link on the right.
- All icons are thin-stroke outline style, monochrome dark — NOT colored.

## 4. Home screen (screenshot 1)

- Clock `1:18 AM` — very large (~56px), weight 600, near-black.
- Date `Thursday, August 13` below, ~17px, grey.
- **Three action tiles**, evenly spaced, icons are ~76px rounded-squares (~20px radius):
  - **New meeting** — ORANGE fill, white **slashed video-camera** glyph. Label
    `New meeting` in dark text with a **⌄ chevron** to its right.
  - **Join** — BLUE fill, white **+** glyph. Label `Join`.
  - **Schedule** — BLUE fill, white **calendar showing "19"** glyph. Label `Schedule`.
  - Labels are ~15px, dark grey/near-black, centered under each icon.
- **Calendar banner**: white fill, 1px BLUE border, rounded ~8px. Blue ⓘ circle glyph
  on the left. Text: `You haven't connected your calendar yet. Connect now to manage
  all your meetings and events in one place.` where **`Connect now`** is a blue link.
  Text wraps to 2 lines. No visible dismiss ✕ in this screenshot.
- **Day strip**: bordered card directly below the banner, same max width.
  - Header row: centered **`Today, Aug 13 ⌄`** (bold), with an **open-in-new-window**
    glyph at the far right.
  - Toolbar row below header: a **`Today` pill** (bordered, with a small calendar
    glyph), then `‹` `›` day arrows, then a `⋯` menu at the far RIGHT.
  - Empty state: a **parasol/beach-umbrella illustration** in pale lavender/periwinkle,
    over the text `No meetings scheduled.` in grey, with generous vertical padding.
  - **Footer row inside the same card**, separated by a divider: `Open recordings ›`
    left-aligned, dark text.

## 5. Join screen (screenshot 2)

- Centered column, but positioned in the UPPER portion of the card (~25% down), not
  vertically centered in the viewport.
- Title **`Join Meeting`** — large, ~28-30px, bold, LEFT-aligned with the input below it.
- **Combobox**: white, 1px grey border, rounded ~6px, generous height (~52px).
  Placeholder `Meeting ID or Personal Link Name` in grey. A large **⌄ chevron** on the
  right side inside the input.
- Buttons **right-aligned** below the input, in order: **`Cancel`** (white fill, grey
  border) then **`Join`** (disabled state = grey fill, lighter grey text).
- Note the disabled Join is a **grey filled** button, not a faded blue one.

## 6. Loading / joining states (screenshots 3 & 4)

- **Screenshot 3** — light loading state inside the white card: a single blue
  circular spinner, centered, on white. Used while a route loads.
- **Screenshot 4** — meeting join state: the content card turns **near-black**, with
  a white/blue circular spinner centered and **`Joining Meeting…`** in white ~24px
  below it. The rail + chrome remain light grey and fully visible. Confirms
  blueprint §6.7: the room renders INSIDE the shell.

## 7. Meeting room (screenshots 5-7, 9-12)

- **Room top bar** (black): ⓘ circle glyph + **`Pinak Kundu's Zoom Meeting`** in white
  bold on the left. Far right: a **green shield** (encryption), a thin vertical
  divider, a **layout/grid glyph**, then a small dark circular **`zm`** avatar chip.
- **Room canvas**: very dark (#1A1A1A-ish). Video tile floats centered.
- **Self name badge**: bottom-left of the canvas, dark translucent rounded rect,
  containing a **red slashed-microphone glyph** + `Pinak Kundu` in white ~13px.
- **Control bar** (black, ~72px), icon-over-label, labels ~12px white:
  - Left group: **`Unmute`** (mic glyph with a RED slash when muted) + `˄`,
    **`Video`** (camera with red slash when off) + `˄`.
  - Center group: **`Participants`** with a count badge (`1`) + `˄`, **`Chat`** + `˄`,
    **`React`** (heart glyph), **`Share`** (green up-arrow in a GREEN rounded square —
    the icon is green-filled, the label stays white) + `˄`, **`Host tools`** (shield).
  - Right group: **`More`** (⋯ in a circle), then **`End`** — red ✕ in a red circle,
    label `End` in white.
  - **Screenshot 9-12 variant**: a thin vertical **divider** appears between
    `Host tools` and a separate **`Settings`** (gear) item, then `More`. So the bar
    has two layouts depending on whether Settings is pinned. Reproduce the divider.

### More popover (screenshot 6)
- Dark (#232323-ish) rounded panel, anchored above the `More` button, bottom-right.
- 3-column grid, icon-over-label, white text ~12px:
  - Row 1: **Breakout Rooms** (blue 2px outline = selected/hover state) · **Whiteboards** · **Settings**
  - Row 2: **Stop Incoming Video** (spans as a single left-aligned item)
- Divider, then footer row: `Reset to default` (white/grey) + **`Reset`** (blue link),
  right-aligned.

### End popover (screenshot 7)
- Dark rounded panel, anchored bottom-right ABOVE the End button.
- **`End Meeting for All`** — full-width RED filled button, white text, rounded.
- **`Leave Meeting`** — full-width neutral dark grey button below it, white text.
- OUTSIDE the panel, on the control bar row: a **`Give feedback` checkbox** (unchecked,
  white label) on the left, and a **`Cancel`** button (dark grey, rounded) on the right.

## 8. Settings modal — TWO distinct variants

### 8a. LIGHT variant (screenshot 5)
Even though this is shown in-meeting, it is the LIGHT theme — white modal on the dark room.
- Title **`Settings`** top-LEFT (not centered), ✕ top-right.
- Left nav ~285px. Items: **General, Audio, Video, Chat** (only 4 — a reduced set).
- **Selected item = solid BLUE filled rounded-rect** with white text and a white glyph.
- Unselected items have **colored rounded-square icons**: Audio = teal/green headphones,
  Video = green camera, Chat = green speech bubble.
- Content pane:
  - `Theme` section head (bold ~15px) + grey subtext
    `Only applied when the system is using light mode, learn more ⓘ`
  - **4 circular swatches** with labels below: **Classic** (split black/white circle,
    selected — has a dark ring around it), **Bloom** (solid blue), **Agave**
    (muted green), **Rose** (muted pink/mauve).
  - `Navigation` section: subtext `Items are added to toolbar when accessed`, with a
    blue **`Reset to default`** link right-aligned on the same row.
  - `Auto-call` section: unchecked checkbox
    `Automatically receive a call when a scheduled meeting starts`.

### 8b. DARK variant (screenshots 9, 10, 11, 12)
- Title **`Settings`** **CENTERED** at the top, ✕ top-right. Header separated from the
  body by a 1px divider that runs the FULL modal width.
- Left nav items: **General, Video, Audio, Background, Statistics, About** (6 items —
  note Video BEFORE Audio here, opposite of the light variant, and no Chat).
- **Selected item = BLUE 2px OUTLINE** (rounded ~16px) with a blue-tinted fill and
  white text — NOT a solid blue fill like the light variant.
- Icon squares are colored per blueprint §2.6: General grey gear, Video green camera,
  Audio teal headphones, Background cyan person, Statistics purple bar-chart,
  About blue ⓘ.
- A 1px vertical divider separates nav from content.

**General pane (screenshot 9)** — differs from the light variant:
- `Always show meeting controls` checkbox (unchecked).
- `Video` head → `Maximum participants displayed per screen in Gallery View:` with
  **radio** options `9 participants` / `25 participants` (25 selected, blue radio).
- `Chat` head → checked `Show user profile icon next to in-meeting chat messages`.
- `Reactions` head → `Skin Tone` label with **6 thumbs-up emoji swatches** in a row
  (first one selected with a grey rounded background), then checked
  `Display your reactions above toolbar` and checked `Animate emojis`.

**Video pane (screenshot 10)**
- Large 16:9 **camera preview** at top (dark red/black = camera feed).
- Checkboxes: checked `Mirror my video`, unchecked `Hide Non-video Participants`,
  unchecked `Hide Self View`, unchecked `Show me as an active speaker when I talk`.
- `Use hardware acceleration for:` with two checked checkboxes side-by-side —
  `Receiving video ⓘ` and `Sending video ⓘ`.
- `Video Rendering Method` label + a select showing `Auto`.
- Note: this pane **scrolls** — a scrollbar is visible on the right edge.

**Audio pane (screenshot 11)**
- `Speaker` head → **`Test Speaker`** button (bordered) + a wide select
  `Default - MacBook Air Speakers (Built-in)`. Below: `Output level:` label with a
  horizontal **level meter bar** (full white bar).
- `Microphone` head → **`Test Mic`** button + select
  `Default - MacBook Air Microphone (Buil...` (truncated). Below: `Input level:`
  with a level meter showing a **partial blue fill** (live input).
- `Audio Profile` head → `Background noise suppression (recommended for most users)`
  where the parenthetical is grey. Two **radios**: `Zoom background noise removal ⓘ`
  (selected) and `Browser built-in noise suppression`.
- Divider, then three checkboxes: **checked** `Mute my microphone when join a meeting`,
  unchecked `Press and hold SPACE key to temporarily unmute yourself`,
  unchecked `Sync buttons on headset`.

**Background pane (screenshot 12)**
- Same 16:9 camera preview at top.
- `Choose Background` head with a **⊕ add button** at the far right.
- Thumbnail grid, ~4 per row, rounded ~6px:
  Row 1: **`None`** (dark tile with centered text, SELECTED — blue outline),
  **`Blur`** (blurred gradient tile with centered text), a Golden-Gate-bridge photo,
  a green-grass photo. Row 2: an earth-from-space photo.
- Below: checked `Mirror my video` checkbox.

## 9. Marketing landing (screenshot 8)

- **Top nav** on the hero (no separate white nav bar — nav sits ON the gradient):
  large white **`zoom`** wordmark left; then `Products ⌄`, `✨ AI ⌄`, `Solutions ⌄`,
  `Pricing`; right side: magnifier, globe, `Meet ⌄`, `Sign In`, `Support`, a
  **`Contact Sales`** WHITE-filled pill, a **`Sign Up Free`** BLUE-filled pill, and a
  9-dot app-grid glyph at the far right.
- **Announcement strip** below the nav: translucent dark band, centered text
  `AI note taking across platforms that's secure, personalized, and under your control.`
  + a **`Explore My Notes`** pill with a blue→magenta GRADIENT fill, and a ✕ at the far right.
- **Hero**: deep navy→indigo→periwinkle vertical gradient. H1 in white, ~60px, weight
  700, two lines, centered: `Find out what's possible` / `when work connects`.
  Subhead ~18px in light grey-blue below.
- **CTA pills**, centered, side by side: **`Explore products`** (very dark navy fill,
  white text) and **`Find your plan`** (white fill, dark text). Both rounded-full.
- **Product card rail**: 5 tall rounded cards bleeding off BOTH edges, each a dark blue
  panel with a product name + logo top-left (`Contact Center`, `workvivo`, `Meetings`,
  `My Notes`, `ZoomMate`) over a screenshot/photo.
- **Bottom-left**: a green circular cookie-consent FAB.
- **Bottom-right**: a blue circular chat FAB with a white speech-bubble glyph.

---

## Deltas vs BLUEPRINT.md worth flagging

1. **§6.0 nav arrows are NOT far-left** — they group with the search pill near center.
2. **Search pill is fully rounded**, blueprint §2.9 says `--r-md` (8px).
3. **Settings light variant has only General/Audio/Video/Chat**; the dark variant has
   General/Video/Audio/Background/Statistics/About. Blueprint §6.8's table implies one
   superset — build the nav item list as a prop.
4. **Selected nav item styling differs by theme**: solid blue fill (light) vs blue
   outline (dark). Blueprint §2.11 does say this — confirmed correct.
5. **Dark modal title is centered; light modal title is left-aligned.**
6. **Content card is inset on all four sides** with visible grey gutter, and rounded on
   all corners — blueprint §2.9 says "0 left from rail, 0 top from bar" and rounded
   TOP corners only. The screenshots disagree; follow the screenshots.
7. **Day strip footer** (`Open recordings ›`) is INSIDE the day-strip card, not a
   separate row — blueprint §6.2 item 5 implies it is separate.
8. **Marketing nav sits on the gradient**, not on a white bar as §6.1 describes.
