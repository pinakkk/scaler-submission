# Zoom Clone — Implementation Blueprint

> **Audience:** the AI agents implementing this. Every section is written to be executable without further clarification.
> **Build order:** see §10 — phases are dependency-ordered, and several can run in parallel across agents.
> **Source of truth for visuals:** the Zoom screenshots supplied alongside this blueprint. Match them closely — visual similarity to Zoom is a graded criterion.

## Visual Target: Zoom Workplace Desktop

The app is a **web recreation of the Zoom Workplace desktop client**, not the zoom.us web portal. This drives every layout decision in §2 and §6:

- A **left icon rail** (Home / Meetings / Chat / More + settings gear), *not* a wide text sidebar.
- **App chrome** across the top: nav arrows, history, a centered `Search ⌘+K` pill, an Upgrade button, and the user avatar.
- Content sits in an **inset white card** with rounded top corners, floating on a grey app frame.
- **Home is a clock**, not a profile page: large time, day/date, three round action tiles, calendar banner, day strip.
- The **marketing landing page** remains the public zoom.us-style page for signed-out visitors.

Scope note: this shell has many surfaces. §6 marks each **Core** (required by the task, must ship), **Shell** (chrome needed for the illusion, cheap to build), or **Optional** (build only if time remains). Build all Core and Shell; treat Optional as stretch.

---

## 0. Decisions Already Made (do not re-litigate)

| Decision | Choice | Rationale |
|---|---|---|
| Video | **Full WebRTC mesh P2P** | Real remote audio/video between peers. Mesh (not SFU) — capped at 6 participants. |
| Auth | **Google OAuth + guest fallback** | Hosts sign in with Google; joiners may enter as guests with a display name. Mirrors real Zoom. |
| Frontend host | Cloudflare Workers via **OpenNext** | Per requirement. |
| Backend host | **Fly.io** (container + persistent volume) | Workers cannot run FastAPI; SQLite needs a real filesystem. |
| DB | **SQLite** via SQLModel | Per requirement. Single file on a Fly volume. |
| Redis | **Optional, phase 2** | Behind a `CacheBackend` interface; in-memory dict by default. |
| Keep-alive | **Cloudflare Worker cron, every 5 min** | Prevents backend cold starts. See §12.3. |

---

## 1. System Architecture

### 1.1 Component Topology

```
                          ┌─────────────────────────────────┐
                          │        Browser (SPA)            │
                          │  Next.js 15 App Router          │
                          │  ├── React Server Components    │
                          │  ├── Zustand (meeting store)    │
                          │  └── RTCPeerConnection × N      │
                          └───┬─────────────┬───────────┬───┘
                              │ HTTPS       │ WSS       │ SRTP/DTLS
                              │ (REST)      │ (signal)  │ (media, P2P)
                              ▼             ▼           │
        ┌──────────────────────────────────────────┐    │
        │   Cloudflare Workers (OpenNext)          │    │
        │   ├── Next.js SSR + static assets        │    │
        │   ├── /api/auth/* (Auth.js, Google)      │    │
        │   └── scheduled() → cron keep-alive      │    │
        └──────────────────┬───────────────────────┘    │
                           │ proxied REST               │
                           ▼                            │
        ┌──────────────────────────────────────────┐    │
        │   FastAPI on Fly.io                      │    │
        │   ├── /api/v1/*      REST                │    │
        │   ├── /ws/meeting/*  WebSocket signaling │    │
        │   ├── RoomRegistry   in-process state    │    │
        │   └── CacheBackend   memory | redis      │    │
        └──────────────────┬───────────────────────┘    │
                           ▼                            │
        ┌──────────────────────────────────────────┐    │
        │   SQLite  (/data/zoom.db, Fly volume)    │    │
        └──────────────────────────────────────────┘    │
                                                        │
        ┌──────────────────────────────────────────┐    │
        │   STUN (Google public) + TURN (Metered)  │◄───┘
        └──────────────────────────────────────────┘
```

**Why the backend is not on Workers:** Workers run V8 isolates, not Python; there is no persistent filesystem for a SQLite file, and WebSocket signaling needs shared in-process room state. Fly.io gives a real container, a mounted volume, and sticky WebSocket connections.

### 1.2 Request Paths

There are three distinct paths. Do not conflate them.

1. **Page loads / SSR** → Cloudflare Worker renders Next.js.
2. **Data operations** → browser calls FastAPI directly at `NEXT_PUBLIC_API_BASE_URL` (CORS-allowed). Not proxied through the Worker, to avoid a double network hop.
3. **Signaling** → browser opens `wss://<api-host>/ws/meeting/{meeting_id}` directly to FastAPI.

Media never touches our servers — it is peer-to-peer, relayed via TURN only when a direct path fails.

### 1.3 Repository Layout

```
scaler-submission/
├── README.md                    # setup, stack, assumptions (graded)
├── docs/
│   ├── BLUEPRINT.md             # this file
│   └── SCHEMA.md                # ER diagram + rationale
├── web/                         # Next.js 15
│   ├── open-next.config.ts
│   ├── wrangler.toml            # includes cron trigger
│   ├── src/
│   │   ├── app/
│   │   │   ├── (marketing)/page.tsx     # public landing
│   │   │   ├── (app)/
│   │   │   │   ├── layout.tsx           # APP SHELL: rail + chrome + card
│   │   │   │   ├── home/page.tsx        # clock + action tiles + day strip
│   │   │   │   ├── meetings/page.tsx    # list + detail panes
│   │   │   │   ├── schedule/page.tsx
│   │   │   │   ├── join/page.tsx
│   │   │   │   ├── wc/[meetingId]/page.tsx   # meeting room (inside shell)
│   │   │   │   └── chat/page.tsx        # optional stub
│   │   │   ├── j/[meetingId]/page.tsx   # join interstitial (no shell, public)
│   │   │   └── api/auth/[...nextauth]/route.ts
│   │   ├── components/
│   │   │   ├── ui/              # Button, Input, Modal, Toast, Select, Checkbox…
│   │   │   ├── shell/           # AppChrome, IconRail, SearchPill, ContentCard
│   │   │   ├── layout/          # MarketingNav, MarketingFooter
│   │   │   ├── home/            # Clock, ActionTiles, CalendarBanner, DayStrip
│   │   │   ├── schedule/        # ScheduleForm + field groups
│   │   │   ├── settings/        # SettingsModal + General/Video/Audio/Background panes
│   │   │   └── meeting/         # VideoTile, ControlBar, ParticipantPanel, ChatPanel,
│   │   │                        # MoreMenu, EndMeetingPopover, HostToolsMenu
│   │   ├── lib/
│   │   │   ├── api.ts           # typed fetch client
│   │   │   ├── auth.ts          # Auth.js config
│   │   │   ├── webrtc/          # PeerManager, SignalingClient, mediaDevices
│   │   │   └── utils/           # formatMeetingId, dates, cn
│   │   ├── store/               # Zustand slices
│   │   └── styles/globals.css   # design tokens
└── api/                         # FastAPI
    ├── Dockerfile
    ├── fly.toml
    ├── pyproject.toml
    ├── app/
    │   ├── main.py
    │   ├── config.py
    │   ├── database.py
    │   ├── models/              # SQLModel tables
    │   ├── schemas/             # Pydantic request/response
    │   ├── routers/             # meetings, participants, users, health
    │   ├── services/            # business logic (no HTTP here)
    │   ├── realtime/            # ws routes, RoomRegistry, protocol
    │   ├── cache/               # CacheBackend protocol + impls
    │   └── seed.py
    └── tests/
```

