const express = require('express');
const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const setsRouter = require('./routes/sets');

const app = express();

app.use(express.json());
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
app.use('/api/sets', setsRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`LaxBoard running on http://localhost:${PORT}`));

module.exports = app;
