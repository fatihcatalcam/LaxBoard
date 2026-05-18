const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const setsRouter = require('./routes/sets');
const authRouter = require('./routes/auth');
const { JWT_SECRET } = require('./middleware/authenticate');

const app = express();

app.use(express.json());
app.use(cookieParser());

// Auth pages — served without token check
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'register.html')));

// Guard SPA root and direct index.html access — redirect to /login if no valid token
function requireAuth(req, res, next) {
  try {
    jwt.verify(req.cookies?.token, JWT_SECRET);
    next();
  } catch {
    res.redirect('/login');
  }
}
app.get('/', requireAuth);
app.get('/index.html', requireAuth);

// Serve static files (index.html, style.css, js/*.js)
app.use(express.static(path.join(__dirname, '..', 'frontend')));

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: { title: 'LaxBoard API', version: '1.0.0' },
    servers: [{ url: 'http://localhost:3000' }]
  },
  apis: [path.join(__dirname, 'routes', '*.js')]
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api/auth', authRouter);
app.use('/api/sets', setsRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`LaxBoard running on http://localhost:${PORT}`));

module.exports = app;
