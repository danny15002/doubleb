// Enhanced service worker for PWA functionality
const CACHE_VERSION = 'v4';
const CACHE_NAME = `bb-chat-${CACHE_VERSION}`;
const STATIC_CACHE = `bb-chat-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `bb-chat-dynamic-${CACHE_VERSION}`;
const UPDATE_AVAILABLE_EVENT = 'update-available';

const urlsToCache = [
  '/',
  '/manifest.json',
  '/static/js/bundle.js',
  '/static/css/main.css'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('Caching static assets');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        // Skip waiting to activate immediately
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Claim all clients immediately
      return self.clients.claim();
    }).then(() => {
      // Notify all clients that the service worker is ready
      return self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: 'SW_ACTIVATED',
            message: 'Service Worker activated and ready'
          });
        });
      });
    })
  );
});

// Fetch event - implement cache-first strategy for static assets, network-first for API calls
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle API requests with network-first strategy
  if (url.pathname.startsWith('/api/')) {
    // Don't cache POST, PUT, DELETE requests
    if (request.method !== 'GET') {
      event.respondWith(fetch(request));
      return;
    }
    
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful GET responses only
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(DYNAMIC_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback to cache if network fails
          return caches.match(request);
        })
    );
    return;
  }

  // Handle static assets with cache-first strategy
  event.respondWith(
    caches.match(request)
      .then((response) => {
        if (response) {
          return response;
        }
        
        return fetch(request).then((response) => {
          // Don't cache non-successful responses
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Cache the response
          const responseClone = response.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });

          return response;
        });
      })
  );
});

// Background sync for offline message queuing
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    console.log('Background sync triggered');
    event.waitUntil(
      // Handle offline message sync here
      syncOfflineMessages()
    );
  }
});

// iOS PWA fix: Store push event handler for re-registration
function handlePushEvent(event) {
  console.log('Push event received from server');
  
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'BB Chat', body: event.data.text() };
    }
  }

  const options = {
    body: data.body || 'You have a new message',
    icon: data.icon || '/manifest.json',
    badge: data.badge || '/manifest.json',
    vibrate: [200, 100, 200],
    data: data.data || {},
    actions: data.actions || [
      {
        action: 'open',
        title: 'Open Chat',
        icon: '/manifest.json'
      },
      {
        action: 'close',
        title: 'Close',
        icon: '/manifest.json'
      }
    ],
    requireInteraction: data.requireInteraction !== false,
    silent: data.silent || false,
    tag: data.tag || 'bb-chat-notification'
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'BB Chat', options)
      .then(() => {
        console.log('Server push notification shown successfully');
      })
      .catch(error => {
        console.error('Failed to show server push notification:', error);
        // Queue the notification if it fails
        return addToNotificationQueue({ title: data.title, options });
      })
  );
}

// Register push event listener
self.addEventListener('push', handlePushEvent);

// Notification click event - handle user interaction with notifications
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event.action);
  
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if there's already a window/tab open with the target URL
        for (const client of clientList) {
          if (client.url === self.location.origin && 'focus' in client) {
            return client.focus();
          }
        }
        
        // If no existing window, open a new one
        if (clients.openWindow) {
          const targetUrl = event.notification.data?.url || '/';
          return clients.openWindow(targetUrl);
        }
      })
  );
});

// Helper function for syncing offline messages
async function syncOfflineMessages() {
  try {
    // Get offline messages from IndexedDB or localStorage
    const offlineMessages = await getOfflineMessages();
    
    for (const message of offlineMessages) {
      try {
        const response = await fetch('/api/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(message)
        });
        
        if (response.ok) {
          // Remove from offline storage
          await removeOfflineMessage(message.id);
        }
      } catch (error) {
        console.error('Failed to sync message:', error);
      }
    }
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}

// iOS PWA fix: Notification queue for missed notifications
const NOTIFICATION_QUEUE_KEY = 'bb-chat-notification-queue';
const MAX_QUEUE_SIZE = 10;

async function addToNotificationQueue(notificationData) {
  try {
    const existingQueue = await getNotificationQueue();
    const queue = existingQueue || [];
    
    // Add timestamp and unique ID
    const queuedNotification = {
      id: Date.now() + Math.random(),
      timestamp: Date.now(),
      ...notificationData
    };
    
    // Add to front of queue
    queue.unshift(queuedNotification);
    
    // Keep only the most recent notifications
    if (queue.length > MAX_QUEUE_SIZE) {
      queue.splice(MAX_QUEUE_SIZE);
    }
    
    // Store in IndexedDB or fallback to localStorage
    await setNotificationQueue(queue);
    console.log('Notification queued:', queuedNotification);
  } catch (error) {
    console.error('Failed to queue notification:', error);
  }
}

async function getNotificationQueue() {
  try {
    // Try IndexedDB first
    if ('indexedDB' in self) {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open('BB-Chat-Notifications', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(['notifications'], 'readonly');
          const store = transaction.objectStore('notifications');
          const getRequest = store.get('queue');
          getRequest.onsuccess = () => resolve(getRequest.result || []);
          getRequest.onerror = () => reject(getRequest.error);
        };
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('notifications')) {
            db.createObjectStore('notifications');
          }
        };
      });
    }
    
    // Fallback to localStorage
    const stored = localStorage.getItem(NOTIFICATION_QUEUE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Failed to get notification queue:', error);
    return [];
  }
}

async function setNotificationQueue(queue) {
  try {
    // Try IndexedDB first
    if ('indexedDB' in self) {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open('BB-Chat-Notifications', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(['notifications'], 'readwrite');
          const store = transaction.objectStore('notifications');
          const putRequest = store.put(queue, 'queue');
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        };
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('notifications')) {
            db.createObjectStore('notifications');
          }
        };
      });
    }
    
    // Fallback to localStorage
    localStorage.setItem(NOTIFICATION_QUEUE_KEY, JSON.stringify(queue));
  } catch (error) {
    console.error('Failed to set notification queue:', error);
  }
}

async function clearNotificationQueue() {
  try {
    await setNotificationQueue([]);
    console.log('Notification queue cleared');
  } catch (error) {
    console.error('Failed to clear notification queue:', error);
  }
}

// iOS PWA fix: Process queued notifications when app becomes active
async function processQueuedNotifications() {
  try {
    const queue = await getNotificationQueue();
    if (queue.length === 0) {
      console.log('No queued notifications to process');
      return;
    }
    
    console.log(`Processing ${queue.length} queued notifications`);
    
    // Show the most recent notification (first in queue)
    const latestNotification = queue[0];
    
    try {
      await self.registration.showNotification(latestNotification.title, latestNotification.options);
      console.log('Queued notification shown:', latestNotification.title);
      
      // Clear the queue after showing the notification
      await clearNotificationQueue();
    } catch (error) {
      console.error('Failed to show queued notification:', error);
    }
  } catch (error) {
    console.error('Failed to process queued notifications:', error);
  }
}

// Helper functions for offline message management
async function getOfflineMessages() {
  // This would typically use IndexedDB
  // For now, return empty array
  return [];
}

async function removeOfflineMessage(messageId) {
  // This would typically use IndexedDB
  // For now, do nothing
  console.log('Removing offline message:', messageId);
}

// Handle message events from the main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CHECK_UPDATE') {
    // Check for updates
    self.registration.update().then(() => {
      console.log('Update check completed');
    });
  }
  
  // Handle PWA notification requests from main thread
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    console.log('PWA: Showing notification from main thread:', event.data.title);
    const { title, options } = event.data;
    
    const notificationOptions = {
      body: options.body || 'You have a new message',
      icon: options.icon || '/manifest.json',
      badge: options.badge || '/manifest.json',
      vibrate: [200, 100, 200],
      data: options.data || {},
      actions: [
        {
          action: 'open',
          title: 'Open Chat',
          icon: '/manifest.json'
        },
        {
          action: 'close',
          title: 'Close',
          icon: '/manifest.json'
        }
      ],
      requireInteraction: options.requireInteraction || true,
      silent: options.silent || false,
      tag: options.tag || 'bb-chat-notification'
    };
    
    // iOS PWA fix: Queue notification if we can't show it immediately
    event.waitUntil(
      self.registration.showNotification(title, notificationOptions)
        .then(() => {
          console.log('Notification shown successfully');
          // Send response back to main thread
          self.clients.matchAll().then(clients => {
            clients.forEach(client => {
              client.postMessage({
                type: 'NOTIFICATION_RESPONSE',
                success: true
              });
            });
          });
        })
        .catch(async (error) => {
          console.error('Failed to show notification, queuing:', error);
          await addToNotificationQueue({ title, options: notificationOptions });
          // Send error response back to main thread
          self.clients.matchAll().then(clients => {
            clients.forEach(client => {
              client.postMessage({
                type: 'NOTIFICATION_RESPONSE',
                success: false,
                error: error.message
              });
            });
          });
        })
    );
  }
  
  // iOS PWA fix: Handle app becoming active - process queued notifications
  if (event.data && event.data.type === 'APP_ACTIVE') {
    console.log('iOS PWA: App became active, processing queued notifications');
    event.waitUntil(processQueuedNotifications());
  }
  
  // iOS PWA fix: Clear notification queue when app is active
  if (event.data && event.data.type === 'CLEAR_NOTIFICATION_QUEUE') {
    console.log('iOS PWA: Clearing notification queue');
    event.waitUntil(clearNotificationQueue());
  }
  
  // iOS PWA fix: Handle notification state refresh
  if (event.data && event.data.type === 'REFRESH_NOTIFICATION_STATE') {
    console.log('iOS PWA: Refreshing notification state, permission:', event.data.permission);
    // Re-register notification handlers for iOS
    if (event.data.permission === 'granted') {
      // Force re-registration of push event listener
      self.removeEventListener('push', handlePushEvent);
      self.addEventListener('push', handlePushEvent);
      console.log('iOS PWA: Notification handlers refreshed');
    }
  }
  
  // iOS PWA fix: Handle periodic notification capability check
  if (event.data && event.data.type === 'CHECK_NOTIFICATION_CAPABILITY') {
    console.log('iOS PWA: Checking notification capability');
    // Re-register all notification handlers
    self.removeEventListener('push', handlePushEvent);
    self.addEventListener('push', handlePushEvent);
    console.log('iOS PWA: Notification capability refreshed');
  }
});

// Handle update found
self.addEventListener('updatefound', () => {
  console.log('Update found, installing...');
  const newWorker = self.registration.installing;
  
  newWorker.addEventListener('statechange', () => {
    if (newWorker.state === 'installed') {
      if (self.registration.waiting) {
        // New service worker is waiting, notify clients
        self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            client.postMessage({
              type: 'UPDATE_AVAILABLE',
              message: 'A new version is available!'
            });
          });
        });
      }
    }
  });
});
