import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Send, MoreVertical, LogOut, Trash2 } from 'lucide-react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import './ChatWindow.css';

const ChatWindow = ({ chat, onBack }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [typingUsers, setTypingUsers] = useState([]);
  const [showMenu, setShowMenu] = useState(false);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const menuRef = useRef(null);
  const { socket, sendMessage, startTyping, stopTyping } = useSocket();
  const { user } = useAuth();

  const fetchMessages = useCallback(async () => {
    try {
      const response = await fetch(`/api/messages/${chat.id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages);
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  }, [chat?.id]);

  const handleNewMessage = (message) => {
    setMessages(prev => [...prev, message]);
  };

  const handleUserTyping = useCallback((data) => {
    if (data.chatId === chat.id) {
      setTypingUsers(prev => {
        if (!prev.find(user => user.userId === data.userId)) {
          return [...prev, { userId: data.userId, username: data.username }];
        }
        return prev;
      });
    }
  }, [chat?.id]);

  const handleUserStoppedTyping = useCallback((data) => {
    if (data.chatId === chat.id) {
      setTypingUsers(prev => prev.filter(user => user.userId !== data.userId));
    }
  }, [chat?.id]);

  useEffect(() => {
    if (chat) {
      fetchMessages();
    }
  }, [chat, fetchMessages]);

  useEffect(() => {
    if (socket) {
      socket.on('new-message', handleNewMessage);
      socket.on('user-typing', handleUserTyping);
      socket.on('user-stopped-typing', handleUserStoppedTyping);

      return () => {
        socket.off('new-message', handleNewMessage);
        socket.off('user-typing', handleUserTyping);
        socket.off('user-stopped-typing', handleUserStoppedTyping);
      };
    }
  }, [socket, handleUserTyping, handleUserStoppedTyping]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = () => {
    if (newMessage.trim()) {
      sendMessage(chat.id, newMessage, 'text');
      setNewMessage('');
      stopTyping(chat.id);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleTyping = () => {
    startTyping(chat.id);
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    typingTimeoutRef.current = setTimeout(() => {
      stopTyping(chat.id);
    }, 1000);
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const leaveChat = async () => {
    try {
      const response = await fetch(`/api/chats/${chat.id}/leave`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        onBack(); // Go back to chat list
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to leave chat');
      }
    } catch (error) {
      console.error('Error leaving chat:', error);
      alert('Failed to leave chat');
    }
  };

  const deleteChat = async () => {
    try {
      const response = await fetch(`/api/chats/${chat.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        onBack(); // Go back to chat list
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to delete chat');
      }
    } catch (error) {
      console.error('Error deleting chat:', error);
      alert('Failed to delete chat');
    }
  };

  const handleMenuClick = () => {
    setShowMenu(!showMenu);
  };

  const handleMenuAction = (action) => {
    setShowMenu(false);
    if (action === 'leave') {
      if (window.confirm(`Are you sure you want to leave "${chat.display_name}"?`)) {
        leaveChat();
      }
    } else if (action === 'delete') {
      if (window.confirm(`Are you sure you want to delete "${chat.display_name}" for everyone?`)) {
        deleteChat();
      }
    }
  };

  const quillModules = {
    toolbar: [
      ['bold', 'italic', 'underline'],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      ['link'],
      ['clean']
    ],
  };

  const quillFormats = [
    'bold', 'italic', 'underline',
    'list', 'bullet',
    'link'
  ];

  if (loading) {
    return (
      <div className="chat-window">
        <div className="chat-header">
          <button className="back-button" onClick={onBack}>
            <ArrowLeft size={20} />
          </button>
          <div className="loading-header">
            <div className="loading-spinner"></div>
            <span>Loading chat...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-window">
      <div className="chat-header">
        <button className="back-button" onClick={onBack}>
          <ArrowLeft size={20} />
        </button>
        <div className="chat-info">
          <div className="chat-avatar">
            {chat.avatar_url ? (
              <img src={chat.avatar_url} alt={chat.display_name} />
            ) : (
              chat.display_name?.charAt(0)?.toUpperCase() || 'C'
            )}
          </div>
          <div className="chat-details">
            <h3>{chat.display_name}</h3>
            <p>
              {typingUsers.length > 0 
                ? `${typingUsers.map(u => u.username).join(', ')} typing...`
                : 'Online'
              }
            </p>
          </div>
        </div>
        <div className="more-menu-container" ref={menuRef}>
          <button className="more-button" onClick={handleMenuClick}>
            <MoreVertical size={20} />
          </button>
          {showMenu && (
            <div className="more-menu">
              <button 
                className="menu-item" 
                onClick={() => handleMenuAction('leave')}
              >
                <LogOut size={16} />
                Leave Chat
              </button>
              {chat.created_by === user?.id && (
                <button 
                  className="menu-item delete-item" 
                  onClick={() => handleMenuAction('delete')}
                >
                  <Trash2 size={16} />
                  Delete Chat
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="no-messages">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={message.id}
              className={`message ${message.sender_id === chat.currentUserId ? 'sent' : 'received'}`}
            >
              <div className="message-content">
                <div 
                  className="message-text"
                  dangerouslySetInnerHTML={{ __html: message.content }}
                />
                <span className="message-time">
                  {formatTime(message.created_at)}
                </span>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="message-input-container">
        <div className="message-input-wrapper">
          <ReactQuill
            value={newMessage}
            onChange={setNewMessage}
            onKeyPress={handleKeyPress}
            onChangeSelection={handleTyping}
            placeholder="Type a message..."
            modules={quillModules}
            formats={quillFormats}
            className="message-input"
          />
          <button 
            className="send-button"
            onClick={handleSendMessage}
            disabled={!newMessage.trim()}
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatWindow;
