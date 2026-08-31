const db = require('../helpers/database');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const JWT_SECRET = process.env.JWT_SECRET;
const jwt = require('jsonwebtoken');
const { getMessage } = require('../helpers/messages');

/**
 * Registers a new user in the system
 * @summary Creates a new user account with hashed password and generates a unique user ID
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body
 * @param {string} req.body.email - User's email address (must be unique)
 * @param {string} req.body.firstName - User's first name
 * @param {string} req.body.lastName - User's last name
 * @param {string} req.body.password - User's password (will be hashed)
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Object} JSON response with success message and userId (201) or error message (400/409)
 */
async function registerUser(req, res, next) {
    try {
        const { email, firstName, lastName, password } = req.body;
        if (!email || !firstName || !lastName || !password) {
            return res.status(400).json({ message: getMessage('errors.auth.allFieldsRequired') });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const userId = uuidv4();

        const stmt = db.prepare(`
            INSERT INTO users (id, email, firstName, lastName, password)
            VALUES (?, ?, ?, ?, ?)
        `);
        stmt.run(userId, email, firstName, lastName, hashedPassword, function(err) {
            if (err) {
                if (err.code === 'SQLITE_CONSTRAINT') {
                    return res.status(409).json({ message: getMessage('errors.auth.emailAlreadyInUse') });
                }
                return next(err);
            }   
            res.status(201).json({ message: getMessage('success.auth.userRegistered'), userId });
        });
        stmt.finalize();
    } catch (error) {   
        next(error);
    }
}

/**
 * Authenticates a user and generates a JWT token
 * @summary Validates user credentials and returns a JWT token for authentication
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body
 * @param {string} req.body.email - User's email address
 * @param {string} req.body.password - User's password
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Object} JSON response with success message and JWT token (200) or error message (400/401)
 */
async function loginUser(req, res, next) {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: getMessage('errors.auth.emailPasswordRequired') });
        }
        
        const user = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        if (!user) {
            return res.status(401).json({ message: getMessage('errors.auth.invalidCredentials') });
        }
        
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(401).json({ message: getMessage('errors.auth.invalidCredentials') });
        }
        
        const token = jwt.sign(
            { id: user.id, email: user.email, jti: uuidv4() }, 
            JWT_SECRET, 
            { expiresIn: '48h' }
        );

        res.status(200).json({
            message: getMessage('success.auth.loginSuccessful'),
            token
        });
        
    } catch (error) {
        next(error);
    }
}

/**
 * Logs out a user by blacklisting their JWT token
 * @summary Adds the user's JWT token to the blacklist to invalidate it
 * @param {Object} req - Express request object
 * @param {Object} req.headers - Request headers
 * @param {string} req.headers.authorization - Authorization header with Bearer token
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Object} JSON response with success message (200) or error message (400)
 */
async function logoutUser(req, res, next) {
    try {
        const token = req.headers['authorization']?.split(' ')[1];
        if (!token) {
            return res.status(400).json({ message: getMessage('errors.auth.noTokenProvided') });
        }
        

        const stmt = db.prepare(`
            INSERT INTO jwt_blacklist (token)
            VALUES (?)
        `);
        stmt.run(token, function(err) {
            if (err) {
                return next(err);
            }
            res.status(200).json({ message: getMessage('success.auth.logoutSuccessful') });
        });
        stmt.finalize();
    } catch (error) {
        next(error);
    }
}

module.exports = { registerUser, loginUser, logoutUser };


