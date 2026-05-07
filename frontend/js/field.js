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

const PLAYER_RADIUS = 14; // canvas pixels (fixed, not scaled)

const PLAYER_COLOUR = '#e94560';
const PLAYER_TEXT_COLOUR = '#fff';
const PATH_COLOUR = 'rgba(233, 69, 96, 0.6)';

export class Field {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // Player positions in metres { x, y } — origin = bottom-left of field
    // x: 0–36 (left to right), y: 0–35 (midline at 0, end line at 35)
    this.players = [
      { x: 18, y: 5 },   // #1 — attacker centre
      { x: 10, y: 8 },   // #2
      { x: 26, y: 8 },   // #3
      { x: 18, y: 18 },  // #4 — midfield
      { x: 10, y: 22 },  // #5
      { x: 26, y: 22 },  // #6
    ];

    this.paths = Array.from({ length: 6 }, () => []); // recorded paths per player [{x,y,t}]
    this.showPaths = true;
    this._scale = 1;
    this._ox = 0; // canvas origin offset (pixels)
    this._oy = 0;

    this._resize();
    window.addEventListener('resize', () => this._resize());
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
    this.canvas.width = aw;
    this.canvas.height = ah;
    this._ox = (aw - fw) / 2;
    this._oy = (ah - fh) / 2;
    this.draw();
  }

  // Convert field metres → canvas pixels
  _px(mx) { return this._ox + mx * this._scale; }
  _py(my) { return this._oy + (FIELD_H - my) * this._scale; } // y flipped: 0 at bottom

  // Convert canvas pixels → field metres
  mxFromPx(px) { return (px - this._ox) / this._scale; }
  myFromPy(py) { return FIELD_H - (py - this._oy) / this._scale; }

  // ── Draw ─────────────────────────────────────────────────

  draw(selectedPlayer = null, recordingPlayer = null) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this._drawField(ctx);
    if (this.showPaths) this._drawPaths(ctx);
    this._drawPlayers(ctx, selectedPlayer, recordingPlayer);
  }

  _drawField(ctx) {
    const s = this._scale;
    const ox = this._ox, oy = this._oy;
    const fw = FIELD_W * s;
    const fh = FIELD_H * s;

    // Grass background
    ctx.fillStyle = '#2d5a27';
    ctx.fillRect(ox, oy, fw, fh);

    // Alternating grass stripes (every 5m)
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (let m = 0; m < FIELD_H; m += 10) {
      ctx.fillRect(ox, this._py(m + 10), fw, 5 * s);
    }

    // X area (behind goal, top portion)
    const xTop = oy;
    const xBot = this._py(FIELD_H - X_DEPTH);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(ox, xTop, fw, xBot - xTop);

    // X area dashed line
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(ox, xBot);
    ctx.lineTo(ox + fw, xBot);
    ctx.stroke();
    ctx.setLineDash([]);

    // Field outline
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(ox, oy, fw, fh);

    // Midline (bottom edge of our half)
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ox, oy + fh);
    ctx.lineTo(ox + fw, oy + fh);
    ctx.stroke();

    // Crease circle
    const goalFieldY = FIELD_H - GOAL_Y; // metres from bottom
    const cx = this._px(FIELD_W / 2);
    const cy = this._py(goalFieldY);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, CREASE_R * s, 0, Math.PI * 2);
    ctx.stroke();

    // Goal posts
    const gLeft = this._px((FIELD_W - GOAL_W) / 2);
    const gRight = this._px((FIELD_W + GOAL_W) / 2);
    const gY = this._py(goalFieldY);
    const goalDepth = 1.2 * s;

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(gLeft, gY);
    ctx.lineTo(gRight, gY);
    ctx.stroke();

    // Goal box (depth toward end line = toward top)
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(gLeft, gY);
    ctx.lineTo(gLeft, gY - goalDepth);
    ctx.lineTo(gRight, gY - goalDepth);
    ctx.lineTo(gRight, gY);
    ctx.stroke();

    // X label
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = `bold ${Math.max(14, 2 * s)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText('X', ox + fw / 2, xTop + (xBot - xTop) / 2 + 6);
  }

  _drawPaths(ctx) {
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    for (let i = 0; i < 6; i++) {
      const path = this.paths[i];
      if (path.length < 2) continue;
      ctx.strokeStyle = PATH_COLOUR;
      ctx.beginPath();
      ctx.moveTo(this._px(path[0].x), this._py(path[0].y));
      for (let j = 1; j < path.length; j++) {
        ctx.lineTo(this._px(path[j].x), this._py(path[j].y));
      }
      ctx.stroke();

      // Arrow at end of path
      const last = path[path.length - 1];
      const prev = path[path.length - 2];
      this._drawArrow(ctx, prev, last, PATH_COLOUR);
    }
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
      tx - arrowLen * (ux * Math.cos(arrowAngle) - uy * Math.sin(arrowAngle)),
      ty - arrowLen * (uy * Math.cos(arrowAngle) + ux * Math.sin(arrowAngle))
    );
    ctx.lineTo(
      tx - arrowLen * (ux * Math.cos(-arrowAngle) - uy * Math.sin(-arrowAngle)),
      ty - arrowLen * (uy * Math.cos(-arrowAngle) + ux * Math.sin(-arrowAngle))
    );
    ctx.closePath();
    ctx.fill();
  }

  _drawPlayers(ctx, selectedPlayer, recordingPlayer) {
    for (let i = 0; i < 6; i++) {
      const { x, y } = this.players[i];
      const px = this._px(x);
      const py = this._py(y);
      const num = i + 1;
      const isSelected = selectedPlayer === num;
      const isRecording = recordingPlayer === num;

      // Glow for recording player
      if (isRecording) {
        ctx.shadowColor = '#e94560';
        ctx.shadowBlur = 16;
      }

      // Circle
      ctx.beginPath();
      ctx.arc(px, py, PLAYER_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = isRecording ? '#ff6b6b' : (isSelected ? '#e94560' : '#c0392b');
      ctx.fill();
      ctx.strokeStyle = isSelected || isRecording ? '#fff' : 'rgba(255,255,255,0.5)';
      ctx.lineWidth = isSelected || isRecording ? 2.5 : 1.5;
      ctx.stroke();

      ctx.shadowBlur = 0;

      // Number
      ctx.fillStyle = PLAYER_TEXT_COLOUR;
      ctx.font = `bold 13px system-ui`;
      ctx.textAlign = 'center';
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
    return null;
  }

  movePlayer(playerNum, px, py) {
    const i = playerNum - 1;
    let mx = this.mxFromPx(px);
    let my = this.myFromPy(py);
    mx = Math.max(0, Math.min(FIELD_W, mx));
    my = Math.max(0, Math.min(FIELD_H, my));
    this.players[i] = { x: mx, y: my };
  }

  // ── Path helpers ──────────────────────────────────────────

  setPathsFromSaved(savedPaths) {
    this.paths = Array.from({ length: 6 }, () => []);
    for (const { player_number, path } of savedPaths) {
      this.paths[player_number - 1] = path;
    }
  }

  clearPaths() {
    this.paths = Array.from({ length: 6 }, () => []);
  }

  snapshotPositions() {
    return this.players.map(p => ({ ...p }));
  }

  restorePositions(snapshot) {
    this.players = snapshot.map(p => ({ ...p }));
  }
}
