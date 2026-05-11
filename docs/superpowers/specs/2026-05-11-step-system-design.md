# Step System Design

**Date:** 2026-05-11  
**Topic:** Sequential and simultaneous player movement in playback

## Problem

Currently all recorded player paths start at t=0 and play simultaneously. Users need control over timing: some movements should be sequential (player 5 moves, then player 3 follows), while others must be simultaneous (interchange — two players swap positions at the same time).

## Solution: Step/Phase System

A "set" contains one or more **steps**. Within a step all movements play simultaneously. Steps play sequentially, one after the other.

- Simultaneous movement → same step
- Sequential movement → different steps
- Number of steps per set is unlimited and varies per set

---

## Data Model

### Current
```js
field.paths    = [p1, p2, p3, p4, p5, p6]
field.ballPath = [...]
```

### New
```js
field.steps = [
  { paths: [null, null, p3, null, p5, null], ballPath: [] },
  { paths: [null, p2, null, p4, null, null], ballPath: [...] },
]
field.currentStepIndex = 0
```

Each step holds 6 player path slots (null = no movement in this step) and an optional ball path. Player positions carry over between steps: end positions of step N become start positions of step N+1.

---

## UI Changes

The **Record** section in the sidebar gains step navigation and management:

```
┌─────────────────────────────┐
│  Record                     │
│  ← Adım 1 / 3 →            │
│  [Player butonları]         │
│  [Record] [Stop] [Clear]    │
│  [+ Yeni Adım] [× Adımı Sil]│
└─────────────────────────────┘
```

- **← →** arrows: navigate between steps. Viewing a previous step shows players at that step's start positions; re-recording is possible.
- **Adım N / Total** counter: always visible so user knows where they are.
- **+ Yeni Adım**: creates a new step after the current one. Player positions automatically carry over from the current step's end positions.
- **× Adımı Sil**: deletes the current step. At least 1 step always remains.
- **Clear Paths**: clears only the active step's paths (unchanged behavior, now scoped to current step).

Playback controls (Play/Pause/Stop) are unchanged in appearance.

---

## Animator Changes

The Animator plays steps sequentially:

1. Play step 0 (all paths in this step animate simultaneously)
2. When step 0 finishes, snap players to step 0 end positions
3. Play step 1
4. Repeat until all steps complete

**Rules:**
- Each step's duration = the longest path `t` value in that step
- No pause between steps — continuous playback
- Players with no path in a step stay stationary at their carried-over position
- Pause/Stop operate globally across all steps
- Stop restores positions to before step 0 started (original snapshot)
- Resume after Pause continues from the same step and elapsed time

---

## Backend / Storage

### New JSON format
```json
{
  "steps": [
    { "paths": [...], "ballPath": [...] },
    { "paths": [...], "ballPath": [...] }
  ]
}
```

### Backward compatibility
On set load, if `steps` is absent the old format `{ paths, ballPath }` is detected and wrapped automatically:
```js
if (!data.steps) data = { steps: [{ paths: data.paths, ballPath: data.ballPath }] };
```
Old sets work without migration. On next save they are written in the new format.

Backend schema (SQLite) does not change — set data is stored as a JSON blob.

---

## Files Affected

| File | Change |
|------|--------|
| `frontend/js/field.js` | Replace `paths`/`ballPath` with `steps[]` + `currentStepIndex`; add step CRUD helpers |
| `frontend/js/recorder.js` | Write to `field.steps[currentStepIndex]` instead of flat `field.paths` |
| `frontend/js/animator.js` | Loop through steps sequentially instead of single-pass |
| `frontend/js/app.js` | Add step navigation UI and wire new buttons |
| `frontend/index.html` | Add step counter, nav arrows, New Step and Delete Step buttons |
| `backend/routes/sets.js` | Apply backward-compat wrapper on load |
