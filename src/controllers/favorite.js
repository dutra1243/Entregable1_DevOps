const TMDB_KEY = process.env.TMDB_KEY;
const db = require('../helpers/database');
const axios = require('axios');
const { getMessage } = require('../helpers/messages');

/**
 * Adds a movie to the user's favorites list
 * @summary Fetches movie details from TMDB API if not in database, stores the movie, and adds it to user's favorites
 * @param {Object} req - Express request object
 * @param {Object} req.user - Authenticated user object (populated by auth middleware)
 * @param {string} req.user.id - User's unique identifier
 * @param {Object} req.body - Request body
 * @param {number} req.body.movieId - TMDB movie ID to add to favorites
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Object} JSON response with success message (201) or error message (400/404/409)
 */
async function addFavoriteMovie(req, res, next) {
    try {
        const userId = req.user.id;
        const {movieId} = req.body;
        if (!movieId) {
            return res.status(400).json({ 
                message: getMessage('errors.auth.movieIdRequired') 
            });
        }

        const userExists = await new Promise((resolve, reject) => {
            db.get('SELECT id FROM users WHERE id = ?', [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!userExists) {
            return res.status(404).json({ 
                message: getMessage('errors.auth.userNotFound') 
            });
        }
        
        const movieAlreadyInDB = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM movies WHERE id = ?', [movieId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!movieAlreadyInDB) {
            const config = {
                headers: {
                    'Authorization': `Bearer ${TMDB_KEY}`,
                    'accept': 'application/json'
                }
            };

            try {
                const response = await axios.get(
                    `https://api.themoviedb.org/3/movie/${movieId}?language=en-US`,
                    config
                );

                const movie = response.data;

                const insertMovieStmt = db.prepare(`
                    INSERT OR IGNORE INTO movies (id, adult, backdrop_path, genre_ids, original_language, original_title, overview, popularity, poster_path, release_date, title, video, vote_average, vote_count)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                insertMovieStmt.run(movie.id, movie.adult ? 1 : 0, movie.backdrop_path, JSON.stringify(movie.genre_ids), movie.original_language, movie.original_title, movie.overview, movie.popularity, movie.poster_path, movie.release_date, movie.title, movie.video ? 1 : 0, movie.vote_average, movie.vote_count);
                insertMovieStmt.finalize();
            } catch (axiosError) {
                return res.status(404).json({ 
                    message: getMessage('errors.auth.movieNotAvailable') 
                });
            }
        }

        const insertFavoriteStmt = db.prepare(`
            INSERT INTO favorites (movieId, userId)
            VALUES (?, ?)
        `);
        insertFavoriteStmt.run(movieId, userId, function(err) {
            if (err) {
                if (err.code === 'SQLITE_CONSTRAINT') {
                    return res.status(409).json({ 
                        message: getMessage('errors.auth.movieAlreadyInFavorites') 
                    });
                }
                return next(err);
            }
            res.status(201).json({ 
                message: getMessage('success.favorite.movieAdded') 
            });
        });
        insertFavoriteStmt.finalize();
    } catch (error) {
        next(error);
    } 
}

/**
 * Retrieves all favorite movies for the authenticated user
 * @summary Gets user's favorite movies from database and assigns random suggestion scores for sorting
 * @param {Object} req - Express request object
 * @param {Object} req.user - Authenticated user object (populated by auth middleware)
 * @param {string} req.user.id - User's unique identifier
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Object} JSON array of favorite movies sorted by suggestionForTodayScore (200)
 */
async function getFavoriteMovies(req, res, next) {
    try {
        const userId = req.user.id;
        const favoriteMovies = await new Promise((resolve, reject) => {
            db.all(`
            SELECT m.*
            FROM movies m
            JOIN favorites f ON m.id = f.movieId
            WHERE f.userId = ?
            `, [userId], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
            });
        });

        console.log(favoriteMovies);

        const scoredMovies = favoriteMovies
            .map(movie => ({
            ...movie,
            suggestionForTodayScore: Math.floor(Math.random() * 100)
        }))
            .sort((a, b) => b.suggestionForTodayScore - a.suggestionForTodayScore);

        res.status(200).json(scoredMovies);
    } catch (error) {
        next(error);
    }
}

module.exports = { addFavoriteMovie, getFavoriteMovies };
