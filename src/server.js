const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const client = require('prom-client');

const app = express();
const PORT = process.env.PORT || 3000;
const SLOT = process.env.SLOT || "unknown";

client.register.setDefaultLabels({pod: process.env.POD_NAME || 'local', slot: SLOT});
client.collectDefaultMetrics();

// Persistent business metric: both slots read the same users file.
const fs = require('fs');
new client.Gauge({
    name: 'movies_registered_users',
    help: 'Number of registered accounts in the shared application data store',
    collect() {
        try {
            const users = JSON.parse(fs.readFileSync(process.env.USERS_FILE || 'data/users.txt', 'utf8') || '[]');
            this.set(users.length);
        } catch (error) {
            // A read failure must not be reported as zero users.
            this.set(NaN);
        }
    },
});

const httpDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
});

app.use(express.json());

app.get('/metrics', async (req, res) => {
    res.set('Content-Type', client.register.contentType);
    res.end(await client.register.metrics());
});

app.use((req, res, next) => {
    if ((req.get('user-agent') || '').startsWith('kube-probe/')) return next();
    const end = httpDuration.startTimer();

    res.on('finish', () => {
        end({
            method: req.method,
            route: req.route?.path || 'unmatched',
            status_code: res.statusCode,
        });
    });

    console.log(`${req.method} ${req.url}`);
    next();
});


app.get('/', (req, res) => {
    res.send(`Hello, Workjnadknfljnld! (${SLOT})`);
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