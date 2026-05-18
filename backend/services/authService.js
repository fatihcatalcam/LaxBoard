const bcrypt = require('bcryptjs');

const DUMMY_HASH = bcrypt.hashSync('dummy-sentinel', 10);

class DuplicateUsernameError extends Error {
  constructor() {
    super('Username already taken');
    this.name = 'DuplicateUsernameError';
    this.status = 409;
  }
}

class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid username or password');
    this.name = 'InvalidCredentialsError';
    this.status = 401;
  }
}

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

function validateUsername(username) {
  if (!username || typeof username !== 'string') throw new ValidationError('Username is required');
  const trimmed = username.trim();
  if (trimmed.length < 3 || trimmed.length > 30)
    throw new ValidationError('Username must be 3–30 characters');
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed))
    throw new ValidationError('Username may only contain letters, numbers, underscores, and hyphens');
  return trimmed;
}

function validatePassword(password) {
  if (!password || typeof password !== 'string') throw new ValidationError('Password is required');
  if (password.length < 6) throw new ValidationError('Password must be at least 6 characters');
}

function createAuthService(db) {
  return {
    registerUser(username, password) {
      const trimmed = validateUsername(username);
      validatePassword(password);
      const hash = bcrypt.hashSync(password, 10);
      try {
        const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run([trimmed, hash]);
        return db.prepare('SELECT id, username FROM users WHERE id = ?').get(result.lastInsertRowid);
      } catch (e) {
        if (e.message && e.message.includes('UNIQUE constraint')) throw new DuplicateUsernameError();
        throw e;
      }
    },

    loginUser(username, password) {
      const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || '').trim());
      const hash = user ? user.password_hash : DUMMY_HASH;
      const match = bcrypt.compareSync(String(password || ''), hash);
      if (!user || !match) throw new InvalidCredentialsError();
      return { id: user.id, username: user.username };
    }
  };
}

module.exports = { createAuthService, DuplicateUsernameError, InvalidCredentialsError, ValidationError };
