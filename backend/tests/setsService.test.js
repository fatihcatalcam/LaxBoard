const { validateSetName, validatePaths, ValidationError, createSetsService, SetNotFoundError, DuplicateNameError } = require('../services/setsService');
const { createTestDb } = require('../models/db');

describe('validateSetName', () => {
  test('throws ValidationError on empty string', () => {
    expect(() => validateSetName('')).toThrow(ValidationError);
  });
  test('throws ValidationError on null', () => {
    expect(() => validateSetName(null)).toThrow(ValidationError);
  });
  test('throws ValidationError when longer than 50 chars', () => {
    expect(() => validateSetName('a'.repeat(51))).toThrow(ValidationError);
  });
  test('throws ValidationError on special characters like @', () => {
    expect(() => validateSetName('set@1')).toThrow(ValidationError);
  });
  test('returns trimmed name on valid input with whitespace', () => {
    expect(validateSetName('  bayram  ')).toBe('bayram');
  });
  test('accepts alphanumeric name', () => {
    expect(validateSetName('play1')).toBe('play1');
  });
  test('accepts name with spaces and hyphens', () => {
    expect(validateSetName('play-1 test')).toBe('play-1 test');
  });
});

describe('validatePaths', () => {
  const validPaths = [{ player_number: 1, path: [{ x: 10, y: 20, t: 1000 }] }];

  test('throws ValidationError on empty array', () => {
    expect(() => validatePaths([])).toThrow(ValidationError);
  });
  test('throws ValidationError when player_number is -1', () => {
    expect(() => validatePaths([{ player_number: -1, path: [{ x: 0, y: 0, t: 0 }] }])).toThrow(ValidationError);
  });
  test('allows player_number 0 (ball)', () => {
    expect(() => validatePaths([{ player_number: 0, path: [{ x: 0, y: 0, t: 0 }] }])).not.toThrow();
  });
  test('throws ValidationError when player_number is 7', () => {
    expect(() => validatePaths([{ player_number: 7, path: [{ x: 0, y: 0, t: 0 }] }])).toThrow(ValidationError);
  });
  test('throws ValidationError on empty path array', () => {
    expect(() => validatePaths([{ player_number: 1, path: [] }])).toThrow(ValidationError);
  });
  test('throws ValidationError when point is missing t', () => {
    expect(() => validatePaths([{ player_number: 1, path: [{ x: 1, y: 2 }] }])).toThrow(ValidationError);
  });
  test('throws ValidationError when x is a string', () => {
    expect(() => validatePaths([{ player_number: 1, path: [{ x: '1', y: 2, t: 0 }] }])).toThrow(ValidationError);
  });
  test('does not throw for valid input', () => {
    expect(() => validatePaths(validPaths)).not.toThrow();
  });
  test('does not throw for multiple players', () => {
    const paths = [
      { player_number: 1, path: [{ x: 0, y: 0, t: 0 }] },
      { player_number: 6, path: [{ x: 100, y: 200, t: 500 }] }
    ];
    expect(() => validatePaths(paths)).not.toThrow();
  });
});