**Layering rule:** `routers` handle HTTP only (parse, authorize, delegate, serialize). `services` hold all business logic and are the only layer touching `models`. This separation is explicitly graded under "Code Modularity."

---

## 2. Design System

Values below are the Zoom Workplace desktop client's. Put them in `globals.css` as CSS custom properties and mirror them in `tailwind.config.ts`. The app frame is light-grey chrome around an inset white content card; the meeting room and its menus are dark.

### 2.1 App Shell Palette

The desktop client's defining surface — a grey frame with a floating white card. Getting these three greys right is most of the resemblance.

| Token | Hex | Usage |
|---|---|---|
| `--zm-app-chrome` | `#E4E7EA` | App frame: top bar and left rail background. |
| `--zm-app-card` | `#FFFFFF` | Inset content card. |
| `--zm-app-titlebar` | `#000000` | 22px OS title strip above the chrome. |
| `--zm-rail-active` | `#FFFFFF` | Active rail item fill (white pill on grey). |
| `--zm-rail-hover` | `rgba(0,0,0,0.05)` | Rail item hover. |
| `--zm-search-bg` | `#D3D8DD` | Search pill fill, slightly darker than the chrome. |
| `--zm-search-text` | `#5B6470` | Search placeholder. |

### 2.2 Brand / Primary

| Token | Hex | Usage |
|---|---|---|
| `--zm-blue-600` | `#0B5CFF` | Primary buttons, links, active states, Join/Schedule tiles. |
| `--zm-blue-700` | `#0A4FD6` | Primary hover. |
| `--zm-blue-800` | `#0842B0` | Primary active/pressed. |
| `--zm-blue-500` | `#2D7CFF` | Focus rings, selected-item outlines. |
| `--zm-blue-100` | `#E5EFFF` | Info banner fill, selected list row. |
| `--zm-blue-50` | `#F0F5FF` | Subtle row hover. |
| `--zm-orange-500` | `#F5721F` | **New meeting** tile. The one warm accent in the product. |
| `--zm-orange-600` | `#DC630F` | New meeting hover. |

### 2.3 Marketing Hero Gradient

Public landing page only.

| Token | Hex | Position |
|---|---|---|
| `--zm-hero-from` | `#0A1A5C` | 0% |
| `--zm-hero-via` | `#1B3FBF` | 55% |
| `--zm-hero-to` | `#4B6CE8` | 100% |

`linear-gradient(180deg, var(--zm-hero-from) 0%, var(--zm-hero-via) 55%, var(--zm-hero-to) 100%)`

### 2.4 Neutrals & Semantic

| Token | Hex | Usage |
|---|---|---|
| `--zm-ink-900` | `#131619` | Primary text, clock digits. |
| `--zm-ink-700` | `#232333` | Headings. |
| `--zm-ink-500` | `#5B5B66` | Secondary text, rail labels, date line. |
| `--zm-ink-400` | `#747487` | Placeholders, muted meta, empty-state text. |
| `--zm-line-200` | `#E6E6E6` | Borders, dividers, input outlines. |
| `--zm-surface-100` | `#F7F9FA` | Subtle fills inside the card. |
| `--zm-warn-bg` | `#FFF8E6` | Plan-limit warnings. |
| `--zm-warn-border` | `#F5D57F` | Warning border. |
| `--zm-warn-icon` | `#B7791F` | Warning glyph. |
| `--zm-success` | `#22B573` | Encryption shield, connected state, presence dot. |
| `--zm-danger` | `#E02D2D` | End button, mute slash, destructive actions. |
| `--zm-danger-strong` | `#D93025` | "End Meeting for All" fill. |

### 2.5 Meeting Room & Dark Menus

| Token | Hex | Usage |
|---|---|---|
| `--zm-room-bg` | `#1A1A1A` | Room canvas. |
| `--zm-room-topbar` | `#000000` | Room title bar. |
| `--zm-room-bar` | `#141414` | Bottom control bar. |
| `--zm-room-tile` | `#1F1F23` | Tile background before stream paints. |
| `--zm-room-toast` | `rgba(28,28,30,0.92)` | Centered toast pills. |
| `--zm-room-text` | `#F5F5F7` | Control labels. |
| `--zm-room-active` | `#22B573` | Active Share button. |
| `--zm-menu-bg` | `#232323` | More / Host tools / End popovers. |
| `--zm-menu-border` | `#3A3A3A` | Popover border. |
| `--zm-menu-hover` | `rgba(255,255,255,0.08)` | Popover item hover. |
| `--zm-menu-selected` | `#2D7CFF` | Selected item outline in dark menus. |

### 2.6 Settings Modal (dark variant)

The in-meeting Settings modal is dark with a light-on-dark nav; the pre-meeting one is light. Build one component, two themes.

| Token | Hex | Usage |
|---|---|---|
| `--zm-modal-dark-bg` | `#242424` | Modal body. |
| `--zm-modal-dark-nav` | `#1C1C1C` | Left nav column. |
| `--zm-modal-dark-border` | `#3A3A3A` | Divider between nav and content. |
| `--zm-modal-light-bg` | `#FFFFFF` | Light modal body. |
| `--zm-modal-light-nav` | `#FFFFFF` | Light nav column. |

**Settings nav icon colors** — each pane has a distinct rounded-square icon:

| Pane | Icon color |
|---|---|
| General | `#8E8E93` grey |
| Video | `#8ED08E` green |
| Audio | `#7ED8C3` teal |
| Background | `#7CD4E8` cyan |
| Statistics | `#C4A5E8` purple |
| Chat | `#6BC96B` green |
| About | `#5B9BD5` blue |

**Theme swatches** in Settings → General (decorative, selectable):

| Name | Hex |
|---|---|
| Classic | split `#1A1A1A` / `#FFFFFF` |
| Bloom | `#2D5FF7` |
| Agave | `#4A7C6F` |
| Rose | `#B5677A` |

### 2.7 Typography

Zoom ships a custom face; **Inter** is the closest free substitute. Load via `next/font/google` with `display: swap`.

| Role | Size / line height | Weight | Applied to |
|---|---|---|---|
| Clock | `56px / 1.0`, tracking `-0.02em` | 600 | Home screen time |
| Clock date | `17px / 1.4` | 400 | "Thursday, August 13" |
| Hero | `60px / 1.08`, `-0.02em` | 700 | Marketing H1 |
| Page title | `24px / 1.3` | 600 | "Join Meeting", "Schedule Meeting" |
| Modal title | `20px / 1.3` | 600 | "Settings" |
| Section head | `15px / 1.4` | 600 | "Theme", "Speaker", "Reactions" |
| Body | `14px / 1.5` | 400 | Default UI text |
| Label | `14px / 1.4` | 500 | Form labels, checkbox labels |
| Rail label | `11px / 1.2` | 400 | Home / Meetings / Chat / More |
| Tile label | `15px / 1.3` | 500 | New meeting / Join / Schedule |
| Meta | `13px / 1.4` | 400 | Helper text, timestamps |
| Control bar | `12px / 1` | 400 | In-meeting button labels |

### 2.8 Spacing, Radius, Elevation

