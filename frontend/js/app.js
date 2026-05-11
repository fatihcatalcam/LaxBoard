import { Field }    from './field.js';
import { Recorder } from './recorder.js';
import { Animator } from './animator.js';
import { SetsUI }   from './sets-ui.js';

const canvas      = document.getElementById('field-canvas');
const statusBar   = document.getElementById('status-bar');
const btnRecord   = document.getElementById('btn-record');
const btnStop     = document.getElementById('btn-stop');
const btnClear    = document.getElementById('btn-clear');
const btnPlay     = document.getElementById('btn-play');
const btnPause    = document.getElementById('btn-pause');
const btnSave     = document.getElementById('btn-save');
const togglePaths = document.getElementById('toggle-paths');
const playerBtns  = document.getElementById('player-buttons');

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
  field.clearAllSteps();
  field.draw(recorder.selectedPlayer, null);
  setStatus('Paths cleared');
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

  // Player buttons
  for (const btn of playerBtns.querySelectorAll('.player-btn')) {
    const num = Number(btn.dataset.player);
    btn.classList.toggle('selected', num === recorder.selectedPlayer);
    btn.disabled = isRecording;
  }

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
