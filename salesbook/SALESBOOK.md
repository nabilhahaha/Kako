# SalesBook

A production implementation of the **SalesBook** customer-intelligence mobile app
("know your customer before you visit"), built from the design handoff in
`project/SalesBook.dc.html`. Arabic-RTL first with a full English (LTR) mirror,
light & dark themes, and a real backend API.

## Stack
- **Next.js 15** (App Router) · **React 19** · **TypeScript** (strict)
- No CSS framework — the design's exact token system (`--bg`, `--card`, `--pri`, …) is ported
  to `src/app/globals.css` and driven by `data-slk` / `data-th` attributes, matching the design 1:1.
- Server-side **API route handlers** under `src/app/api/*` backed by a file-persisted store
  (`data/store.json`), seeded from `src/lib/seed.ts`.

## Run
```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
```

## Architecture
```
src/
  app/
    layout.tsx, page.tsx         # entry; wraps providers + <AppShell/>
    globals.css                  # ported design tokens + keyframes
    api/                         # backend
      bootstrap/                 # GET all seed collections + persisted state
      requests/[id]/             # POST approve/reject membership request
      reviews/[id]/              # POST approve/reject data update
      notifications/read/        # POST mark all notifications read
      messages/[chatId]/         # POST append a chat message
      auth/{login,register}/     # POST demo auth
  lib/
    types.ts                     # bilingual data model (every field is { ar, en })
    seed.ts                      # all 15 collections, translated ar+en
    tokens.ts                    # tone() / scoreCol() / scoreRing() (from the design)
    deco.ts                      # customer-card display decoration
    store.ts                     # server store (JSON-file persisted)
  state/
    i18n.tsx                     # LocaleProvider — lang, dir, t(L), tt(ar,en)
    app.tsx                      # AppProvider — the screen state machine + actions + API wiring
  components/
    ui.tsx                       # Icon set, ScoreRing, Avatar, Toggle, Chip
    AppShell.tsx                 # phone frame, status bar, quick-jump bar, bottom nav, toast, reject sheet
    screens/                     # the 23 screens (index.tsx maps screen key -> component)
```

## Internationalization
Every user-facing value carries both languages as `{ ar, en }` (`L`). Static UI chrome uses
`tt('عربي','English')`; data values use `t(value)`. The language toggle (in the quick-jump bar
and Settings) flips `lang`, which flips `dir` (rtl/ltr) across the whole phone. Layout uses
logical CSS properties so both directions mirror correctly.

## State & navigation
`src/state/app.tsx` reproduces the prototype's in-app state machine: a `screen` key plus a
navigation `stack` (`nav`/`root`/`back`), selection state, the 8-step report wizard, and all
toggles. Persistent workflows (membership approvals, review queue, mark-all-read, chat messages)
are wired through the API and survive reloads; lightweight UI state stays client-side.

## Backend note
The store persists to `data/store.json` (gitignored). It is a lightweight, dependency-free
persistence layer that keeps the demo genuinely API-driven without standing up an external
database — the data layer (`src/lib/store.ts`) is structured so a real DB can be dropped in
behind the same route handlers.
