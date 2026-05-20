# LaxBoard

Sixes lacrosse play designer. Draw player movements on a half-field canvas, record paths one player at a time, animate all players simultaneously, and save plays to a local SQLite database.

## Prerequisites

- Node.js 18+
- npm

## Quick Start

```bash
# Clone from GitHub (see repo link in Google Sheets) or extract the submitted ZIP
npm install
npm start          # http://localhost:3000
```

Other commands:

```bash
npm run dev        # auto-restart with nodemon
npm test           # Jest unit tests
```

## Authentication

Register at `http://localhost:3000/register`, then log in at `http://localhost:3000/login`. On successful login the server sets an `httpOnly` JWT cookie (named `token`, expires in 7 days). All `/api/sets` endpoints require this cookie to be present.

## Usage

1. **Create a set** — click "+ New Set" in the sidebar and give it a name (max 50 chars, letters/numbers/spaces/hyphens).
2. **Select a player** — click one of the numbered circles on the canvas.
3. **Record** — click "Record Player", drag the player, release to stop.
4. **Steps** — add multiple movement steps per set with the "+ Yeni Adım" (New Step) button.
5. **Play** — click "Play" to watch all players animate simultaneously.
6. **Save** — click "Save" to persist paths to the database.
7. **Search** — type in the search box to filter sets by name.

## API Reference

Interactive docs: `http://localhost:3000/api-docs` (Swagger UI)

### Auth

| Method | Path | Description | Auth required |
|--------|------|-------------|---------------|
| POST | `/api/auth/register` | Create account | No |
| POST | `/api/auth/login` | Log in, receive cookie | No |
| POST | `/api/auth/logout` | Clear session cookie | No |
| GET | `/api/auth/me` | Current user info | Yes |

**Register / Login body:**
```json
{ "username": "fatih", "password": "secret123" }
```

### Sets

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/sets` | List all sets for current user |
| GET | `/api/sets/search?q=<term>` | Search sets by name |
| GET | `/api/sets/:id` | Get set with player paths |
| POST | `/api/sets` | Create set |
| PUT | `/api/sets/:id` | Rename set |
| DELETE | `/api/sets/:id` | Delete set and its paths |
| POST | `/api/sets/:id/paths` | Save (replace) player paths |

**GET `/api/sets` response:**
```json
[
  { "id": 1, "name": "play-1", "created_at": "2026-05-20 10:00:00" },
  { "id": 2, "name": "zone-defense", "created_at": "2026-05-19 09:00:00" }
]
```

**GET `/api/sets/:id` response:**
```json
{
  "id": 1,
  "name": "play-1",
  "created_at": "2026-05-20 10:00:00",
  "paths": [
    { "player_number": 1, "step_index": 0, "path": [{ "x": 100, "y": 200, "t": 1000 }] }
  ]
}
```

All `/api/sets` endpoints require authentication (JWT cookie). Responses are JSON.

**POST `/api/sets` body:**
```json
{ "name": "play-1" }
```

**PUT `/api/sets/:id` body:**
```json
{ "name": "new-name" }
```

**Save paths body:**
```json
{
  "paths": [
    {
      "player_number": 1,
      "step_index": 0,
      "path": [{ "x": 100, "y": 200, "t": 1000 }, { "x": 150, "y": 250, "t": 1500 }]
    }
  ]
}
```

**Status codes:** `200` OK · `201` Created · `204` No content · `400` Validation error · `401` Unauthenticated · `404` Not found · `409` Duplicate name · `500` Server error

**Error response format (4xx/5xx):**
```json
{ "error": "descriptive error message" }
```

## Stack

- **Backend**: Node.js, Express, `node-sqlite3-wasm` (pure-JS SQLite), Swagger UI
- **Frontend**: Vanilla JS ES modules, HTML5 Canvas
- **Tests**: Jest + in-memory SQLite
