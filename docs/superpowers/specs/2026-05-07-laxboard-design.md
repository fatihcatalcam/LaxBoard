# LaxBoard — Design Spec
**Date:** 2026-05-07  
**Status:** Approved

---

## Overview

LaxBoard is a full-stack CRUD web application for designing and managing Sixes lacrosse plays ("sets"). Coaches draw player movement paths on a 2D half-field canvas, save them as named sets, and replay them as synchronized animations.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla JS (ES modules), HTML Canvas |
| Backend | Node.js + Express |
| Database | SQLite via `better-sqlite3` |
| API Docs | `swagger-jsdoc` + `swagger-ui-express` |
| Tests | Jest (backend business logic only) |

---

## Project Structure

```
LaxBoard/
├── backend/
│   ├── app.js                    ← Express setup, Swagger mount, server start
│   ├── routes/
│   │   └── sets.js               ← HTTP endpoint definitions
│   ├── services/
│   │   └── setsService.js        ← Business logic + validation
│   ├── models/
│   │   └── db.js                 ← SQLite connection, table creation on startup
│   └── tests/
│       └── setsService.test.js
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── js/
│       ├── app.js                ← Entry point, wires modules together
│       ├── field.js              ← Canvas rendering
│       ├── recorder.js           ← Path capture state machine
│       ├── animator.js           ← Synchronized playback
│       └── sets-ui.js            ← Sidebar CRUD UI
└── README.md
```

---

## UI Layout

- **Left sidebar:** Record/Stop/Play/Clear controls, active player selector, set name input, save button, search input, set list (load/rename/delete per item), path toggle checkbox.
- **Right:** HTML Canvas occupies remaining width. Renders the half-field, players, and optionally paths.
- SPA — no full page reloads. All DOM updates via JavaScript.

---

## Field Design

Half-field of an official Sixes lacrosse field (35m × 36m view).

- **Orientation:** End line at top, midfield at bottom (faint dashed line).
- **Background:** Green grass (`#2d6b26`).
- **Lines:** White (2px). End line + left/right sidelines solid. Bottom edge (midfield) faint dashed.
- **Goal:** Centered horizontally, 10m from end line (25m from midfield). 1.83m × 1.83m, rendered visually larger for clarity. Yellow/gold lines (`#ffcc00`). Opens downward (faces midfield).
- **Crease:** Full circle, 3m radius, centered on midpoint of goal line. White, semi-transparent fill.
- **X area:** Space between end line and goal, labeled "X".
- **Scale:** Canvas pixels map proportionally to field meters. Coordinates stored as canvas pixels.

---

## Players

- 6 players, identified by numbers 1–6 only (no names, no colors per player).
- Rendered as white filled circles with black number in center.
- Positioned anywhere on the canvas by drag.
- **IDLE mode drag:** Dragging a player circle repositions it — no path is recorded.
- **RECORDING mode drag:** Dragging the active player records a movement path.
- When saving a set, all 6 players' data is always sent. Players that did not move are saved with a single-point path `[{x, y, t}]` representing their current position. This ensures all positions are restored correctly on load.

---

## Recording System

State machine in `recorder.js`: `IDLE → RECORDING → IDLE`

**Flow:**
1. User clicks **Record** → sidebar shows player selector (circles 1–6).
2. User clicks a player number to make it active (highlighted border).
3. User presses mouse on the active player circle on the canvas and drags → each `mousemove` appends `{x: e.offsetX, y: e.offsetY, t: Date.now()}` to that player's path array.
4. `mouseup` finalizes that player's path. Player selector remains open.
5. User selects another player and repeats. Previously recorded paths are preserved.
6. User clicks **Stop** → recording mode ends.

Only players that were explicitly dragged have paths. Players with no path remain stationary during playback.

---

## Animation System

`animator.js` uses `requestAnimationFrame`.

**Playback algorithm:**
1. Record `startTime = performance.now()` and each path's `t0 = path[0].t`.
2. Each frame: `elapsed = performance.now() - startTime`.
3. For each player with a path: find the last point where `point.t - t0 <= elapsed` → move player to that position.
4. Call `field.js` draw functions to re-render the canvas.
5. When all players have reached their final point, animation stops.

Result: playback mirrors exact recorded tempo (fast drag = fast playback).

---

## Path Visibility Toggle

A checkbox in the sidebar labeled "Yolları Göster / Show Paths". When checked, `field.js` draws each player's full recorded path as a white polyline with an arrowhead at the final point. When unchecked, the field shows only player circles.

---

## Database Schema

```sql
CREATE TABLE sets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE player_paths (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  set_id        INTEGER NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
  player_number INTEGER NOT NULL CHECK(player_number BETWEEN 1 AND 6),
  path          TEXT NOT NULL   -- JSON string: [{x,y,t}, ...]
);
```

`ON DELETE CASCADE` ensures player_paths are removed when a set is deleted.

---

## REST API

Base path: `/api`  
Swagger UI: `/api-docs`

| Method | Path | Body | Description |
|--------|------|------|-------------|
| GET | `/sets` | — | List all sets |
| GET | `/sets/search?q=` | — | Search by name (empty `q` returns all sets) |
| GET | `/sets/:id` | — | Get set + all player paths |
| POST | `/sets` | `{name}` | Create new set |
| PUT | `/sets/:id` | `{name}` | Rename set |
| DELETE | `/sets/:id` | — | Delete set (cascade paths) |
| POST | `/sets/:id/paths` | `{paths: [{player_number, path}]}` | Save paths for a set |

**Error responses:**
- `400` — validation failure (name empty, invalid path data)
- `404` — set not found
- `409` — duplicate set name

---

## Services Layer (`setsService.js`)

Validates input and executes DB operations. Routes only parse HTTP, delegate everything to service.

**Functions:**
- `validateSetName(name)` — not empty, max 50 chars, alphanumeric + spaces/hyphens
- `validatePaths(paths)` — player_number 1–6, each path is array of `{x, y, t}` with numeric values
- `createSet(name)` → `{id, name, created_at}`
- `getSet(id)` → `{id, name, paths: [{player_number, path}]}`
- `getAllSets()` → array of `{id, name, created_at}`
- `searchSets(q)` → filtered array
- `updateSet(id, name)` → updated set
- `deleteSet(id)` → void
- `savePaths(setId, paths)` → replaces existing paths for the set

**Custom errors:** `SetNotFoundError`, `DuplicateNameError`, `ValidationError`

---

## Testing Strategy

Jest tests in `backend/tests/setsService.test.js`.  
Each test suite uses a fresh in-memory SQLite database (`:memory:`) — no mocks.

**Coverage:**
- `validateSetName` — empty, too long, invalid chars, valid
- `validatePaths` — invalid player_number, missing fields, non-numeric values, empty array
- `createSet` — success, duplicate name throws `DuplicateNameError`
- `getSet` — found, not found throws `SetNotFoundError`
- `getAllSets` — empty DB, populated DB
- `searchSets` — match, no match, empty query returns all
- `updateSet` — success, not found, name conflict
- `deleteSet` — success, not found, paths cascade deleted
- `savePaths` — success, invalid set_id, replaces on re-save

---

## Input Validation

**Frontend:** Before POST/PUT, `sets-ui.js` checks name is not empty and paths array is not empty. Shows inline error message without alert().

**Backend:** `setsService.js` validates all inputs independently of frontend. Backend is the authoritative validation layer.

---

## Non-Goals

- No user authentication
- No offense/defense player separation
- No undo/redo
- No mobile/touch support
- No real-time collaboration
