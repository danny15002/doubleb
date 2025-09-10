import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { useAuth } from './AuthContext';
import { config } from '../config/api';

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
      setNotificationPermission(Notification.permission);
      
      // Only request permission if it's default and user is authenticated
      if (Notification.permission === 'default' && user) {
        Notification.requestPermission().then(permission => {
          setNotificationPermission(permission);
        });
      }
    }
  }, [user]);

  const requestNotificationPermission = useCallback(async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      return permission;
    }
    return 'denied';
  }, []);

  const showBrowserNotification = useCallback((title, options) => {
    if (notificationPermission === 'granted' && document.hidden) {
      try {
        const notification = new Notification(title, {
          icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">💬</text></svg>',
          badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">💬</text></svg>',
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
      } catch (error) {
        console.error('Failed to show notification:', error);
      }
    }
  }, [notificationPermission]);

  useEffect(() => {
    if (user) {
      const token = localStorage.getItem('token');
      const newSocket = io(config.serverUrl, {
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
        // Check if this is the user's own message or current chat
        const isOwnMessage = String(message.user_id) === String(user.id);
        const isCurrentChat = String(message.chat_id) === String(currentChatId);

        console.log('isOwnMessage', isOwnMessage);
        console.log('isCurrentChat', isCurrentChat);
        console.log('message', message);
        
        // Only show notification if the message is not from the current user
        // and not from the currently viewed chat
        // Use strict equality and ensure both values are properly compared
        
        if (!isOwnMessage && !isCurrentChat) {
          console.log('Showing notification');
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

      // Handle chat deletion notifications
      newSocket.on('chat-deleted', (data) => {
        const chatName = data.chatName || `Chat ${data.chatId}`;
        
        // Show notification
        toast(`${chatName} has been deleted`, {
          duration: 4000,
          position: 'top-right',
          style: {
            background: '#ff4757',
            color: '#fff',
            borderRadius: '8px',
            padding: '12px 16px',
            fontSize: '14px',
            maxWidth: '300px',
          },
        });
        
        // Show browser notification
        showBrowserNotification('Chat Deleted', {
          body: `${chatName} has been deleted`,
          tag: `chat-deleted-${data.chatId}`,
          requireInteraction: false
        });
      });

      setSocket(newSocket);

      return () => {
        newSocket.close();
      };
    }
  }, [user, currentChatId, showBrowserNotification]);

  const sendMessage = (chatId, messageData, messageType = 'text') => {
    if (socket && connected) {
      // Handle both old format (string content) and new format (object with content and quotedMessage)
      const content = typeof messageData === 'string' ? messageData : messageData.content;
      const quotedMessage = typeof messageData === 'object' ? messageData.quotedMessage : null;
      
      socket.emit('send-message', { 
        chatId, 
        content, 
        messageType,
        quotedMessage 
      });
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
    if (socket && connected && chatId) {
      socket.emit('join-chat', { chatId });
    }
  };

  const editMessage = async (messageId, content) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${config.serverUrl}/api/messages/${messageId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ content })
      });

      if (response.ok) {
        const data = await response.json();
        return { success: true, data: data.data };
      } else {
        const error = await response.json();
        return { success: false, error: error.error };
      }
    } catch (error) {
      console.error('Error editing message:', error);
      return { success: false, error: 'Failed to edit message' };
    }
  };

  const value = {
    socket,
    connected,
    sendMessage,
    startTyping,
    stopTyping,
    setCurrentChat,
    editMessage,
    notificationPermission,
    requestNotificationPermission
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};

