## Tech Stack

### Frontend
- React 18
- React Router DOM
- Socket.IO Client
- React Quill (WYSIWYG editor)
- Lucide React (icons)
- React Hot Toast (notifications)
- Axios (HTTP client)

### Backend
- Node.js
- Express.js
- Socket.IO
- PostgreSQL
- JWT (authentication)
- Bcryptjs (password hashing)
- Express Rate Limit
- Helmet (security)

## Prerequisites

- Node.js (v16 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd clone
   ```

2. **Install dependencies**
   ```bash
   npm run install-all
   ```

3. **Set up PostgreSQL database**
   ```sql
   CREATE DATABASE bb_chat;
   ```

4. **Configure environment variables**
   ```bash
   cp env.example .env
   ```
   
   Edit `.env` with your database credentials:
   ```env
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=bb_chat
   DB_USER=your_username
   DB_PASSWORD=your_password
   JWT_SECRET=your_super_secret_jwt_key_here
   JWT_EXPIRES_IN=7d
   PORT=5000
   NODE_ENV=development
   CLIENT_URL=http://localhost:3000
   ```

5. **Set up database schema**
   ```bash
   psql -U your_username -d bb_chat -f server/database/schema.sql
   ```

6. **Start the application**
   
   **Option 1: Use the startup script (recommended)**
   ```bash
   ./bin/start-dev
   ```
   
   **Option 2: Use the simple startup script**
   ```bash
   ./bin/start-simple
   ```
   
   **Option 3: Manual start**
   ```bash
   npm run dev
   ```
   
   **For Windows users:**
   ```cmd
   bin\start-dev.bat
   ```

   The startup scripts will automatically:
   - Check prerequisites
   - Install dependencies
   - Handle port conflicts
   - Start both server and client
   - Clean up processes on exit

## Usage

1. **Register a new account** or **login** with existing credentials
2. **Start chatting** - The interface will show your chat list
3. **Create new chats** - Click the plus button to start new conversations
4. **Send messages** - Use the rich text editor to compose and send messages
5. **Real-time updates** - Messages appear instantly for all participants

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user

### Chats
- `GET /api/chats` - Get user's chats
- `POST /api/chats` - Create new chat
- `GET /api/chats/:chatId` - Get chat details

### Messages
- `GET /api/messages/:chatId` - Get chat messages
- `POST /api/messages/:chatId` - Send message
- `POST /api/messages/:messageId/read` - Mark message as read

## WebSocket Events

### Client to Server
- `join-chats` - Join user's chat rooms
- `send-message` - Send new message
- `typing-start` - Start typing indicator
- `typing-stop` - Stop typing indicator

### Server to Client
- `new-message` - New message received
- `user-typing` - User started typing
- `user-stopped-typing` - User stopped typing

## Project Structure

```
clone/
├── client/                 # React frontend
│   ├── public/
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── contexts/       # React contexts
│   │   └── ...
│   └── package.json
├── server/                 # Node.js backend
│   ├── database/          # Database schema and connection
│   ├── middleware/        # Express middleware
│   ├── routes/           # API routes
│   └── index.js
├── package.json
└── README.md
```

## Development

### Running in Development Mode
```bash
npm run dev
```

### Running Server Only
```bash
npm run server
```

### Running Client Only
```bash
npm run client
```

### Building for Production
```bash
npm run build
```

## Security Features

- JWT-based authentication
- Password hashing with bcrypt
- Rate limiting on API endpoints
- Input validation and sanitization
- CORS protection
- Helmet security headers

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details
