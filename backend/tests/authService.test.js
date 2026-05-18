const { createAuthService, DuplicateUsernameError, InvalidCredentialsError, ValidationError } = require('../services/authService');
const { createTestDb } = require('../models/db');

describe('createAuthService', () => {
  let db, auth;

  beforeEach(() => {
    db = createTestDb();
    auth = createAuthService(db);
  });

  afterEach(() => db.close());

  describe('registerUser', () => {
    test('creates and returns user with id and username (no password_hash)', () => {
      const user = auth.registerUser('coach_ali', 'password123');
      expect(user.id).toBeDefined();
      expect(user.username).toBe('coach_ali');
      expect(user.password_hash).toBeUndefined();
    });

    test('throws DuplicateUsernameError on duplicate username', () => {
      auth.registerUser('coach_ali', 'password123');
      expect(() => auth.registerUser('coach_ali', 'other123')).toThrow(DuplicateUsernameError);
    });

    test('throws ValidationError when username is shorter than 3 chars', () => {
      expect(() => auth.registerUser('ab', 'password123')).toThrow(ValidationError);
    });

    test('throws ValidationError when username is longer than 30 chars', () => {
      expect(() => auth.registerUser('a'.repeat(31), 'password123')).toThrow(ValidationError);
    });

    test('throws ValidationError when username has a space', () => {
      expect(() => auth.registerUser('coach ali', 'password123')).toThrow(ValidationError);
    });

    test('throws ValidationError when username has @', () => {
      expect(() => auth.registerUser('coach@ali', 'password123')).toThrow(ValidationError);
    });

    test('accepts username with underscores and hyphens', () => {
      expect(() => auth.registerUser('coach_ali-1', 'password123')).not.toThrow();
    });

    test('throws ValidationError when password is shorter than 6 chars', () => {
      expect(() => auth.registerUser('coach_ali', 'abc')).toThrow(ValidationError);
    });

    test('throws ValidationError when password is missing', () => {
      expect(() => auth.registerUser('coach_ali', null)).toThrow(ValidationError);
    });
  });

  describe('loginUser', () => {
    beforeEach(() => {
      auth.registerUser('coach_ali', 'password123');
    });

    test('returns user on correct credentials', () => {
      const user = auth.loginUser('coach_ali', 'password123');
      expect(user.id).toBeDefined();
      expect(user.username).toBe('coach_ali');
    });

    test('throws InvalidCredentialsError on wrong password', () => {
      expect(() => auth.loginUser('coach_ali', 'wrongpassword')).toThrow(InvalidCredentialsError);
    });

    test('throws InvalidCredentialsError on unknown username', () => {
      expect(() => auth.loginUser('nobody', 'password123')).toThrow(InvalidCredentialsError);
    });

    test('does not expose which field is wrong (same error for both cases)', () => {
      const err1 = (() => { try { auth.loginUser('nobody', 'x'); } catch (e) { return e; } })();
      const err2 = (() => { try { auth.loginUser('coach_ali', 'wrong'); } catch (e) { return e; } })();
      expect(err1.message).toBe(err2.message);
    });
  });
});
