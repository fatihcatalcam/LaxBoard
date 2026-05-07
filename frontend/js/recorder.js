// State machine: IDLE → RECORDING → IDLE
// Records one player at a time via mousedown → mousemove → mouseup on the canvas.

export class Recorder {
  constructor(field, canvas) {
    this.field = field;
    this.canvas = canvas;

    this.state = 'IDLE';        // 'IDLE' | 'RECORDING'
    this.selectedPlayer = null; // 0 (ball) or 1–6
    this.activePlayer = null;   // entity being recorded right now
    this._currentPath = [];
    this._recordStart = null;   // high-res timestamp when recording started
    this._dragging = false;

    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp   = this._onMouseUp.bind(this);
    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchMove  = this._onTouchMove.bind(this);
    this._onTouchEnd   = this._onTouchEnd.bind(this);

    canvas.addEventListener('mousedown', this._onMouseDown);
    canvas.addEventListener('mousemove', this._onMouseMove);
    canvas.addEventListener('mouseup',   this._onMouseUp);
    canvas.addEventListener('touchstart', this._onTouchStart, { passive: false });
    canvas.addEventListener('touchmove',  this._onTouchMove,  { passive: false });
    canvas.addEventListener('touchend',   this._onTouchEnd,   { passive: false });
  }

  // ── Public API ────────────────────────────────────────────

  selectPlayer(num) {
    if (this.state === 'RECORDING') return;
    this.selectedPlayer = num;
    this.onChange?.();
  }

  startRecording() {
    if (this.selectedPlayer === null || this.state !== 'IDLE') return;
    this.state = 'RECORDING';
    this.activePlayer = this.selectedPlayer;
    this._currentPath = [];
    this._recordStart = null;
    this.canvas.classList.add('recording');
    this.onChange?.();
  }

  stopRecording() {
    if (this.state !== 'RECORDING') return;
    this._commitPath();
    this.state = 'IDLE';
    this.activePlayer = null;
    this.canvas.classList.remove('recording');
    this.onChange?.();
  }

  // ── Mouse handlers ────────────────────────────────────────

  _onMouseDown(e) {
    const { x, y } = this._canvasXY(e);
    if (this.state === 'RECORDING') {
      this._dragging = true;
      this._addPoint(x, y, e.timeStamp);
      return;
    }
    // IDLE: click a player or the ball to select
    const hit = this.field.playerAt(x, y);
    if (hit !== null) {
      this.selectPlayer(hit);
      this.field.draw(this.selectedPlayer, this.activePlayer);
    }
  }

  _onMouseMove(e) {
    if (this.state !== 'RECORDING' || !this._dragging) return;
    const { x, y } = this._canvasXY(e);
    this._addPoint(x, y, e.timeStamp);
    this.field.draw(this.selectedPlayer, this.activePlayer);
  }

  _onMouseUp(e) {
    if (this.state !== 'RECORDING' || !this._dragging) return;
    this._dragging = false;
    const { x, y } = this._canvasXY(e);
    this._addPoint(x, y, e.timeStamp);
    this.stopRecording();
    this.field.draw(this.selectedPlayer, this.activePlayer);
  }

  // ── Touch handlers ────────────────────────────────────────

  _onTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    this._onMouseDown({ ...touch, timeStamp: e.timeStamp });
  }

  _onTouchMove(e) {
    e.preventDefault();
    const touch = e.touches[0];
    this._onMouseMove({ ...touch, timeStamp: e.timeStamp });
  }

  _onTouchEnd(e) {
    e.preventDefault();
    const touch = e.changedTouches[0];
    this._onMouseUp({ ...touch, timeStamp: e.timeStamp });
  }

  // ── Internals ─────────────────────────────────────────────

  _canvasXY(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  _addPoint(px, py, timestamp) {
    if (this._recordStart === null) this._recordStart = timestamp;
    const t = timestamp - this._recordStart;
    const mx = this.field.mxFromPx(px);
    const my = this.field.myFromPy(py);
    // Move the player live
    this.field.movePlayer(this.activePlayer, px, py);
    this._currentPath.push({ x: mx, y: my, t });
  }

  _commitPath() {
    if (this._currentPath.length === 0) return;
    if (this.activePlayer === 0) {
      this.field.ballPath = this._currentPath;
    } else {
      this.field.paths[this.activePlayer - 1] = this._currentPath;
    }
    this._currentPath = [];
  }
}
