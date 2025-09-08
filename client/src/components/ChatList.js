import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { LogOut, Search, Plus, MessageCircle, Trash2, Bell, BellOff } from 'lucide-react';
import { getApiUrl } from '../config/api';
import NewChatModal from './NewChatModal';
import './ChatList.css';

const ChatList = ({ onChatSelect, selectedChat }) => {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const { user, logout } = useAuth();
  const { socket, notificationPermission, requestNotificationPermission } = useSocket();

  const stripHtml = (html) => {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  };

  const fetchChats = useCallback(async () => {
    try {
      const response = await fetch(getApiUrl('/api/chats'), {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        // Strip HTML from existing messages
        const chatsWithStrippedHtml = data.chats.map(chat => ({
          ...chat,
          last_message: chat.last_message ? stripHtml(chat.last_message) : null
        }));
        setChats(chatsWithStrippedHtml);
      }
    } catch (error) {
      console.error('Error fetching chats:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleNewMessage = useCallback((message) => {
    setChats(prevChats => {
      const updatedChats = prevChats.map(chat => {
        if (chat.id === message.chat_id) {
          return {
            ...chat,
            last_message: stripHtml(message.content),
            last_message_time: message.created_at,
            // Ensure we have display_name for the chat
            display_name: chat.display_name || chat.name || `Chat ${chat.id}`
          };
        }
        return chat;
      });
      
      // Move the chat to the top
      const chatIndex = updatedChats.findIndex(chat => chat.id === message.chat_id);
      if (chatIndex > -1) {
        const [updatedChat] = updatedChats.splice(chatIndex, 1);
        updatedChats.unshift(updatedChat);
      }
      
      return updatedChats;
    });
  }, []);

  const handleNewChat = useCallback((data) => {
    // Only handle if this is for the current user
    if (data.participantId === user?.id) {
      // Refresh the chat list to include the new chat
      fetchChats();
    }
  }, [user?.id, fetchChats]);

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  useEffect(() => {
    if (socket) {
      socket.on('new-message', handleNewMessage);
      socket.on('new-chat', handleNewChat);
      return () => {
        socket.off('new-message', handleNewMessage);
        socket.off('new-chat', handleNewChat);
      };
    }
  }, [socket, user?.id, handleNewMessage, handleNewChat]);

  const createChat = async (type, participantUsernames, groupName) => {
    try {
      const requestBody = {
        type: type
      };

      if (type === 'direct') {
        requestBody.participantUsernames = participantUsernames;
      } else {
        requestBody.participantIds = []; // Empty array for group chats
        requestBody.name = groupName || 'New Group';
      }

      const response = await fetch(getApiUrl('/api/chats'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(requestBody)
      });

      if (response.ok) {
        const data = await response.json();
        // Refresh the chat list
        await fetchChats();
        // Select the new chat - create a basic chat object for selection
        if (data.chat && data.chat.id) {
          onChatSelect({
            id: data.chat.id,
            name: data.chat.name,
            type: data.chat.type,
            display_name: data.chat.name || `Chat ${data.chat.id}`,
            last_message: null,
            last_message_time: null
          });
        }
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create chat');
      }
    } catch (error) {
      console.error('Error creating chat:', error);
      throw error;
    }
  };

  const leaveChat = async (chatId) => {
    try {
      const response = await fetch(getApiUrl(`/api/chats/${chatId}/leave`), {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        // Refresh the chat list
        await fetchChats();
        // Clear selected chat if it was the one that was left
        if (selectedChat && selectedChat.id === chatId) {
          onChatSelect(null);
        }
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed to leave chat');
      }
    } catch (error) {
      console.error('Error leaving chat:', error);
      throw error;
    }
  };

  const deleteChat = async (chatId) => {
    try {
      const response = await fetch(getApiUrl(`/api/chats/${chatId}`), {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        // Refresh the chat list
        await fetchChats();
        // Clear selected chat if it was the one that was deleted
        if (selectedChat && selectedChat.id === chatId) {
          onChatSelect(null);
        }
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete chat');
      }
    } catch (error) {
      console.error('Error deleting chat:', error);
      throw error;
    }
  };

  const filteredChats = chats.filter(chat =>
    chat.display_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now - date) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 168) { // 7 days
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  if (loading) {
    return (
      <div className="chat-list">
        <div className="chat-list-header">
          <div className="user-info">
            <div className="user-avatar">
              {user?.displayName?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div className="user-details">
              <h3>{user?.displayName || 'User'}</h3>
              <p>Loading chats...</p>
            </div>
          </div>
        </div>
        <div className="loading-chats">
          <div className="loading-spinner"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-list">
      <div className="chat-list-header">
        <div className="user-info">
          <div className="user-avatar">
            {(user?.displayName || user?.username)?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <div className="user-details">
            <h3>{user?.displayName || user?.username || 'User'}</h3>
            <p>Online</p>
          </div>
        </div>
        <div className="header-actions">
          <button 
            className={`notification-button ${notificationPermission === 'denied' ? 'disabled' : ''}`}
            onClick={notificationPermission === 'default' ? requestNotificationPermission : undefined}
            title={
              notificationPermission === 'default' ? 'Enable notifications' :
                notificationPermission === 'denied' ? 'Notifications blocked - check browser settings' :
                  'Notifications enabled'
            }
          >
            {notificationPermission === 'denied' ? <BellOff size={20} /> : <Bell size={20} />}
          </button>
          {notificationPermission === 'granted' && (
            <button 
              className="test-notification-button"
              onClick={() => {
                if ('Notification' in window) {
                  new Notification('Test Notification', {
                    body: 'This is a test notification from BB Chat',
                    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">💬</text></svg>'
                  });
                }
              }}
              title="Test notification"
            >
              🔔
            </button>
          )}
          <button className="logout-button" onClick={logout} title="Logout">
            <LogOut size={20} />
          </button>
        </div>
      </div>

      <div className="search-container">
        <div className="search-input-wrapper">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder="Search chats..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        <button 
          className="new-chat-button" 
          title="New chat"
          onClick={() => setShowNewChatModal(true)}
        >
          <Plus size={20} />
        </button>
      </div>

      <div className="chats-container">
        {filteredChats.length === 0 ? (
          <div className="no-chats">
            <MessageCircle size={48} className="no-chats-icon" />
            <p>No chats found</p>
            <small>Start a new conversation</small>
          </div>
        ) : (
          filteredChats.map(chat => (
            <div
              key={chat.id}
              className="chat-item"
            >
              <div 
                className="chat-content"
                onClick={() => onChatSelect(chat)}
              >
                <div className="chat-avatar">
                  {chat.avatar_url ? (
                    <img src={chat.avatar_url} alt={chat.display_name} />
                  ) : (
                    chat.display_name?.charAt(0)?.toUpperCase() || 'C'
                  )}
                </div>
                <div className="chat-info">
                  <div className="chat-header">
                    <h4 className="chat-name">{chat.display_name}</h4>
                    <span className="chat-time">{formatTime(chat.last_message_time)}</span>
                  </div>
                  <p className="chat-preview">
                    {chat.last_message || 'No messages yet'}
                  </p>
                </div>
              </div>
              <button
                className="delete-chat-button"
                onClick={(e) => {
                  e.stopPropagation();
                  const isCreator = chat.created_by === user?.id;
                  const actionText = isCreator ? 'delete' : 'leave';
                  
                  if (window.confirm(`Are you sure you want to ${actionText} "${chat.display_name}"?`)) {
                    if (isCreator) {
                      deleteChat(chat.id);
                    } else {
                      leaveChat(chat.id);
                    }
                  }
                }}
                title={chat.created_by === user?.id ? "Delete chat (for everyone)" : "Leave chat"}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>

      <NewChatModal
        isOpen={showNewChatModal}
        onClose={() => setShowNewChatModal(false)}
        onCreateChat={createChat}
      />
    </div>
  );
};

export default ChatList;
