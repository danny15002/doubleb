const express = require('express');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const { pool } = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');
const { getIO } = require('../socket/socketManager');

const router = express.Router();

// Configure multer for image uploads (2MB limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB limit
  },
  fileFilter: (req, file, cb) => {
    // Check if file is an image
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

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
        m.image_data,
        m.quoted_message_id,
        m.quoted_content,
        m.quoted_sender_name,
        m.status,
        m.edited,
        m.edited_at,
        m.created_at,
        m.updated_at,
        u.id as sender_id,
        u.username,
        u.display_name as sender_name,
        u.avatar_url as sender_avatar,
        COALESCE(
          (
            SELECT JSON_AGG(
              JSON_BUILD_OBJECT(
                'emoji', mr.emoji,
                'count', mr.count,
                'users', mr.users
              )
            )
            FROM (
              SELECT 
                mr.emoji,
                COUNT(*) as count,
                ARRAY_AGG(
                  JSON_BUILD_OBJECT(
                    'user_id', mr.user_id,
                    'username', u2.username,
                    'display_name', u2.display_name,
                    'created_at', mr.created_at
                  )
                ) as users
              FROM message_reactions mr
              JOIN users u2 ON mr.user_id = u2.id
              WHERE mr.message_id = m.id
              GROUP BY mr.emoji
              ORDER BY COUNT(*) DESC, mr.emoji
            ) mr
          ),
          '[]'::json
        ) as reactions
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.chat_id = $1
      ORDER BY m.created_at DESC
      LIMIT $2 OFFSET $3
    `, [chatId, limit, offset]);

    // Parse image_data and prepare quoted message data for all messages
    const messages = result.rows.map(row => {
      if (row.image_data && typeof row.image_data === 'string') {
        try {
          row.image_data = JSON.parse(row.image_data);
        } catch (error) {
          console.error('Error parsing image_data:', error);
        }
      }
      
      // Prepare quoted message data
      if (row.quoted_message_id) {
        row.quotedMessage = {
          id: row.quoted_message_id,
          content: row.quoted_content,
          sender_name: row.quoted_sender_name
        };
      }
      
      // Parse reactions if they exist
      if (row.reactions && typeof row.reactions === 'string') {
        try {
          row.reactions = JSON.parse(row.reactions);
        } catch (error) {
          console.error('Error parsing reactions:', error);
          row.reactions = [];
        }
      } else if (!row.reactions) {
        row.reactions = [];
      }
      
      return row;
    });

    res.json({ 
      messages: messages.reverse(),
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

// Upload image
router.post('/:chatId/upload-image', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const { chatId } = req.params;
    const { caption } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    // Verify user is participant
    const participantCheck = await pool.query(
      'SELECT 1 FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
      [chatId, req.user.id]
    );

    if (participantCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Convert image to base64
    const base64Image = req.file.buffer.toString('base64');
    const imageData = {
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      data: base64Image
    };

    // Create message with image data
    const result = await pool.query(`
      INSERT INTO messages (chat_id, sender_id, content, message_type, image_data)
      VALUES ($1, $2, $3, 'image', $4)
      RETURNING id, content, message_type, image_data, created_at, updated_at
    `, [chatId, req.user.id, caption || '', JSON.stringify(imageData)]);

    const message = result.rows[0];

    // Parse image_data if it exists
    if (message.image_data && typeof message.image_data === 'string') {
      try {
        message.image_data = JSON.parse(message.image_data);
      } catch (error) {
        console.error('Error parsing image_data:', error);
      }
    }

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

    // Get chat information for notifications
    const chatResult = await pool.query(`
      SELECT c.id, c.name, c.type,
             CASE 
               WHEN c.type = 'direct' THEN u.display_name
               ELSE c.name
             END as display_name
      FROM chats c
      LEFT JOIN chat_participants cp ON c.id = cp.chat_id AND cp.user_id != $1
      LEFT JOIN users u ON c.type = 'direct' AND u.id = cp.user_id
      WHERE c.id = $2
    `, [req.user.id, chatId]);

    const chatInfo = chatResult.rows[0];

    // Broadcast to all participants in the chat
    const io = getIO();
    const socketMessage = {
      ...messageWithSender,
      chat_id: chatId,
      chat_name: chatInfo?.display_name || 'Unknown Chat',
      user_id: req.user.id
    };
    io.to(`chat-${chatId}`).emit('new-message', socketMessage);

    res.status(201).json({
      message: 'Image uploaded successfully',
      data: messageWithSender
    });
  } catch (error) {
    console.error('Upload image error:', error);
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size too large. Maximum 2MB allowed.' });
    }
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

// Add reaction to message
router.post('/:messageId/reactions', authenticateToken, [
  body('emoji').notEmpty().trim().isLength({ min: 1, max: 10 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { messageId } = req.params;
    const { emoji } = req.body;

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

    // Add or update reaction
    const result = await pool.query(`
      INSERT INTO message_reactions (message_id, user_id, emoji)
      VALUES ($1, $2, $3)
      ON CONFLICT (message_id, user_id, emoji) 
      DO UPDATE SET created_at = CURRENT_TIMESTAMP
      RETURNING id, emoji, created_at
    `, [messageId, req.user.id, emoji]);

    res.json({ 
      message: 'Reaction added successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Add reaction error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove reaction from message
router.delete('/:messageId/reactions/:emoji', authenticateToken, async (req, res) => {
  try {
    const { messageId, emoji } = req.params;

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

    // Remove reaction
    const result = await pool.query(`
      DELETE FROM message_reactions 
      WHERE message_id = $1 AND user_id = $2 AND emoji = $3
      RETURNING id
    `, [messageId, req.user.id, emoji]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reaction not found' });
    }

    res.json({ message: 'Reaction removed successfully' });
  } catch (error) {
    console.error('Remove reaction error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get reactions for a message
router.get('/:messageId/reactions', authenticateToken, async (req, res) => {
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

    // Get reactions grouped by emoji
    const result = await pool.query(`
      SELECT 
        mr.emoji,
        COUNT(*) as count,
        ARRAY_AGG(
          JSON_BUILD_OBJECT(
            'user_id', mr.user_id,
            'username', u.username,
            'display_name', u.display_name,
            'created_at', mr.created_at
          )
        ) as users
      FROM message_reactions mr
      JOIN users u ON mr.user_id = u.id
      WHERE mr.message_id = $1
      GROUP BY mr.emoji
      ORDER BY COUNT(*) DESC, mr.emoji
    `, [messageId]);

    res.json({ reactions: result.rows });
  } catch (error) {
    console.error('Get reactions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update message status
router.patch('/:messageId/status', authenticateToken, [
  body('status').isIn(['sent', 'delivered', 'read'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { messageId } = req.params;
    const { status } = req.body;

    // Check if message exists and user has access
    const messageCheck = await pool.query(`
      SELECT m.id, m.chat_id, m.sender_id
      FROM messages m
      JOIN chat_participants cp ON m.chat_id = cp.chat_id
      WHERE m.id = $1 AND cp.user_id = $2
    `, [messageId, req.user.id]);

    if (messageCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found or access denied' });
    }

    const message = messageCheck.rows[0];

    // Update message status
    await pool.query(`
      UPDATE messages 
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [status, messageId]);

    res.json({ 
      message: 'Message status updated successfully',
      status: status
    });
  } catch (error) {
    console.error('Update message status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Edit message
router.patch('/:messageId', authenticateToken, [
  body('content').notEmpty().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { messageId } = req.params;
    const { content } = req.body;

    // Check if message exists and user is the sender
    const messageCheck = await pool.query(`
      SELECT m.id, m.chat_id, m.sender_id, m.content, m.message_type
      FROM messages m
      WHERE m.id = $1 AND m.sender_id = $2
    `, [messageId, req.user.id]);

    if (messageCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found or you are not the sender' });
    }

    const message = messageCheck.rows[0];

    // Only allow editing text messages
    if (message.message_type !== 'text') {
      return res.status(400).json({ error: 'Only text messages can be edited' });
    }

    // Update message content and mark as edited
    const result = await pool.query(`
      UPDATE messages 
      SET content = $1, edited = TRUE, edited_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING id, content, edited, edited_at, updated_at
    `, [content, messageId]);

    const updatedMessage = result.rows[0];

    // Get sender info for socket broadcast
    const senderResult = await pool.query(
      'SELECT id, username, display_name, avatar_url FROM users WHERE id = $1',
      [req.user.id]
    );

    const messageWithSender = {
      ...updatedMessage,
      sender_id: req.user.id,
      username: senderResult.rows[0].username,
      sender_name: senderResult.rows[0].display_name,
      sender_avatar: senderResult.rows[0].avatar_url,
      chat_id: message.chat_id
    };

    // Broadcast the edited message to all participants in the chat
    const io = getIO();
    io.to(`chat-${message.chat_id}`).emit('message-edited', messageWithSender);

    res.json({ 
      message: 'Message edited successfully',
      data: messageWithSender
    });
  } catch (error) {
    console.error('Edit message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
