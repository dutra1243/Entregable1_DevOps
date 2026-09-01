const express = require('express');
const { getMovies } = require('../controllers/movies');
const { query } = require('express-validator');
const validateRequest = require('../middlewares/validation');

const router = express.Router();

/**
 * @route GET /api/movies
 * @summary Retrieves all movies or searches by keyword
 * @access  Protected (Bearer Token required)
 * @headers Authorization: Bearer <token>
 * @query {string} search - Optional search keyword
 * @returns {object} 200 - List of movies
 * @returns {object} 500 - Internal server error
 */
router.get('/', [
    query('search')
        .optional()
        .isString()
        .withMessage('Search query must be a string')
        .trim()
        .escape()
], validateRequest, getMovies);

module.exports = router;