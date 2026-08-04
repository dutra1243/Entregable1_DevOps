/**
 * Favorites routes module
 * @module routes/favorite
 * @summary Defines routes for managing user's favorite movies
 */

const express = require('express');
const { body } = require('express-validator');
const { addFavoriteMovie, getFavoriteMovies } = require('../controllers/favorite');
const validate = require('../helpers/validator');
const { getMessage } = require('../helpers/messages');

/**
 * Express router instance for favorite routes
 * @type {express.Router}
 */
const router = express.Router();

/**
 * POST /favorites
 * @route POST /favorites
 * @summary Adds a movie to the authenticated user's favorites list
 * @param {number} movieId - TMDB movie ID to add to favorites (must be numeric)
 * @returns {Object} 201 - Movie successfully added to favorites
 * @returns {Object} 400 - Validation error (invalid movieId)
 * @returns {Object} 404 - User not found or movie not available
 * @returns {Object} 409 - Movie already in favorites
 * @requires authentication - User must be authenticated (JWT token required)
 */
router.post('/favorites', [
    body('movieId').isInt().withMessage(() => getMessage('errors.auth.invalidMovieId')),
    validate
], addFavoriteMovie);

/**
 * GET /favorites
 * @route GET /favorites
 * @summary Retrieves all favorite movies for the authenticated user
 * @returns {Object[]} 200 - Array of favorite movies sorted by suggestionForTodayScore
 * @requires authentication - User must be authenticated (JWT token required)
 */
router.get('/favorites', getFavoriteMovies);

/**
 * Exports the favorites router
 * @exports router
 * @type {express.Router}
 */
module.exports = router;