- **Grid:** 4px base — `4 8 12 16 20 24 32 40 48 64`.
- **Radius:** `--r-sm 4px` inputs · `--r-md 8px` cards, banners, popovers · `--r-lg 12px` modals, content card top · `--r-xl 16px` settings nav items · `--r-full` pills, avatars, action tiles.
- **Shadows:** `--shadow-card 0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)` · `--shadow-modal 0 8px 32px rgba(0,0,0,.16)` · `--shadow-popover 0 4px 16px rgba(0,0,0,.12)` · `--shadow-menu-dark 0 8px 24px rgba(0,0,0,.5)`.

### 2.9 Shell Layout Metrics

The numbers that make it read as the desktop app.

| Element | Value |
|---|---|
| OS title strip | 22px, black |
| App top bar | 68px, `--zm-app-chrome` |
| Left icon rail width | 113px, `--zm-app-chrome` |
| Rail item | 72px tall, icon 22px + 11px label, 8px gap |
| Rail active pill | white fill, `--r-lg`, 8px horizontal inset |
| Settings gear (rail bottom) | 24px, 32px from bottom |
| Content card | fills remaining space, `--r-lg` top corners, white |
| Content card inset | 0 left from rail, 0 top from bar |
| Search pill | 588px wide, 36px tall, `--r-md` |
| Nav arrows / history | 20px glyphs, 32px tap targets, 6px apart |
| Upgrade button | 36px tall, 20px horizontal, `--r-md`, blue |
| Avatar | 36px, `--r-full`, 8px green presence dot bottom-right |

### 2.10 Home Screen Metrics

| Element | Value |
|---|---|
| Clock block | centered, 72px from card top |
| Action tile icon | 76px square, `--r-lg` (20px radius), 44px glyph |
| Action tile gap | 56px between tiles |
| Tile label | 16px below icon |
| New meeting chevron | 14px, 6px right of label |
| Calendar banner | max 810px, 1px `--zm-blue-500` border, `--r-md`, 20px padding |
| Day strip card | max 810px, 1px `--zm-line-200`, `--r-md` |
| Day strip header | 56px tall, centered date + chevron |
| Empty state illustration | 120px, centered, 160px vertical padding |

### 2.11 Component Specs

**Buttons** — `primary` blue fill · `secondary` white fill + `--zm-line-200` border · `ghost` transparent, blue text · `danger` `--zm-danger-strong` fill · `pill` full radius (marketing). Sizes `sm 32 / md 40 / lg 48`.

**Action tile** (Home) — round-rect icon over a label. New meeting `--zm-orange-500` with a slashed-camera glyph and a chevron for its dropdown; Join `--zm-blue-600` with a plus; Schedule `--zm-blue-600` with a calendar showing "19". Hover lifts 1px and deepens the fill.

**Info banner** — `--zm-blue-500` 1px border on white, ⓘ glyph in blue, inline blue action link. Warning variant swaps to the amber tokens.

**Settings modal** — 1030×810 max, centered, `--r-lg`. Left nav 285px with 16px-radius items, colored icon squares, selected item in `--zm-blue-600` fill (light) or a blue outline (dark). Content pane 32px padding. Close ✕ top-right.

**Dark popover** (More / Host tools) — `--zm-menu-bg`, 1px `--zm-menu-border`, `--r-md`, `--shadow-menu-dark`. Grid of icon-over-label items, 88px wide each. Selected item gets a 2px `--zm-menu-selected` outline. A divider then a "Reset to default · Reset" footer row.

**End Meeting popover** — anchored bottom-right above the End button. `--zm-danger-strong` "End Meeting for All" full-width, then a neutral dark "Leave Meeting". A "Give feedback" checkbox and "Cancel" sit outside on the bar. **Only the host sees "End for All"**; non-hosts get "Leave Meeting" alone.

**Control bar button** — vertical icon-over-label. Idle `--zm-room-text`; hover `--zm-menu-hover` at `--r-md`; muted shows a red slashed glyph; Share is `--zm-room-active`; End is `--zm-danger` with a red circular icon. Chevrons (˄) beside Unmute/Video/Participants/Chat/Share open device or option menus.

**Toast pills** — centered top, stacked 8px, `--zm-room-toast`, `--r-md`, 12px/20px padding, white 14px, auto-dismiss 4s.

**Name badge** — bottom-left of each tile, `rgba(0,0,0,0.6)`, `--r-sm`, 6px/10px padding, 13px white, with a red mute glyph when muted.

---

## 3. Data Model

### 3.1 ER Diagram

```
┌────────────────────┐
│ users              │
├────────────────────┤
│ id            PK   │
│ google_id     UQ ∅ │
│ email         UQ   │
│ name               │
│ avatar_url    ∅    │
│ personal_meeting_id UQ │
│ plan               │  "basic" | "pro"
│ is_guest      bool │
│ created_at         │
└─────┬──────────────┘
      │ 1
      │        host_id
      │ N
┌─────▼──────────────────────┐
│ meetings                   │
├────────────────────────────┤
│ id                  PK     │
│ meeting_number      UQ     │  11-digit, displayed 895 9025 0750
│ host_id             FK     │
│ topic                      │
│ description          ∅     │
│ scheduled_start      ∅     │  null ⇒ instant meeting
│ duration_minutes           │
│ timezone                   │
│ passcode                   │
│ invite_token        UQ     │  the ?pwd= value
│ status                     │  scheduled|live|ended|cancelled
│ use_pmi             bool   │
│ waiting_room        bool   │
│ host_video_on       bool   │
│ participant_video_on bool  │
│ allow_transcription bool   │
│ chat_before_after   bool   │
│ encryption                 │  enhanced|e2ee
│ started_at           ∅     │
│ ended_at             ∅     │
│ created_at                 │
└────┬───────────────────┬───┘
     │ 1               1│
     │ N               N│
┌────▼──────────────┐ ┌─▼──────────────────┐
│ participants      │ │ chat_messages      │
├───────────────────┤ ├────────────────────┤
│ id           PK   │ │ id            PK   │
│ meeting_id   FK   │ │ meeting_id    FK   │
│ user_id   FK ∅    │ │ participant_id FK  │
│ display_name      │ │ body               │
│ role              │ │ sent_at            │
│ session_id   UQ   │ └────────────────────┘
│ connection_id ∅   │
│ is_muted     bool │
│ is_video_on  bool │
│ is_hand_raised    │
│ joined_at         │
│ left_at      ∅    │
└───────────────────┘

┌──────────────────────────┐   ┌────────────────────────────┐
│ meeting_invitees         │   │ user_preferences           │
├──────────────────────────┤   ├────────────────────────────┤
│ id            PK         │   │ user_id       PK FK        │
│ meeting_id    FK         │   │ theme                      │ classic|bloom|agave|rose
│ email                    │   │ mute_on_join       bool    │
│ invited_at               │   │ video_off_on_join  bool    │
└──────────────────────────┘   │ gallery_size       int     │ 9 | 25
                               │ mirror_video       bool    │
                               │ always_show_controls bool  │
                               │ audio_input_id      ∅      │
                               │ audio_output_id     ∅      │
                               │ video_input_id      ∅      │
                               │ updated_at                 │
                               └────────────────────────────┘
```

`PK` primary key · `UQ` unique · `FK` foreign key · `∅` nullable

### 3.2 Table Notes

**`users`** — Google OAuth users have `google_id` and `is_guest=false`. Guests get a row with `is_guest=true`, a synthetic email, and no `google_id`, so `participants.user_id` is always populated and analytics stay uniform. `personal_meeting_id` is an 11-digit number generated at signup.

