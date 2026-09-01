const express = require('express');
const { register, login, logout } = require('../controllers/auth');
const { body } = require('express-validator');
const validateRequest = require('../middlewares/validation');

const router = express.Router();

/**
 * @route POST /api/auth/register
 * @summary Registers a new user
 * @param {string} email.body.required - User's email address (must be a valid email)
 * @param {string} firstName.body.required - User's first name
 * @param {string} lastName.body.required - User's last name
 * @param {string} password.body.required - User's password (minimum 8 characters)
 * @returns {object} 201 - User registered successfully
 * @returns {object} 400 - Email already exists or validation error
 * @returns {object} 500 - Internal server error
 */
router.post('/auth/register', [
    body('email').isEmail().withMessage('Invalid email format'),
    body('firstName').notEmpty().withMessage('First name is required').escape(),
    body('lastName').notEmpty().withMessage('Last name is required').escape(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
], validateRequest, register);

/**
 * @route POST /api/auth/login
 * @summary Authenticates a user and returns a JWT token
 * @param {string} email.body.required - User's email address (must be a valid email)
 * @param {string} password.body.required - User's password
 * @returns {object} 200 - Login successful, returns JWT token
 * @returns {object} 401 - Invalid email or password
 * @returns {object} 500 - Internal server error
 */
router.post('/auth/login', [
    body('email').isEmail().withMessage('Invalid email format'),
    body('password').notEmpty().withMessage('Password is required')
], validateRequest, login);

/**
 * @route POST /api/auth/logout
 * @summary Logs out a user
 * @access  Protected (Bearer Token required)
 * @headers Authorization: Bearer <token>
 * @returns {object} 200 - Logout successful
 * @returns {object} 500 - Internal server error
 */
router.post('/auth/logout', logout);

module.exports = router;