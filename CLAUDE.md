# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

「合成大肥鱼」(DaFeiYu) — a browser-based merge game (Suika/watermelon style, Chinese-language UI) where identical AI-model characters merge up an 11-stage progression: 豆包 → Mistral → Gemini → MuseSpark → GLM → Qwen → Kimi → Grok → Claude → ChatGPT → DeepSeek (the "big fat fish"). Pure static site — no build step, no bundler, no package.json. Deployed as plain files (GitHub Pages).

There is also an independent, standalone mini-game at `ricochet.html` / `ricochet.js` / `ricochet.css`: a no-gravity aim-and-shoot merge puzzle reusing the same asset manifest.

## Running / developing

No build or test tooling exists. To run locally, serve the root over HTTP (ES modules/CORS-free asset loading needs it less here since scripts are classic, but Supabase and WebP work fine either way), e.g. `python -m http.server` in the repo root, then open `index.html`. `ricochet.html` works standalone.

Never open `file://` directly if testing Supabase features — use a local server.

## Architecture

**Script loading order in `index.html` matters** (classic scripts, globals via `window.*`):
1. `supabase-config.js` — sets `window.FISH_SUPABASE_CONFIG` (publishable/anon key only; never put a service-role key there).
2. `Assets/processed/manifest.js` — sets `window.FISH_ASSET_MANIFEST` (character images, alpha bounds, and **convex polygon collision hitboxes** normalized to the image frame).
3. `leaderboard.js` — profile (nickname/avatar in localStorage), global leaderboard via Supabase REST (`/rest/v1/`), offline-pending score/profile sync in localStorage.
4. `ui-controls.js`, `game.js`, `result-screenshot.js`, `topbar-message.js`.

`game.js` is the whole game engine in one IIFE: a hand-rolled physics simulation (no library) — gravity, polygon-vs-polygon collision with substeps, sleeping bodies, squash/stretch, merge-on-touch. Key constants at the top (board geometry: `W=420, H=620`, `FLOOR=594`, `DANGER_LINE=118`; drop interval 0.35s; starter-drop weights `[40,25,16,10,6,3]` for the first six stages). Game-over triggers after a character crosses the danger line continuously for 3 seconds. All persistence is localStorage under `big-fish-*` keys (items/revives, active run state).

**Asset pipeline** (`scripts/preprocess_assets.py`, requires Pillow/NumPy/SciPy): reads source art in `Assets/images/`, flood-fills the edge-connected near-white background, writes padded lossless WebP to `Assets/processed/`, derives convex collision polygons from the alpha channel, and regenerates `manifest.json` + `manifest.js`. If you change art or progression, rerun this — don't hand-edit `Assets/processed/manifest.js` (it's generated, minified one-liner).

**Service worker** (`service-worker.js`): caches only `Assets/processed|illustrations/*.webp` and `vendor/html2canvas.min.js`. Bump `IMAGE_CACHE_NAME` version (`v4` currently) when replacing image files without changing their URLs; image URLs also carry a `?v=2` cache-busting query that must stay in sync with the checks in `leaderboard.sql` and manifest entries.

`ricochet.js` similarly consumes `FISH_ASSET_MANIFEST` but is fully offline/local-only (localStorage stats, no Supabase).

## Supabase leaderboard

Schema/policies live in `supabase/leaderboard.sql` (run once in SQL Editor) plus time-stamped migrations in `supabase/migrations/`. The `leaderboard` table is capped at 20 rows, RLS with anon read/insert, no user accounts; `player_id` (UUID from localStorage) keeps profiles updatable. Note: avatar validation in SQL is a fixed `IN` list of the `?v=2` URLs — changing image URLs requires updating that check too.

## Conventions

- All user-facing text is Simplified Chinese (README, UI strings, comments often too).
- Chinese characters appear in file paths (`Assets/processed/豆包.webp`) and stage IDs — handle Unicode correctly; the character ID 豆包 is the drop-stage asset id, not "Doubao".
- The active git repo is absent here (`DaFeiYu-main` is an extracted snapshot); upstream is github.com/Koloyaaa/DaFeiYu.