**`meetings`** — `scheduled_start IS NULL` distinguishes an instant meeting from a scheduled one; this is the single discriminator, so no `type` column is needed. `invite_token` is the URL-safe token in `?pwd=`; `passcode` is the short human-typed code. They are deliberately different values with different threat models. `status` transitions are enforced in the service layer (§5.4), never by the client.

**`user_preferences`** — One row per user, created lazily on first save, with sensible defaults if absent. Backs the Settings modal (§6.8). Only preferences that change real behavior live here — `mute_on_join` and `video_off_on_join` are read by the join flow and applied to the initial `getUserMedia` track state; device IDs are passed as `deviceId` constraints. Purely cosmetic toggles stay in `localStorage` rather than bloating the table.

**`participants`** — One row per join attempt, not per user; rejoining creates a new row so the history is auditable. `session_id` is a UUID minted by the server on join and held by the client; it authorizes subsequent WS frames. `connection_id` maps to the live WebSocket and is nulled on disconnect. `left_at IS NULL` means currently present — that predicate drives every participant count.

**Indexes** (create explicitly; SQLite will not infer these):
```sql
CREATE UNIQUE INDEX ix_meetings_number      ON meetings(meeting_number);
CREATE UNIQUE INDEX ix_meetings_invite      ON meetings(invite_token);
CREATE INDEX        ix_meetings_host_start  ON meetings(host_id, scheduled_start);
CREATE INDEX        ix_meetings_host_status ON meetings(host_id, status);
CREATE INDEX        ix_participants_active  ON participants(meeting_id, left_at);
CREATE INDEX        ix_chat_meeting_time    ON chat_messages(meeting_id, sent_at);
```
The dashboard's two queries — upcoming (`host_id` + `scheduled_start > now`) and recent (`host_id` + `status='ended'`) — are both covered by the composite indexes above.

**SQLite pragmas** — set on every connection in `database.py`:
```python
PRAGMA journal_mode=WAL;      # concurrent readers during writes
PRAGMA foreign_keys=ON;       # OFF by default in SQLite — must enable
PRAGMA busy_timeout=5000;     # ride out brief write locks
PRAGMA synchronous=NORMAL;    # safe with WAL, much faster
```

### 3.3 Meeting Number Generation

11 digits, displayed as `### #### ####`. Generate with `secrets.randbelow`, reject anything starting with 0, retry on unique-constraint collision (max 5 attempts). Never use a sequential counter — it leaks volume and is trivially enumerable.

### 3.4 Seed Data

`api/app/seed.py`, idempotent (safe to re-run):
- 1 primary user: **Pinak Kundu**, `plan="basic"`, PMI `383 555 3861` — matches the screenshots.
- 3 secondary users for participant lists.
- 2 upcoming scheduled meetings (one today +3h, one tomorrow) — populates "Upcoming Meetings".
- 3 ended meetings with participants and chat history — populates "Recent activity".
- 1 live meeting for immediate join testing.

---

## 4. REST API

Base: `/api/v1`. All responses JSON. Errors use RFC-7807-ish shape:
```json
{ "error": { "code": "MEETING_NOT_FOUND", "message": "No meeting with that ID.", "details": {} } }
```

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `GET` | `/health` | Liveness. Returns `{status, db, uptime_s}`. Cron target. | none |
| `GET` | `/users/me` | Current user + plan + PMI | session |
| `PATCH` | `/users/me` | Update display name / avatar | session |
| `GET` | `/users/me/preferences` | Settings values; defaults when no row exists | session |
| `PUT` | `/users/me/preferences` | Upsert preferences from the Settings modal | session |
| `POST` | `/auth/google` | Exchange Google ID token → session | none |
| `POST` | `/auth/guest` | Create guest identity `{display_name}` | none |
| `GET` | `/meetings` | List. `?filter=upcoming\|recent\|all&limit&cursor` | session |
| `POST` | `/meetings` | Create (instant if no `scheduled_start`) | session |
| `GET` | `/meetings/{number}` | Detail by meeting number | session/guest |
| `PATCH` | `/meetings/{number}` | Edit scheduled meeting | host |
| `DELETE` | `/meetings/{number}` | Cancel | host |
| `POST` | `/meetings/{number}/start` | `scheduled\|ended` → `live` | host |
| `POST` | `/meetings/{number}/end` | `live` → `ended`, evict all | host |
| `GET` | `/meetings/{number}/lookup` | **Pre-join probe.** Existence + topic + passcode-required, *no* private fields | none |
| `POST` | `/meetings/{number}/join` | Validate passcode, create participant, return `session_id` + ICE servers | none |
| `GET` | `/meetings/{number}/participants` | Active participants | participant |
| `PATCH` | `/participants/{id}` | Mute/unmute, video toggle | self or host |
| `DELETE` | `/participants/{id}` | Remove from meeting | host |
| `GET` | `/meetings/{number}/messages` | Chat history | participant |

**`/lookup` is deliberately separate from `/join`.** The join page must confirm a meeting exists and render its topic *before* asking for a passcode, without leaking the invite token or participant roster to an unauthenticated caller.

**Rate limits** (slowapi, in-memory): `/join` and `/lookup` 10/min per IP — these are the enumeration-exposed endpoints. `/meetings` POST 30/min.

---

## 5. WebRTC & Signaling

This is the highest-risk subsystem. Specified in full.

### 5.1 Topology

**Full mesh.** Each participant holds an `RTCPeerConnection` to every other participant: N participants ⇒ N(N−1)/2 connections, each client uploading N−1 streams. Upstream bandwidth is the binding constraint, so **cap the room at 6** (`MAX_MESH_PARTICIPANTS = 6`) and return `MEETING_FULL` beyond that. Do not silently degrade.

### 5.2 Signaling Protocol

Transport: WebSocket at `/ws/meeting/{meeting_number}?session_id=<uuid>`. The server validates `session_id` against an active `participants` row before accepting; on failure, close with code `4401`.

Every frame: `{ "type": string, "from": participant_id, "to": participant_id | null, "payload": object, "ts": epoch_ms }`. `to: null` means broadcast to the room.

**Server → client**

| Type | Payload | Meaning |
|---|---|---|
| `room.state` | `{participants[], you, meeting}` | First frame after connect. Full snapshot. |
| `peer.joined` | `{participant}` | Someone joined. Existing peers initiate offers. |
| `peer.left` | `{participant_id}` | Close and discard that peer connection. |
| `peer.updated` | `{participant_id, is_muted, is_video_on, is_hand_raised}` | State change. |
| `signal.offer` | `{sdp}` | Relayed SDP offer. |
| `signal.answer` | `{sdp}` | Relayed SDP answer. |
| `signal.ice` | `{candidate}` | Relayed ICE candidate. |
| `chat.message` | `{id, participant_id, display_name, body, sent_at}` | New chat message. |
| `host.muted_you` | `{by}` | Host muted this client — client must actually mute. |
| `host.removed_you` | `{by}` | Client tears down and redirects out. |
| `meeting.ended` | `{by}` | Host ended for all. |
| `error` | `{code, message}` | Protocol or auth error. |

**Client → server**

| Type | Payload |
|---|---|
| `signal.offer` / `signal.answer` / `signal.ice` | `{to, sdp \| candidate}` — server relays verbatim to `to`, after confirming both are in the same room |
| `state.update` | `{is_muted, is_video_on, is_hand_raised}` |
| `chat.send` | `{body}` (≤2000 chars, server-trimmed) |
| `host.mute` / `host.mute_all` / `host.remove` | `{participant_id?}` — server verifies `role == "host"` and rejects otherwise |
| `ping` | `{}` — heartbeat |

