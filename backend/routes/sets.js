const express = require('express');
const router = express.Router();
const { createSetsService, SetNotFoundError, DuplicateNameError, ValidationError } = require('../services/setsService');
const { getDb } = require('../models/db');
const { authenticate } = require('../middleware/authenticate');

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
 *     summary: List all sets for the authenticated user
 *     responses:
 *       200:
 *         description: Array of sets
 *       401:
 *         description: Not authenticated
 */
router.get('/', authenticate, (req, res) => {
  try { res.json(svc().getAllSets(req.user.id)); } catch (e) { handleError(res, e); }
});

/**
 * @swagger
 * /api/sets/search:
 *   get:
 *     summary: Search sets by name for the authenticated user
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Matching sets
 *       401:
 *         description: Not authenticated
 */
router.get('/search', authenticate, (req, res) => {
  try { res.json(svc().searchSets(req.query.q || '', req.user.id)); } catch (e) { handleError(res, e); }
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
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Set not found
 */
router.get('/:id', authenticate, (req, res) => {
  try { res.json(svc().getSet(Number(req.params.id), req.user.id)); } catch (e) { handleError(res, e); }
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
 *       401:
 *         description: Not authenticated
 *       409:
 *         description: Duplicate name
 */
router.post('/', authenticate, (req, res) => {
  try { res.status(201).json(svc().createSet(req.body.name, req.user.id)); } catch (e) { handleError(res, e); }
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
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Set not found
 *       409:
 *         description: Duplicate name
 */
router.put('/:id', authenticate, (req, res) => {
  try { res.json(svc().updateSet(Number(req.params.id), req.body.name, req.user.id)); } catch (e) { handleError(res, e); }
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
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Set not found
 */
router.delete('/:id', authenticate, (req, res) => {
  try { svc().deleteSet(Number(req.params.id), req.user.id); res.status(204).send(); } catch (e) { handleError(res, e); }
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
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Set not found
 */
router.post('/:id/paths', authenticate, (req, res) => {
  try { svc().savePaths(Number(req.params.id), req.user.id, req.body.paths); res.status(204).send(); } catch (e) { handleError(res, e); }
});

module.exports = router;
