import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { useAuth } from './AuthContext';

const SocketContext = createContext();

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [notificationPermission, setNotificationPermission] = useState('default');
  const { user } = useAuth();

  // Request notification permission
  useEffect(() => {
    if ('Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
          setNotificationPermission(permission);
        });
      } else {
        setNotificationPermission(Notification.permission);
      }
    }
  }, []);

  const showBrowserNotification = useCallback((title, options) => {
    if (notificationPermission === 'granted' && document.hidden) {
      const notification = new Notification(title, {
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        ...options
      });
      
      // Auto-close after 5 seconds
      setTimeout(() => {
        notification.close();
      }, 5000);
      
      // Focus window when notification is clicked
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    }
  }, [notificationPermission]);

  useEffect(() => {
    if (user) {
      const token = localStorage.getItem('token');
      const newSocket = io(process.env.REACT_APP_SERVER_URL || 'http://localhost:5001', {
        auth: {
          token
        },
        transports: ['websocket', 'polling']
      });

      newSocket.on('connect', () => {
        console.log('Connected to server');
        setConnected(true);
        newSocket.emit('join-chats');
      });

      newSocket.on('disconnect', () => {
        console.log('Disconnected from server');
        setConnected(false);
      });

      newSocket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        setConnected(false);
      });

      // Handle new messages with notifications
      newSocket.on('new-message', (message) => {
        // Only show notification if the message is not from the current user
        // and not from the currently viewed chat
        if (message.user_id !== user.id && message.chat_id !== currentChatId) {
          // Get chat name from the message or use a default
          const chatName = message.chat_name || 'Unknown Chat';
          const senderName = message.username || 'Someone';
          
          // Strip HTML from message content for notifications
          const stripHtml = (html) => {
            const tmp = document.createElement('div');
            tmp.innerHTML = html;
            return tmp.textContent || tmp.innerText || '';
          };
          
          const plainTextMessage = stripHtml(message.content);
          
          // Show in-app notification
          toast(`${senderName} in ${chatName}: ${plainTextMessage}`, {
            duration: 4000,
            position: 'top-right',
            style: {
              background: '#363636',
              color: '#fff',
              borderRadius: '8px',
              padding: '12px 16px',
              fontSize: '14px',
              maxWidth: '300px',
            },
          });
          
          // Show browser notification
          showBrowserNotification(`${senderName} in ${chatName}`, {
            body: plainTextMessage,
            tag: `chat-${message.chat_id}`,
            requireInteraction: false
          });
        }
      });

      // Handle new chat notifications
      newSocket.on('new-chat', (data) => {
        // Only handle if this is for the current user
        if (data.participantId === user.id) {
          // Join the new chat room
          newSocket.emit('join-chat', { chatId: data.chatId });
          
          // Show notification
          const chatName = data.chatName || `Chat ${data.chatId}`;
          toast(`You've been added to ${chatName}`, {
            duration: 3000,
            position: 'top-right',
            style: {
              background: '#4CAF50',
              color: '#fff',
              borderRadius: '8px',
              padding: '12px 16px',
              fontSize: '14px',
              maxWidth: '300px',
            },
          });
          
          // Show browser notification for new chat
          showBrowserNotification('New Chat', {
            body: `You've been added to ${chatName}`,
            tag: `new-chat-${data.chatId}`,
            requireInteraction: false
          });
        }
      });

      setSocket(newSocket);

      return () => {
        newSocket.close();
      };
    }
  }, [user, currentChatId, showBrowserNotification]);

  const sendMessage = (chatId, content, messageType = 'text') => {
    if (socket && connected) {
      socket.emit('send-message', { chatId, content, messageType });
    }
  };

  const startTyping = (chatId) => {
    if (socket && connected) {
      socket.emit('typing-start', { chatId });
    }
  };

  const stopTyping = (chatId) => {
    if (socket && connected) {
      socket.emit('typing-stop', { chatId });
    }
  };

  const setCurrentChat = (chatId) => {
    setCurrentChatId(chatId);
  };

  const value = {
    socket,
    connected,
    sendMessage,
    startTyping,
    stopTyping,
    setCurrentChat
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};
