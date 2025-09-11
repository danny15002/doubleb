import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { useAuth } from './AuthContext';
import { config } from '../config/api';
import notificationManager from '../utils/notifications';

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
  const [isPageVisible, setIsPageVisible] = useState(!document.hidden);
  const { user } = useAuth();

  // Request notification permission and subscribe to push notifications
  useEffect(() => {
    if ('Notification' in window && window.Notification) {
      setNotificationPermission(window.Notification.permission);
      
      // Only request permission if it's default and user is authenticated
      if (window.Notification.permission === 'default' && user) {
        window.Notification.requestPermission().then(async (permission) => {
          setNotificationPermission(permission);
          
          // If permission granted, subscribe to push notifications
          if (permission === 'granted') {
            try {
              const subscription = await notificationManager.subscribeToPush();
              if (subscription) {
                console.log('Push notification subscription successful');
              }
            } catch (error) {
              console.error('Failed to subscribe to push notifications:', error);
            }
          }
        });
      } else if (window.Notification.permission === 'granted' && user) {
        // Permission already granted, subscribe to push notifications
        notificationManager.subscribeToPush().then(subscription => {
          if (subscription) {
            console.log('Push notification subscription successful (existing permission)');
          }
        }).catch(error => {
          console.error('Failed to subscribe to push notifications:', error);
        });
      }
    }
  }, [user]);

  // Track page visibility to determine when to show notifications
  useEffect(() => {
    const handleVisibilityChange = () => {
      const isVisible = !document.hidden;
      setIsPageVisible(isVisible);
      
      // iOS PWA fix: Refresh notification capability when app becomes active
      if (isVisible && 'Notification' in window) {
        console.log('App became visible - refreshing notification capability');
        refreshNotificationCapability();
      }
    };

    // iOS PWA fix: Also listen for focus events (when PWA becomes active)
    const handleFocus = () => {
      if ('Notification' in window) {
        console.log('App focused - refreshing notification capability');
        refreshNotificationCapability();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  // iOS PWA fix: Refresh notification capability when app becomes active
  const refreshNotificationCapability = useCallback(async () => {
    if ('serviceWorker' in navigator && 'Notification' in window) {
      try {
        const registration = await navigator.serviceWorker.ready;
        
        // Send a message to the service worker to refresh notification state
        if (registration.active) {
          registration.active.postMessage({
            type: 'REFRESH_NOTIFICATION_STATE',
            permission: window.Notification ? window.Notification.permission : 'denied'
          });
          
          // iOS PWA fix: Notify service worker that app is active
          registration.active.postMessage({
            type: 'APP_ACTIVE'
          });
          
          // iOS PWA fix: Check notification capability periodically
          registration.active.postMessage({
            type: 'CHECK_NOTIFICATION_CAPABILITY'
          });
          
          // iOS PWA fix: Wake up service worker with MessageChannel for response
          const wakeUpChannel = new MessageChannel();
          wakeUpChannel.port1.onmessage = (event) => {
            if (event.data.type === 'SERVICE_WORKER_AWAKE') {
              console.log('iOS PWA: Service worker confirmed awake');
            }
          };
          
          registration.active.postMessage({
            type: 'WAKE_UP_SERVICE_WORKER'
          }, [wakeUpChannel.port2]);
        }
        
        console.log('iOS PWA: Notification capability refreshed');
      } catch (error) {
        console.error('Failed to refresh notification capability:', error);
      }
    }
  }, []);

  const requestNotificationPermission = useCallback(async () => {
    if ('Notification' in window && window.Notification) {
      const permission = await window.Notification.requestPermission();
      setNotificationPermission(permission);
      return permission;
    }
    return 'denied';
  }, []);

  const showBrowserNotification = useCallback(async (title, options) => {
    // iOS PWA fix: Always check current permission state, not cached state
    const currentPermission = window.Notification ? window.Notification.permission : 'denied';
    
    if (currentPermission === 'granted') {
      try {
        // Try PWA notification first (through service worker) - works when app is hidden
        if ('serviceWorker' in navigator) {
          const registration = await navigator.serviceWorker.ready;
          if (registration.active) {
            try {
              // iOS PWA fix: Add timeout to detect unresponsive service worker
              const notificationPromise = new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                  reject(new Error('Service worker notification timeout'));
                }, 2000); // 2 second timeout
                
                // Listen for response from service worker
                const handleMessage = (event) => {
                  if (event.data && event.data.type === 'NOTIFICATION_RESPONSE') {
                    clearTimeout(timeout);
                    navigator.serviceWorker.removeEventListener('message', handleMessage);
                    resolve();
                  }
                };
                
                navigator.serviceWorker.addEventListener('message', handleMessage);
                
                // Send message to service worker to show notification
                registration.active.postMessage({
                  type: 'SHOW_NOTIFICATION',
                  title,
                  options: {
                    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">💬</text></svg>',
                    badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">💬</text></svg>',
                    requireInteraction: true,
                    silent: false,
                    ...options
                  }
                });
                
                // For iOS, don't wait for response as it may not come
                if (navigator.userAgent.includes('iPhone') || navigator.userAgent.includes('iPad')) {
                  clearTimeout(timeout);
                  navigator.serviceWorker.removeEventListener('message', handleMessage);
                  resolve();
                }
              });
              
              await notificationPromise;
              console.log('PWA notification sent to service worker');
              return;
            } catch (postMessageError) {
              console.error('Failed to send message to service worker:', postMessageError);
              // Fall through to browser notification fallback
            }
          } else {
            console.warn('Service worker not active, falling back to browser notification');
          }
        }
        
        // Fallback to browser notification if service worker not available
        // Only show browser notification if page is hidden (to avoid duplicate notifications)
        if (document.hidden && window.Notification) {
          const notification = new window.Notification(title, {
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
          
          console.log('Browser notification shown (fallback)');
        }
      } catch (error) {
        console.error('Failed to show notification:', error);
        console.error('Error details:', {
          name: error.name,
          message: error.message,
          stack: error.stack,
          permission: currentPermission,
          serviceWorkerSupported: 'serviceWorker' in navigator,
          notificationSupported: 'Notification' in window
        });
        
        // iOS PWA fix: If notification fails, try to refresh capability
        if (navigator.userAgent.includes('iPhone') || navigator.userAgent.includes('iPad')) {
          console.log('iOS notification failed, attempting capability refresh');
          refreshNotificationCapability();
        }
      }
    } else {
      console.warn('Notification permission not granted:', currentPermission);
    }
  }, [notificationPermission, refreshNotificationCapability]);

  // iOS PWA fix: Periodically refresh notification capability (battery optimized but works when hidden)
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('Notification' in window)) {
      return;
    }

    let refreshInterval;
    let heartbeatInterval;
    let lastRefreshTime = 0;
    const MIN_REFRESH_INTERVAL = 30000; // Minimum 30 seconds between refreshes for iOS
    
    // Detect iOS for more aggressive refresh
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const refreshIntervalMs = isIOS ? 30000 : 180000; // 30 seconds for iOS, 3 minutes for others
    const heartbeatIntervalMs = isIOS ? 10000 : 60000; // 10 seconds for iOS, 1 minute for others
    
    const startRefresh = () => {
      if (refreshInterval) clearInterval(refreshInterval);
      
      // More frequent refresh for iOS to combat notification issues
      refreshInterval = setInterval(() => {
        const now = Date.now();
        if (window.Notification && window.Notification.permission === 'granted' && (now - lastRefreshTime) > MIN_REFRESH_INTERVAL) {
          console.log(`Periodic notification capability refresh (${isIOS ? 'iOS' : 'other'})`);
          refreshNotificationCapability();
          lastRefreshTime = now;
        }
      }, refreshIntervalMs);
    };

    const startHeartbeat = () => {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      
      // iOS PWA fix: Send heartbeat to keep service worker alive
      heartbeatInterval = setInterval(async () => {
        if (isIOS && 'serviceWorker' in navigator) {
          try {
            const registration = await navigator.serviceWorker.ready;
            if (registration.active) {
              const heartbeatChannel = new MessageChannel();
              heartbeatChannel.port1.onmessage = (event) => {
                if (event.data.type === 'HEARTBEAT_RESPONSE') {
                  console.log('iOS PWA: Service worker heartbeat confirmed');
                }
              };
              
              registration.active.postMessage({
                type: 'HEARTBEAT'
              }, [heartbeatChannel.port2]);
            }
          } catch (error) {
            console.error('Heartbeat failed:', error);
          }
        }
      }, heartbeatIntervalMs);
    };

    const stopRefresh = () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
      }
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
    };

    // Always start refresh to keep notifications working when app is hidden
    startRefresh();
    startHeartbeat();

    // Handle visibility changes - refresh immediately when app becomes visible
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('App became visible - immediate refresh');
        refreshNotificationCapability();
        lastRefreshTime = Date.now();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopRefresh();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshNotificationCapability]);

  // iOS PWA fix: Refresh on page load/refresh
  useEffect(() => {
    if (window.Notification && window.Notification.permission === 'granted') {
      console.log('Page loaded - refreshing notification capability');
      refreshNotificationCapability();
      
      // iOS PWA fix: Refresh push subscription on page load
      if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
        console.log('iOS PWA: Refreshing push subscription on page load');
        notificationManager.subscribeToPush().then(subscription => {
          if (subscription) {
            console.log('iOS PWA: Push subscription refreshed successfully');
          }
        }).catch(error => {
          console.error('iOS PWA: Failed to refresh push subscription:', error);
        });
      }
    }
  }, [refreshNotificationCapability]);

  // iOS PWA fix: Periodic push subscription refresh to prevent stale subscriptions
  useEffect(() => {
    if (!/iPad|iPhone|iPod/.test(navigator.userAgent)) {
      return; // Only for iOS
    }

    let subscriptionRefreshInterval;
    
    const startSubscriptionRefresh = () => {
      if (subscriptionRefreshInterval) clearInterval(subscriptionRefreshInterval);
      
      // Refresh push subscription every 2 minutes on iOS
      subscriptionRefreshInterval = setInterval(async () => {
        if (window.Notification && window.Notification.permission === 'granted') {
          console.log('iOS PWA: Periodic push subscription refresh');
          try {
            await notificationManager.subscribeToPush();
            console.log('iOS PWA: Push subscription refreshed successfully');
          } catch (error) {
            console.error('iOS PWA: Failed to refresh push subscription:', error);
          }
        }
      }, 120000); // 2 minutes
    };

    startSubscriptionRefresh();

    return () => {
      if (subscriptionRefreshInterval) {
        clearInterval(subscriptionRefreshInterval);
      }
    };
  }, []);

  // iOS PWA fix: Clear notification queue when user is actively using the app
  const clearNotificationQueue = useCallback(async () => {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        if (registration.active) {
          registration.active.postMessage({
            type: 'CLEAR_NOTIFICATION_QUEUE'
          });
          console.log('iOS PWA: Notification queue cleared');
        }
      } catch (error) {
        console.error('Failed to clear notification queue:', error);
      }
    }
  }, []);

  // Clear notification queue when user sends a message (indicates active usage)
  const clearQueueOnActivity = useCallback(() => {
    if (isPageVisible) {
      clearNotificationQueue();
    }
  }, [isPageVisible, clearNotificationQueue]);

  useEffect(() => {
    if (user) {
      const token = localStorage.getItem('token');
      // TEMPORARY: Force local IP for socket connection
      const socketUrl = import.meta.env.PROD ? config.serverUrl : 'http://localhost:3001';
      console.log('Socket connecting to:', socketUrl); // Debug log
      const newSocket = io(socketUrl, {
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
        console.log('isPageVisible', isPageVisible);
        console.log('message', message);
        
        // Show notification if:
        // 1. Message is not from current user
        // 2. Either it's not the current chat OR the page is not visible (user switched apps)
        const shouldShowNotification = !isOwnMessage && (!isCurrentChat || !isPageVisible);
        
        if (shouldShowNotification) {
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
  }, [user, currentChatId, showBrowserNotification, isPageVisible, clearQueueOnActivity]);

  const sendMessage = (chatId, messageData, messageType = 'text') => {
    if (socket && connected) {
      // Handle both old format (string content) and new format (object with content and quotedMessage)
      const content = typeof messageData === 'string' ? messageData : messageData.content;
      const quotedMessage = typeof messageData === 'object' ? messageData.quotedMessage : null;
      
      // iOS PWA fix: Clear notification queue when user is actively sending messages
      clearQueueOnActivity();
      
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

  const deleteMessage = async (messageId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${config.serverUrl}/api/messages/${messageId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        return { success: true, data: data.data };
      } else {
        const error = await response.json();
        return { success: false, error: error.error };
      }
    } catch (error) {
      console.error('Error deleting message:', error);
      return { success: false, error: 'Failed to delete message' };
    }
  };

  // iOS PWA fix: Test notification function for debugging
  const testNotification = useCallback(async () => {
    console.log('Testing notification...');
    console.log('Current permission:', window.Notification ? window.Notification.permission : 'not supported');
    console.log('Service worker supported:', 'serviceWorker' in navigator);
    console.log('Page visible:', !document.hidden);
    
    try {
      await showBrowserNotification('Test Notification', {
        body: 'This is a test notification to check if notifications are working',
        tag: 'test-notification'
      });
      console.log('Test notification sent successfully');
    } catch (error) {
      console.error('Test notification failed:', error);
    }
  }, [showBrowserNotification]);

  const value = {
    socket,
    connected,
    sendMessage,
    startTyping,
    stopTyping,
    setCurrentChat,
    editMessage,
    deleteMessage,
    notificationPermission,
    requestNotificationPermission,
    isPageVisible,
    testNotification
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};

