const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get user's chats
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        c.id,
        c.name,
        c.type,
        c.created_at,
        c.updated_at,
        c.created_by,
        CASE 
          WHEN c.type = 'direct' THEN u.display_name
          ELSE c.name
        END as display_name,
        CASE 
          WHEN c.type = 'direct' THEN u.avatar_url
          ELSE NULL
        END as avatar_url,
        (SELECT content FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT created_at FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_time
      FROM chats c
      JOIN chat_participants cp ON c.id = cp.chat_id
      LEFT JOIN chat_participants cp2 ON c.id = cp2.chat_id AND cp2.user_id != $1
      LEFT JOIN users u ON c.type = 'direct' AND u.id = cp2.user_id
      WHERE cp.user_id = $1
      ORDER BY COALESCE((SELECT created_at FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1), c.updated_at) DESC
    `, [req.user.id]);

    res.json({ chats: result.rows });
  } catch (error) {
    console.error('Get chats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new chat
router.post('/', authenticateToken, [
  body('type').isIn(['direct', 'group']),
  body('participantIds').optional().isArray(),
  body('participantUsernames').optional().isArray(),
  body('name').optional().isLength({ max: 100 }).trim().escape()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { type, participantIds, participantUsernames, name } = req.body;
    let finalParticipantIds = participantIds || [];

    // Handle direct messages with username validation
    if (type === 'direct') {
      if (!participantUsernames || participantUsernames.length !== 1) {
        return res.status(400).json({ error: 'Direct message requires exactly one participant username' });
      }

      const username = participantUsernames[0];
      
      // Check if user exists
      const userResult = await pool.query(
        'SELECT id FROM users WHERE username = $1 AND id != $2',
        [username, req.user.id]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: `User '${username}' not found` });
      }

      finalParticipantIds = [userResult.rows[0].id];
    }

    // Validate participants exist (only if participantIds is not empty)
    if (finalParticipantIds && finalParticipantIds.length > 0) {
      const participantResult = await pool.query(
        'SELECT id FROM users WHERE id = ANY($1)',
        [finalParticipantIds]
      );

      if (participantResult.rows.length !== finalParticipantIds.length) {
        return res.status(400).json({ error: 'One or more participants not found' });
      }
    }

    // For direct chats, check if chat already exists
    if (type === 'direct' && finalParticipantIds.length === 1) {
      const existingChat = await pool.query(`
        SELECT c.id FROM chats c
        WHERE c.type = 'direct'
        AND c.id IN (
          SELECT chat_id FROM chat_participants 
          WHERE user_id = $1 OR user_id = $2
          GROUP BY chat_id 
          HAVING COUNT(*) = 2
        )
      `, [req.user.id, finalParticipantIds[0]]);

      if (existingChat.rows.length > 0) {
        return res.json({ 
          message: 'Direct chat already exists',
          chatId: existingChat.rows[0].id
        });
      }
    }

    // Create chat
    const chatResult = await pool.query(
      'INSERT INTO chats (name, type, created_by) VALUES ($1, $2, $3) RETURNING id, name, type, created_at',
      [name || null, type, req.user.id]
    );

    const chat = chatResult.rows[0];

    // Add participants (always include the creator)
    const allParticipants = [req.user.id, ...finalParticipantIds];
    for (const participantId of allParticipants) {
      await pool.query(
        'INSERT INTO chat_participants (chat_id, user_id) VALUES ($1, $2)',
        [chat.id, participantId]
      );
    }

    // Notify all participants about the new chat via socket
    const { io } = require('../index');
    if (io) {
      // Send new-chat event to all participants
      allParticipants.forEach(participantId => {
        io.emit('new-chat', {
          chatId: chat.id,
          chatName: chat.name,
          chatType: chat.type,
          participantId: participantId
        });
      });
    }

    res.status(201).json({
      message: 'Chat created successfully',
      chat: {
        id: chat.id,
        name: chat.name,
        type: chat.type,
        createdAt: chat.created_at
      }
    });
  } catch (error) {
    console.error('Create chat error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get chat details
router.get('/:chatId', authenticateToken, async (req, res) => {
  try {
    const { chatId } = req.params;

    // Verify user is participant
    const participantCheck = await pool.query(
      'SELECT 1 FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
      [chatId, req.user.id]
    );

    if (participantCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get chat details
    const chatResult = await pool.query(`
      SELECT 
        c.id,
        c.name,
        c.type,
        c.created_at,
        c.updated_at,
        CASE 
          WHEN c.type = 'direct' THEN u.display_name
          ELSE c.name
        END as display_name,
        CASE 
          WHEN c.type = 'direct' THEN u.avatar_url
          ELSE NULL
        END as avatar_url
      FROM chats c
      LEFT JOIN chat_participants cp2 ON c.id = cp2.chat_id AND cp2.user_id != $1
      LEFT JOIN users u ON c.type = 'direct' AND u.id = cp2.user_id
      WHERE c.id = $1
    `, [chatId]);

    if (chatResult.rows.length === 0) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    // Get participants
    const participantsResult = await pool.query(`
      SELECT u.id, u.username, u.display_name, u.avatar_url, cp.joined_at
      FROM chat_participants cp
      JOIN users u ON cp.user_id = u.id
      WHERE cp.chat_id = $1
      ORDER BY cp.joined_at
    `, [chatId]);

    res.json({
      chat: chatResult.rows[0],
      participants: participantsResult.rows
    });
  } catch (error) {
    console.error('Get chat error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Leave chat (remove user from chat participants)
router.delete('/:chatId/leave', authenticateToken, async (req, res) => {
  try {
    const { chatId } = req.params;

    // Check if user is a participant in this chat
    const participantCheck = await pool.query(
      'SELECT id FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
      [chatId, req.user.id]
    );

    if (participantCheck.rows.length === 0) {
      return res.status(403).json({ error: 'You are not a participant in this chat' });
    }

    // Get chat info before leaving
    const chatResult = await pool.query(
      'SELECT id, name, type FROM chats WHERE id = $1',
      [chatId]
    );

    if (chatResult.rows.length === 0) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const chat = chatResult.rows[0];

    // Remove user from chat participants
    await pool.query(
      'DELETE FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
      [chatId, req.user.id]
    );

    // Check if there are any remaining participants
    const remainingParticipants = await pool.query(
      'SELECT COUNT(*) as count FROM chat_participants WHERE chat_id = $1',
      [chatId]
    );

    const participantCount = parseInt(remainingParticipants.rows[0].count);

    // If no participants left, delete the chat entirely
    if (participantCount === 0) {
      await pool.query('DELETE FROM chats WHERE id = $1', [chatId]);
    }

    res.json({ 
      message: 'Left chat successfully',
      chat: {
        id: chat.id,
        name: chat.name,
        type: chat.type,
        deleted: participantCount === 0
      }
    });
  } catch (error) {
    console.error('Leave chat error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete chat entirely (only for group chat creators)
router.delete('/:chatId', authenticateToken, async (req, res) => {
  try {
    const { chatId } = req.params;

    // Get chat info and check if user is the creator
    const chatResult = await pool.query(
      'SELECT id, name, type, created_by FROM chats WHERE id = $1',
      [chatId]
    );

    if (chatResult.rows.length === 0) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const chat = chatResult.rows[0];

    // Only allow deletion if user is the creator
    if (chat.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Only the chat creator can delete the chat' });
    }

    // Delete chat (this will cascade delete messages and participants due to foreign key constraints)
    await pool.query('DELETE FROM chats WHERE id = $1', [chatId]);

    res.json({ 
      message: 'Chat deleted successfully',
      chat: {
        id: chat.id,
        name: chat.name,
        type: chat.type
      }
    });
  } catch (error) {
    console.error('Delete chat error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
