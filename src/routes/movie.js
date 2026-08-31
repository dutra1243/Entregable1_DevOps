/**
 * Movie routes module
 * @module routes/movie
 * @summary Defines routes for retrieving movies from The Movie Database (TMDB)
 */

const express = require('express');
const { getMoviesFromTMDB } = require('../controllers/movie');
const { query } = require('express-validator');
const validate = require('../helpers/validator');
const { getMessage } = require('../helpers/messages');

/**
 * Express router instance for movie routes
 * @type {express.Router}
 */
const router = express.Router();

/**
 * GET /
 * @route GET /
 * @summary Retrieves movies from TMDB API - searches by keyword or returns popular movies
 * @param {string} [search] - Optional search query parameter to find specific movies (sanitized, must be string)
 * @returns {Object[]} 200 - Array of movies sorted by suggestionScore
 * @returns {Object} 400 - Validation error (invalid search query)
 * @requires authentication - User must be authenticated (JWT token required)
 */
router.get('/', [
    query('search')
        .optional()
        .isString()
        .withMessage(() => getMessage('errors.auth.invalidSearchQuery'))
        .escape(),
    validate
], getMoviesFromTMDB);

/**
 * Exports the movie router
 * @exports router
 * @type {express.Router}
 */
module.exports = router;