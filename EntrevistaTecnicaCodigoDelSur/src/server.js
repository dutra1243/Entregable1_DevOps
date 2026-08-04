const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const app = express();
const PORT = 3000;

app.use(express.json());

const authRoutes = require('./routes/auth');
app.use('/api', authRoutes);

const authenticate = require('./helpers/authenticator').authenticate;

const movieRoutes = require('./routes/movie');
app.use('/api/movies', authenticate, movieRoutes);

const favoriteRoutes = require('./routes/favorite');
app.use('/api', authenticate, favoriteRoutes);

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});