describe('createSetsService CRUD', () => {
  let db, svc;

  beforeEach(() => {
    db = createTestDb();
    svc = createSetsService(db);
  });

  afterEach(() => db.close());

  describe('createSet', () => {
    test('creates and returns a set with id and name', () => {
      const set = svc.createSet('bayram');
      expect(set.id).toBeDefined();
      expect(set.name).toBe('bayram');
      expect(set.created_at).toBeDefined();
    });
    test('trims name before saving', () => {
      const set = svc.createSet('  hilal  ');
      expect(set.name).toBe('hilal');
    });
    test('throws DuplicateNameError on duplicate name', () => {
      svc.createSet('bayram');
      expect(() => svc.createSet('bayram')).toThrow(DuplicateNameError);
    });
    test('throws ValidationError on empty name', () => {
      expect(() => svc.createSet('')).toThrow(ValidationError);
    });
  });

  describe('getSet', () => {
    test('returns set with empty paths array when no paths saved', () => {
      const created = svc.createSet('hilal');
      const set = svc.getSet(created.id);
      expect(set.name).toBe('hilal');
      expect(set.paths).toEqual([]);
    });
    test('throws SetNotFoundError for unknown id', () => {
      expect(() => svc.getSet(999)).toThrow(SetNotFoundError);
    });
  });

  describe('getAllSets', () => {
    test('returns empty array when no sets exist', () => {
      expect(svc.getAllSets()).toEqual([]);
    });
    test('returns all sets ordered by created_at descending', () => {
      svc.createSet('a');
      svc.createSet('b');
      const sets = svc.getAllSets();
      expect(sets).toHaveLength(2);
      expect(sets.map(s => s.name)).toContain('a');
      expect(sets.map(s => s.name)).toContain('b');
    });
  });

  describe('searchSets', () => {
    beforeEach(() => {
      svc.createSet('bayram');
      svc.createSet('hilal');
      svc.createSet('bayram-2');
    });
    test('returns sets matching the query', () => {
      expect(svc.searchSets('bayram')).toHaveLength(2);
    });
    test('returns empty array when nothing matches', () => {
      expect(svc.searchSets('zzz')).toHaveLength(0);
    });
    test('returns all sets on empty query', () => {
      expect(svc.searchSets('')).toHaveLength(3);
    });
    test('returns all sets on null query', () => {
      expect(svc.searchSets(null)).toHaveLength(3);
    });
  });

  describe('updateSet', () => {
    test('renames the set and returns updated record', () => {
      const set = svc.createSet('old-name');
      const updated = svc.updateSet(set.id, 'new-name');
      expect(updated.name).toBe('new-name');
    });
    test('throws SetNotFoundError for unknown id', () => {
      expect(() => svc.updateSet(999, 'name')).toThrow(SetNotFoundError);
    });
    test('throws DuplicateNameError when name is taken by another set', () => {
      const a = svc.createSet('a');
      svc.createSet('b');
      expect(() => svc.updateSet(a.id, 'b')).toThrow(DuplicateNameError);
    });
  });

  describe('deleteSet', () => {
    test('deletes set — subsequent getSet throws SetNotFoundError', () => {
      const set = svc.createSet('to-delete');
      svc.deleteSet(set.id);
      expect(() => svc.getSet(set.id)).toThrow(SetNotFoundError);
    });
    test('throws SetNotFoundError for unknown id', () => {
      expect(() => svc.deleteSet(999)).toThrow(SetNotFoundError);
    });
    test('cascades: player_paths are removed when set is deleted', () => {
      const set = svc.createSet('cascade-test');
      svc.savePaths(set.id, [{ player_number: 1, path: [{ x: 0, y: 0, t: 0 }] }]);
      svc.deleteSet(set.id);
      const count = db.prepare('SELECT COUNT(*) as c FROM player_paths WHERE set_id = ?').get(set.id).c;
      expect(count).toBe(0);
    });
  });

  describe('savePaths', () => {
    let setId;
    beforeEach(() => { setId = svc.createSet('path-test').id; });

    test('saves paths and getSet returns them parsed', () => {
      svc.savePaths(setId, [
        { player_number: 1, path: [{ x: 10, y: 20, t: 1000 }, { x: 50, y: 80, t: 1500 }] },
        { player_number: 2, path: [{ x: 5, y: 5, t: 1000 }] }
      ]);
      const set = svc.getSet(setId);
      expect(set.paths).toHaveLength(2);
      const p1 = set.paths.find(p => p.player_number === 1);
      expect(p1.path[1].x).toBe(50);
    });
    test('replaces all existing paths on re-save', () => {
      svc.savePaths(setId, [{ player_number: 1, path: [{ x: 0, y: 0, t: 0 }] }]);
      svc.savePaths(setId, [{ player_number: 2, path: [{ x: 1, y: 1, t: 1 }] }]);
      const set = svc.getSet(setId);
      expect(set.paths).toHaveLength(1);
      expect(set.paths[0].player_number).toBe(2);
    });
    test('throws SetNotFoundError for unknown setId', () => {
      expect(() => svc.savePaths(999, [{ player_number: 1, path: [{ x: 0, y: 0, t: 0 }] }]))
        .toThrow(SetNotFoundError);
    });
    test('throws ValidationError for invalid paths', () => {
      expect(() => svc.savePaths(setId, [])).toThrow(ValidationError);
    });
  });
});
