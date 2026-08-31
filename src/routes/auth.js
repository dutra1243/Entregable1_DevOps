/**
 * Authentication routes module
 * @module routes/auth
 * @summary Defines authentication-related routes for user registration, login, and logout
 */

const express = require('express');
const { body } = require('express-validator');
const { registerUser, loginUser, logoutUser } = require('../controllers/auth');
const validate = require('../helpers/validator');
const { getMessage } = require('../helpers/messages');

/**
 * Express router instance for authentication routes
 * @type {express.Router}
 */
const router = express.Router();

/**
 * POST /auth/register
 * @route POST /auth/register
 * @summary Registers a new user with validation
 * @param {string} email - User's email address (must be valid email format)
 * @param {string} firstName - User's first name (required, sanitized)
 * @param {string} lastName - User's last name (required, sanitized)
 * @param {string} password - User's password (min 8 chars, must contain lowercase, uppercase, number, and special character)
 * @returns {Object} 201 - User successfully registered with userId
 * @returns {Object} 400 - Validation error
 * @returns {Object} 409 - Email already in use
 */
router.post('/auth/register', [
    body('email').isEmail().withMessage(() => getMessage('errors.auth.invalidEmailFormat')),
    body('firstName').notEmpty().withMessage(() => getMessage('errors.auth.firstNameRequired')).escape(),
    body('lastName').notEmpty().withMessage(() => getMessage('errors.auth.lastNameRequired')).escape(),
    body('password').isLength({ min: 8 }).withMessage(() => getMessage('errors.auth.passwordMinLength')),
    body('password').matches(/[a-z]/).withMessage(() => getMessage('errors.auth.passwordLowercase')),
    body('password').matches(/[A-Z]/).withMessage(() => getMessage('errors.auth.passwordUppercase')),
    body('password').matches(/[0-9]/).withMessage(() => getMessage('errors.auth.passwordNumber')),
    body('password').matches(/[^a-zA-Z0-9]/).withMessage(() => getMessage('errors.auth.passwordSpecialChar')),
    validate
], registerUser);

/**
 * POST /auth/login
 * @route POST /auth/login
 * @summary Authenticates a user and returns JWT token
 * @param {string} email - User's email address (must be valid email format)
 * @param {string} password - User's password (required)
 * @returns {Object} 200 - Login successful with JWT token
 * @returns {Object} 400 - Validation error
 * @returns {Object} 401 - Invalid credentials
 */
router.post('/auth/login', [
    body('email').isEmail().withMessage(() => getMessage('errors.auth.invalidEmailFormat')),
    body('password').notEmpty().withMessage(() => getMessage('errors.auth.passwordRequired')),
    validate
], loginUser);

/**
 * POST /auth/logout
 * @route POST /auth/logout
 * @summary Logs out a user by blacklisting their JWT token
 * @param {string} authorization - Bearer token in Authorization header
 * @returns {Object} 200 - Logout successful
 * @returns {Object} 400 - No token provided
 */
router.post('/auth/logout', logoutUser);

/**
 * Exports the authentication router
 * @exports router
 * @type {express.Router}
 */
module.exports = router;