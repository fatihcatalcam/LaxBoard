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
  }

  goToStep(index) {
    if (index < 0 || index >= this.steps.length) return;
    this.currentStepIndex = index;
  }

  // Recompute startPositions for every step from path endpoints.
  // Called by Animator before playback so positions are always correct
  // regardless of what order steps were added / recorded.
  recomputeStartPositions() {
    let curPlayers = this.steps[0].startPositions.players.map(p => ({ ...p }));
    let curBall    = { ...this.steps[0].startPositions.ball };
    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i];
      step.startPositions = {
        players:        curPlayers.map(p => ({ ...p })),
        ball:           { ...curBall },
        ballAttachedTo: null
      };
      for (let j = 0; j < 6; j++) {
        if (step.paths[j].length >= 2) {
          const last = step.paths[j][step.paths[j].length - 1];
          curPlayers[j] = { x: last.x, y: last.y };
        }
      }
      if (step.ballPath.length >= 2) {
        const last = step.ballPath[step.ballPath.length - 1];
        curBall = { x: last.x, y: last.y };
      }
    }
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
    // Live positions = end of step 0 (so that addStep() snaps from the correct state)
    this.players        = this.steps.length > 1
      ? this.steps[1].startPositions.players.map(p => ({ ...p }))
      : curPlayers.map(p => ({ ...p }));
    this.ball           = this.steps.length > 1
      ? { ...this.steps[1].startPositions.ball }
      : { ...curBall };
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