**The server never trusts a client-declared role.** Every `host.*` frame is authorized against the DB row for that `session_id`.

### 5.3 Connection Lifecycle — the "polite peer" rule

Glare (both peers offering at once) is the classic mesh failure. Resolve it deterministically:

> **The peer already in the room when a new peer joins is the initiator.** The joiner never sends the first offer.

Concretely, on `peer.joined`, every existing peer creates an offer for the newcomer. The newcomer only answers. Because `peer.joined` reaches all existing peers but the newcomer receives `room.state` (not `peer.joined`) for itself, roles are unambiguous with no negotiation needed.

```
Existing peer A                Server               New peer B
      │                          │                       │
      │                          │◄── WS connect + auth ──┤
      │                          ├─── room.state ────────►│  (B learns A exists)
      │◄──── peer.joined(B) ─────┤                       │
      │                          │                       │
  createOffer()                  │                       │
      ├──── signal.offer ───────►├──── signal.offer ────►│
      │                          │                  setRemote
      │                          │                  createAnswer()
      │◄─── signal.answer ───────┤◄─── signal.answer ────┤
  setRemote                      │                       │
      │                          │                       │
      ├──── signal.ice ─────────►├──── signal.ice ──────►│   (trickle, both ways)
      │◄──── signal.ice ─────────┤◄──── signal.ice ──────┤
      │                          │                       │
      │═══════════ SRTP media, direct P2P ═══════════════│
```

### 5.4 Meeting State Machine

```
      POST /meetings (scheduled_start set)
                 │
                 ▼
          ┌─────────────┐  DELETE ┌───────────┐
          │  scheduled  ├────────►│ cancelled │
          └──────┬──────┘         └───────────┘
                 │ POST /start  (or host joins)
                 ▼
   POST /meetings ┌────────┐
   (instant) ────►│  live  │◄──── host rejoins (ended → live)
                  └───┬────┘
                      │ POST /end  ·or·  last participant leaves + 60s grace
                      ▼
                  ┌────────┐
                  │ ended  │
                  └────────┘
```

Enforced in `services/meeting_service.py` via an explicit transition table. Illegal transitions raise `InvalidStateTransition` → HTTP 409.

### 5.5 ICE Configuration

`POST /join` returns `ice_servers` so credentials are never baked into the bundle:

```json
{
  "ice_servers": [
    { "urls": "stun:stun.l.google.com:19302" },
    { "urls": "stun:stun1.l.google.com:19302" },
    { "urls": "turn:<host>:3478", "username": "<ephemeral>", "credential": "<ephemeral>" }
  ]
}
```

STUN alone fails behind symmetric NAT and most corporate networks. **Provision a TURN server** (Metered.ca free tier, or Cloudflare Calls TURN) before demoing on anything but a single LAN. Without TURN, roughly 15–20% of real-world peer pairs will never connect — and it will look like a bug in your code.

### 5.6 Client Module Contracts

`lib/webrtc/PeerManager.ts` — owns the `Map<participantId, RTCPeerConnection>`. Public surface:
```ts
init(localStream: MediaStream, iceServers: RTCIceServer[]): void
addPeer(id: string, initiator: boolean): Promise<void>
handleSignal(from: string, type: 'offer'|'answer'|'ice', payload: unknown): Promise<void>
removePeer(id: string): void
replaceLocalTrack(kind: 'audio'|'video', track: MediaStreamTrack | null): Promise<void>
destroy(): void
onRemoteStream: (id: string, stream: MediaStream) => void
onConnectionStateChange: (id: string, state: RTCPeerConnectionState) => void
```

`lib/webrtc/SignalingClient.ts` — WebSocket with exponential-backoff reconnect (1s→2s→4s→8s, cap 30s), heartbeat ping every 25s, and an outbound queue that buffers frames while disconnected.

**Critical:** on reconnect, re-request `room.state` and reconcile — do not assume peer connections survived. Toggling mute must use `track.enabled`, never `removeTrack`, which forces costly renegotiation.

---

## 6. Screens

Every route below is tagged **Core** (task-required, must ship), **Shell** (chrome that sells the desktop illusion, cheap), or **Optional** (only if time remains). Build all Core and Shell.

### 6.0 App Shell — wraps every authenticated route · **Shell**

One layout at `app/(app)/layout.tsx`. Everything else renders inside its content card.

```
┌────────────────────────────────────────────────────────────────┐
│ ██ black OS strip, 22px                                        │
├──────┬─────────────────────────────────────────────────────────┤
│      │  ‹ › ⟲    ┌──────── Search ⌘+K ────────┐   [Upgrade] 👤 │  68px
│ ⌂    ├─────────────────────────────────────────────────────────┤
│ Home │                                                         │
│      │                                                         │
│ ▭◃   │              inset white content card                   │
│Meet- │              rounded top corners                        │
│ings  │                                                         │
│      │              ← every route renders here                 │
│ 💬   │                                                         │
│ Chat │                                                         │
│      │                                                         │
│ ⋯    │                                                         │
│ More │                                                         │
│      │                                                         │
│ ⚙    │                                                         │
└──────┴─────────────────────────────────────────────────────────┘
 113px
```

**Left rail** — Home, Meetings, Chat, More, each a 22px glyph over an 11px label. The active item gets a white rounded pill. The settings gear pins to the bottom. Route mapping: Home → `/home`, Meetings → `/meetings`, Chat → `/chat` (Optional; stub with an empty state), More → opens the **More flyout**.

**More flyout** — a white panel anchored right of the rail, `--r-lg`, `--shadow-popover`. A 3-column grid of icon-over-label items: Scheduler, Hub (with a blue `NEW` pill), Canvas, Paper, Sheets, Slides, Whiteboards, Clips, Tasks, Notes, Contacts. Footer: "Drag to pin or remove from toolbar" with a blue "Reset" link. **All items are decorative** — they render the panel and do nothing on click. Do not build these products.

**Top bar** — back/forward chevrons (wired to `router.back()` / `router.forward()`, disabled-grey when unavailable), a history clock glyph (Optional), the centered search pill (Shell — renders and focuses on `⌘K`, no search backend), the Upgrade button (decorative), and the avatar with a green presence dot opening a small menu (Profile, Settings, Sign out).

### 6.1 Marketing Landing — `/` · **Shell**

Public page for signed-out visitors; signed-in users redirect to `/home`. Black utility bar; white nav with the Zoom wordmark, Products / AI / Solutions / Pricing, search, globe, Meet, Sign In, Support, a "Contact Sales" outline pill and a blue "Sign Up Free" pill; a dismissible gradient announcement strip; the navy→indigo hero with a 60px H1, subhead, and dark/white CTA pills; a horizontally scrolling product-card rail bleeding off both edges; a chat FAB bottom-right.

Only **Sign In** and **Sign Up Free** are wired — both start Google OAuth. Everything else is presentational.

### 6.2 Home — `/home` · **Core**

The clock screen. Centered column inside the content card.

1. **Clock** — 56px time, live-updating on a 1s interval, formatted `h:mm AM/PM`. Below it the date at 17px in `--zm-ink-500`, `EEEE, MMMM d`. Render the initial value server-side from a stable timestamp and correct on mount, so hydration doesn't mismatch.
2. **Action tiles** — three round-rect icons with labels, 56px apart:
   - **New meeting** (orange, slashed camera) → `POST /meetings` with no `scheduled_start`, then redirect to `/wc/{number}`. Its chevron opens a menu: "Start with video off" (checkbox) and "Use My Personal Meeting ID".
   - **Join** (blue, plus) → `/join`.
   - **Schedule** (blue, calendar "19") → `/schedule`.
