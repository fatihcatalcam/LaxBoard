# Step System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-path playback model with a multi-step system where movements within a step are simultaneous and steps play sequentially.

**Architecture:** Each `field.steps[]` entry holds 6 player paths + a ball path + a `startPositions` snapshot. `field.paths` / `field.ballPath` become getters that delegate to the current step so `Recorder` needs no changes. `Animator` loops through steps sequentially. Backend adds a `step_index` column to `player_paths`.

**Tech Stack:** Node.js/Express, SQLite (node-sqlite3-wasm), Jest, vanilla JS ES modules.

---

## File Map

| File | Change |
|------|--------|
| `backend/models/db.js` | Migrate `player_paths` table to add `step_index INTEGER NOT NULL DEFAULT 0` |
| `backend/services/setsService.js` | `validatePaths` accepts `step_index`; `savePaths` writes it; `getSet` returns it |
| `backend/tests/setsService.test.js` | Add step_index tests |
| `frontend/js/field.js` | Replace `paths`/`ballPath` flat fields with `steps[]` + getters + step CRUD |
| `frontend/js/animator.js` | Sequential step playback instead of single-pass |
| `frontend/js/sets-ui.js` | Call `field.getStepsPayload()` on save; `field.setStepsFromSaved()` on load |
| `frontend/js/app.js` | Wire step nav buttons; update `syncUI` |
| `frontend/index.html` | Add step counter, nav arrows, New Step and Delete Step buttons |

---

## Task 1: Backend — step_index in DB and service

**Files:**
- Modify: `backend/models/db.js`
- Modify: `backend/services/setsService.js`
- Modify: `backend/tests/setsService.test.js`

- [ ] **Step 1: Write failing tests for step_index**

Add to the end of `describe('savePaths', ...)` in `backend/tests/setsService.test.js`:

```js
describe('step_index support', () => {
  let setId;
  beforeEach(() => { setId = svc.createSet('step-test').id; });

  test('saves and returns step_index', () => {
    svc.savePaths(setId, [
      { player_number: 1, step_index: 0, path: [{ x: 0, y: 0, t: 0 }] },
      { player_number: 1, step_index: 1, path: [{ x: 10, y: 10, t: 500 }] }
    ]);
    const set = svc.getSet(setId);
    expect(set.paths).toHaveLength(2);
    const step1 = set.paths.find(p => p.step_index === 1);
    expect(step1.path[0].x).toBe(10);
  });

  test('defaults step_index to 0 when omitted', () => {
    svc.savePaths(setId, [{ player_number: 1, path: [{ x: 0, y: 0, t: 0 }] }]);
    const set = svc.getSet(setId);
    expect(set.paths[0].step_index).toBe(0);
  });

  test('throws ValidationError when step_index is negative', () => {
    expect(() => svc.savePaths(setId, [
      { player_number: 1, step_index: -1, path: [{ x: 0, y: 0, t: 0 }] }
    ])).toThrow(ValidationError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd C:\Users\fthct\OneDrive\Belgeler\LaxBoard
npm test
```

Expected: 3 new tests FAIL (column does not exist, step_index not returned, validation missing).

- [ ] **Step 3: Migrate DB schema in db.js**

In `backend/models/db.js`, add the migration at the end of `_initSchema`, after the `CREATE TABLE` block:

```js
function _initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sets (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS player_paths (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      set_id        INTEGER NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
      player_number INTEGER NOT NULL CHECK(player_number BETWEEN 0 AND 6),
      path          TEXT NOT NULL
    );
  `);
  try {
    db.exec('ALTER TABLE player_paths ADD COLUMN step_index INTEGER NOT NULL DEFAULT 0');
  } catch (_) { /* column already exists — safe to ignore */ }
}
```

- [ ] **Step 4: Update setsService.js**

Replace the entire `setsService.js` content:

```js
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

class SetNotFoundError extends Error {
  constructor(id) {
    super(`Set ${id} not found`);
    this.name = 'SetNotFoundError';
    this.status = 404;
  }
}

class DuplicateNameError extends Error {
  constructor(name) {
    super(`Set name '${name}' already exists`);
    this.name = 'DuplicateNameError';
    this.status = 409;
  }
}

function validateSetName(name) {
  if (!name || typeof name !== 'string') throw new ValidationError('Name is required');
  const trimmed = name.trim();
  if (trimmed.length === 0) throw new ValidationError('Name cannot be empty');
  if (trimmed.length > 50) throw new ValidationError('Name must be 50 characters or fewer');
  if (!/^[a-zA-Z0-9ğüşıöçĞÜŞİÖÇ\s\-]+$/.test(trimmed))
    throw new ValidationError('Name may only contain letters, numbers, spaces, and hyphens');
  return trimmed;
}

function validatePaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0)
    throw new ValidationError('paths must be a non-empty array');
  for (const p of paths) {
    if (!Number.isInteger(p.player_number) || p.player_number < 0 || p.player_number > 6)
      throw new ValidationError('player_number must be an integer between 0 and 6');
    const si = p.step_index ?? 0;
    if (!Number.isInteger(si) || si < 0)
      throw new ValidationError('step_index must be a non-negative integer');
    if (!Array.isArray(p.path) || p.path.length === 0)
      throw new ValidationError('each path must be a non-empty array');
    for (const pt of p.path) {
      if (typeof pt.x !== 'number' || typeof pt.y !== 'number' || typeof pt.t !== 'number')
        throw new ValidationError('each point must have numeric x, y, t');
    }
  }
}

