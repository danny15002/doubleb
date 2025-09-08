const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chats');
const messageRoutes = require('./routes/messages');
const { authenticateToken } = require('./middleware/auth');
const { testConnection } = require('./database/connection');
const { setIO } = require('./socket/socketManager');

const app = express();
const server = createServer(app);

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? [process.env.CLIENT_URL]
      : [
          process.env.CLIENT_URL || "http://localhost:3000",
          "http://localhost:3000",
          "http://127.0.0.1:3000"
        ],
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Set the io instance in the socket manager
setIO(io);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

// Middleware
app.use(helmet());
app.set('trust proxy', 1); // Trust first proxy for rate limiting
app.use(limiter);
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? [process.env.CLIENT_URL]
    : [
        process.env.CLIENT_URL || "http://localhost:3000",
        "http://localhost:3000",
        "http://127.0.0.1:3000"
      ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/messages', messageRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Serve static files from Vite build in production
if (process.env.NODE_ENV === 'production') {
  const path = require('path');
  const buildPath = path.join(__dirname, '../client/build');
  
  // Serve static files from Vite build directory
  app.use(express.static(buildPath));
  
  // Handle React routing, return all requests to React app
  app.get('*', (req, res) => {
    res.sendFile(path.join(buildPath, 'index.html'));
  });
}

// Socket.IO connection handling
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error'));
    }

    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const { pool } = require('./database/connection');
    const userResult = await pool.query(
      'SELECT id, username, display_name FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return next(new Error('User not found'));
    }

    socket.userId = decoded.userId;
    socket.user = userResult.rows[0];
    next();
  } catch (error) {
    next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  console.log(`User ${socket.user.username} connected`);

  // Join user to their chat rooms
  socket.on('join-chats', async () => {
    try {
      const { pool } = require('./database/connection');
      const result = await pool.query(
        'SELECT chat_id FROM chat_participants WHERE user_id = $1',
        [socket.userId]
      );

      result.rows.forEach(row => {
        socket.join(`chat-${row.chat_id}`);
      });
    } catch (error) {
      console.error('Error joining chats:', error);
    }
  });

  // Join a specific chat room
  socket.on('join-chat', async (data) => {
    try {
      const { chatId } = data;
      console.log(`User ${socket.user.username} attempting to join chat ${chatId}`);
      const { pool } = require('./database/connection');
      
      // Verify user is participant
      const participantCheck = await pool.query(
        'SELECT 1 FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
        [chatId, socket.userId]
      );

      if (participantCheck.rows.length > 0) {
        socket.join(`chat-${chatId}`);
        console.log(`User ${socket.user.username} successfully joined chat ${chatId}`);
      } else {
        console.log(`User ${socket.user.username} denied access to chat ${chatId}`);
      }
    } catch (error) {
      console.error('Error joining chat:', error);
    }
  });

  // Handle new message
  socket.on('send-message', async (data) => {
    try {
      const { chatId, content, messageType = 'text' } = data;
      
      const { pool } = require('./database/connection');
      
      // Verify user is participant
      const participantCheck = await pool.query(
        'SELECT 1 FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
        [chatId, socket.userId]
      );

      if (participantCheck.rows.length === 0) {
        socket.emit('error', { message: 'Access denied' });
        return;
      }

      // Create message
      const result = await pool.query(`
        INSERT INTO messages (chat_id, sender_id, content, message_type)
        VALUES ($1, $2, $3, $4)
        RETURNING id, content, message_type, image_data, created_at, updated_at
      `, [chatId, socket.userId, content, messageType]);

      const message = result.rows[0];

      // Parse image_data if it exists
      if (message.image_data && typeof message.image_data === 'string') {
        try {
          message.image_data = JSON.parse(message.image_data);
        } catch (error) {
          console.error('Error parsing image_data:', error);
        }
      }

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
      `, [socket.userId, chatId]);

      const chatInfo = chatResult.rows[0];

      // Broadcast to all participants in the chat
      io.to(`chat-${chatId}`).emit('new-message', {
        ...message,
        chat_id: chatId,
        chat_name: chatInfo?.display_name || 'Unknown Chat',
        user_id: socket.userId,
        username: socket.user.username,
        sender_name: socket.user.display_name,
        sender_avatar: null
      });
    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Handle typing indicators
  socket.on('typing-start', (data) => {
    socket.to(`chat-${data.chatId}`).emit('user-typing', {
      userId: socket.userId,
      username: socket.user.username,
      chatId: data.chatId
    });
  });

  socket.on('typing-stop', (data) => {
    socket.to(`chat-${data.chatId}`).emit('user-stopped-typing', {
      userId: socket.userId,
      chatId: data.chatId
    });
  });

  socket.on('disconnect', () => {
    console.log(`User ${socket.user.username} disconnected`);
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 5000;

// Start server only after database connection is verified
const startServer = async () => {
  try {
    console.log('🚀 Starting server...');
    
    // Test database connection first
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.error('💥 Server startup failed: Database connection failed');
      process.exit(1);
    }
    
    // Start the server
    server.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
    
  } catch (error) {
    console.error('💥 Server startup failed:', error.message);
    process.exit(1);
  }
};

// Start the server
startServer();
