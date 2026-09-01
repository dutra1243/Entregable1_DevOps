const TMDB_API_KEY = process.env.TMDB_API_KEY;
const axios = require('axios');

const { readJSON, writeJSON } = require('../helpers/fileHandler');
const FAVORITES_FILE = process.env.FAVORITES_FILE || 'data/favorites.txt';
const MOVIES_FILE = process.env.MOVIES_FILE || 'data/movies.txt';
const USERS_FILE = process.env.USERS_FILE || 'data/users.txt';
const uuid = require('uuid');

async function addFavoriteMovie(req, res, next) {
    const { movieId } = req.body;
    const userId = req.userId;
    console.log(req)
    if (!movieId) {
        return res.status(400).json({ error: 'Movie ID is required' });
    }

    const response = await axios.get(
        `https://api.themoviedb.org/3/movie/${movieId}?language=en-US`,
        {
            headers: {
                'Authorization': `Bearer ${TMDB_API_KEY}`,
                'Content-Type': 'application/json'
            }
        }
    );
    const movieData = response.data;
    if (!movieData || !movieData.id) {
        return res.status(404).json({ error: 'Movie not found' });
    }
    const favorites = readJSON(FAVORITES_FILE);
    if (favorites.some(fav => fav.movieId === movieId && fav.userId === userId)) {
        return res.status(400).json({ error: 'Movie is already in favorites' });
    }
    const new_favorite = {
        id: uuid.v4(),
        movieId: movieData.id,
        userId: userId,
        addedAt: new Date().toISOString(),
    }
    favorites.push(new_favorite);
    writeJSON(FAVORITES_FILE, favorites);

    const movies = readJSON(MOVIES_FILE);
    const movieExists = movies.some(movie => movie.id === movieData.id);
    if (!movieExists) {
        const new_movie = {
            backdrop_path: movieData.backdrop_path,
            id: movieData.id,
            title: movieData.title,
            original_title: movieData.original_title,
            overview: movieData.overview,
            poster_path: movieData.poster_path,
            media_type: movieData.media_type || 'movie',
            adult: movieData.adult,
            original_language: movieData.original_language,
            genre_ids: movieData.genre_ids,
            popularity: movieData.popularity,
            release_date: movieData.release_date,
            video: movieData.video,
            vote_average: movieData.vote_average,
            vote_count: movieData.vote_count
        }
        movies.push(new_movie);
        writeJSON(MOVIES_FILE, movies);
    }
    res.status(201).json({
        message: 'Movie added to favorites successfully'
    });

}

async function getFavoriteMovies(req, res, next) {
    const userId = req.userId;

    const favorites = readJSON(FAVORITES_FILE);
    const userFavorites = favorites.filter(fav => fav.userId === userId);

    if (userFavorites.length === 0) {
        return res.status(200).json({ message: 'No favorite movies found for this user' });
    }

    const movies = readJSON(MOVIES_FILE);
    const favoriteMovies = userFavorites.map(fav => {
        const movie = movies.find(m => m.id === fav.movieId);
        if (!movie) return null;
        return {
            ...movie,
            addedAt: fav.addedAt,
            suggestionForTodayScore: Math.floor(Math.random() * 100)
        };
    }).filter(movie => movie !== null)
        .sort((a, b) => b.suggestionForTodayScore - a.suggestionForTodayScore);

    res.status(200).json(favoriteMovies);
}

module.exports = { addFavoriteMovie, getFavoriteMovies };