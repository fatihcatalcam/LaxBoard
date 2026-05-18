const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { createAuthService, DuplicateUsernameError, InvalidCredentialsError, ValidationError } = require('../services/authService');
const { getDb } = require('../models/db');
const { JWT_SECRET } = require('../middleware/authenticate');

const COOKIE_OPTIONS = { httpOnly: true, sameSite: 'strict', path: '/', secure: process.env.NODE_ENV === 'production' };
const TOKEN_EXPIRY = '7d';

function svc() { return createAuthService(getDb()); }

function handleError(res, err) {
  if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
  if (err instanceof DuplicateUsernameError) return res.status(409).json({ error: err.message });
  if (err instanceof InvalidCredentialsError) return res.status(401).json({ error: err.message });
  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
}

router.post('/register', (req, res) => {
  try {
    const user = svc().registerUser(req.body.username, req.body.password);
    res.status(201).json({ id: user.id, username: user.username });
  } catch (e) { handleError(res, e); }
});

router.post('/login', (req, res) => {
  try {
    const user = svc().loginUser(req.body.username, req.body.password);
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
    res.cookie('token', token, COOKIE_OPTIONS).json({ id: user.id, username: user.username });
  } catch (e) { handleError(res, e); }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token', { path: '/', secure: process.env.NODE_ENV === 'production' }).json({ message: 'Logged out' });
});

router.get('/me', (req, res) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const user = jwt.verify(token, JWT_SECRET);
    res.json({ id: user.id, username: user.username });
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

module.exports = router;
