// State machine: IDLE → RECORDING → IDLE
//
// IDLE:      click+drag freely moves any player or the ball (no Record needed)
//            short tap (< DRAG_THRESHOLD px) selects entity for recording
// RECORDING: mousedown → mousemove → mouseup records the active entity's path

const DRAG_THRESHOLD = 5; // px — below this is a tap (select), above is a drag

export class Recorder {
  constructor(field, canvas) {
    this.field  = field;
    this.canvas = canvas;

    this.state          = 'IDLE';
    this.selectedPlayer = null; // 0 (ball) or 1–6
    this.activePlayer   = null; // entity being recorded right now

    this._currentPath     = [];
    this._currentBallPath = []; // co-recorded ball path when ball is attached during recording
    this._recordStart     = null;
    this._dragging        = false; // recording drag active

    this._freeDragging    = false; // IDLE free-drag active
    this._freeDragEntity  = null;
    this._freeDragStartPx = null;

    this._onMouseDown  = this._onMouseDown.bind(this);
    this._onMouseMove  = this._onMouseMove.bind(this);
    this._onMouseUp    = this._onMouseUp.bind(this);
    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchMove  = this._onTouchMove.bind(this);
    this._onTouchEnd   = this._onTouchEnd.bind(this);

    canvas.addEventListener('mousedown',  this._onMouseDown);
    canvas.addEventListener('mousemove',  this._onMouseMove);
    canvas.addEventListener('mouseup',    this._onMouseUp);
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
    this.state            = 'RECORDING';
    this.activePlayer     = this.selectedPlayer;
    this._currentPath     = [];
    this._currentBallPath = [];
    this._recordStart     = null;
    this._dragging        = false;
    this.canvas.classList.add('recording');
    this.onChange?.();
  }

  stopRecording() {
    if (this.state !== 'RECORDING') return;
    this._commitPath();
    this.state        = 'IDLE';
    this.activePlayer = null;
    this._dragging    = false;
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

    // IDLE: start free-drag if we hit a player or the ball
    const hit = this.field.playerAt(x, y);
    if (hit !== null) {
      if (hit === 0) this.field.detachBall(); // picking up ball detaches it
      this._freeDragging    = true;
      this._freeDragEntity  = hit;
      this._freeDragStartPx = { x, y };
      this.canvas.classList.add('free-dragging');
    }
  }

  _onMouseMove(e) {
    const { x, y } = this._canvasXY(e);

    if (this.state === 'RECORDING') {
      if (!this._dragging) return;
      this._addPoint(x, y, e.timeStamp);
      this.field.draw(this.selectedPlayer, this.activePlayer);
      return;
    }

    if (this._freeDragging) {
      this.field.movePlayer(this._freeDragEntity, x, y);
      this.field.draw(this.selectedPlayer, null);
    }
  }

  _onMouseUp(e) {
    const { x, y } = this._canvasXY(e);

    if (this.state === 'RECORDING') {
      if (!this._dragging) return;
      this._dragging = false;
      this._addPoint(x, y, e.timeStamp);
      this.stopRecording();
      this.field.draw(this.selectedPlayer, null);
      return;
    }

    if (!this._freeDragging) return;

    const moved = this._freeDragStartPx
      ? Math.hypot(x - this._freeDragStartPx.x, y - this._freeDragStartPx.y)
      : Infinity;

    if (moved <= DRAG_THRESHOLD) {
      // Tap — select entity for recording
      this.selectPlayer(this._freeDragEntity);
    } else {
      // Drag — finalize position
      this.field.movePlayer(this._freeDragEntity, x, y);
      // If ball was dragged onto a player, attach it
      if (this._freeDragEntity === 0) {
        const under = this.field.ballOverlapsPlayer();
        if (under !== null) this.field.attachBallTo(under);
      }
    }

    this._freeDragging    = false;
    this._freeDragEntity  = null;
    this._freeDragStartPx = null;
    this.canvas.classList.remove('free-dragging');
    this.field.draw(this.selectedPlayer, null);
  }

  // ── Touch handlers ────────────────────────────────────────

  _onTouchStart(e) {
    e.preventDefault();
    const t = e.touches[0];
    this._onMouseDown({ clientX: t.clientX, clientY: t.clientY, timeStamp: e.timeStamp });
  }

  _onTouchMove(e) {
    e.preventDefault();
    const t = e.touches[0];
    this._onMouseMove({ clientX: t.clientX, clientY: t.clientY, timeStamp: e.timeStamp });
  }

  _onTouchEnd(e) {
    e.preventDefault();
    const t = e.changedTouches[0];
    this._onMouseUp({ clientX: t.clientX, clientY: t.clientY, timeStamp: e.timeStamp });
  }

  // ── Internals ─────────────────────────────────────────────

  _canvasXY(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  _addPoint(px, py, timestamp) {
    if (this._recordStart === null) this._recordStart = timestamp;
    const t  = timestamp - this._recordStart;
    const mx = this.field.mxFromPx(px);
    const my = this.field.myFromPy(py);
    this.field.movePlayer(this.activePlayer, px, py);
    this._currentPath.push({ x: mx, y: my, t });
    // Co-record ball path when it's attached to the player being recorded
    if (this.activePlayer !== 0 && this.field.ballAttachedTo === this.activePlayer) {
      this._currentBallPath.push({ x: mx, y: my, t });
    }
  }

  _commitPath() {
    if (this._currentPath.length === 0) return;
    if (this.activePlayer === 0) {
      this.field.ballPath = this._currentPath;
    } else {
      this.field.paths[this.activePlayer - 1] = this._currentPath;
      if (this._currentBallPath.length >= 2) {
        this.field.ballPath = this._currentBallPath;
      }
    }
    this._currentPath     = [];
    this._currentBallPath = [];
  }
}
