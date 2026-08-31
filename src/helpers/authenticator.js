const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

const db = require('./database');
const { getMessage } = require('./messages');

/**
 * Authenticates user requests by validating JWT tokens
 * @summary Middleware that verifies JWT token from Authorization header, checks if token is blacklisted, and attaches decoded user data to request
 * @param {Object} req - Express request object
 * @param {Object} req.headers - Request headers
 * @param {string} req.headers.authorization - Authorization header with Bearer token
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {void} Calls next() if authentication succeeds, or sends JSON error response (401/500) if authentication fails
 */
function authenticate(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: getMessage('errors.auth.noTokenProvided') });
    };

    db.get('SELECT * FROM jwt_blacklist WHERE token = ?', [token], (err, row) => {
        if (err) {
            return res.status(500).json({ message: getMessage('errors.generic.internalServerError') });
        }
        if (row) {
            return res.status(401).json({ message: getMessage('errors.auth.tokenBlacklisted') });
        }
        jwt.verify(token, JWT_SECRET, (err, decoded) => {
            if (err) {
                return res.status(401).json({ message: getMessage('errors.auth.invalidToken') });
            }
            // console.log('Decoded JWT:', decoded);
            req.user = decoded;
            next();
        });
    });
}

module.exports = { authenticate };
