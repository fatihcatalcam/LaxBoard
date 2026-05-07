const express = require('express');
const router = express.Router();
const { createSetsService, SetNotFoundError, DuplicateNameError, ValidationError } = require('../services/setsService');
const { getDb } = require('../models/db');

function handleError(res, err) {
  if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
  if (err instanceof SetNotFoundError) return res.status(404).json({ error: err.message });
  if (err instanceof DuplicateNameError) return res.status(409).json({ error: err.message });
  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
}

function svc() { return createSetsService(getDb()); }

/**
 * @swagger
 * /api/sets:
 *   get:
 *     summary: List all sets
 *     responses:
 *       200:
 *         description: Array of sets
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   name: { type: string }
 *                   created_at: { type: string }
 */
router.get('/', (req, res) => {
  try { res.json(svc().getAllSets()); } catch (e) { handleError(res, e); }
});

/**
 * @swagger
 * /api/sets/search:
 *   get:
 *     summary: Search sets by name (empty q returns all)
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Matching sets
 */
router.get('/search', (req, res) => {
  try { res.json(svc().searchSets(req.query.q || '')); } catch (e) { handleError(res, e); }
});

/**
 * @swagger
 * /api/sets/{id}:
 *   get:
 *     summary: Get a single set with player paths
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Set with paths
 *       404:
 *         description: Set not found
 */
router.get('/:id', (req, res) => {
  try { res.json(svc().getSet(Number(req.params.id))); } catch (e) { handleError(res, e); }
});

/**
 * @swagger
 * /api/sets:
 *   post:
 *     summary: Create a new set
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *     responses:
 *       201:
 *         description: Created set
 *       400:
 *         description: Validation error
 *       409:
 *         description: Duplicate name
 */
router.post('/', (req, res) => {
  try { res.status(201).json(svc().createSet(req.body.name)); } catch (e) { handleError(res, e); }
});

/**
 * @swagger
 * /api/sets/{id}:
 *   put:
 *     summary: Rename a set
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *     responses:
 *       200:
 *         description: Updated set
 *       404:
 *         description: Set not found
 *       409:
 *         description: Duplicate name
 */
router.put('/:id', (req, res) => {
  try { res.json(svc().updateSet(Number(req.params.id), req.body.name)); } catch (e) { handleError(res, e); }
});

/**
 * @swagger
 * /api/sets/{id}:
 *   delete:
 *     summary: Delete a set and its paths
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204:
 *         description: Deleted
 *       404:
 *         description: Set not found
 */
router.delete('/:id', (req, res) => {
  try { svc().deleteSet(Number(req.params.id)); res.status(204).send(); } catch (e) { handleError(res, e); }
});

/**
 * @swagger
 * /api/sets/{id}/paths:
 *   post:
 *     summary: Save (replace) player paths for a set
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               paths:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     player_number: { type: integer }
 *                     path:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           x: { type: number }
 *                           y: { type: number }
 *                           t: { type: number }
 *     responses:
 *       204:
 *         description: Paths saved
 *       400:
 *         description: Validation error
 *       404:
 *         description: Set not found
 */
router.post('/:id/paths', (req, res) => {
  try { svc().savePaths(Number(req.params.id), req.body.paths); res.status(204).send(); } catch (e) { handleError(res, e); }
});

module.exports = router;