3. **Calendar banner** — "You haven't connected your calendar yet. **Connect now** to manage all your meetings and events in one place." Blue-bordered, ⓘ glyph. The link is decorative; the banner is dismissible and its state persists in `localStorage`.
4. **Day strip** — a bordered card: header with "Today, Aug 13 ⌄" centered and an open-in-new glyph right; a toolbar with a "Today" pill, ‹ › day arrows, and a ⋯ menu; then the day's meetings, or the empty state — a parasol illustration over "No meetings scheduled." at 160px vertical padding.
5. **Footer row** — "Open recordings ›" (Optional; links to an empty `/recordings`).

The day strip queries `GET /meetings?filter=day&date=YYYY-MM-DD`; the arrows shift the date and refetch. **This is where the task's "Upcoming meetings" requirement lands** — meetings scheduled for the selected day render here as rows with time, topic, and a Join button.

### 6.3 Meetings — `/meetings` · **Core**

Two-pane inside the content card. Left: a list with **Upcoming** / **Previous** / **Personal Room** tabs, each row showing time, topic, and meeting number. Right: the detail pane for the selected meeting — topic, time, Meeting ID, passcode with a Show toggle, invite link with a copy button, and a "Add to calendar" row (Google / Outlook .ics / Yahoo, Optional). Action row: **Start** (primary), **Copy Invitation**, **Edit**, **Delete**.

This satisfies the task's "Recent meetings section" via the Previous tab.

Copy Invitation writes to the clipboard:
```
Pinak Kundu is inviting you to a scheduled Zoom meeting.

Topic: My Meeting
Time: Aug 14, 2026 01:00 PM Pacific Time (US and Canada)

Join Zoom Meeting
https://<host>/j/89590250750?pwd=<token>

Meeting ID: 895 9025 0750
Passcode: H8m00e
```

### 6.4 Join — `/join` · **Core**

Centered in the content card: "Join Meeting" at 24px/600, then a combobox — a text input with a chevron opening recently-used meeting IDs from `localStorage`. Placeholder "Meeting ID or Personal Link Name". Below, right-aligned: **Cancel** (secondary, → `/home`) and **Join** (primary, disabled until non-empty).

On submit: strip spaces, `GET /meetings/{number}/lookup`. Not found → inline error "Invalid meeting ID". Found and passcode-required → reveal a passcode field. Otherwise → `/wc/{number}`.

**Loading state:** while joining, the card shows a centered blue spinner — a distinct state, not a disabled button.

### 6.5 Join Interstitial — `/j/[meetingId]` · **Core**

Where invite links land. Works signed-out. Calls `/lookup` on mount and shows the meeting topic. If the visitor is signed in, prefill their name; otherwise show a **display-name input** (required, 1–50 chars) — this is the task's "enter display name before joining."

Buttons: **Join from browser** (primary — our real path) and **Join from Zoom Workplace app** (secondary; attempts the deep link, then after ~1.2s shows a "Did not open Zoom Workplace app?" popover). A passcode field appears when `lookup` reports `passcode_required` and no valid `?pwd=` token is present.

Error states get their own centered cards: meeting not found, meeting ended, meeting full.

### 6.6 Schedule — `/schedule` · **Core**

Two-column label/field form inside the content card (label column 200px, required marked with a red asterisk).

**Core fields — must ship:** Topic (default "My Meeting", required, ≤200 chars) · "+ Add Description" disclosure → textarea · When (date input + time select + AM/PM) · Duration (hr + min selects) · Time Zone select · Meeting ID radio (Generate Automatically / Personal Meeting ID) · Security: Passcode checkbox (checked, disabled) with its generated value, and a Waiting Room checkbox · Video: Host on/off and Participant on/off radios · **Save** (primary) and **Cancel**.

**Shell fields — render, persist, no deep behavior:** Recurring meeting checkbox (Optional if time is short) · Invitees input with the "calendar not connected" warning · Encryption radios (Enhanced / End-to-end) · Meeting chat checkbox.

**Optional — skip freely:** Template select, Whiteboard, Docs, My Notes transcription block, the "Options / Show" disclosure.

Validation: topic required; start must be in the future; duration 15–1440. On a basic plan, duration over 40 min clamps to 40 and shows the amber plan-limit banner — a nice touch of fidelity that costs almost nothing.

On save: `POST /meetings` → redirect to `/meetings` with the new meeting selected.

### 6.7 Meeting Room — `/wc/[meetingId]` · **Core**

Renders **inside the app shell** — the rail and top bar stay visible; the room is a black card in the content area. This is what makes it read as the desktop client rather than a web page.

**Pre-join gate.** Black canvas with a "You are host now." toast and a centered white modal: "Do you want people to see you in the meeting?", **Use microphone and camera** (primary) and "Continue without microphone and camera" (ghost). The first calls `getUserMedia({audio, video})`; the second joins with no local tracks. Handle `NotAllowedError` and `NotFoundError` explicitly with a retry affordance — a denied camera must never crash the room.

**Joining state.** Full-bleed black with a centered blue spinner and "Joining Meeting…" while the WebSocket connects and the first peers negotiate.

**Room chrome.** Top bar: ⓘ glyph + meeting title ("Pinak Kundu's Zoom Meeting"); right side a green encryption shield, a layout-switcher glyph, and a `zm` avatar chip.

**Video grid.** 1 → single centered tile · 2 → side by side · 3–4 → 2×2 · 5–6 → 3×2. Tiles hold 16:9. A participant with video off shows their avatar centered on `--zm-room-tile`. The active speaker (loudest by `AudioContext` RMS over a 250ms window) gets a 2px `--zm-blue-500` ring. Name badge bottom-left with a mute indicator.

**Control bar** (72px, `--zm-room-bar`):

| Control | Behavior | Tag |
|---|---|---|
| **Unmute / Mute** + ˄ | Toggles `track.enabled`, broadcasts `state.update`. Chevron opens mic/speaker picker. | Core |
| **Video** + ˄ | Toggles video track. Chevron opens camera picker. | Core |
| **Participants** + count | Opens the participants drawer. | Core |
| **Chat** + ˄ | Opens the chat drawer. | Shell |
| **React** | Emoji reaction that floats over the tile. | Optional |
| **Share** (green) + ˄ | `getDisplayMedia` → `replaceLocalTrack`. | Optional |
| **Host tools** | Host-only menu: Mute All, Lock Meeting, End for All. | Core |
| **Settings** | Opens the Settings modal (dark variant). | Shell |
| **More** | Dark popover: Breakout Rooms, Whiteboards, Settings, Stop Incoming Video, plus a "Reset to default · Reset" footer. Only **Settings** and **Stop Incoming Video** work; the rest are decorative. | Shell |
| **End** (red) | Opens the End popover. | Core |

**End popover.** Anchored above the End button. Host sees red **End Meeting for All** over a neutral **Leave Meeting**; non-hosts see only Leave Meeting. Outside the popover on the bar: a "Give feedback" checkbox (decorative) and **Cancel**. End for All → `POST /meetings/{n}/end` → server broadcasts `meeting.ended` → every client tears down and returns to `/home`.

**Participants drawer** — 320px on the right, pushing the grid rather than overlaying. Rows show avatar, name, "(Host)" / "(You)" suffixes, and mute/video glyphs. Hosts get a ⋯ menu per row with **Mute** and **Remove**. A "Mute All" button pins to the drawer footer. **This is the task's host-controls bonus — build it.**

