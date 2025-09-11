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

// Push event - handle incoming push notifications
self.addEventListener('push', (event) => {
  console.log('Push event received');
  
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
    icon: '/manifest.json', // Will use the icon from manifest
    badge: '/manifest.json',
    vibrate: [200, 100, 200],
    data: data.data || {},
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
    requireInteraction: true,
    silent: false
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'BB Chat', options)
  );
});

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
    
    event.waitUntil(
      self.registration.showNotification(title, notificationOptions)
    );
  }
  
  // iOS PWA fix: Handle notification state refresh
  if (event.data && event.data.type === 'REFRESH_NOTIFICATION_STATE') {
    console.log('iOS PWA: Refreshing notification state, permission:', event.data.permission);
    // Re-register notification handlers for iOS
    if (event.data.permission === 'granted') {
      // Force re-registration of push event listener
      self.addEventListener('push', handlePushEvent);
      console.log('iOS PWA: Notification handlers refreshed');
    }
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
