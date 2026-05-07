// Animates all 6 players simultaneously using their recorded {x,y,t} paths.
// Players without a multi-point path stay stationary at their last position.

export class Animator {
  constructor(field) {
    this.field = field;
    this._rafId = null;
    this._startWall = null;  // performance.now() at playback start
    this._duration = 0;      // total animation duration in ms
    this._snapshot = null;   // player positions before playback (restored on stop)
    this.state = 'IDLE';     // 'IDLE' | 'PLAYING' | 'PAUSED'
    this._pausedAt = 0;      // elapsed ms when paused
    this.onStateChange = null;
  }

  // ── Public API ────────────────────────────────────────────

  play() {
    if (this.state === 'PLAYING') return;

    const paths = this.field.paths;
    let maxT = paths.reduce((max, p) => {
      if (p.length < 2) return max;
      return Math.max(max, p[p.length - 1].t);
    }, 0);
    const bp = this.field.ballPath;
    if (bp.length >= 2) maxT = Math.max(maxT, bp[bp.length - 1].t);
    this._duration = maxT;

    if (this._duration === 0) return; // nothing to play

    if (this.state === 'IDLE') {
      this._snapshot = this.field.snapshotPositions();
      this._pausedAt = 0;
    }

    this.state = 'PLAYING';
    this._startWall = performance.now() - this._pausedAt;
    this._tick();
    this.onStateChange?.();
  }

  pause() {
    if (this.state !== 'PLAYING') return;
    this._pausedAt = performance.now() - this._startWall;
    cancelAnimationFrame(this._rafId);
    this._rafId = null;
    this.state = 'PAUSED';
    this.onStateChange?.();
  }

  stop() {
    cancelAnimationFrame(this._rafId);
    this._rafId = null;
    this.state = 'IDLE';
    this._pausedAt = 0;
    if (this._snapshot) {
      this.field.restorePositions(this._snapshot);
      this._snapshot = null;
    }
    this.field.draw();
    this.onStateChange?.();
  }

  // ── Internals ─────────────────────────────────────────────

  _tick() {
    this._rafId = requestAnimationFrame((now) => {
      const elapsed = now - this._startWall;

      for (let i = 0; i < 6; i++) {
        const path = this.field.paths[i];
        if (path.length < 2) continue;
        this.field.players[i] = this._interpolate(path, elapsed);
      }
      const bp = this.field.ballPath;
      if (bp.length >= 2) {
        this.field.ball = this._interpolate(bp, elapsed);
      } else if (this.field.ballAttachedTo !== null) {
        this.field.ball = { ...this.field.players[this.field.ballAttachedTo - 1] };
      }

      this.field.draw(null, null);

      if (elapsed >= this._duration) {
        this.state = 'IDLE';
        this._pausedAt = 0;
        if (this._snapshot) {
          this.field.restorePositions(this._snapshot);
          this._snapshot = null;
        }
        this.field.draw();
        this.onStateChange?.();
        return;
      }

      this._tick();
    });
  }

  _interpolate(path, elapsed) {
    if (elapsed <= path[0].t) return { x: path[0].x, y: path[0].y };
    const last = path[path.length - 1];
    if (elapsed >= last.t) return { x: last.x, y: last.y };

    // Binary-search for the surrounding segment
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
