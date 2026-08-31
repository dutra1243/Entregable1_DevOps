// Mock database before importing controller
jest.mock('../helpers/database', () => ({
    all: jest.fn(),
    get: jest.fn(),
    run: jest.fn(),
    prepare: jest.fn()
}));

jest.mock('axios');

const { getFavoriteMovies, addFavoriteMovie } = require('./favorite');
const db = require('../helpers/database');


describe('getFavoriteMovies', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return favorite movies for a user - normal use case', async () => {
        const fakeMovies = [
            { id: 1, title: 'Kinds of Kindness' },
            { id: 2, title: 'Princess Mononoke' }
        ];

        db.all.mockImplementation((query, params, callback) => {
            callback(null, fakeMovies);
        });

        const req = { user: { id: 'user123' } };
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        const next = jest.fn();

        await getFavoriteMovies(req, res, next);

        expect(res.status).toHaveBeenCalledWith(200);
        
        // Check that json was called with an array
        expect(res.json).toHaveBeenCalled();
        const returnedMovies = res.json.mock.calls[0][0];
        
        // Verify it returns the expected number of movies
        expect(returnedMovies).toHaveLength(fakeMovies.length);
        
        //Verify suggestionForTodayScore property
        returnedMovies.forEach(movie => {
            expect(movie).toHaveProperty('suggestionForTodayScore');
            expect(typeof movie.suggestionForTodayScore).toBe('number');
            expect(movie.suggestionForTodayScore).toBeGreaterThanOrEqual(0);
            expect(movie.suggestionForTodayScore).toBeLessThan(100);
        });
        
        // Verify movie descenting order by suggestionForTodayScore
        for (let i = 0; i < returnedMovies.length - 1; i++) {
            expect(returnedMovies[i].suggestionForTodayScore).toBeGreaterThanOrEqual(returnedMovies[i + 1].suggestionForTodayScore);
        }
        
        // Verify no lost data
        const movieIds = returnedMovies.map(m => m.id).sort();
        const originalIds = fakeMovies.map(m => m.id).sort();
        expect(movieIds).toEqual(originalIds);
    });

    it('should handle database errors', async () => {
        const error = new Error('Database error');
        db.all.mockImplementation((query, params, callback) => {
            callback(error, null);
        });

        const req = { user: { id: 'user-123' } };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        const next = jest.fn();

        await getFavoriteMovies(req, res, next);

        // Justt verify an error is passed to next
        expect(next).toHaveBeenCalledWith(error);
    });
});

describe('addFavoriteMovie', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should successfully add a favorite movie', async () => {
        const mockPrepare = {
            run: jest.fn((movieId, userId, callback) => callback && callback(null)),
            finalize: jest.fn()
        };

        db.get.mockImplementation((query, params, callback) => {
            callback(null, { id: 'user-123' });  // Simulate user exists, movie existence is not needed
        });

        db.prepare.mockReturnValue(mockPrepare);

        // fake req, res and next
        const req = { 
            user: { id: 'user-123' },
            body: { movieId: 1 }
        };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        const next = jest.fn();

        await addFavoriteMovie(req, res, next);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({ message: 'Movie added to favorites.' });
    });

    it('should return 400 if movieId is missing', async () => {
        const req = { 
            user: { id: 'user-123' },
            body: {}
        };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        const next = jest.fn();

        await addFavoriteMovie(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ message: 'movieId is required.' });
    });

    it('should return 404 if user does not exist', async () => {
        db.get.mockImplementationOnce((query, params, callback) => {
            callback(null, null); // non-existent user
        });

        const req = { 
            user: { id: 'nonexistent-user' },
            body: { movieId: 1 }
        };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        const next = jest.fn();

        await addFavoriteMovie(req, res, next);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ message: 'User not found.' });
    });

    it('should return 409 if movie is already in favorites', async () => {
        const mockPrepare = {
            run: jest.fn((movieId, userId, callback) => {
                const error = new Error('UNIQUE constraint failed');
                error.code = 'SQLITE_CONSTRAINT';
                callback(error);
            }),
            finalize: jest.fn()
        };

        db.get.mockImplementation((query, params, callback) => {
            callback(null, { id: 'user-123' });
        });

        db.prepare.mockReturnValue(mockPrepare);

        const req = { 
            user: { id: 'user-123' },
            body: { movieId: 1 }
        };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        const next = jest.fn();

        await addFavoriteMovie(req, res, next);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith({ message: 'Movie already in favorites.' });
    });

    it('should handle database errors', async () => {
        const error = new Error('Database error');
        
        db.get.mockImplementationOnce((query, params, callback) => {
            callback(error, null);
        });

        const req = { 
            user: { id: 'user-123' },
            body: { movieId: 1 }
        };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        const next = jest.fn();

        await addFavoriteMovie(req, res, next);

        expect(next).toHaveBeenCalledWith(error);
    });

    test('should return 404 when movieId is not available in TMDB', async () => {
        const req = {
            user: { id: 1 },
            body: { movieId: 999999999 } // Non-existent movie ID
        };
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        const next = jest.fn();

        // Mock db.get to:
        // 1st call: user exists
        // 2nd call: movie not in DB (so it will try to fetch from TMDB)
        db.get
            .mockImplementationOnce((query, params, callback) => {
                callback(null, { id: 1 }); // User exists
            })
            .mockImplementationOnce((query, params, callback) => {
                callback(null, null); // Movie not available (TMDB fetch unsuccessful)
            });

        // Mock axios to return 404
        const axios = require('axios');
        axios.get.mockRejectedValueOnce({
            response: { status: 404 }
        });

        await addFavoriteMovie(req, res, next);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ message: 'Movie not available.' });
        expect(next).not.toHaveBeenCalled();
    });
});