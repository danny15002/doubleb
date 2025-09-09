import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Send, MoreVertical, LogOut, Trash2, Image as ImageIcon, X, Check, CheckCheck } from 'lucide-react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { getApiUrl } from '../config/api';
import './ChatWindow.css';

const ChatWindow = ({ chat, onBack }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [typingUsers, setTypingUsers] = useState([]);
  const [showMenu, setShowMenu] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [quotedMessage, setQuotedMessage] = useState(null);
  const [swipeStartX, setSwipeStartX] = useState(null);
  const [swipeStartY, setSwipeStartY] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedMessageForReaction, setSelectedMessageForReaction] = useState(null);
  const [longPressTimer, setLongPressTimer] = useState(null);
  const [customEmoji, setCustomEmoji] = useState('');
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const menuRef = useRef(null);
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const { socket, sendMessage, startTyping, stopTyping } = useSocket();
  const { user } = useAuth();

  const fetchMessages = useCallback(async () => {
    try {
      const response = await fetch(getApiUrl(`/api/messages/${chat.id}`), {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Fetched messages with reactions:', data.messages);
        setMessages(data.messages);
      } else if (response.status === 404 || response.status === 403) {
        // Chat not found or access denied - redirect back to chat list
        console.log('Chat not found or access denied, redirecting...');
        onBack();
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  }, [chat?.id, onBack]);

  const handleNewMessage = (message) => {
    // Only handle messages for the current chat - compare as strings to avoid type mismatch
    if (String(message.chat_id) !== String(chat.id)) {
      return;
    }
    
    // Normalize message structure - Socket.IO uses user_id, API uses sender_id
    const normalizedMessage = {
      ...message,
      sender_id: message.user_id || message.sender_id,
      sender_name: message.sender_name || message.username
    };
    setMessages(prev => [...prev, normalizedMessage]);
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

  const handleReactionUpdate = useCallback((data) => {
    console.log('Reaction update received:', data);
    setMessages(prev => prev.map(message => 
      message.id === data.messageId 
        ? { ...message, reactions: data.reactions }
        : message
    ));
  }, []);

  const handleStatusUpdate = useCallback((data) => {
    console.log('Status update received:', data);
    setMessages(prev => prev.map(message => 
      message.id === data.messageId 
        ? { ...message, status: data.status }
        : message
    ));
  }, []);

  useEffect(() => {
    if (socket) {
      socket.on('new-message', handleNewMessage);
      socket.on('user-typing', handleUserTyping);
      socket.on('user-stopped-typing', handleUserStoppedTyping);
      socket.on('reaction-updated', handleReactionUpdate);
      socket.on('message-status-updated', handleStatusUpdate);

      return () => {
        socket.off('new-message', handleNewMessage);
        socket.off('user-typing', handleUserTyping);
        socket.off('user-stopped-typing', handleUserStoppedTyping);
        socket.off('reaction-updated', handleReactionUpdate);
        socket.off('message-status-updated', handleStatusUpdate);
      };
    }
  }, [socket, handleUserTyping, handleUserStoppedTyping, handleReactionUpdate, handleStatusUpdate]);

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
      const messageData = {
        content: newMessage,
        quotedMessage: quotedMessage
      };
      sendMessage(chat.id, messageData, 'text');
      setNewMessage('');
      setQuotedMessage(null);
      stopTyping(chat.id);
    }
  };

  const resizeImage = (file, maxWidth, maxHeight, quality) => {
    return new Promise((resolve, reject) => {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        try {
          // Calculate new dimensions while maintaining aspect ratio
          let { width, height } = img;
          
          // Calculate scaling factors for both dimensions
          const widthScale = maxWidth / width;
          const heightScale = maxHeight / height;
          
          // Use the smaller scaling factor to ensure both dimensions fit within limits
          const scale = Math.min(widthScale, heightScale, 1); // Don't upscale
          
          width = Math.round(width * scale);
          height = Math.round(height * scale);
          
          // Set canvas dimensions
          canvas.width = width;
          canvas.height = height;
          
          // Clear canvas and set image smoothing
          ctx.clearRect(0, 0, width, height);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          
          // Draw and resize image
          ctx.drawImage(img, 0, 0, width, height);
          
          // Convert to blob
          canvas.toBlob((blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to create resized image'));
            }
          }, file.type, quality);
        } catch (error) {
          reject(error);
        }
      };
      
      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };
      
      img.src = URL.createObjectURL(file);
    });
  };

  const resizeImageToTargetSize = (file, targetSizeBytes) => {
    return new Promise((resolve, reject) => {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        try {
          let { width, height } = img;
          const aspectRatio = width / height;
          
          // Start with a quality of 0.9 and adjust if needed
          let quality = 0.9;
          let resizedBlob = null;
          
          // Binary search to find the optimal quality that gets us close to target size
          const findOptimalQuality = (minQuality, maxQuality, iterations = 0) => {
            if (iterations > 10) {
              // Fallback to the best result we found
              resolve(resizedBlob || file);
              return;
            }
            
            const testQuality = (minQuality + maxQuality) / 2;
            
            // Calculate dimensions based on current quality
            // We'll use a simple heuristic: reduce dimensions by sqrt(quality) to roughly maintain file size
            const scale = Math.sqrt(testQuality);
            const newWidth = Math.round(width * scale);
            const newHeight = Math.round(height * scale);
            
            // Set canvas dimensions
            canvas.width = newWidth;
            canvas.height = newHeight;
            
            // Clear canvas and set image smoothing
            ctx.clearRect(0, 0, newWidth, newHeight);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            
            // Draw and resize image
            ctx.drawImage(img, 0, 0, newWidth, newHeight);
            
            // Convert to blob
            canvas.toBlob((blob) => {
              if (!blob) {
                reject(new Error('Failed to create resized image'));
                return;
              }
              
              const currentSize = blob.size;
              const sizeRatio = currentSize / targetSizeBytes;
              
              if (Math.abs(sizeRatio - 1) < 0.1) {
                // Close enough to target size
                resolve(blob);
              } else if (currentSize > targetSizeBytes) {
                // Too big, reduce quality
                findOptimalQuality(minQuality, testQuality, iterations + 1);
              } else {
                // Too small, increase quality (but save this as our best result so far)
                resizedBlob = blob;
                findOptimalQuality(testQuality, maxQuality, iterations + 1);
              }
            }, file.type, testQuality);
          };
          
          // Start the binary search
          findOptimalQuality(0.1, 0.95);
          
        } catch (error) {
          reject(error);
        }
      };
      
      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };
      
      img.src = URL.createObjectURL(file);
    });
  };

  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Check if it's an image
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.');
      return;
    }

    // If image is small enough, upload directly
    if (file.size <= 3 * 1024 * 1024) {
      await uploadImage(file);
      return;
    }

    // For larger images, automatically resize to fit within 3MB
    try {
      setUploadingImage(true);
      
      // Calculate optimal dimensions to get close to 3MB
      const targetSizeBytes = 3 * 1024 * 1024;
      const resizedFile = await resizeImageToTargetSize(file, targetSizeBytes);
      
      await uploadImage(resizedFile);
    } catch (error) {
      console.error('Error resizing image:', error);
      alert('Failed to resize image');
    } finally {
      setUploadingImage(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const uploadImage = async (file) => {
    setUploadingImage(true);

    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('caption', newMessage.trim());

      const response = await fetch(getApiUrl(`/api/messages/${chat.id}/upload-image`), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        // Don't add the message locally - it will be received via Socket.IO
        setNewMessage(''); // Clear the input
      } else if (response.status === 404 || response.status === 403) {
        // Chat not found or access denied - redirect back to chat list
        console.log('Chat not found or access denied during image upload, redirecting...');
        onBack();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to upload image');
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Failed to upload image');
    } finally {
      setUploadingImage(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };


  const triggerImageUpload = () => {
    fileInputRef.current?.click();
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

  const renderMessageStatus = (message) => {
    const isOwnMessage = message.sender_id === user?.id;
    if (!isOwnMessage) return null;
    
    const status = message.status || 'sent';
    
    switch (status) {
      case 'sent':
        return (
          <div className="message-status">
            <Check size={12} className="status-icon sent" />
          </div>
        );
      case 'delivered':
        return (
          <div className="message-status">
            <Check size={12} className="status-icon delivered" />
            <Check size={12} className="status-icon delivered" />
          </div>
        );
      case 'read':
        return (
          <div className="message-status">
            <CheckCheck size={12} className="status-icon read" />
          </div>
        );
      default:
        return null;
    }
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


  const removeQuotedMessage = () => {
    setQuotedMessage(null);
  };

  // Long press detection for reactions
  const handleMouseDown = (e, message) => {
    e.preventDefault();
    const timer = setTimeout(() => {
      setSelectedMessageForReaction(message);
      setShowEmojiPicker(true);
    }, 500); // 500ms long press
    setLongPressTimer(timer);
  };

  const handleMouseUp = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  const handleMouseLeave = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  // Touch events for mobile
  const handleTouchStart = (e, message) => {
    const touch = e.touches[0];
    setSwipeStartX(touch.clientX);
    setSwipeStartY(touch.clientY);
    
    const timer = setTimeout(() => {
      setSelectedMessageForReaction(message);
      setShowEmojiPicker(true);
    }, 500); // 500ms long press
    setLongPressTimer(timer);
  };

  const handleTouchEnd = (e, message) => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }

    if (!swipeStartX || !swipeStartY) return;

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - swipeStartX;
    const deltaY = touch.clientY - swipeStartY;
    const minSwipeDistance = 50;

    // Check if it's a horizontal swipe (left or right) for quoting
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > minSwipeDistance) {
      // Quote the message
      setQuotedMessage(message);
    }

    setSwipeStartX(null);
    setSwipeStartY(null);
  };

  // Emoji picker functions
  const handleEmojiSelect = (emoji) => {
    if (selectedMessageForReaction) {
      addReaction(selectedMessageForReaction.id, emoji);
    }
    setShowEmojiPicker(false);
    setSelectedMessageForReaction(null);
    setCustomEmoji('');
  };

  const handleCustomEmojiSubmit = () => {
    if (customEmoji.trim() && selectedMessageForReaction) {
      addReaction(selectedMessageForReaction.id, customEmoji.trim());
      setShowEmojiPicker(false);
      setSelectedMessageForReaction(null);
      setCustomEmoji('');
    }
  };

  const addReaction = async (messageId, emoji) => {
    try {
      console.log('Adding reaction:', { messageId, emoji });
      const response = await fetch(getApiUrl(`/api/messages/${messageId}/reactions`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ emoji })
      });

      if (response.ok) {
        console.log('Reaction added successfully');
        // Also emit socket event for immediate update
        if (socket) {
          socket.emit('add-reaction', { messageId, emoji });
        }
      } else {
        const error = await response.json();
        console.error('Error adding reaction:', error);
      }
    } catch (error) {
      console.error('Error adding reaction:', error);
    }
  };

  const removeReaction = async (messageId, emoji) => {
    try {
      console.log('Removing reaction:', { messageId, emoji });
      const response = await fetch(getApiUrl(`/api/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`), {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        console.log('Reaction removed successfully');
        // Also emit socket event for immediate update
        if (socket) {
          socket.emit('remove-reaction', { messageId, emoji });
        }
      } else {
        const error = await response.json();
        console.error('Error removing reaction:', error);
      }
    } catch (error) {
      console.error('Error removing reaction:', error);
    }
  };

  const toggleReaction = (messageId, emoji, currentReactions) => {
    const hasReacted = currentReactions.some(reaction => 
      reaction.users.some(u => u.user_id === user?.id)
    );
    
    if (hasReacted) {
      removeReaction(messageId, emoji);
    } else {
      addReaction(messageId, emoji);
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
          messages.map((message, index) => {
            const isOwnMessage = message.sender_id === user.id;
            return (
              <div
                key={message.id}
                className={`message ${isOwnMessage ? 'sent' : 'received'}`}
                onMouseDown={(e) => handleMouseDown(e, message)}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                onTouchStart={(e) => handleTouchStart(e, message)}
                onTouchEnd={(e) => handleTouchEnd(e, message)}
              >
                <div className="message-content">
                  {!isOwnMessage && (
                    <div className="message-sender">
                      {message.sender_name || message.username}
                    </div>
                  )}
                  {message.quotedMessage && (
                    <div className="quoted-message">
                      <div className="quoted-message-content">
                        <span className="quoted-sender">
                          {message.quotedMessage.sender_name || message.quotedMessage.username}
                        </span>
                        <div 
                          className="quoted-text"
                          dangerouslySetInnerHTML={{ __html: message.quotedMessage.content }}
                        />
                      </div>
                    </div>
                  )}
                  {message.message_type === 'image' ? (
                    <div className="message-image">
                      {message.image_data && (
                        <img 
                          src={`data:${message.image_data.mimetype};base64,${message.image_data.data}`}
                          alt={message.image_data.filename}
                          style={{ maxWidth: '300px', maxHeight: '300px', borderRadius: '8px' }}
                        />
                      )}
                      {message.content && (
                        <div 
                          className="message-text"
                          dangerouslySetInnerHTML={{ __html: message.content }}
                        />
                      )}
                    </div>
                  ) : (
                    <div 
                      className="message-text"
                      dangerouslySetInnerHTML={{ __html: message.content }}
                    />
                  )}
                  <div className="message-time-status">
                    <span className="message-time">
                      {formatTime(message.created_at)}
                    </span>
                    {renderMessageStatus(message)}
                  </div>
                  {message.reactions && message.reactions.length > 0 && (
                    <div className="message-reactions">
                      {message.reactions.map((reaction, index) => (
                        <button
                          key={index}
                          className={`reaction ${reaction.users.some(u => u.user_id === user?.id) ? 'reacted' : ''}`}
                          onClick={() => toggleReaction(message.id, reaction.emoji, message.reactions)}
                        >
                          <span className="reaction-emoji">{reaction.emoji}</span>
                          <span className="reaction-count">{reaction.count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="message-input-container">
        {quotedMessage && (
          <div className="quoted-message-preview">
            <div className="quoted-message-preview-content">
              <span className="quoted-sender">
                {quotedMessage.sender_name || quotedMessage.username}
              </span>
              <div 
                className="quoted-text"
                dangerouslySetInnerHTML={{ __html: quotedMessage.content }}
              />
            </div>
            <button 
              className="remove-quote-button"
              onClick={removeQuotedMessage}
              title="Remove quote"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="message-input-wrapper">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageUpload}
            accept="image/*"
            style={{ display: 'none' }}
          />
          <button 
            className="image-upload-button"
            onClick={triggerImageUpload}
            disabled={uploadingImage}
            title="Upload image"
          >
            <ImageIcon size={20} />
          </button>
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
            disabled={!newMessage.trim() || uploadingImage}
          >
            <Send size={20} />
          </button>
        </div>
        {uploadingImage && (
          <div className="upload-status">
            Uploading image...
          </div>
        )}
      </div>

      {/* Hidden canvas for image resizing */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Emoji Picker Modal */}
      {showEmojiPicker && (
        <div className="emoji-picker-overlay" onClick={() => setShowEmojiPicker(false)}>
          <div className="emoji-picker" onClick={(e) => e.stopPropagation()}>
            <div className="emoji-picker-header">
              <h3>Add Reaction</h3>
              <button 
                className="close-emoji-picker"
                onClick={() => setShowEmojiPicker(false)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="emoji-grid">
              {['😀', '😂', '😍', '🥰', '😎', '🤔', '👍', '👎', '❤️', '🔥', '🎉', '👏', '😢', '😡', '🤯', '💯'].map(emoji => (
                <button
                  key={emoji}
                  className="emoji-button"
                  onClick={() => handleEmojiSelect(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <div className="custom-emoji-section">
              <div className="custom-emoji-input">
                <input
                  type="text"
                  placeholder="Type any emoji..."
                  value={customEmoji}
                  onChange={(e) => setCustomEmoji(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleCustomEmojiSubmit()}
                />
                <button 
                  className="add-custom-emoji"
                  onClick={handleCustomEmojiSubmit}
                  disabled={!customEmoji.trim()}
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default ChatWindow;

