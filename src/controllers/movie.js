const axios = require("axios");
const TMDB_KEY = process.env.TMDB_KEY;

/**
 * Retrieves movies from The Movie Database (TMDB) API
 * @summary Searches for movies by keyword or fetches popular movies, then assigns random suggestion scores and sorts by score
 * @param {Object} req - Express request object
 * @param {Object} req.query - Query parameters
 * @param {string} [req.query.search] - Optional search keyword to find specific movies (if omitted, returns popular movies)
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Object} JSON array of movies sorted by suggestionScore (200) or error passed to next middleware
 */
async function getMoviesFromTMDB(req, res, next) {
    try {
        
        const keyword = req.query.search || '';
        let response;

        const config = {
            headers: {
                'Authorization': `Bearer ${TMDB_KEY}`,
                'accept': 'application/json'
            }
        };

        if (keyword) {
            response = await axios.get(
                `https://api.themoviedb.org/3/search/movie?query=${keyword}&language=en-US&page=1`,
                config
            )
        } else {
            response = await axios.get(
                'https://api.themoviedb.org/3/movie/popular?language=en-US&page=1',
                config
            )
        }

        const scoredMovies = response.data.results
            .map(movie => ({
            ...movie,
            suggestionScore: Math.floor(Math.random() * 100)
        }))
            .sort((a, b) => b.suggestionScore - a.suggestionScore);

        res.status(200).json(scoredMovies);
    } catch (error) {
     
        next(error);
    }
}

module.exports = {getMoviesFromTMDB};
