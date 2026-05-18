# LaxBoard — JWT Auth & Data Isolation Design Spec
**Date:** 2026-05-18  
**Status:** Approved

---

## Overview

Add JWT-based authentication with per-user data isolation to LaxBoard. Each coach registers with a username and password, logs in to receive a JWT stored in an httpOnly cookie, and can only view and manage their own sets. Login and Register are served as separate HTML pages outside the SPA.

---

## New Dependencies

| Package | Purpose |
|---------|---------|
| `jsonwebtoken` | Sign and verify JWTs |
| `bcryptjs` | Hash and compare passwords |
| `cookie-parser` | Parse httpOnly cookies in Express |

---

## Database Changes

### New `users` table

```sql
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TEXT DEFAULT (datetime('now'))
);
```

### `sets` table migration

The existing `sets` table changes in two ways:
1. Add `user_id INTEGER REFERENCES users(id) ON DELETE CASCADE`
2. Replace global `UNIQUE(name)` with per-user `UNIQUE(user_id, name)`

SQLite cannot drop or modify constraints on existing tables, so the migration uses rename-recreate:

```sql
BEGIN;
ALTER TABLE sets RENAME TO sets_old;
CREATE TABLE sets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, name)
);
INSERT INTO sets SELECT id, name, NULL, created_at, updated_at FROM sets_old;
DROP TABLE sets_old;
COMMIT;
```

Existing rows receive `user_id = NULL`. This is acceptable since all existing data predates auth.

---

## Project Structure Changes

```
LaxBoard/
├── backend/
│   ├── app.js                        ← add cookie-parser, auth guard for GET /
│   ├── middleware/
│   │   └── authenticate.js           ← NEW: JWT verification middleware
│   ├── routes/
│   │   ├── auth.js                   ← NEW: register, login, logout, me
│   │   └── sets.js                   ← add req.user.id to all service calls
│   ├── services/
│   │   ├── authService.js            ← NEW: user creation, credential check
│   │   └── setsService.js            ← add userId param to all functions
│   └── models/
│       └── db.js                     ← add users table + sets migration
├── frontend/
│   ├── login.html                    ← NEW
│   ├── register.html                 ← NEW
│   ├── index.html                    ← add logout button + username display
│   └── js/
│       └── app.js                    ← fetch /api/auth/me on load, wire logout
```

---

## Backend: Auth Routes (`/api/auth`)

| Method | Path | Body | Success | Failure |
|--------|------|------|---------|---------|
| POST | `/api/auth/register` | `{username, password}` | `201` + JWT cookie | `400` validation, `409` duplicate username |
| POST | `/api/auth/login` | `{username, password}` | `200` + JWT cookie | `400` validation, `401` wrong credentials |
| POST | `/api/auth/logout` | — | `200` + clears cookie | — |
| GET | `/api/auth/me` | — | `200 {id, username}` | `401` if no valid token |

**JWT config:**
- Expiry: 7 days
- Secret: `process.env.JWT_SECRET` — if unset, the server logs a warning and falls back to `'dev-secret-change-me'`. In a real deployment this should be an environment variable set explicitly.
- Cookie: `HttpOnly; SameSite=Strict; Path=/`

---

## Backend: Auth Middleware (`authenticate.js`)

```
Request
  └─ read req.cookies.token
      ├─ missing → 401 { error: 'Authentication required' }
      └─ verify jwt.verify(token, JWT_SECRET)
          ├─ invalid/expired → 401 { error: 'Invalid or expired token' }
          └─ valid → attach req.user = { id, username } → next()
```

Applied to all routes under `/api/sets`.

---

## Backend: Auth Service (`authService.js`)

**`registerUser(db, username, password)`**
- Validate: username 3–30 chars, alphanumeric + underscore/hyphen; password ≥ 6 chars
- Hash password with bcrypt (cost 10)
- Insert into `users`, return `{id, username}`
- Throws `DuplicateUsernameError` on conflict

**`loginUser(db, username, password)`**
- Fetch user by username (404 → throw `InvalidCredentialsError` — don't reveal which field is wrong)
- `bcrypt.compare(password, hash)`
- Returns `{id, username}` on match, throws `InvalidCredentialsError` on mismatch

---

## Backend: Sets Service Changes (`setsService.js`)

All functions gain a `userId` parameter. SQL queries are scoped with `WHERE user_id = ?`:

| Function | Change |
|----------|--------|
| `createSet(name, userId)` | Insert with `user_id` |
| `getAllSets(userId)` | Filter by `user_id` |
| `searchSets(q, userId)` | Filter by `user_id AND name LIKE` |
| `getSet(id, userId)` | `WHERE id = ? AND user_id = ?` → 404 if not owned |
| `updateSet(id, name, userId)` | Ownership check before update |
| `deleteSet(id, userId)` | Ownership check before delete |
| `savePaths(setId, userId, paths)` | Ownership check before save |

---

## Frontend: Auth Pages

### `login.html`
- Form: username input, password input, submit button
- Link to `register.html`
- On submit: `fetch('/api/auth/login', { method:'POST', body: JSON.stringify(...) })`
  - Success → `window.location.href = '/'`
  - Failure → show inline error message
- Minimal CSS, matches LaxBoard green/dark color scheme

### `register.html`
- Same structure as login
- Link to `login.html`
- On submit: POST to `/api/auth/register`
  - Success → redirect to `/login` with a "Registration successful" query param
  - Failure → show inline error

### `index.html` changes
- Add logout button to sidebar (top-right area)
- Add username display (e.g., "Logged in as: coach_ali")

### `app.js` changes
- On DOMContentLoaded: `fetch('/api/auth/me')` — if 401, redirect to `/login`
- Wire logout button → POST `/api/auth/logout` → redirect to `/login`

---

## Server-side Route Guard (`app.js`)

```js
app.get('/', (req, res, next) => {
  const token = req.cookies?.token;
  try {
    jwt.verify(token, JWT_SECRET);
    next(); // serve index.html via static middleware
  } catch {
    res.redirect('/login');
  }
});
```

This prevents unauthenticated users from ever loading the SPA.

---

## Error Handling

| Error | HTTP | Message |
|-------|------|---------|
| `ValidationError` | 400 | Field-specific message |
| `DuplicateUsernameError` | 409 | "Username already taken" |
| `InvalidCredentialsError` | 401 | "Invalid username or password" |
| Missing/invalid token | 401 | "Authentication required" / "Invalid or expired token" |

---

## Testing Strategy

Extend `backend/tests/` with `authService.test.js`:
- `registerUser` — success, duplicate username, short password, invalid chars
- `loginUser` — success, wrong password, unknown username
- Middleware: test with valid token, expired token, missing token

Existing `setsService.test.js` tests pass a `userId` to all calls (use a test user inserted at the start of each suite).

---

## Non-Goals

- Password reset / forgot password flow
- Email verification
- OAuth / social login
- Token refresh (7-day expiry is sufficient for this use case)
- Rate limiting on auth endpoints