**Chat drawer** — same geometry. Message list with sender, body, and time; a composer at the bottom sending `chat.send`. Messages persist to `chat_messages` so history survives a refresh.

### 6.8 Settings Modal · **Shell**

One component, two themes: **light** outside a meeting, **dark** inside one. Left nav of 285px with colored icon squares; content pane on the right. Panes differ slightly by context — in-meeting adds Background and Statistics.

| Pane | Contents | Tag |
|---|---|---|
| **General** | Theme swatches (Classic / Bloom / Agave / Rose), "Always show meeting controls", gallery-size radios (9 / 25), chat profile-icon checkbox, reaction skin-tone picker, "Animate emojis". | Shell |
| **Video** | Live camera preview, camera select, "Mirror my video", "Hide Non-video Participants", "Hide Self View", hardware-acceleration checkboxes, rendering-method select. | Shell |
| **Audio** | Speaker select + "Test Speaker" + output level meter; mic select + "Test Mic" + **live input level meter driven by `AudioContext`**; noise-suppression radios; "Mute my microphone when joining". | Shell |
| **Background** | "None / Blur" plus a few preset images. Blur via CSS filter on the local preview only. | Optional |
| **Statistics** | Per-peer `RTCPeerConnection.getStats()` — bitrate, packet loss, RTT. | Optional |
| **About** | Version string, links. | Optional |

**Persist real preferences** — mute-on-join, default video state, gallery size, theme, and selected device IDs go to `user_preferences` (§3) and are applied on the next join. Decorative toggles may live in `localStorage`. Wiring mute-on-join and default-video-off end to end is worth the small effort: it demonstrates preferences actually flowing through the join path.

### 6.9 Optional Stubs

Build only after everything above is done. Each is a route with the shell and a centered empty state: `/chat`, `/recordings`, `/scheduler`, `/whiteboards`. They exist so rail and flyout clicks don't 404.

---

## 7. Frontend Architecture

### 7.1 State

- **Server state:** TanStack Query for all REST reads. `staleTime: 30s`; invalidate `['meetings']` after any mutation.
- **Meeting room state:** a single Zustand store, since it changes many times per second and must not re-render the tree.

```ts
interface MeetingStore {
  meeting: Meeting | null
  self: Participant | null
  participants: Map<string, Participant>
  remoteStreams: Map<string, MediaStream>
  localStream: MediaStream | null
  connectionStates: Map<string, RTCPeerConnectionState>
  messages: ChatMessage[]
  activeSpeakerId: string | null
  panel: 'none' | 'participants' | 'chat'
  isMuted: boolean
  isVideoOn: boolean
  isScreenSharing: boolean
  // actions…
}
```

Select narrowly (`useMeetingStore(s => s.isMuted)`) so a remote ICE update never re-renders the control bar.

### 7.2 Component Rules

1. **Server Components by default.** `"use client"` only for interactivity — the room, forms, panels, dropdowns.
2. **Presentational components never fetch.** `VideoTile` takes `{participant, stream, isActiveSpeaker}` and nothing else, so it is trivially testable with a mock stream.
3. **One primitive per file** under `components/ui/`, all with `forwardRef` and `className` merge via `cn()`.
4. **All API access flows through `lib/api.ts`** — typed, single error-normalization point. No bare `fetch` in components.

### 7.3 Accessibility

Focus-visible rings using `--zm-blue-500` at 2px offset; all icon-only buttons carry `aria-label`; modals trap focus and close on Escape; toasts live in an `aria-live="polite"` region; the participant count is announced on change. Meeting-room contrast must clear 4.5:1 against `--zm-room-bg` — check the 12px control labels specifically.

### 7.4 Responsive

Breakpoints `sm 640 / md 768 / lg 1024 / xl 1280`. The desktop-app shell is inherently wide, so it needs a deliberate mobile translation rather than a naive squeeze:

| Surface | Below `lg` (1024) | Below `sm` (640) |
|---|---|---|
| **Icon rail** | Stays, narrowed to 72px, labels hidden | Becomes a bottom tab bar, 56px, safe-area padded |
| **Top chrome** | Search pill collapses to a search glyph | Nav arrows hidden; logo + avatar only |
| **Content card** | Drops rounded corners, full-bleed | Same |
| **Home clock** | 48px | 40px |
| **Action tiles** | Stay in a row, 40px gap | Icons shrink to 64px |
| **Day strip** | Full width | Full width, compact rows |
| **Meetings list/detail** | Detail becomes a pushed route, not a pane | Same |
| **Schedule form** | Single column, labels above fields | Same |
| **Meeting grid** | 2-col | 1-col |
| **Control bar** | Labels retained | Labels dropped, icons at 44px minimum |
| **Drawers** | Full-height overlay instead of push | Full-screen sheet |
| **Settings modal** | Full-screen, nav becomes a top tab row | Same |

Moving the rail to the bottom below `sm` is the right call — it matches mobile-app convention, and a 113px vertical rail on a 375px screen would eat 30% of the width.

---

## 8. Authentication

**Auth.js v5** in Next.js with the Google provider; JWT session strategy (no adapter — the FastAPI DB is the record of truth).

**Host flow:** Sign In → Google consent → Auth.js callback → `POST /api/v1/auth/google` with the ID token → FastAPI verifies the token against Google's JWKS (`google-auth` library), upserts the user, mints a PMI on first sight, returns the app user → stored in the JWT → all subsequent API calls carry `Authorization: Bearer <app_jwt>`.

**Guest flow:** on `/j/[meetingId]` an unauthenticated visitor supplies a display name → `POST /auth/guest` → guest user + short-lived JWT (4h) scoped to that one meeting. Guests cannot list meetings, schedule, or hold host tools.

**Verify the Google ID token server-side.** Never trust a client-decoded profile. Required env: `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_SECRET`, `NEXTAUTH_URL`, and `GOOGLE_CLIENT_ID` on the API for audience validation.

---

## 9. Caching (optional, phase 2)

Define the interface up front so retrofitting Redis is a one-line swap:

```python
class CacheBackend(Protocol):
    async def get(self, key: str) -> str | None: ...
    async def set(self, key: str, value: str, ttl: int | None = None) -> None: ...
    async def delete(self, key: str) -> None: ...
    async def incr(self, key: str) -> int: ...
```

`MemoryCache` (dict + TTL sweep) ships by default; `RedisCache` activates when `REDIS_URL` is set. Cache targets: meeting lookup by number (60s), participant counts (10s), rate-limit counters.

**Note:** if the API ever scales past one instance, `RoomRegistry` must move to Redis pub/sub — in-process room state breaks across replicas. Keep the API at one instance for this submission.

---

## 10. Build Order

Phases are dependency-ordered — each assumes the ones before it are done. Phases 5–8 (frontend surfaces) can run in parallel across agents once phase 4 lands, since they share only the UI primitives.

