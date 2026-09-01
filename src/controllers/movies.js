const TMDB_API_KEY = process.env.TMDB_API_KEY;
const axios = require('axios');

async function getMovies(req, res, next) {
    try {
        const searchQuery = req.query.search || '';
        const keyword = searchQuery.trim();
        console.log('Search Query:', searchQuery);
        console.log('Keyword:', keyword);
        let response = {};
        if (searchQuery) {
            response = await axios.get(
                `https://api.themoviedb.org/3/search/movie?query=${keyword}&include_adult=false&language=en-US&page=1`,
                {
                    headers: {
                        'Authorization': `Bearer ${TMDB_API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
        } else {
            response = await axios.get(
                `https://api.themoviedb.org/3/trending/movie/week?language=en-US`,
                {
                    headers: {
                        'Authorization': `Bearer ${TMDB_API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
        }

        // Add suggestionScore and sort
        const moviesWithScore = response.data.results.map(movie => ({
            ...movie,
            suggestionScore: Math.floor(Math.random() * 100)
        })).sort((a, b) => b.suggestionScore - a.suggestionScore);

        res.status(200).json(moviesWithScore);

    } catch (error) {
        console.error('Error fetching movies:', error);
        next(error);
    }
}

module.exports = { getMovies };