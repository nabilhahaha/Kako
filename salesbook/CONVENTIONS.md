# SalesBook — screen implementation conventions

You are porting one or more screens of a mobile prototype into a Next.js/React/TypeScript app.
The **source of truth for markup & styling** is `project/SalesBook.dc.html` (a custom `<x-dc>`
template using `sc-if`, `sc-for`, and `{{ }}` bindings). The **logic** that computes the bound
values is the `renderVals()` method + helper methods in the `<script>` block of that same file
(lines ~1644–2233). Reproduce the design **pixel-for-pixel**: same paddings, radii, font sizes,
colors (all via CSS `var(--x)` tokens), and animations.

Read these exemplar files first — they establish the exact pattern to follow:
`src/components/screens/Home.tsx`, `src/components/screens/Customers.tsx`, `src/components/screens/Auth.tsx`.

## Output
- Create ONE `.tsx` file per screen group under `src/components/screens/`, e.g. `Report.tsx`.
- Each screen is a named export: `export function Report() { ... }` returning the screen's
  root element (the `<div data-scroll ... style=...>` that the design has directly under the phone).
- `'use client';` at the top of every file.
- Do NOT edit `src/components/screens/index.tsx` — the integrator wires exports in afterward.
- Do NOT touch any other existing file.

## Hooks & API
```ts
import { useApp } from '@/state/app';
import { useI18n } from '@/state/i18n';

const { s, data, set, update, nav, root, back, openC, openChat, toast,
        login, startReport, repNext, repBack, sendMsg, toggleTheme,
        approveRequest, rejectRequest, approveReview, rejectReview, markAllRead } = useApp();
const { t, tt, lang, dir, setLang, toggleLang } = useI18n();
```
- `s` is the full app state (see `src/state/app.tsx` `AppState`): fields like `s.screen`, `s.stack`,
  `s.theme`, `s.tab`, `s.filter`, `s.sort`, `s.query`, `s.selId`, `s.reportStep`, `s.repCust`,
  `s.repPay`, `s.repMove`, `s.repPhotos`, `s.repVoice`, `s.feedFilter`, `s.likes`, `s.conns`,
  `s.connReqs`, `s.applied`, `s.rsvp`, `s.joined`, `s.careersTab`, `s.chatId`, `s.chatInput`,
  `s.typing`, `s.chatMsgs`, `s.notifRead`, `s.requests`, `s.reviews`, `s.availOn`, `s.ntf1`, `s.ntf2`.
- `set(partial)` merges into state (analog of the design's inline `this.setState({...})`).
- `update(prev => partial)` for functional updates (e.g. toggling a map: `update(p => ({ likes: { ...p.likes, [id]: !p.likes[id] } }))`).
- `nav(screen, extra?)` pushes current screen on the stack and navigates; `root(screen)` clears
  the stack; `back()` pops. `openC(id)` = `nav('customer', { selId:id, tab:'ov' })`.
  `openChat(id)` = `nav('chat', { chatId:id })`.
- `toast(L)` shows a transient toast. **It takes an `L` object `{ ar, en }`, NOT a string.**
  Example: `toast({ ar: 'تم الحفظ', en: 'Saved' })`.
- Server-backed actions already POST to the API: `approveRequest`, `rejectRequest`,
  `approveReview`, `rejectReview`, `markAllRead`. Use them directly for those workflows.

## i18n — every user-facing string is bilingual
- `tt(ar, en)` returns the string for the current language. Use it for ALL static chrome:
  `tt('حفظ', 'Save')`.
- `t(L)` localizes a data value already shaped as `{ ar, en }` (all seed data is). Example:
  `t(customer.name)`, `t(post.txt)`.
- `lang` is `'ar' | 'en'`; `dir` is `'rtl' | 'ltr'`.
- Never hardcode an Arabic-only or English-only literal in visible text. Translate faithfully;
  keep the Arabic identical to the design, add a natural English equivalent.
- The phone container is already `dir`-switched by the shell — use logical CSS
  (`marginInlineStart`, `insetInlineStart`, `borderInlineStart`, `textAlign:'start'`) not
  left/right, EXCEPT where the design deliberately forces `direction:ltr` (phone numbers).

## Styling
- Use inline `style={{}}` objects mirroring the design's inline CSS exactly. Numeric px values
  can be bare numbers (`padding: '15px 16px'` or `borderRadius: 18`). Keep `var(--x)` tokens verbatim.
- Convert `style-hover`/`style-active` from the design into plain static styles (drop the hover/
  active pseudo-behaviors; keep `transition` and `cursor:'pointer'`). Keep all `animation:` values.
- Scroll containers: add `data-scroll="true"` and `overflowY:'auto'` (or `overflowX`) as in the design.
- Reuse primitives from `@/components/ui`: `Icon` (named icons; see the file for the set — inline
  a raw `<svg>` for any one-off icon not in the set, copying the exact path from the design),
  `ScoreRing`, `Avatar`, `Toggle`, `Chip`. Helpers in `@/lib/tokens`: `tone(key)`,
  `scoreCol(n)`, `scoreRaw(n)`, `scoreRing(n)`.

## Tone / score helpers (from `@/lib/tokens`)
- `tone(k)` → `{ bg, c, d }` for k ∈ `'g'|'b'|'a'|'o'|'r'|'n'` (green/blue/amber/orange/red/neutral).
- `scoreCol(n)`, `scoreRaw(n)` → color strings; `scoreRing(n)` → the conic-gradient background.
- Score label is language-dependent: excellent≥85, good≥70, average≥50, else highRisk. Render via `tt`.

## Types
All data shapes are in `src/lib/types.ts` (`Customer`, `Post`, `Job`, `Member`, etc.). Every
content field is `L = { ar, en }`. `data` (from `useApp`) is the `Bootstrap` object with
`customers, requests, reviews, notifs, posts, jobs, talents, leaders, connreqs, suggest, chats,
chatseed, groups, events, member, reasons`.

## Fidelity checklist
- Match the design's structure, spacing, and colors precisely — do not restyle or "improve".
- Wire every `onClick` binding to the corresponding action from `renderVals()` in the design.
- Keep entry animations (`fadeUp`, `ringPop`, `pop`, `slideUp`, `shimmer`, etc.).
- The code must typecheck under `strict` TypeScript.