| Phase | Name | Deliverable | Depends on |
|---|---|---|---|
| **P1** | Scaffold | Both apps boot; `/health` green; Tailwind + tokens wired | — |
| **P2** | Data layer | Models, pragmas, indexes, seed script | P1 |
| **P3** | REST API | All §4 endpoints; tests on meeting numbers and state transitions | P2 |
| **P4** | Design system | `globals.css` tokens, `components/ui/*` primitives | P1 |
| **P5** | App shell | Icon rail, top chrome, search pill, content card, More flyout | P4 |
| **P6** | Home | Clock, action tiles, calendar banner, day strip on live data | P3, P5 |
| **P7** | Meetings + Schedule | List/detail panes, schedule form, copy-invitation | P3, P5 |
| **P8** | Join flows | `/join`, `/j/[id]`, lookup + passcode + display name | P3, P5 |
| **P9** | Signaling | WS server, RoomRegistry, protocol frames, frame auth | P3 |
| **P10** | WebRTC mesh | PeerManager, offer/answer/ICE, remote streams rendering | P9 |
| **P11** | Room UI | Grid, control bar, drawers, host tools, End popover, More menu | P10, P5 |
| **P12** | Auth | Google OAuth end to end | P3 |
| **P13** | Deploy + README | Both hosts live, cron active, README written | all |
| **P14** | Polish | Marketing landing, Settings modal, optional stubs | P13 |

**P10 is the critical path** — it is the phase most likely to overrun and the one everything visual depends on for a convincing demo. Start it as early as P9 allows rather than saving it for last.

Marketing landing and the Settings modal sit in **P14** deliberately: neither is task-required, and both are large surfaces. A Settings modal with only General and Audio panes is a perfectly good ship.

**If time runs short, cut in this order:** optional stubs → Background/Statistics panes → marketing landing → screen share → React → chat drawer → recurring meetings. **Never cut:** the seed data, the README, or the meeting-number/state-transition tests — all three are directly graded.

**Best fidelity per unit of effort:** the app shell (P5) and Home clock (P6). They are the first thing any evaluator sees, and they are mostly static layout. The Settings modal is the worst — many pixels hidden behind a click.

---

## 11. Testing

**Backend (pytest):** meeting-number uniqueness under collision; state-transition table incl. illegal transitions; passcode validation on join; host-only authorization on `host.*` frames; participant `left_at` lifecycle; `/lookup` leaks no private fields.

**Frontend (Vitest):** `formatMeetingId` (11 digits → `### #### ####`); PeerManager glare handling (simultaneous offers resolve to one connection); SignalingClient reconnect backoff and queue flush.

**Manual matrix — run before submitting:** two browsers, same LAN, both grant camera → both see remote video. Host mutes participant → participant's mic actually stops. Host removes participant → participant redirects out. Host ends meeting → all clients exit. Refresh mid-meeting → clean rejoin. Deny camera permission → graceful fallback, no crash.

---

## 12. Deployment

### 12.1 Frontend — Cloudflare Workers via OpenNext

```bash
npm i -D @opennextjs/cloudflare wrangler
npx opennextjs-cloudflare build && npx opennextjs-cloudflare deploy
```

`open-next.config.ts` uses the default Cloudflare adapter. Set `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_WS_BASE_URL`, `AUTH_*` as Worker secrets (`wrangler secret put`), never in `wrangler.toml`.

### 12.2 Backend — Fly.io

`fly.toml`: 1 shared-cpu-1x/512MB machine, a 1GB volume mounted at `/data`, `min_machines_running = 1` (critical — WebSockets die on scale-to-zero), health check on `/health`. Dockerfile: `python:3.12-slim`, uvicorn with `--workers 1` (one worker only, so `RoomRegistry` stays coherent). Set `DATABASE_URL=sqlite:////data/zoom.db`, `CORS_ORIGINS`, `GOOGLE_CLIENT_ID`, `SECRET_KEY`.

### 12.3 Cron Keep-Alive — every 5 minutes

Free-tier backends idle out; a cold FastAPI start mid-demo looks like a broken app. OpenNext has no cron of its own, but the Worker it produces supports Cloudflare Cron Triggers, and OpenNext lets you attach a custom `scheduled()` handler alongside the Next.js fetch handler.

`web/wrangler.toml`:
```toml
name = "zoom-clone"
main = ".open-next/worker.js"
compatibility_date = "2025-03-01"
compatibility_flags = ["nodejs_compat"]

[triggers]
crons = ["*/5 * * * *"]

[vars]
API_HEALTH_URL = "https://<your-api>.fly.dev/api/v1/health"
```

`web/src/worker.ts` (wrap the OpenNext handler rather than replacing it):
```ts
import handler from "../.open-next/worker.js";

export default {
  fetch: handler.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      fetch(env.API_HEALTH_URL, {
        method: "GET",
        headers: { "user-agent": "zoom-clone-keepalive/1.0" },
      })
        .then(r => console.log(`keepalive ${r.status}`))
        .catch(e => console.error("keepalive failed", e))
    );
  },
};
```

Point `main` at this wrapper once it exists. Verify locally with `wrangler dev --test-scheduled` then `curl "http://localhost:8787/__scheduled?cron=*/5+*+*+*+*"`. Confirm in production under Workers → your worker → Logs, and check the Cron Triggers tab shows the schedule as active.

**Keep `/health` cheap** — it runs 288×/day. A `SELECT 1` and an uptime counter, nothing more. If Fly still cold-starts despite the cron, `min_machines_running = 1` is the real fix; the cron is a belt-and-braces measure.

### 12.4 Google OAuth Setup

In Google Cloud Console create an OAuth 2.0 Client (Web). Authorized origins: `http://localhost:3000` and the Workers URL. Redirect URIs: `<origin>/api/auth/callback/google` for both. Publish the consent screen or add test users — an unpublished app silently rejects non-test accounts.

---

## 13. README Requirements (graded)

Must contain: project overview + live links; tech stack with a one-line justification each; local setup for both apps incl. env vars; seed instructions; **the schema diagram from §3.1**; an architecture diagram; assumptions made; known limitations (mesh caps at 6, TURN dependency, single API instance); a feature checklist mapped to the task's requirements.

State the deviations explicitly and defend them — they will come up in the evaluation interview:
- Backend on Fly rather than Workers (Workers cannot run Python or host SQLite).
- Mesh rather than SFU (no media server in scope; hence the 6-participant cap).
- Google OAuth added though the task said auth was optional (bonus item), with guest join retained so the core flow needs no login.

---

## 14. Definition of Done

**Task requirements**

- [ ] Instant meeting → unique ID → invite link → redirect into the room
- [ ] Join by ID and by invite link, with display-name entry and existence validation
- [ ] Schedule with title, description, date/time, duration → link generated → appears in the day strip
- [ ] Upcoming meetings visible on Home; previous meetings visible under Meetings → Previous
- [ ] Navbar with profile/settings surfaces present and functional
- [ ] Seed script populates a demo-ready DB
- [ ] README complete per §13

**Bonus criteria**

- [ ] Two browsers exchange real audio/video via WebRTC
- [ ] Host can mute all and remove a participant, and it takes effect on the target client
- [ ] Google sign-in works; guest join works without it
- [ ] Responsive at 375 / 768 / 1440, with the rail becoming a bottom bar on mobile

**Visual fidelity**

- [ ] Left icon rail with active-pill state, and a working More flyout
- [ ] Top chrome: nav arrows, search pill (opens on `⌘K`), Upgrade button, avatar with presence dot
- [ ] Home clock updates live and shows the correct date
- [ ] Three action tiles with correct colors — orange New meeting, blue Join and Schedule
- [ ] Meeting room renders inside the shell, not as a bare page
- [ ] End popover distinguishes "End for All" (host) from "Leave Meeting"
- [ ] Settings modal opens with at least General and Audio panes working

**Operational**

- [ ] Both apps deployed; cron keep-alive firing on schedule
- [ ] Refresh mid-meeting rejoins cleanly; denied camera degrades gracefully
