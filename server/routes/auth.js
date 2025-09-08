const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { pool } = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');
const { REGISTRATION_ENABLED } = require('../config/features');

const router = express.Router();

// Register
router.post('/register', [
  body('username').isLength({ min: 3, max: 50 }).trim().escape(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('displayName').isLength({ min: 1, max: 100 }).trim().escape()
], async (req, res) => {
  // Check if registration is enabled
  if (!REGISTRATION_ENABLED) {
    return res.status(503).json({ 
      error: 'Registration is temporarily disabled',
      message: 'New user registration is currently not available. Please try again later.'
    });
  }

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, email, password, displayName } = req.body;

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id, username, email FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existingUser.rows.length > 0) {
      // Check which field already exists for more specific error message
      const existingUsername = existingUser.rows.find(row => row.username === username);
      const existingEmail = existingUser.rows.find(row => row.email === email);
      
      if (existingUsername && existingEmail) {
        return res.status(400).json({ error: 'Both username and email are already taken' });
      } else if (existingUsername) {
        return res.status(400).json({ error: 'Username is already taken. Please choose a different username.' });
      } else if (existingEmail) {
        return res.status(400).json({ error: 'Email is already registered. Please use a different email or try logging in.' });
      }
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash, display_name) VALUES ($1, $2, $3, $4) RETURNING id, username, email, display_name',
      [username, email, passwordHash, displayName]
    );

    const user = result.rows[0];

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({
      message: 'User created successfully',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.display_name
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Login
router.post('/login', [
  body('username').notEmpty().trim().escape(),
  body('password').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password } = req.body;

    // Find user by username or email
    const result = await pool.query(
      'SELECT id, username, email, password_hash, display_name FROM users WHERE username = $1 OR email = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.display_name
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user
router.get('/me', authenticateToken, (req, res) => {
  res.json({ 
    user: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email,
      displayName: req.user.display_name,
      avatarUrl: req.user.avatar_url
    }
  });
});

// Search users by username
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const { username } = req.query;
    
    if (!username || username.trim().length < 2) {
      return res.status(400).json({ error: 'Username must be at least 2 characters long' });
    }

    const result = await pool.query(
      'SELECT id, username, display_name FROM users WHERE username ILIKE $1 AND id != $2 ORDER BY username LIMIT 10',
      [`%${username.trim()}%`, req.user.id]
    );

    res.json({ users: result.rows });
  } catch (error) {
    console.error('User search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user by username
router.get('/username/:username', authenticateToken, async (req, res) => {
  try {
    const { username } = req.params;
    
    const result = await pool.query(
      'SELECT id, username, display_name FROM users WHERE username = $1 AND id != $2',
      [username, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Get user by username error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
