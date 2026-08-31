/**
 * Message management module for internationalization and centralized messaging
 * @module messages
 * @summary Loads and retrieves messages from JSON file with caching and hot-reload support
 */

const fs = require('fs');
const path = require('path');

/**
 * Cached messages object
 * @type {Object|null}
 */
let messagesCache = null;

/**
 * Last modified timestamp of messages file
 * @type {number|null}
 */
let lastModified = null;

/**
 * Loads messages from the JSON file with caching mechanism
 * @summary Reads messages.json file and caches content, reloads if file has been modified
 * @returns {Object} Object containing all messages, or empty object if loading fails
 */
function loadMessages() {
    const messagesPath = path.join(__dirname, '../resources/messages.json');
    
    try {
        const stats = fs.statSync(messagesPath);
        const currentModified = stats.mtime.getTime();

        // load messages if not cached or file has changed
        if (!messagesCache || lastModified !== currentModified) {
            const fileContent = fs.readFileSync(messagesPath, 'utf8');
            messagesCache = JSON.parse(fileContent);
            lastModified = currentModified;
            console.log('Messages reloaded from file');
        }
    } catch (error) {
        console.error('Error loading messages:', error);
        return messagesCache || {};
    }
    
    return messagesCache;
}

/**
 * Retrieves a message by dot-notation key with optional parameter interpolation
 * @summary Navigates nested message object using dot notation and replaces parameters in message strings
 * @param {string} key - Dot-notation path to message (e.g., 'errors.auth.invalidCredentials')
 * @param {Object} [params={}] - Optional parameters for string interpolation using {paramName} syntax
 * @returns {string} The requested message with interpolated parameters, or error message if key not found
 * @example
 * getMessage('errors.auth.invalidCredentials') // Returns the message string
 * getMessage('welcome.user', { name: 'John' }) // Returns "Welcome, John" if template is "Welcome, {name}"
 */
function getMessage(key, params = {}) {
    const messages = loadMessages();
    const keys = key.split('.');
    let message = messages;
    
    for (const k of keys) {
        if (message[k] === undefined) {
            return `Message not found: ${key}`;
        }
        message = message[k];
    }
    
    // Interpolación básica de parámetros si es necesario
    if (typeof message === 'string' && Object.keys(params).length > 0) {
        return message.replace(/\{(\w+)\}/g, (match, param) => {
            return params[param] !== undefined ? params[param] : match;
        });
    }
    
    return message;
}

/**
 * Exports message retrieval function
 * @exports getMessage
 */
module.exports = { getMessage };