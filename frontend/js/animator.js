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
    this._speed         = 1;
    this.onStateChange  = null;
  }

  setSpeed(s) {
    this._speed = Math.max(0.25, Math.min(4, s));
  }

  // ── Public API ────────────────────────────────────────────

  play() {
    if (this.state === 'PLAYING') return;

    if (this.state === 'IDLE') {
      this.field.recomputeStartPositions();
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
    this._stepElapsedAtPause = (performance.now() - this._stepStartWall) * this._speed;
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
    this._stepStartWall = performance.now() - this._stepElapsedAtPause / this._speed;
    this._stepElapsedAtPause = 0;
    this._tick();
  }

  _tick() {
    this._rafId = requestAnimationFrame((now) => {
      const elapsed = (now - this._stepStartWall) * this._speed;
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

      this.field.draw(null, null, step);

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

    const frac = (elapsed - path[lo].t) / (path[hi].t - path[lo].t);

    // Catmull-Rom spline: smooth curve through all recorded points, no data loss
    const p0 = path[Math.max(0, lo - 1)];
    const p1 = path[lo];
    const p2 = path[hi];
    const p3 = path[Math.min(path.length - 1, hi + 1)];

    const t = frac, t2 = t * t, t3 = t2 * t;
    return {
      x: 0.5 * ((2*p1.x) + (-p0.x + p2.x)*t + (2*p0.x - 5*p1.x + 4*p2.x - p3.x)*t2 + (-p0.x + 3*p1.x - 3*p2.x + p3.x)*t3),
      y: 0.5 * ((2*p1.y) + (-p0.y + p2.y)*t + (2*p0.y - 5*p1.y + 4*p2.y - p3.y)*t2 + (-p0.y + 3*p1.y - 3*p2.y + p3.y)*t3),
    };
  }
}
