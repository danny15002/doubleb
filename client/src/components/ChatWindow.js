import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Send, MoreVertical, LogOut, Trash2, Image as ImageIcon } from 'lucide-react';
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
  const [showImageResizeModal, setShowImageResizeModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [originalImageSize, setOriginalImageSize] = useState({ width: 0, height: 0 });
  const [estimatedNewSize, setEstimatedNewSize] = useState(0);
  const [imageResizeOptions, setImageResizeOptions] = useState({
    maxWidth: 800,
    maxHeight: 600,
    quality: 0.8
  });
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

  // Calculate estimated size when resize options change
  useEffect(() => {
    if (showImageResizeModal && originalImageSize.width > 0) {
      calculateEstimatedSize();
    }
  }, [imageResizeOptions, originalImageSize, showImageResizeModal]);

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

  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Check if it's an image
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.');
      return;
    }

    // If image is small enough, upload directly
    if (file.size <= 2 * 1024 * 1024) {
      await uploadImage(file);
      return;
    }

    // For larger images, show resize modal
    setSelectedImage(file);
    
    // Get original image dimensions for preview
    const img = new Image();
    img.onload = () => {
      setOriginalImageSize({ width: img.width, height: img.height });
    };
    img.src = URL.createObjectURL(file);
    
    setShowImageResizeModal(true);
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

  const handleResizeAndUpload = async () => {
    if (!selectedImage) return;

    try {
      setUploadingImage(true);
      setShowImageResizeModal(false);

      const resizedFile = await resizeImage(
        selectedImage,
        imageResizeOptions.maxWidth,
        imageResizeOptions.maxHeight,
        imageResizeOptions.quality
      );

      await uploadImage(resizedFile);
    } catch (error) {
      console.error('Error resizing image:', error);
      alert('Failed to resize image');
    } finally {
      setUploadingImage(false);
      setSelectedImage(null);
    }
  };

  const calculateEstimatedSize = () => {
    if (!originalImageSize.width || !selectedImage) return;
    
    const { width: origWidth, height: origHeight } = originalImageSize;
    const { maxWidth, maxHeight, quality } = imageResizeOptions;
    
    // Calculate scaling factors
    const widthScale = maxWidth / origWidth;
    const heightScale = maxHeight / origHeight;
    const scale = Math.min(widthScale, heightScale, 1);
    
    // Calculate new dimensions
    const newWidth = Math.round(origWidth * scale);
    const newHeight = Math.round(origHeight * scale);
    
    // Estimate file size reduction based on area and quality
    const areaReduction = (newWidth * newHeight) / (origWidth * origHeight);
    const estimatedSize = selectedImage.size * areaReduction * quality;
    
    setEstimatedNewSize(estimatedSize);
    
    // Store new dimensions for display
    setImageResizeOptions(prev => ({
      ...prev,
      newWidth,
      newHeight
    }));
  };

  const handleCancelResize = () => {
    setShowImageResizeModal(false);
    setSelectedImage(null);
    setOriginalImageSize({ width: 0, height: 0 });
    setEstimatedNewSize(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
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
          messages.map((message, index) => {
            const isOwnMessage = message.sender_id === user.id;
            return (
              <div
                key={message.id}
                className={`message ${isOwnMessage ? 'sent' : 'received'}`}
              >
                <div className="message-content">
                  {!isOwnMessage && (
                    <div className="message-sender">
                      {message.sender_name || message.username}
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
                  <span className="message-time">
                    {formatTime(message.created_at)}
                  </span>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="message-input-container">
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

      {/* Image Resize Modal */}
      {showImageResizeModal && selectedImage && (
        <div className="image-resize-modal-overlay">
          <div className="image-resize-modal">
            <h3>Resize Image</h3>
            <p>Your image is larger than 2MB. Please choose resize options:</p>
            {originalImageSize.width > 0 && (
              <div className="original-size-info">
                <p><strong>Original size:</strong> {originalImageSize.width} × {originalImageSize.height} pixels</p>
                <p><strong>File size:</strong> {(selectedImage.size / (1024 * 1024)).toFixed(1)} MB</p>
                {estimatedNewSize > 0 && (
                  <>
                    <p><strong>New dimensions:</strong> {imageResizeOptions.newWidth || 0} × {imageResizeOptions.newHeight || 0} pixels</p>
                    <p><strong>Estimated new size:</strong> {(estimatedNewSize / (1024 * 1024)).toFixed(1)} MB</p>
                  </>
                )}
              </div>
            )}
            
            <div className="resize-options">
              <div className="preset-sizes">
                <label>Quick presets:</label>
                <div className="preset-buttons">
                  <button 
                    type="button"
                    className="preset-btn"
                    onClick={() => setImageResizeOptions(prev => ({ ...prev, maxWidth: 400, maxHeight: 300 }))}
                  >
                    Small (400×300)
                  </button>
                  <button 
                    type="button"
                    className="preset-btn"
                    onClick={() => setImageResizeOptions(prev => ({ ...prev, maxWidth: 800, maxHeight: 600 }))}
                  >
                    Medium (800×600)
                  </button>
                  <button 
                    type="button"
                    className="preset-btn"
                    onClick={() => setImageResizeOptions(prev => ({ ...prev, maxWidth: 1200, maxHeight: 900 }))}
                  >
                    Large (1200×900)
                  </button>
                </div>
              </div>
              
              <div className="option-group">
                <label htmlFor="maxWidth">Max Width (px):</label>
                <input
                  id="maxWidth"
                  type="number"
                  value={imageResizeOptions.maxWidth}
                  onChange={(e) => setImageResizeOptions(prev => ({
                    ...prev,
                    maxWidth: parseInt(e.target.value) || 800
                  }))}
                  min="100"
                  max="2000"
                />
              </div>
              
              <div className="option-group">
                <label htmlFor="maxHeight">Max Height (px):</label>
                <input
                  id="maxHeight"
                  type="number"
                  value={imageResizeOptions.maxHeight}
                  onChange={(e) => setImageResizeOptions(prev => ({
                    ...prev,
                    maxHeight: parseInt(e.target.value) || 600
                  }))}
                  min="100"
                  max="2000"
                />
              </div>
              
              <div className="option-group">
                <label htmlFor="quality">Quality:</label>
                <input
                  id="quality"
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.1"
                  value={imageResizeOptions.quality}
                  onChange={(e) => setImageResizeOptions(prev => ({
                    ...prev,
                    quality: parseFloat(e.target.value)
                  }))}
                />
                <span>{Math.round(imageResizeOptions.quality * 100)}%</span>
              </div>
            </div>

            <div className="modal-buttons">
              <button 
                className="cancel-button"
                onClick={handleCancelResize}
                disabled={uploadingImage}
              >
                Cancel
              </button>
              <button 
                className="resize-button"
                onClick={handleResizeAndUpload}
                disabled={uploadingImage}
              >
                {uploadingImage ? 'Processing...' : 'Resize & Upload'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatWindow;

