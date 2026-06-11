# Homeschool HQ — Claude Code working notes

This file calibrates Claude Code when working in this repo. Edit freely — every new session reads the latest version.

## What this repo is

Mike's **Homeschool HQ** — a single-page web app for tracking BC curriculum work for his three kids:

- **Aubrey** — age 8, BC Grade 3
- **Makena** — age 6, BC Grade 1
- **Oakley** — age 4, BC Kindergarten (Pre-K bridge)

Everything runs in the browser. No server, no build step, no `node_modules`. Just open `index.html`. The only external dependency is jsPDF (loaded from a CDN) for printable worksheets. Claude API calls go **directly browser → Anthropic** using the user's own API key.

Migrated from a Claude Cowork session on 2026-05-28. Previously lived at `~/Desktop/Homeschool/app/`.

## How to run it

**Recommended (and required for AI features):** double-click **`Start Homeschool HQ.command`** (on the Desktop, or in this folder). It starts a small local server on port 8765 and opens the app at `http://localhost:8765/index.html`.

Why a server and not just opening the file: the AI worksheet templates call the Anthropic API directly from the browser. That CORS request needs a real http origin — it fails from a `file://` page (origin "null"). Local-only templates (tracing, math, the Scholastic writing pages) work fine either way, but **AI templates only work over the local server.**

Storage is per-origin. The user's API key and all data live under `http://localhost:8765` when launched this way (and persist across server restarts, since localStorage is keyed by origin, not process). If the app is ever opened via `file://` instead, that's a *separate* empty storage bucket — the key would need re-entering and AI calls would likely fail.

All state lives in browser `localStorage` under the key `homeschoolHQ_v1`.

## Architecture quick reference

- **Stack**: Vanilla HTML/CSS/JS, no build, no framework, no package.json.
- **Script load order matters** (declared in `index.html`): `curriculum.js` → `map-data.js` → `tracing-font.js` → `worksheet-templates.js` → `app.js`.
- **State**: `localStorage["homeschoolHQ_v1"]` — single JSON blob. See `DEFAULT_STATE` in `app.js` for shape.
- **AI calls**: `callClaudeAPI()` in `app.js` (~line 1087). POSTs directly to `https://api.anthropic.com/v1/messages` with `anthropic-dangerous-direct-browser-access: true`. The key is whatever the user typed into Settings.
- **Cache-busting**: script tags carry a `?v=DATE` query (e.g. `?v=2026-06-02d`). **Bump it on every JS/data change** — the local server sends no cache headers, so a stale file will otherwise load (this has bitten us: a stale `curriculum.js` crashed the dashboard). `tracing-font.js` keeps its own `?v=kgdots1` since it never changes.

## File map

| File | What it does |
|---|---|
| `index.html` | App shell — header, sidebar, three modals (worksheet preview, grading upload, settings) |
| `app.js` | The whole app. State, tabs, rendering, Claude calls, PDF assembly |
| `curriculum.js` | BC curriculum data — Math + ELA, K through Gr 3, each standard has a stable ID for mastery tracking |
| `worksheet-templates.js` | Scholastic-style printable worksheet generators (jsPDF). Each template has `generate(mods)` + `renderPDF(doc, content, mods, kid)` |
| `tracing-font.js` | Base64-embedded KG Primary DOTS (dashed trace) + KG Penmanship (solid model); the "9" is hand-drawn in worksheet-templates.js |
| `map-data.js` | `window.MAP_DATA` — simplified, projected outline polygons for Canada (13 provinces/territories) and the USA (lower-48 states), used by the `map_label` template. Built from public GeoJSON, decimated + normalized to 0–1 coords (~98KB) |
| `styles.css` | Visual design, per-kid color themes, modals |

## The data model

State shape (simplified):

