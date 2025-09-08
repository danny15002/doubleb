const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get messages for a chat
router.get('/:chatId', authenticateToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    // Verify user is participant
    const participantCheck = await pool.query(
      'SELECT 1 FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
      [chatId, req.user.id]
    );

    if (participantCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const offset = (page - 1) * limit;

    const result = await pool.query(`
      SELECT 
        m.id,
        m.content,
        m.message_type,
        m.created_at,
        m.updated_at,
        u.id as sender_id,
        u.username,
        u.display_name as sender_name,
        u.avatar_url as sender_avatar
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.chat_id = $1
      ORDER BY m.created_at DESC
      LIMIT $2 OFFSET $3
    `, [chatId, limit, offset]);

    res.json({ 
      messages: result.rows.reverse(),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: result.rows.length === parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send message
router.post('/:chatId', authenticateToken, [
  body('content').notEmpty().trim(),
  body('messageType').optional().isIn(['text', 'image', 'file'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { chatId } = req.params;
    const { content, messageType = 'text' } = req.body;

    // Verify user is participant
    const participantCheck = await pool.query(
      'SELECT 1 FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
      [chatId, req.user.id]
    );

    if (participantCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Create message
    const result = await pool.query(`
      INSERT INTO messages (chat_id, sender_id, content, message_type)
      VALUES ($1, $2, $3, $4)
      RETURNING id, content, message_type, created_at, updated_at
    `, [chatId, req.user.id, content, messageType]);

    const message = result.rows[0];

    // Get sender info
    const senderResult = await pool.query(
      'SELECT id, username, display_name, avatar_url FROM users WHERE id = $1',
      [req.user.id]
    );

    const messageWithSender = {
      ...message,
      sender_id: req.user.id,
      username: senderResult.rows[0].username,
      sender_name: senderResult.rows[0].display_name,
      sender_avatar: senderResult.rows[0].avatar_url
    };

    res.status(201).json({
      message: 'Message sent successfully',
      data: messageWithSender
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark message as read
router.post('/:messageId/read', authenticateToken, async (req, res) => {
  try {
    const { messageId } = req.params;

    // Check if message exists and user has access
    const messageCheck = await pool.query(`
      SELECT m.id, m.chat_id 
      FROM messages m
      JOIN chat_participants cp ON m.chat_id = cp.chat_id
      WHERE m.id = $1 AND cp.user_id = $2
    `, [messageId, req.user.id]);

    if (messageCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found or access denied' });
    }

    // Insert or update read status
    await pool.query(`
      INSERT INTO message_reads (message_id, user_id, read_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (message_id, user_id) 
      DO UPDATE SET read_at = CURRENT_TIMESTAMP
    `, [messageId, req.user.id]);

    res.json({ message: 'Message marked as read' });
  } catch (error) {
    console.error('Mark message read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