function createSetsService(db) {
  return {
    createSet(name) {
      const trimmed = validateSetName(name);
      try {
        const result = db.prepare('INSERT INTO sets (name) VALUES (?)').run(trimmed);
        return db.prepare('SELECT * FROM sets WHERE id = ?').get(result.lastInsertRowid);
      } catch (e) {
        if (e.message && e.message.includes('UNIQUE constraint')) throw new DuplicateNameError(trimmed);
        throw e;
      }
    },

    getSet(id) {
      const set = db.prepare('SELECT * FROM sets WHERE id = ?').get(id);
      if (!set) throw new SetNotFoundError(id);
      const rows = db.prepare(
        'SELECT player_number, step_index, path FROM player_paths WHERE set_id = ? ORDER BY step_index'
      ).all(id);
      return {
        ...set,
        paths: rows.map(r => ({
          player_number: r.player_number,
          step_index: r.step_index ?? 0,
          path: JSON.parse(r.path)
        }))
      };
    },

    getAllSets() {
      return db.prepare('SELECT id, name, created_at FROM sets ORDER BY created_at DESC').all();
    },

    searchSets(q) {
      if (!q || String(q).trim() === '') return this.getAllSets();
      return db.prepare(
        "SELECT id, name, created_at FROM sets WHERE name LIKE ? ORDER BY created_at DESC"
      ).all(`%${String(q).trim()}%`);
    },

    updateSet(id, name) {
      const trimmed = validateSetName(name);
      if (!db.prepare('SELECT id FROM sets WHERE id = ?').get(id)) throw new SetNotFoundError(id);
      try {
        db.prepare("UPDATE sets SET name = ?, updated_at = datetime('now') WHERE id = ?").run([trimmed, id]);
        return db.prepare('SELECT * FROM sets WHERE id = ?').get(id);
      } catch (e) {
        if (e.message && e.message.includes('UNIQUE constraint')) throw new DuplicateNameError(trimmed);
        throw e;
      }
    },

    deleteSet(id) {
      if (!db.prepare('SELECT id FROM sets WHERE id = ?').get(id)) throw new SetNotFoundError(id);
      db.prepare('DELETE FROM sets WHERE id = ?').run(id);
    },

    savePaths(setId, paths) {
      validatePaths(paths);
      if (!db.prepare('SELECT id FROM sets WHERE id = ?').get(setId)) throw new SetNotFoundError(setId);
      const del = db.prepare('DELETE FROM player_paths WHERE set_id = ?');
      const ins = db.prepare(
        'INSERT INTO player_paths (set_id, player_number, step_index, path) VALUES (?, ?, ?, ?)'
      );
      db.exec('BEGIN');
      try {
        del.run(setId);
        for (const p of paths) ins.run([setId, p.player_number, p.step_index ?? 0, JSON.stringify(p.path)]);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    }
  };
}

module.exports = {
  validateSetName, validatePaths,
  createSetsService,
  ValidationError, SetNotFoundError, DuplicateNameError
};
```

- [ ] **Step 5: Run tests to verify all pass**

```
npm test
```

Expected: All tests PASS (including the 3 new step_index tests).

- [ ] **Step 6: Commit**

```
git add backend/models/db.js backend/services/setsService.js backend/tests/setsService.test.js
git commit -m "feat: add step_index to player_paths for multi-step recording"
```

---

## Task 2: field.js — steps data model

**Files:**
- Modify: `frontend/js/field.js`

- [ ] **Step 1: Replace the constructor and add new properties/methods**

Replace the entire `field.js` with the following (all draw/layout/hit-test code is unchanged; only constructor + path-related methods change):

```js
// Sixes lacrosse half-field: 36m wide × 35m deep (midline to end line)
// Goal at top (10m from end line = 25m from midline)
// Crease: 3m radius circle around goal
// X area: 10m behind goal (end line to 10m mark)
// All positions stored in metres; rendered scaled to fit the canvas.

const FIELD_W = 36;   // metres wide
const FIELD_H = 35;   // metres deep (midline at bottom, end line at top)
const GOAL_Y = 10;    // metres from end line (top)
const GOAL_W = 1.83;  // metres (6 ft)
const CREASE_R = 3;   // metres radius
const X_DEPTH = 10;   // metres from end line

const PLAYER_RADIUS = 14; // canvas pixels (fixed)
const BALL_RADIUS   = 9;  // canvas pixels (fixed)

const PLAYER_COLOUR    = '#e94560';
const PATH_COLOUR      = 'rgba(233, 69, 96, 0.6)';
const BALL_COLOUR      = '#ffd700';
const BALL_PATH_COLOUR = 'rgba(255, 215, 0, 0.75)';

const DEFAULT_PLAYERS = [
  { x: 18, y: 26 },
  { x: 11, y: 18 },
  { x: 25, y: 18 },
  { x: 18, y: 11 },
  { x:  8, y:  5 },
  { x: 28, y:  5 },
];
const DEFAULT_BALL = { x: 18, y: 14 };

export class Field {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this.players        = DEFAULT_PLAYERS.map(p => ({ ...p }));
    this.ball           = { ...DEFAULT_BALL };
    this.ballAttachedTo = null;

    this.steps = [{
      paths: Array.from({ length: 6 }, () => []),
      ballPath: [],
      startPositions: this.snapshotPositions()
    }];
    this.currentStepIndex = 0;

    this.showPaths = true;
    this._scale = 1;
    this._ox = 0;
    this._oy = 0;

    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  // ── Step accessors ────────────────────────────────────────

  get currentStep() { return this.steps[this.currentStepIndex]; }
  get stepCount()   { return this.steps.length; }

  // Transparent proxies so Recorder keeps working unchanged
  get paths()    { return this.currentStep.paths; }
  set paths(v)   { this.currentStep.paths = v; }
  get ballPath() { return this.currentStep.ballPath; }
  set ballPath(v){ this.currentStep.ballPath = v; }

  // ── Step management ───────────────────────────────────────

  addStep() {
    const startPositions = this.snapshotPositions();
    this.steps.splice(this.currentStepIndex + 1, 0, {
      paths: Array.from({ length: 6 }, () => []),
      ballPath: [],
      startPositions
    });
    this.currentStepIndex++;
  }

  deleteStep() {
    if (this.steps.length === 1) return;
    this.steps.splice(this.currentStepIndex, 1);
    this.currentStepIndex = Math.min(this.currentStepIndex, this.steps.length - 1);
    this.restorePositions(this.steps[this.currentStepIndex].startPositions);
  }

  goToStep(index) {
    if (index < 0 || index >= this.steps.length) return;
    this.currentStepIndex = index;
    this.restorePositions(this.steps[index].startPositions);
  }

  clearCurrentStepPaths() {
    this.currentStep.paths   = Array.from({ length: 6 }, () => []);
    this.currentStep.ballPath = [];
  }

  clearAllSteps() {
    this.players        = DEFAULT_PLAYERS.map(p => ({ ...p }));
    this.ball           = { ...DEFAULT_BALL };
    this.ballAttachedTo = null;
    this.steps = [{
      paths: Array.from({ length: 6 }, () => []),
      ballPath: [],
      startPositions: this.snapshotPositions()
    }];
    this.currentStepIndex = 0;
  }

  // Load from API response: [{player_number, step_index, path}]
  setStepsFromSaved(savedPaths) {
    const stepMap = new Map();
    for (const p of savedPaths) {
      const si = p.step_index ?? 0;
      if (!stepMap.has(si)) {
        stepMap.set(si, {
          paths: Array.from({ length: 6 }, () => []),
          ballPath: []
        });
      }
      const step = stepMap.get(si);
      if (p.player_number === 0) step.ballPath = p.path;
      else step.paths[p.player_number - 1] = p.path;
    }

    if (stepMap.size === 0) { this.clearAllSteps(); return; }

    const maxSi = Math.max(...stepMap.keys());

    // Determine positions before step 0 from first points of step-0 paths
    let curPlayers = DEFAULT_PLAYERS.map(p => ({ ...p }));
    let curBall    = { ...DEFAULT_BALL };
    const step0 = stepMap.get(0);
    if (step0) {
      for (let j = 0; j < 6; j++) {
        if (step0.paths[j].length >= 1) curPlayers[j] = { x: step0.paths[j][0].x, y: step0.paths[j][0].y };
      }
      if (step0.ballPath.length >= 1) curBall = { x: step0.ballPath[0].x, y: step0.ballPath[0].y };
    }

    this.steps = [];
    for (let i = 0; i <= maxSi; i++) {
      const step = stepMap.get(i) || { paths: Array.from({ length: 6 }, () => []), ballPath: [] };
      const startPositions = {
        players: curPlayers.map(p => ({ ...p })),
        ball: { ...curBall },
        ballAttachedTo: null
      };
      this.steps.push({ ...step, startPositions });

      // Advance positions to end of this step for next iteration
      for (let j = 0; j < 6; j++) {
        if (step.paths[j].length >= 1) {
          const last = step.paths[j][step.paths[j].length - 1];
          curPlayers[j] = { x: last.x, y: last.y };
        }
      }
      if (step.ballPath.length >= 1) {
        const last = step.ballPath[step.ballPath.length - 1];
        curBall = { x: last.x, y: last.y };
      }
    }

    this.currentStepIndex = 0;
    this.players        = this.steps[0].startPositions.players.map(p => ({ ...p }));
    this.ball           = { ...this.steps[0].startPositions.ball };
    this.ballAttachedTo = null;
  }

  // Flatten steps to API payload
  getStepsPayload() {
    const result = [];
    for (let si = 0; si < this.steps.length; si++) {
      const step = this.steps[si];
      for (let i = 0; i < 6; i++) {
        const recorded = step.paths[i];
        result.push({
          step_index: si,
          player_number: i + 1,
          path: recorded.length >= 2 ? recorded : [{ ...step.startPositions.players[i], t: 0 }]
        });
      }
      const bp      = step.ballPath;
      const ballPos = step.startPositions.ball;
      result.push({
        step_index: si,
        player_number: 0,
        path: bp.length >= 2 ? bp : [{ ...ballPos, t: 0 }]
      });
    }
    return result;
  }

  // ── Layout ────────────────────────────────────────────────

  _resize() {
    const area = this.canvas.parentElement;
    const aw = area.clientWidth;
    const ah = area.clientHeight;
    const padding = 32;
    const scaleX = (aw - padding * 2) / FIELD_W;
    const scaleY = (ah - padding * 2) / FIELD_H;
    this._scale = Math.min(scaleX, scaleY);

    const fw = FIELD_W * this._scale;
    const fh = FIELD_H * this._scale;
    this.canvas.width  = aw;
    this.canvas.height = ah;
    this._ox = (aw - fw) / 2;
    this._oy = (ah - fh) / 2;
    this.draw();
  }

  _px(mx) { return this._ox + mx * this._scale; }
  _py(my) { return this._oy + (FIELD_H - my) * this._scale; }

  mxFromPx(px) { return (px - this._ox) / this._scale; }
  myFromPy(py) { return FIELD_H - (py - this._oy) / this._scale; }

  // ── Draw ─────────────────────────────────────────────────

  draw(selectedEntity = null, recordingEntity = null) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this._drawField(ctx);
    if (this.showPaths) this._drawPaths(ctx);
    this._drawPlayers(ctx, selectedEntity, recordingEntity);
    this._drawBall(ctx, selectedEntity, recordingEntity);
  }

  _drawField(ctx) {
    const s = this._scale;
    const ox = this._ox, oy = this._oy;
    const fw = FIELD_W * s;
    const fh = FIELD_H * s;

    ctx.fillStyle = '#2d5a27';
    ctx.fillRect(ox, oy, fw, fh);

    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (let m = 0; m < FIELD_H; m += 10) {
      ctx.fillRect(ox, this._py(m + 10), fw, 5 * s);
    }

    const xTop = oy;
    const xBot = this._py(FIELD_H - X_DEPTH);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(ox, xTop, fw, xBot - xTop);

    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(ox, xBot);
    ctx.lineTo(ox + fw, xBot);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(ox, oy, fw, fh);

    ctx.beginPath();
    ctx.moveTo(ox, oy + fh);
    ctx.lineTo(ox + fw, oy + fh);
    ctx.stroke();

    const goalFieldY = FIELD_H - GOAL_Y;
    const cx = this._px(FIELD_W / 2);
    const cy = this._py(goalFieldY);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, CREASE_R * s, 0, Math.PI * 2);
    ctx.stroke();

    const gLeft  = this._px((FIELD_W - GOAL_W) / 2);
    const gRight = this._px((FIELD_W + GOAL_W) / 2);
    const gY     = this._py(goalFieldY);
    const goalDepth = 1.2 * s;

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(gLeft, gY);
    ctx.lineTo(gRight, gY);
    ctx.stroke();

    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(gLeft,  gY);
    ctx.lineTo(gLeft,  gY - goalDepth);
    ctx.lineTo(gRight, gY - goalDepth);
    ctx.lineTo(gRight, gY);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = `bold ${Math.max(14, 2 * s)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText('X', ox + fw / 2, xTop + (xBot - xTop) / 2 + 6);
  }

  _drawPaths(ctx) {
    ctx.lineJoin = 'round';
    ctx.lineCap  = 'round';

    for (let i = 0; i < 6; i++) {
      const path = this.currentStep.paths[i];
      if (path.length < 2) continue;
      ctx.strokeStyle = PATH_COLOUR;
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(this._px(path[0].x), this._py(path[0].y));
      for (let j = 1; j < path.length; j++) {
        ctx.lineTo(this._px(path[j].x), this._py(path[j].y));
      }
      ctx.stroke();
      this._drawArrow(ctx, path[path.length - 2], path[path.length - 1], PATH_COLOUR);
    }

    const ballPath = this.currentStep.ballPath;
    if (ballPath.length >= 2) {
      ctx.strokeStyle = BALL_PATH_COLOUR;
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 4]);
      ctx.beginPath();
      ctx.moveTo(this._px(ballPath[0].x), this._py(ballPath[0].y));
      for (let j = 1; j < ballPath.length; j++) {
        ctx.lineTo(this._px(ballPath[j].x), this._py(ballPath[j].y));
      }
      ctx.stroke();
      ctx.setLineDash([]);
      this._drawArrow(ctx, ballPath[ballPath.length - 2], ballPath[ballPath.length - 1], BALL_PATH_COLOUR);
    }

    ctx.setLineDash([]);
  }

  _drawArrow(ctx, from, to, colour) {
    const dx = this._px(to.x) - this._px(from.x);
    const dy = this._py(to.y) - this._py(from.y);
    const len = Math.hypot(dx, dy);
    if (len < 4) return;
    const ux = dx / len, uy = dy / len;
    const arrowLen = 10, arrowAngle = 0.45;
    const tx = this._px(to.x), ty = this._py(to.y);

    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(
      tx - arrowLen * (ux * Math.cos(arrowAngle)  - uy * Math.sin(arrowAngle)),
      ty - arrowLen * (uy * Math.cos(arrowAngle)  + ux * Math.sin(arrowAngle))
    );
    ctx.lineTo(
      tx - arrowLen * (ux * Math.cos(-arrowAngle) - uy * Math.sin(-arrowAngle)),
      ty - arrowLen * (uy * Math.cos(-arrowAngle) + ux * Math.sin(-arrowAngle))
    );
    ctx.closePath();
    ctx.fill();
  }

  _drawBall(ctx, selectedEntity, recordingEntity) {
    const { x, y } = this.ball;
    const px = this._px(x);
    const py = this._py(y);
    const isSelected  = selectedEntity  === 0;
    const isRecording = recordingEntity === 0;

    if (isRecording) {
      ctx.shadowColor = BALL_COLOUR;
      ctx.shadowBlur  = 14;
    }

    ctx.beginPath();
    ctx.arc(px, py, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = isRecording ? '#fff' : BALL_COLOUR;
    ctx.fill();
    ctx.strokeStyle = isSelected || isRecording ? '#fff' : 'rgba(255,255,255,0.6)';
    ctx.lineWidth   = isSelected || isRecording ? 2.5 : 1.5;
    ctx.stroke();

    ctx.shadowBlur = 0;
  }

  _drawPlayers(ctx, selectedEntity, recordingEntity) {
    for (let i = 0; i < 6; i++) {
      const { x, y } = this.players[i];
      const px = this._px(x);
      const py = this._py(y);
      const num = i + 1;
      const isSelected  = selectedEntity  === num;
      const isRecording = recordingEntity === num;

      if (isRecording) {
        ctx.shadowColor = '#e94560';
        ctx.shadowBlur  = 16;
      }

      ctx.beginPath();
      ctx.arc(px, py, PLAYER_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = isRecording ? '#ff6b6b' : (isSelected ? '#e94560' : '#c0392b');
      ctx.fill();
      ctx.strokeStyle = isSelected || isRecording ? '#fff' : 'rgba(255,255,255,0.5)';
      ctx.lineWidth   = isSelected || isRecording ? 2.5 : 1.5;
      ctx.stroke();

      ctx.shadowBlur = 0;

      ctx.fillStyle = '#fff';
      ctx.font = `bold 13px system-ui`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(num), px, py);
    }
    ctx.textBaseline = 'alphabetic';
  }

  // ── Hit testing ───────────────────────────────────────────

  playerAt(px, py) {
    for (let i = 0; i < 6; i++) {
      const cpx = this._px(this.players[i].x);
      const cpy = this._py(this.players[i].y);
      if (Math.hypot(px - cpx, py - cpy) <= PLAYER_RADIUS + 4) return i + 1;
    }
    const bpx = this._px(this.ball.x);
    const bpy = this._py(this.ball.y);
    if (Math.hypot(px - bpx, py - bpy) <= BALL_RADIUS + 4) return 0;
    return null;
  }

  movePlayer(entity, px, py) {
    const mx = Math.max(0, Math.min(FIELD_W, this.mxFromPx(px)));
    const my = Math.max(0, Math.min(FIELD_H, this.myFromPy(py)));
    if (entity === 0) {
      this.ball = { x: mx, y: my };
    } else {
      this.players[entity - 1] = { x: mx, y: my };
      if (this.ballAttachedTo === entity) this.ball = { x: mx, y: my };
    }
  }

  attachBallTo(playerNum) {
    this.ballAttachedTo = playerNum;
    this.ball = { ...this.players[playerNum - 1] };
  }

  detachBall() {
    this.ballAttachedTo = null;
  }

  ballOverlapsPlayer() {
    const bpx = this._px(this.ball.x);
    const bpy = this._py(this.ball.y);
    for (let i = 0; i < 6; i++) {
      const cpx = this._px(this.players[i].x);
      const cpy = this._py(this.players[i].y);
      if (Math.hypot(bpx - cpx, bpy - cpy) <= PLAYER_RADIUS + BALL_RADIUS) return i + 1;
    }
    return null;
  }

  // ── Snapshot / restore ────────────────────────────────────

  snapshotPositions() {
    return {
      players:        this.players.map(p => ({ ...p })),
      ball:           { ...this.ball },
      ballAttachedTo: this.ballAttachedTo
    };
  }

  restorePositions(snapshot) {
    this.players        = snapshot.players.map(p => ({ ...p }));
    this.ball           = { ...snapshot.ball };
    this.ballAttachedTo = snapshot.ballAttachedTo ?? null;
  }
}
```

- [ ] **Step 2: Verify the page still loads without errors**

Open `http://localhost:3000` in a browser. Expected: field renders, no console errors.

- [ ] **Step 3: Commit**

```
git add frontend/js/field.js
git commit -m "feat: replace flat paths with steps[] data model in Field"
```

---

## Task 3: animator.js — sequential step playback

**Files:**
- Modify: `frontend/js/animator.js`

- [ ] **Step 1: Rewrite animator.js**

Replace the entire file:

```js
// Animates steps sequentially. Within each step all players move simultaneously.

export class Animator {
  constructor(field) {
    this.field = field;
    this._rafId = null;
    this._stepStartWall = null;
    this._stepDuration  = 0;
    this._snapshot      = null;
    this.state          = 'IDLE';
    this._currentStepIdx       = 0;
    this._stepElapsedAtPause   = 0;
    this._allSteps      = [];
    this._stepDurations = [];
    this.onStateChange  = null;
  }

  // ── Public API ────────────────────────────────────────────

  play() {
    if (this.state === 'PLAYING') return;

    if (this.state === 'IDLE') {
      this._allSteps      = this.field.steps;
      this._stepDurations = this._allSteps.map(step => {
        let max = step.paths.reduce((m, p) => p.length < 2 ? m : Math.max(m, p[p.length - 1].t), 0);
        if (step.ballPath.length >= 2) max = Math.max(max, step.ballPath[step.ballPath.length - 1].t);
        return max;
      });
      if (this._stepDurations.every(d => d === 0)) return;
      this._snapshot             = this.field.snapshotPositions();
      this._currentStepIdx       = 0;
      this._stepElapsedAtPause   = 0;
      // Skip leading empty steps
      while (
        this._currentStepIdx < this._allSteps.length &&
        this._stepDurations[this._currentStepIdx] === 0
      ) this._currentStepIdx++;
    }

    this.state = 'PLAYING';
    this._startCurrentStep();
    this.onStateChange?.();
  }

  pause() {
    if (this.state !== 'PLAYING') return;
    this._stepElapsedAtPause = performance.now() - this._stepStartWall;
    cancelAnimationFrame(this._rafId);
    this._rafId = null;
    this.state  = 'PAUSED';
    this.onStateChange?.();
  }

  stop() {
    cancelAnimationFrame(this._rafId);
    this._rafId = null;
    this.state  = 'IDLE';
    this._stepElapsedAtPause = 0;
    if (this._snapshot) {
      this.field.restorePositions(this._snapshot);
      this._snapshot = null;
    }
    this.field.draw();
    this.onStateChange?.();
  }

  // ── Internals ─────────────────────────────────────────────

  _startCurrentStep() {
    const step = this._allSteps[this._currentStepIdx];
    this.field.restorePositions(step.startPositions);
    this._stepDuration  = this._stepDurations[this._currentStepIdx];
    this._stepStartWall = performance.now() - this._stepElapsedAtPause;
    this._stepElapsedAtPause = 0;
    this._tick();
  }

  _tick() {
    this._rafId = requestAnimationFrame((now) => {
      const elapsed = now - this._stepStartWall;
      const step    = this._allSteps[this._currentStepIdx];

      for (let i = 0; i < 6; i++) {
        const path = step.paths[i];
        if (path.length < 2) continue;
        this.field.players[i] = this._interpolate(path, elapsed);
      }
      const bp = step.ballPath;
      if (bp.length >= 2) {
        this.field.ball = this._interpolate(bp, elapsed);
      } else if (this.field.ballAttachedTo !== null) {
        this.field.ball = { ...this.field.players[this.field.ballAttachedTo - 1] };
      }

      this.field.draw(null, null);

      if (elapsed >= this._stepDuration) {
        this._snapToStepEnd(this._currentStepIdx);

        // Find next step with actual paths
        let nextIdx = this._currentStepIdx + 1;
        while (nextIdx < this._allSteps.length && this._stepDurations[nextIdx] === 0) nextIdx++;

        if (nextIdx < this._allSteps.length) {
          this._currentStepIdx     = nextIdx;
          this._stepElapsedAtPause = 0;
          this._startCurrentStep();
        } else {
          this.state = 'IDLE';
          this._stepElapsedAtPause = 0;
          this.field.restorePositions(this._snapshot);
          this._snapshot = null;
          this.field.draw();
          this.onStateChange?.();
        }
        return;
      }

      this._tick();
    });
  }

  _snapToStepEnd(stepIdx) {
    const step = this._allSteps[stepIdx];
    for (let i = 0; i < 6; i++) {
      const path = step.paths[i];
      if (path.length >= 2) {
        this.field.players[i] = { x: path[path.length - 1].x, y: path[path.length - 1].y };
      }
    }
    const bp = step.ballPath;
    if (bp.length >= 2) {
      this.field.ball = { x: bp[bp.length - 1].x, y: bp[bp.length - 1].y };
    }
  }

  _interpolate(path, elapsed) {
    if (elapsed <= path[0].t) return { x: path[0].x, y: path[0].y };
    const last = path[path.length - 1];
    if (elapsed >= last.t) return { x: last.x, y: last.y };

    let lo = 0, hi = path.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (path[mid].t <= elapsed) lo = mid; else hi = mid;
    }

    const a = path[lo], b = path[hi];
    const frac = (elapsed - a.t) / (b.t - a.t);
    return {
      x: a.x + (b.x - a.x) * frac,
      y: a.y + (b.y - a.y) * frac,
    };
  }
}
```

- [ ] **Step 2: Verify playback in browser**

1. Open `http://localhost:3000`
2. Select player 1, record a path
3. Click Play → verify the path animates correctly and playback returns to original position on finish
4. Verify Pause and Stop still work

- [ ] **Step 3: Commit**

```
git add frontend/js/animator.js
git commit -m "feat: animator plays steps sequentially"
```

---

## Task 4: sets-ui.js — save/load steps

**Files:**
- Modify: `frontend/js/sets-ui.js`

- [ ] **Step 1: Update `_savePaths` to use `getStepsPayload`**

Replace the `_savePaths` method:

```js
async _savePaths() {
  if (!this.activeSetId) return;
  const paths = this.field.getStepsPayload();
  try {
    await this._fetch(`${API}/${this.activeSetId}/paths`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths })
    });
    this.onStatus('Paths saved');
  } catch (e) {
    this.onStatus(`Error saving: ${e.message}`);
  }
}
```

- [ ] **Step 2: Update `_loadSet` to use `setStepsFromSaved`**

In `_loadSet`, replace the line:
```js
this.field.setPathsFromSaved(set.paths);
```
with:
```js
this.field.setStepsFromSaved(set.paths);
```

- [ ] **Step 3: Update `_deleteSet` to use `clearAllSteps`**

In `_deleteSet`, replace:
```js
this.field.clearPaths();
```
with:
```js
this.field.clearAllSteps();
```

- [ ] **Step 4: Verify save and load in browser**

1. Create a new set
2. Record paths for 2 players
3. Add a step, record a path for player 3
4. Save → reload page → load the set
5. Verify: step count is 2, step 1 shows player 1+2 paths, step 2 shows player 3 path

- [ ] **Step 5: Commit**

```
git add frontend/js/sets-ui.js
git commit -m "feat: save/load step-aware paths via getStepsPayload / setStepsFromSaved"
```

---

## Task 5: index.html + app.js — step navigation UI

**Files:**
- Modify: `frontend/index.html`
- Modify: `frontend/js/app.js`

- [ ] **Step 1: Add step controls to index.html**

In `index.html`, inside `<section id="record-section">`, add after `<h2>Record</h2>`:

```html
<div id="step-nav">
  <button id="btn-step-prev">←</button>
  <span id="step-indicator">Adım 1 / 1</span>
  <button id="btn-step-next">→</button>
</div>
<div id="step-controls">
  <button id="btn-add-step">+ Yeni Adım</button>
  <button id="btn-del-step">× Adımı Sil</button>
</div>
```

So the full record section becomes:

```html
<section id="record-section">
  <h2>Record</h2>
  <div id="step-nav">
    <button id="btn-step-prev">←</button>
    <span id="step-indicator">Adım 1 / 1</span>
    <button id="btn-step-next">→</button>
  </div>
  <div id="step-controls">
    <button id="btn-add-step">+ Yeni Adım</button>
    <button id="btn-del-step">× Adımı Sil</button>
  </div>
  <div id="player-buttons"></div>
  <div id="record-controls">
    <button id="btn-record" disabled>Record Player</button>
    <button id="btn-stop" disabled>Stop</button>
    <button id="btn-clear" disabled>Clear Paths</button>
  </div>
  <label id="toggle-paths-label">
    <input id="toggle-paths" type="checkbox" checked />
    Show paths
  </label>
</section>
```

- [ ] **Step 2: Wire step controls in app.js**

Replace the entire `app.js`:

```js
import { Field }    from './field.js';
import { Recorder } from './recorder.js';
import { Animator } from './animator.js';
import { SetsUI }   from './sets-ui.js';

const canvas        = document.getElementById('field-canvas');
const statusBar     = document.getElementById('status-bar');
const btnRecord     = document.getElementById('btn-record');
const btnStop       = document.getElementById('btn-stop');
const btnClear      = document.getElementById('btn-clear');
const btnPlay       = document.getElementById('btn-play');
const btnPause      = document.getElementById('btn-pause');
const btnSave       = document.getElementById('btn-save');
const togglePaths   = document.getElementById('toggle-paths');
const playerBtns    = document.getElementById('player-buttons');
const btnStepPrev   = document.getElementById('btn-step-prev');
const btnStepNext   = document.getElementById('btn-step-next');
const stepIndicator = document.getElementById('step-indicator');
const btnAddStep    = document.getElementById('btn-add-step');
const btnDelStep    = document.getElementById('btn-del-step');

const field    = new Field(canvas);
const recorder = new Recorder(field, canvas);
const animator = new Animator(field);

// ── Player selector buttons (1–6) + ball (0) ────────────────
for (let i = 1; i <= 6; i++) {
  const btn = document.createElement('button');
  btn.className = 'player-btn';
  btn.textContent = String(i);
  btn.dataset.player = i;
  btn.addEventListener('click', () => {
    if (recorder.state === 'RECORDING') return;
    recorder.selectPlayer(i);
    syncUI();
  });
  playerBtns.appendChild(btn);
}

const ballBtn = document.createElement('button');
ballBtn.className = 'player-btn ball-btn';
ballBtn.textContent = '⬤';
ballBtn.title = 'Ball';
ballBtn.dataset.player = 0;
ballBtn.addEventListener('click', () => {
  if (recorder.state === 'RECORDING') return;
  recorder.selectPlayer(0);
  syncUI();
});
playerBtns.appendChild(ballBtn);

// ── Record controls ──────────────────────────────────────────
btnRecord.addEventListener('click', () => {
  recorder.startRecording();
  syncUI();
});

btnStop.addEventListener('click', () => {
  recorder.stopRecording();
  field.draw(recorder.selectedPlayer, null);
  syncUI();
});

btnClear.addEventListener('click', () => {
  if (recorder.state === 'RECORDING') return;
  field.clearCurrentStepPaths();
  field.draw(recorder.selectedPlayer, null);
  setStatus('Paths cleared');
});

// ── Step controls ────────────────────────────────────────────
btnStepPrev.addEventListener('click', () => {
  field.goToStep(field.currentStepIndex - 1);
  field.draw(recorder.selectedPlayer, null);
  syncUI();
});

btnStepNext.addEventListener('click', () => {
  field.goToStep(field.currentStepIndex + 1);
  field.draw(recorder.selectedPlayer, null);
  syncUI();
});

btnAddStep.addEventListener('click', () => {
  if (recorder.state === 'RECORDING') return;
  field.addStep();
  field.draw(recorder.selectedPlayer, null);
  syncUI();
});

btnDelStep.addEventListener('click', () => {
  if (recorder.state === 'RECORDING') return;
  field.deleteStep();
  field.draw(recorder.selectedPlayer, null);
  syncUI();
});

// ── Playback controls ────────────────────────────────────────
btnPlay.addEventListener('click', () => {
  if (animator.state === 'IDLE' || animator.state === 'PAUSED') animator.play();
  syncUI();
});

btnPause.addEventListener('click', () => {
  animator.pause();
  syncUI();
});

animator.onStateChange = () => syncUI();

// ── Toggle paths ─────────────────────────────────────────────
togglePaths.addEventListener('change', () => {
  field.showPaths = togglePaths.checked;
  field.draw(recorder.selectedPlayer, recorder.activePlayer);
});

// ── Recorder change hook ─────────────────────────────────────
recorder.onChange = () => {
  field.draw(recorder.selectedPlayer, recorder.activePlayer);
  syncUI();
};

// ── Sets UI ──────────────────────────────────────────────────
new SetsUI({
  field,
  recorder,
  animator,
  onSetLoaded: () => syncUI(),
  onStatus: setStatus
});

// ── Sync button states ───────────────────────────────────────
function syncUI() {
  const isRecording = recorder.state === 'RECORDING';
  const isPlaying   = animator.state === 'PLAYING';
  const isPaused    = animator.state === 'PAUSED';
  const hasPlayer   = recorder.selectedPlayer !== null;
  const stepIdx     = field.currentStepIndex;
  const stepTotal   = field.stepCount;

  // Player buttons
  for (const btn of playerBtns.querySelectorAll('.player-btn')) {
    const num = Number(btn.dataset.player);
    btn.classList.toggle('selected', num === recorder.selectedPlayer);
    btn.disabled = isRecording;
  }

  // Step nav
  stepIndicator.textContent     = `Adım ${stepIdx + 1} / ${stepTotal}`;
  btnStepPrev.disabled          = isRecording || isPlaying || stepIdx === 0;
  btnStepNext.disabled          = isRecording || isPlaying || stepIdx >= stepTotal - 1;
  btnAddStep.disabled           = isRecording || isPlaying;
  btnDelStep.disabled           = isRecording || isPlaying || stepTotal <= 1;

  btnRecord.disabled = !hasPlayer || isRecording || isPlaying;
  btnStop.disabled   = !isRecording;
  btnClear.disabled  = isRecording || isPlaying;
  btnPlay.disabled   = isRecording || isPlaying;
  btnPause.disabled  = !isPlaying;
  btnSave.disabled   = isRecording || isPlaying || !document.querySelector('#set-list li.active');

  if (isRecording) setStatus(`Recording ${recorder.activePlayer === 0 ? 'ball' : `player ${recorder.activePlayer}`}… release mouse to stop`);
  else if (isPlaying) setStatus('Playing…');
  else if (isPaused) setStatus('Paused');
}

function setStatus(msg) {
  statusBar.textContent = msg;
}

syncUI();
```

- [ ] **Step 3: Verify the full flow in browser**

1. Open `http://localhost:3000`
2. Verify step counter shows "Adım 1 / 1"
3. Select player 5, record a path to the right
4. Click **+ Yeni Adım** → counter shows "Adım 2 / 2", player 5 is now at the end of his path
5. Select player 3, record a path toward player 5's new position
6. Click **←** → goes back to Adım 1, players reset to step 1 start positions, step 1 paths are shown
7. Click **Play** → player 5 moves, then player 3 moves (sequential)
8. Click **+ Yeni Adım** again, record two players simultaneously
9. Click **Play** → step 1 then step 2 (both players move at once in step 2)
10. Verify **Pause** / **Stop** work during playback

- [ ] **Step 4: Commit**

```
git add frontend/index.html frontend/js/app.js
git commit -m "feat: add step navigation UI — Yeni Adım, delete, prev/next arrows"
```
