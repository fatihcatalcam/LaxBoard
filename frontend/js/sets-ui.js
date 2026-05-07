const API = '/api/sets';

export class SetsUI {
  constructor({ field, recorder, animator, onSetLoaded, onStatus }) {
    this.field = field;
    this.recorder = recorder;
    this.animator = animator;
    this.onSetLoaded = onSetLoaded; // (set) => void
    this.onStatus = onStatus;       // (msg) => void

    this.activeSetId = null;

    this._search = document.getElementById('set-search');
    this._list = document.getElementById('set-list');
    this._btnNew = document.getElementById('btn-new-set');
    this._btnSave = document.getElementById('btn-save');

    this._btnNew.addEventListener('click', () => this._createSet());
    this._btnSave.addEventListener('click', () => this._savePaths());
    this._search.addEventListener('input', () => this._loadList());

    this._loadList();
  }

  // ── List ──────────────────────────────────────────────────

  async _loadList() {
    const q = this._search.value.trim();
    const url = q ? `${API}/search?q=${encodeURIComponent(q)}` : API;
    try {
      const sets = await this._fetch(url);
      this._renderList(sets);
    } catch (e) {
      this.onStatus(`Error loading sets: ${e.message}`);
    }
  }

  _renderList(sets) {
    this._list.innerHTML = '';
    for (const s of sets) {
      const li = document.createElement('li');
      li.dataset.id = s.id;
      if (s.id === this.activeSetId) li.classList.add('active');

      const nameSpan = document.createElement('span');
      nameSpan.className = 'set-name';
      nameSpan.textContent = s.name;
      nameSpan.addEventListener('click', () => this._loadSet(s.id));

      const btnRename = document.createElement('button');
      btnRename.className = 'btn-rename';
      btnRename.textContent = '✎';
      btnRename.title = 'Rename';
      btnRename.addEventListener('click', (e) => { e.stopPropagation(); this._renameSet(s.id, s.name); });

      const btnDel = document.createElement('button');
      btnDel.className = 'btn-delete';
      btnDel.textContent = '✕';
      btnDel.title = 'Delete';
      btnDel.addEventListener('click', (e) => { e.stopPropagation(); this._deleteSet(s.id, s.name); });

      li.append(nameSpan, btnRename, btnDel);
      this._list.appendChild(li);
    }
  }

  // ── Load set onto canvas ──────────────────────────────────

  async _loadSet(id) {
    try {
      const set = await this._fetch(`${API}/${id}`);
      this.activeSetId = id;
      this.field.setPathsFromSaved(set.paths);
      this.field.draw();
      this._btnSave.disabled = false;
      this.onSetLoaded?.(set);
      this.onStatus(`Loaded set "${set.name}"`);
      this._loadList();
    } catch (e) {
      this.onStatus(`Error loading set: ${e.message}`);
    }
  }

  // ── Create ────────────────────────────────────────────────

  async _createSet() {
    const name = prompt('Set name:');
    if (!name) return;
    try {
      const set = await this._fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      this.onStatus(`Created set "${set.name}"`);
      await this._loadSet(set.id);
    } catch (e) {
      this.onStatus(`Error: ${e.message}`);
    }
  }

  // ── Rename ────────────────────────────────────────────────

  async _renameSet(id, currentName) {
    const name = prompt('New name:', currentName);
    if (!name || name === currentName) return;
    try {
      await this._fetch(`${API}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      this.onStatus(`Renamed to "${name}"`);
      this._loadList();
    } catch (e) {
      this.onStatus(`Error: ${e.message}`);
    }
  }

  // ── Delete ────────────────────────────────────────────────

  async _deleteSet(id, name) {
    if (!confirm(`Delete set "${name}"?`)) return;
    try {
      await fetch(`${API}/${id}`, { method: 'DELETE' });
      if (this.activeSetId === id) {
        this.activeSetId = null;
        this.field.clearPaths();
        this.field.draw();
        this._btnSave.disabled = true;
      }
      this.onStatus(`Deleted set "${name}"`);
      this._loadList();
    } catch (e) {
      this.onStatus(`Error: ${e.message}`);
    }
  }

  // ── Save paths ────────────────────────────────────────────

  async _savePaths() {
    if (!this.activeSetId) return;

    // Build paths payload — ball (0) + all 6 players; stationary ones get single-point path
    const paths = this.field.players.map((pos, i) => {
      const recorded = this.field.paths[i];
      return {
        player_number: i + 1,
        path: recorded.length >= 2 ? recorded : [{ x: pos.x, y: pos.y, t: 0 }]
      };
    });
    const bp = this.field.ballPath;
    paths.push({
      player_number: 0,
      path: bp.length >= 2 ? bp : [{ x: this.field.ball.x, y: this.field.ball.y, t: 0 }]
    });

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

  // ── Utility ───────────────────────────────────────────────

  async _fetch(url, options) {
    const res = await fetch(url, options);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || res.statusText);
    }
    if (res.status === 204) return null;
    return res.json();
  }
}
