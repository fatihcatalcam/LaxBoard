const { validateSetName, validatePaths, ValidationError } = require('../services/setsService');

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
  test('throws ValidationError when player_number is 0', () => {
    expect(() => validatePaths([{ player_number: 0, path: [{ x: 0, y: 0, t: 0 }] }])).toThrow(ValidationError);
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
