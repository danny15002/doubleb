import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Send, MoreVertical, LogOut, Trash2, Image as ImageIcon, X, Check, CheckCheck, Edit2, Save, Trash } from 'lucide-react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { getApiUrl } from '../config/api';
import './ChatWindow.css';

let touchOngoing = false;

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
  const LONG_PRESS_DELAY = 1200; // Increased to 1.2 seconds
  const [customEmoji, setCustomEmoji] = useState('');
  const [lastTapTime, setLastTapTime] = useState(0);
  const [lastTappedMessage, setLastTappedMessage] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const touchEventOccurred = useRef(false);
  const lastEventTime = useRef(0);
  const tapTimeoutRef = useRef(null);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const menuRef = useRef(null);
  const fileInputRef = useRef(null);
  const quillRef = useRef(null);
  const canvasRef = useRef(null);
  const textareaRef = useRef(null);
  const [inputValue, setInputValue] = useState('');
  const { socket, sendMessage, startTyping, stopTyping, editMessage, deleteMessage } = useSocket();
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

  // Detect touch device and handle touch events globally
  useEffect(() => {
    const checkTouchDevice = () => {
      setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
    };
    
    const handleGlobalTouchStart = () => {
      touchEventOccurred.current = true;
      // Reset after a short delay
      setTimeout(() => {
        touchEventOccurred.current = false;
      }, 300);
    };
    
    // Handle mobile keyboard visibility changes
    const handleResize = () => {
      // On mobile, when keyboard appears/disappears, the viewport height changes
      // This can help detect when keyboard is shown/hidden
      if (isTouchDevice && textareaRef.current && document.activeElement === textareaRef.current) {
        // Ensure textarea stays focused when keyboard is visible
        setTimeout(() => {
          if (textareaRef.current && !textareaRef.current.value) {
            textareaRef.current.focus();
          }
        }, 100);
      }
    };
    
    checkTouchDevice();
    window.addEventListener('resize', checkTouchDevice);
    window.addEventListener('resize', handleResize);
    document.addEventListener('touchstart', handleGlobalTouchStart, { passive: true });
    
    return () => {
      window.removeEventListener('resize', checkTouchDevice);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('touchstart', handleGlobalTouchStart);
    };
  }, [isTouchDevice]);

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

  const handleMessageEdited = useCallback((data) => {
    console.log('Message edited received:', data);
    setMessages(prev => prev.map(message => 
      message.id === data.id 
        ? { ...message, content: data.content, edited: data.edited, edited_at: data.edited_at }
        : message
    ));
  }, []);

  const handleMessageDeleted = useCallback((data) => {
    console.log('Message deleted received:', data);
    setMessages(prev => prev.filter(message => message.id !== data.messageId));
  }, []);

  useEffect(() => {
    if (socket) {
      socket.on('new-message', handleNewMessage);
      socket.on('user-typing', handleUserTyping);
      socket.on('user-stopped-typing', handleUserStoppedTyping);
      socket.on('reaction-updated', handleReactionUpdate);
      socket.on('message-status-updated', handleStatusUpdate);
      socket.on('message-edited', handleMessageEdited);
      socket.on('message-deleted', handleMessageDeleted);

      return () => {
        socket.off('new-message', handleNewMessage);
        socket.off('user-typing', handleUserTyping);
        socket.off('user-stopped-typing', handleUserStoppedTyping);
        socket.off('reaction-updated', handleReactionUpdate);
        socket.off('message-status-updated', handleStatusUpdate);
        socket.off('message-edited', handleMessageEdited);
        socket.off('message-deleted', handleMessageDeleted);
      };
    }
  }, [socket, handleUserTyping, handleUserStoppedTyping, handleReactionUpdate, handleStatusUpdate, handleMessageEdited, handleMessageDeleted]);

  // Configure Quill editor for better iOS compatibility
  useEffect(() => {
    if (quillRef.current) {
      const quill = quillRef.current.getEditor();
      const editor = quill.root;
      
      // Set proper attributes for iOS autocorrect
      editor.setAttribute('autocorrect', 'on');
      editor.setAttribute('autocapitalize', 'sentences');
      editor.setAttribute('spellcheck', 'true');
      editor.setAttribute('autocomplete', 'on');
      
      // Improve iOS keyboard behavior
      editor.style.webkitUserSelect = 'text';
      editor.style.webkitAppearance = 'none';
      editor.style.webkitTapHighlightColor = 'transparent';
    }
  }, []);

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

  // Blur textarea when clicking outside on mobile
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Only handle on mobile devices
      if (isTouchDevice && textareaRef.current) {
        const textarea = textareaRef.current;
        const inputContainer = textarea.closest('.message-input-container');
        
        // Check if the click is outside the input area
        if (inputContainer && !inputContainer.contains(event.target)) {
          // Only blur if the textarea is currently focused
          if (document.activeElement === textarea) {
            console.log('Blurring textarea due to outside click');
            textarea.blur();
          }
        }
      }
    };

    // Use both mousedown and touchstart for better mobile support
    // touchstart is more reliable on mobile devices
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isTouchDevice]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Auto-detect and convert links to clickable elements
  const detectAndConvertLinks = (text) => {
    if (!text) return text;
    
    // URL regex pattern - matches http, https, www, and common domains
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,})/g;
    
    return text.replace(urlRegex, (url) => {
      // Add protocol if missing
      const fullUrl = url.startsWith('http') ? url : `https://${url}`;
      return `<a href="${fullUrl}" target="_blank" rel="noopener noreferrer" class="message-link">${url}</a>`;
    });
  };

  // Format message content with link detection
  const formatMessageContent = (content) => {
    if (!content) return '';
    
    // If content is already HTML (from previous messages), return as is
    if (content.includes('<') && content.includes('>')) {
      return content;
    }
    
    // Convert newlines to <br> and detect links
    return detectAndConvertLinks(content)
      .replace(/\n/g, '<br>');
  };

  const handleSendMessage = useCallback((e) => {
    if (e) {
      e.preventDefault();
    }
    
    const messageToSend = inputValue.trim();
    if (messageToSend) {
      // Format the message content with link detection
      const formattedContent = formatMessageContent(messageToSend);
      
      const messageData = {
        content: formattedContent,
        quotedMessage: quotedMessage
      };
      
      // Send the message first
      sendMessage(chat.id, messageData, 'text');
      
      // Clear input and other state
      setInputValue('');
      setNewMessage(''); // Keep this for compatibility
      setQuotedMessage(null);
      stopTyping(chat.id);
      
      // On mobile, refocus the textarea after clearing to keep keyboard open
      // if (isTouchDevice) {
      setTimeout(() => {
        console.log('refocusing textarea');
        if (textareaRef.current) {
          textareaRef.current.focus();
        }
      }, 0);
      // }
    }
  }, [inputValue, quotedMessage, sendMessage, chat.id, stopTyping, isTouchDevice, formatMessageContent]);

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
          
          // Convert to blob - handle PNG vs JPEG differently
          const isPNG = file.type === 'image/png';
          if (isPNG) {
            // PNG doesn't support quality parameter
            canvas.toBlob((blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('Failed to create resized image'));
              }
            }, file.type);
          } else {
            // JPEG and other formats support quality
            canvas.toBlob((blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('Failed to create resized image'));
              }
            }, file.type, quality);
          }
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
          
          // Check if it's a PNG file
          const isPNG = file.type === 'image/png';
          
          if (isPNG) {
            // For PNG files, we can only resize by dimensions, not quality
            // Use iterative approach to get closer to target size
            const currentSize = file.size;
            let bestBlob = null;
            let bestScale = 1;
            
            // Try different scales to find the best fit
            const scales = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1];
            
            const tryScale = (scaleIndex) => {
              if (scaleIndex >= scales.length) {
                // Use the best result we found
                const finalScale = bestScale;
                const newWidth = Math.round(width * finalScale);
                const newHeight = Math.round(height * finalScale);
                
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
                  
                  const resizedFile = new File([blob], file.name, {
                    type: file.type,
                    lastModified: Date.now()
                  });
                  
                  console.log('PNG resizing result:', {
                    originalSize: file.size,
                    resizedSize: blob.size,
                    originalDimensions: `${img.width}x${img.height}`,
                    resizedDimensions: `${newWidth}x${newHeight}`,
                    scale: finalScale
                  });
                  
                  resolve(resizedFile);
                }, file.type);
                return;
              }
              
              const scale = scales[scaleIndex];
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
                  tryScale(scaleIndex + 1);
                  return;
                }
                
                const currentSize = blob.size;
                
                // If this size is acceptable (close to or under target), use it
                if (currentSize <= targetSizeBytes * 1.1) { // Allow 10% over target
                  const resizedFile = new File([blob], file.name, {
                    type: file.type,
                    lastModified: Date.now()
                  });
                  
                  console.log('PNG resizing result:', {
                    originalSize: file.size,
                    resizedSize: blob.size,
                    originalDimensions: `${img.width}x${img.height}`,
                    resizedDimensions: `${newWidth}x${newHeight}`,
                    scale: scale
                  });
                  
                  resolve(resizedFile);
                  return;
                }
                
                // If this is better than our current best, save it
                if (!bestBlob || (currentSize < bestBlob.size && currentSize > targetSizeBytes * 0.5)) {
                  bestBlob = blob;
                  bestScale = scale;
                }
                
                // Try next scale
                tryScale(scaleIndex + 1);
              }, file.type);
            };
            
            // Start trying scales
            tryScale(0);
          } else {
            // For JPEG and other formats, use quality-based resizing
            let quality = 0.9;
            let resizedBlob = null;
            
            // Binary search to find the optimal quality that gets us close to target size
            const findOptimalQuality = (minQuality, maxQuality, iterations = 0) => {
            if (iterations > 10) {
              // Fallback to the best result we found
              if (resizedBlob) {
                const resizedFile = new File([resizedBlob], file.name, {
                  type: file.type,
                  lastModified: Date.now()
                });
                resolve(resizedFile);
              } else {
                resolve(file);
              }
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
                  const resizedFile = new File([blob], file.name, {
                    type: file.type,
                    lastModified: Date.now()
                  });
                  resolve(resizedFile);
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
          }
          
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

    console.log('Image upload started:', {
      name: file.name,
      size: file.size,
      type: file.type
    });

    // Check if it's an image
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.');
      return;
    }

    // Log specific file type for debugging
    console.log('File type detected:', file.type);
    if (file.type === 'image/png') {
      console.log('PNG file detected - will use dimension-based resizing');
    }

    // If image is small enough, upload directly
    if (file.size <= 3 * 1024 * 1024) {
      console.log('Image is small enough, uploading directly');
      await uploadImage(file);
      return;
    }

    // For larger images, automatically resize to fit within 3MB
    try {
      console.log('Image is large, starting resize process');
      setUploadingImage(true);
      
      // Calculate optimal dimensions to get close to 3MB
      const targetSizeBytes = 3 * 1024 * 1024;
      console.log('Target size:', targetSizeBytes, 'bytes');
      
      const resizedFile = await resizeImageToTargetSize(file, targetSizeBytes);
      console.log('Resize completed, resized file size:', resizedFile.size);
      
      // For PNG files, check if resizing was effective
      if (file.type === 'image/png' && resizedFile.size > targetSizeBytes) {
        console.warn('PNG file is still large after resizing. PNG files may not compress as much as JPEG files.');
      }
      
      await uploadImage(resizedFile);
    } catch (error) {
      console.error('Error in image upload process:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        fileType: file.type,
        fileSize: file.size
      });
      alert(`Failed to process image: ${error.message}`);
    } finally {
      setUploadingImage(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const uploadImage = async (file) => {
    console.log('Starting upload for file:', {
      name: file.name,
      size: file.size,
      type: file.type
    });
    
    setUploadingImage(true);

    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('caption', inputValue.trim());

      console.log('Sending upload request to:', getApiUrl(`/api/messages/${chat.id}/upload-image`));

      const response = await fetch(getApiUrl(`/api/messages/${chat.id}/upload-image`), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });

      console.log('Upload response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('Upload successful:', data);
        // Don't add the message locally - it will be received via Socket.IO
        setInputValue(''); // Clear the input
        setNewMessage(''); // Keep this for compatibility
        
        // On mobile, refocus the textarea after clearing to keep keyboard open
        if (isTouchDevice) {
          setTimeout(() => {
            if (textareaRef.current) {
              textareaRef.current.focus();
            }
          }, 0);
        }
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


  const triggerImageUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleImageClick = useCallback((imageData) => {
    setSelectedImage(imageData);
  }, []);

  const closeImageModal = useCallback(() => {
    setSelectedImage(null);
  }, []);

  const handleKeyPress = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  }, []);

  const handleTyping = useCallback(() => {
    startTyping(chat.id);
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    typingTimeoutRef.current = setTimeout(() => {
      stopTyping(chat.id);
    }, 1000);
  }, [chat.id, startTyping, stopTyping]);

  const handleInputChange = useCallback((e) => {
    const value = e.target.value;
    setInputValue(value);
    setNewMessage(value); // Keep this for compatibility with other parts
    handleTyping();
  }, [handleTyping]);

  // Memoized style objects to prevent re-renders
  const imageStyle = useMemo(() => ({
    maxWidth: '300px',
    maxHeight: '300px',
    borderRadius: '8px'
  }), []);

  const hiddenButtonStyle = useMemo(() => ({
    // Always visible for mobile-first design
  }), []);

  const hiddenInputStyle = useMemo(() => ({
    display: 'none'
  }), []);

  const textareaStyle = useMemo(() => ({
    width: '100%',
    minHeight: '40px',
    maxHeight: '120px',
    border: 'none',
    outline: 'none',
    resize: 'none',
    fontSize: '14px',
    lineHeight: '1.4',
    fontFamily: 'inherit',
    backgroundColor: 'transparent',
    padding: '8px 0',
    color: '#333'
  }), []);

  const hiddenCanvasStyle = useMemo(() => ({
    display: 'none'
  }), []);

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

  const handleTap = (message) => {
    const now = new Date().getTime();
    const DOUBLE_TAP_DELAY = 300; // 300ms between taps

    console.log('handleTap called:', {
      messageId: message.id,
      lastTappedMessage: lastTappedMessage?.id,
      lastTapTime,
      timeDiff: lastTappedMessage ? (now - lastTapTime) : 'N/A',
      isDoubleTap: lastTappedMessage && lastTappedMessage.id === message.id && (now - lastTapTime) < DOUBLE_TAP_DELAY
    });

    // Clear any existing timeout
    if (tapTimeoutRef.current) {
      clearTimeout(tapTimeoutRef.current);
      tapTimeoutRef.current = null;
    }

    // Check if this is a double tap on the same message
    if (lastTappedMessage && lastTappedMessage.id === message.id && (now - lastTapTime) < DOUBLE_TAP_DELAY) {
      // Double tap detected - copy message text
      console.log('DOUBLE TAP DETECTED - Copying message');
      copyMessageText(message);
      setLastTappedMessage(null);
      setLastTapTime(0);
    } else {
      // Single tap - just record the tap for potential double tap
      console.log('SINGLE TAP - Recording for potential double tap');
      setLastTappedMessage(message);
      setLastTapTime(now);
      
      // Set timeout to clear the tap state if no second tap comes
      tapTimeoutRef.current = setTimeout(() => {
        console.log('Timeout reached - clearing tap state');
        setLastTappedMessage(null);
        setLastTapTime(0);
      }, DOUBLE_TAP_DELAY);
    }
  };

  const copyMessageText = async (message) => {
    try {
      // Extract text content from the message
      let textToCopy = '';
      
      if (message.content) {
        // If it's HTML content, strip HTML tags
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = message.content;
        textToCopy = tempDiv.textContent || tempDiv.innerText || '';
      }
      
      if (textToCopy.trim()) {
        await navigator.clipboard.writeText(textToCopy.trim());
        console.log('Message copied to clipboard:', textToCopy.trim());
        // Show a brief success message without blocking the UI
        const notification = document.createElement('div');
        notification.textContent = 'Message copied!';
        notification.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          background: #4CAF50;
          color: white;
          padding: 12px 16px;
          border-radius: 8px;
          z-index: 1000;
          font-size: 14px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          animation: slideIn 0.3s ease;
        `;
        document.body.appendChild(notification);
        setTimeout(() => {
          notification.remove();
        }, 2000);
      }
    } catch (err) {
      console.error('Failed to copy text: ', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = message.content ? message.content.replace(/<[^>]*>/g, '') : '';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      
      // Show a brief success message without blocking the UI
      const notification = document.createElement('div');
      notification.textContent = 'Message copied!';
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        z-index: 1000;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      `;
      document.body.appendChild(notification);
      setTimeout(() => {
        notification.remove();
      }, 2000);
    }
  };

  // Long press detection for reactions
  const handleMouseDown = (e, message) => {
    // Only handle mouse events on non-touch devices and if no touch event just occurred
    const now = Date.now();
    if (e.type === 'mousedown' && !isTouchDevice && !touchEventOccurred.current && (now - lastEventTime.current) > 100) {
      lastEventTime.current = now;
      e.preventDefault();
      const timer = setTimeout(() => {
        setSelectedMessageForReaction(message);
        setShowEmojiPicker(true);
      }, LONG_PRESS_DELAY); // 800ms long press
      setLongPressTimer(timer);
    }
  };

  const handleMouseUp = (e, message) => {
    if (touchOngoing) {
      return;
    }
    // Only handle mouse events on non-touch devices and if no touch event just occurred
    console.log('handleMouseUp called', e);
    const now = Date.now();
    if (e.type === 'mouseup' && !isTouchDevice && !touchEventOccurred.current && (now - lastEventTime.current) > 100) {
      lastEventTime.current = now;
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        setLongPressTimer(null);
      }
      
      // Handle tap detection on mouse up (for desktop)
      if (message) {
        console.log('handleMouseUp called for message:', message.id);
        handleTap(message);
      }
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
    touchOngoing = true;
    console.log('handleTouchStart called for message:', message.id);
    const now = Date.now();
    lastEventTime.current = now;
    touchEventOccurred.current = true;
    
    const touch = e.touches[0];
    setSwipeStartX(touch.clientX);
    setSwipeStartY(touch.clientY);
    
    const timer = setTimeout(() => {
      setSelectedMessageForReaction(message);
      setShowEmojiPicker(true);
    }, LONG_PRESS_DELAY); // 800ms long press
    setLongPressTimer(timer);
    
    // Reset touch flag after a short delay
    setTimeout(() => {
      touchEventOccurred.current = false;
    }, 300);
  };

  const handleTouchEnd = (e, message) => {
    touchOngoing = false;
    console.log('handleTouchEnd called for message:', message.id, {
      swipeStartX,
      swipeStartY,
      longPressTimer: !!longPressTimer
    });

    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }

    if (!swipeStartX || !swipeStartY) {
      // No swipe detected, handle as tap
      console.log('No swipe detected, calling handleTap');
      handleTap(message);
      return;
    }

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - swipeStartX;
    const deltaY = touch.clientY - swipeStartY;
    const minSwipeDistance = 50;

    console.log('Swipe calculation:', {
      deltaX,
      deltaY,
      minSwipeDistance,
      isSwipe: Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > minSwipeDistance
    });

    // Check if it's a horizontal swipe (left or right) for quoting
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > minSwipeDistance) {
      // Quote the message
      console.log('Swipe detected, quoting message');
      setQuotedMessage(message);
    } else {
      // Small movement, treat as tap
      console.log('Small movement, calling handleTap');
      handleTap(message);
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

  const startEditingMessage = (message) => {
    if (message.sender_id === user?.id && message.message_type === 'text') {
      setEditingMessage(message);
      // Strip HTML tags for editing
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = message.content;
      const plainText = tempDiv.textContent || tempDiv.innerText || '';
      setEditContent(plainText);
      
      // Clear any quoted message when editing
      setQuotedMessage(null);
      
      // Focus the textarea and move cursor to end after a short delay
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          // Move cursor to end of text
          const textLength = plainText.length;
          textareaRef.current.setSelectionRange(textLength, textLength);
        }
      }, 100);
    }
  };

  const cancelEditing = () => {
    setEditingMessage(null);
    setEditContent('');
    setInputValue(''); // Clear the input as well
  };

  const saveEditedMessage = async () => {
    if (!editingMessage || !editContent.trim()) return;

    const result = await editMessage(editingMessage.id, editContent.trim());
    
    if (result.success) {
      setEditingMessage(null);
      setEditContent('');
      setInputValue(''); // Clear the input as well
      
      // Focus the textarea after saving
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
        }
      }, 100);
    } else {
      alert(result.error || 'Failed to edit message');
    }
  };

  const handleDeleteMessage = async (messageId) => {
    if (window.confirm('Are you sure you want to delete this message?')) {
      const result = await deleteMessage(messageId);
      
      if (!result.success) {
        alert(result.error || 'Failed to delete message');
      }
    }
  };

  const handleEditKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveEditedMessage();
    } else if (e.key === 'Escape') {
      cancelEditing();
    }
  };

  const quillModules = {
    toolbar: [
      ['bold', 'italic', 'underline'],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      ['link'],
      ['clean']
    ],
    keyboard: {
      bindings: {
        // Allow normal keyboard behavior for autocorrect
        enter: {
          key: 13,
          handler: function(range, context) {
            return true; // Allow default behavior
          }
        }
      }
    }
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
          <button 
            className="back-button" 
            onClick={onBack}
            onMouseDown={(e) => e.preventDefault()} // Prevent focus on mouse down
          >
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
    <div 
      className="chat-window"
      onClick={(e) => {
        // On mobile, clicking the chat area should blur the textarea
        if (isTouchDevice && textareaRef.current && document.activeElement === textareaRef.current) {
          // Only blur if clicking on the chat area itself, not on interactive elements
          if (e.target === e.currentTarget || e.target.closest('.messages-container')) {
            console.log('Blurring textarea due to chat area click');
            textareaRef.current.blur();
          }
        }
      }}
    >
      <div className="chat-header">
        <button 
          className="back-button" 
          onClick={onBack}
          onMouseDown={(e) => e.preventDefault()} // Prevent focus on mouse down
        >
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
          <button 
            className="more-button" 
            onClick={handleMenuClick}
            onMouseDown={(e) => e.preventDefault()} // Prevent focus on mouse down
          >
            <MoreVertical size={20} />
          </button>
          {showMenu && (
            <div className="more-menu">
              <button 
                className="menu-item" 
                onClick={() => handleMenuAction('leave')}
                onMouseDown={(e) => e.preventDefault()} // Prevent focus on mouse down
              >
                <LogOut size={16} />
                Leave Chat
              </button>
              {chat.created_by === user?.id && (
                <button 
                  className="menu-item delete-item" 
                  onClick={() => handleMenuAction('delete')}
                  onMouseDown={(e) => e.preventDefault()} // Prevent focus on mouse down
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
                onMouseUp={(e) => handleMouseUp(e, message)}
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
                          style={imageStyle}
                          onClick={() => handleImageClick(message.image_data)}
                          className="clickable-image"
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
                    <div className="message-text-container">
                      <div 
                        className="message-text"
                        dangerouslySetInnerHTML={{ __html: message.content }}
                      />
                    </div>
                  )}
                  <div className="message-time-status">
                    <div className="message-time-status-left">
                      <span className="message-time">
                        {formatTime(message.created_at)}
                        {message.edited && (
                          <span className="edited-indicator"> (edited)</span>
                        )}
                      </span>
                      {renderMessageStatus(message)}
                    </div>
                    {isOwnMessage && message.message_type === 'text' && (
                      <div className="message-actions">
                        <button 
                          style={hiddenButtonStyle}
                          className="edit-message-button"
                          onClick={() => startEditingMessage(message)}
                          title="Edit message"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button 
                          style={hiddenButtonStyle}
                          className="delete-message-button"
                          onClick={() => handleDeleteMessage(message.id)}
                          title="Delete message"
                        >
                          <Trash size={14} />
                        </button>
                      </div>
                    )}
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
        {editingMessage && (
          <div className="edit-message-preview">
            <div className="edit-message-preview-content">
              <span className="edit-sender">
                Editing message
              </span>
              <div 
                className="edit-text"
                dangerouslySetInnerHTML={{ __html: editingMessage.content }}
              />
            </div>
            <button 
              className="remove-edit-button"
              onClick={cancelEditing}
              title="Cancel edit"
            >
              <X size={16} />
            </button>
          </div>
        )}
        {quotedMessage && !editingMessage && (
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
            style={hiddenInputStyle}
          />
          <button 
            className="image-upload-button"
            onClick={triggerImageUpload}
            onMouseDown={(e) => e.preventDefault()} // Prevent focus on mouse down
            disabled={uploadingImage}
            title="Upload image"
          >
            <ImageIcon size={20} />
          </button>
          <textarea
            ref={textareaRef}
            value={editingMessage ? editContent : inputValue}
            onInput={editingMessage ? (e) => setEditContent(e.target.value) : handleInputChange}
            onKeyPress={editingMessage ? handleEditKeyPress : handleKeyPress}
            onFocus={handleTyping}
            placeholder={editingMessage ? "Edit your message..." : "Type a message... (links will be auto-detected)"}
            className="message-input-textarea"
            style={textareaStyle}
          />
          {editingMessage ? (
            <>
              <button 
                className="edit-save-button"
                onClick={saveEditedMessage}
                onMouseDown={(e) => e.preventDefault()}
                disabled={!editContent.trim() || uploadingImage}
                title="Save changes"
              >
                <Save size={20} />
              </button>
              <button 
                className="edit-cancel-button"
                onClick={cancelEditing}
                onMouseDown={(e) => e.preventDefault()}
                title="Cancel edit"
              >
                <X size={20} />
              </button>
            </>
          ) : (
            <button 
              className="send-button"
              onClick={handleSendMessage}
              onMouseDown={(e) => e.preventDefault()} // Prevent focus on mouse down
              disabled={!inputValue.trim() || uploadingImage}
            >
              <Send size={20} />
            </button>
          )}
        </div>
        {uploadingImage && (
          <div className="upload-status">
            Uploading image...
          </div>
        )}
      </div>

      {/* Hidden canvas for image resizing */}
      <canvas ref={canvasRef} style={hiddenCanvasStyle} />

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
                  id="custom-emoji-input"
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

      {/* Image Modal */}
      {selectedImage && (
        <div className="image-modal-overlay" onClick={closeImageModal}>
          <div className="image-modal" onClick={(e) => e.stopPropagation()}>
            <button className="close-image-modal" onClick={closeImageModal}>
              <X size={24} />
            </button>
            <div className="image-modal-content">
              <img 
                src={`data:${selectedImage.mimetype};base64,${selectedImage.data}`}
                alt={selectedImage.filename}
                className="modal-image"
              />
              <div className="image-modal-info">
                <p className="image-filename">{selectedImage.filename}</p>
                <p className="image-size">{selectedImage.size ? `${Math.round(selectedImage.size / 1024)} KB` : ''}</p>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default ChatWindow;

