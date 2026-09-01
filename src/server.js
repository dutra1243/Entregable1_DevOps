const dotenv = require('dotenv');
dotenv.config();

const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
const SLOT = process.env.SLOT || "unknown";

app.use(express.json());

app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});


app.get('/', (req, res) => {
    res.send(`Hello, World! (${SLOT})`);
});

const authRoutes = require('./routes/auth');
app.use('/api', authRoutes);

const authenticate = require('./middlewares/authenticate');
app.use(authenticate);

const movieRoutes = require('./routes/movies');
app.use('/api/movies', movieRoutes);

const userRoutes = require('./routes/users');
app.use('/api/users', userRoutes);

app.use((err, req, res, next) => {
    console.error('ERROR:', err.message);

    res.status(err.status || 500).json({
        error: {
            message: err.message || 'Internal Server Error',
        }
    });
});


app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});