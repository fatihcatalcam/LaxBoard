const { authenticate } = require('../middleware/authenticate');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

describe('authenticate middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { cookies: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
  });

  test('calls next() and attaches req.user with valid token', () => {
    const token = jwt.sign({ id: 1, username: 'coach_ali' }, JWT_SECRET, { expiresIn: '1h' });
    req.cookies.token = token;
    authenticate(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toMatchObject({ id: 1, username: 'coach_ali' });
  });

  test('returns 401 JSON when cookie is missing', () => {
    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 JSON when token is invalid', () => {
    req.cookies.token = 'not.a.valid.token';
    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 JSON when token is expired', () => {
    const token = jwt.sign({ id: 1, username: 'coach_ali' }, JWT_SECRET, { expiresIn: '-1s' });
    req.cookies.token = token;
    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
