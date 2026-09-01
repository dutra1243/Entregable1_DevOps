const express = require('express');
const { addFavoriteMovie, getFavoriteMovies } = require('../controllers/users');
const { body, param } = require('express-validator');
const validateRequest = require('../middlewares/validation');

const router = express.Router();

/**
 * @route POST /api/me/favorites
 * @summary Adds a movie to the authenticated user's favorites
 * @access Protected (Bearer Token required)
 * @headers Authorization: Bearer <token>
 * @param {integer} movieId.body.required - The TMDB movie ID to add to favorites
 * @returns {object} 201 - Movie added successfully
 * @returns {object} 400 - Movie already in favorites or validation error
 * @returns {object} 404 - Movie not found in TMDB
 * @returns {object} 500 - Internal server error
 */
router.post('/addFavorite', [
    body('movieId').isInt().withMessage('Movie ID must be an integer'),
], validateRequest, addFavoriteMovie);

/**
 * @route GET /api/users/favorites
 * @summary Retrieves favorite movies for the authenticated user
 * @access Protected (Bearer Token required)
 * @headers Authorization: Bearer <token>
 * @returns {object} 200 - List of favorite movies (empty if none found)
 * @returns {object} 500 - Internal server error
 */
router.get('/favorites', getFavoriteMovies);

module.exports = router;