```js
{
  currentKidId: "aubrey",
  currentTab: "dashboard",
  kids: {
    aubrey: {
      id, name, age, gradeKey,           // "K" | "1" | "2" | "3"
      interests, notes,
      difficulty: { math, reading, writing },   // 1–10 per subject
      mastery:    { [standardId]: "not_yet" | "emerging" | "developing" | "proficient" | "extending" },
      references: { math: [], reading: [], writing: [] }  // reference photos per subject
    },
    makena: {...}, oakley: {...}
  },
  worksheets: { aubrey: [...], makena: [...], oakley: [...] },
  gradings:   { aubrey: [...], makena: [...], oakley: [...] },
  readingLog: { aubrey: [...], makena: [...], oakley: [...] },
  settings:   { apiKey: "", model: "claude-sonnet-4-6" }
}
```

`loadState()` shallow-merges with `DEFAULT_STATE` so adding new fields doesn't break older saves. There's already a migration shim for `references` — follow that pattern for future schema additions.

## Tabs

10 tabs, all per-kid: Dashboard → Math → Reading → Writing → Geography → Standards → **Grading** → Daily Plan → Reading Log → Portfolio. Router lives in `renderContent()` (~line 262 of `app.js`).

## Grading tab + completion model

The **Grading** tab (`renderGrading`/`gradingRowHTML`/`attachGradingListeners`) is a day-by-day marking queue: a native date picker (with ‹/› day-shift + "Jump to today"), an All-kids/per-kid chip filter, and a row per worksheet generated that day. Each row shows a status badge — `⏳ to mark` / `score%` / `✗ not done` — and actions: **Mark** (`openGradeModal`), **Reprint** (`printWorksheet`, the exact same sheet), and **Not done** (`markIncomplete(id, carryForward=true)`).

Completion lives on the worksheet object: `markedIncomplete` + `carryForward` (+ `incompleteAt`). Helpers: `dateKeyOf`/`todayKey` (local-tz YYYY-MM-DD, **not** UTC), `dateKeyLabel` (Today/Yesterday/short date), `worksheetsOnDate(key, kidId|'all')`, `worksheetStatus(ws)` → `graded|incomplete|pending`, `carryForwardSheets(kidId)`. Grading a sheet clears both flags (in `runGrading`), and `runGrading` now attributes the mark to `worksheet.kidId` (not the active profile) so you can mark any kid's sheet from the All-kids view. New fields are absent-by-default — no migration needed.

The **Daily Plan** ties in: carry-forward (`✗ not done` + flagged) sheets surface in a "Finish first" section (Reprint same / generate Fresh one) above the per-subject recommendations, plus a nudge linking to Grading when today's sheets are still unmarked. Per-subject recs already key off the latest grading's `recommendation` (reteach/easier/harder/practice).

## Worksheet flow

Two modes per subject:

1. **Template mode** (default) — picks a template from `window.TEMPLATES`, generates problems locally, renders PDF via jsPDF. No API call, deterministic, fast.
2. **AI mode** — calls Claude, expects JSON back via `parseWorksheetJSON()`, falls back to `mockWorksheetResponse()` if no API key.

Reference photos uploaded per subject get sent along to Claude so it can mimic the style of the workbook Mike likes.

## Grading flow

Mike uploads a photo of a completed worksheet → `callClaudeForGrading()` sends image + the original worksheet to Claude → response includes `score` (0–100), per-question feedback, weak spots, and a `recommendation` of `"harder" | "same" | "easier" | "reteach"`. The difficulty arrow on the dashboard reflects this.

## Curriculum source

BC curriculum from https://curriculum.gov.bc.ca/, structured per BC's Know-Do-Understand model:
- `bigIdeas` = Understand
- `content`  = Know (each has stable ID like `M3.4`, `ELA1.2`)
- `competencies` = Do

When extending: keep IDs stable. They're how mastery is tracked.

## Don't

- Don't add a build step / bundler / framework. The whole point is "open the file." Stay vanilla.
- Don't change standard IDs in `curriculum.js` — mastery is keyed off them.
- Don't commit anything that looks like an API key or a personal export JSON.
- Don't reach for new dependencies. jsPDF is the only one and that's intentional.
- Don't refactor for the sake of it — this app works. Touch what the task requires.
