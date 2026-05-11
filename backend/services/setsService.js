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
