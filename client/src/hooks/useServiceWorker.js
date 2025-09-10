import { useState, useEffect } from 'react';

export const useServiceWorker = () => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [registration, setRegistration] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
          console.log('Service Worker registered successfully:', reg);
          setRegistration(reg);
          
          // Check for updates immediately
          reg.update();
          
          // Check for updates every 30 seconds
          const updateInterval = setInterval(() => {
            reg.update();
          }, 30000);
          
          // Clean up interval on unmount
          return () => clearInterval(updateInterval);
        })
        .catch((error) => {
          console.error('Service Worker registration failed:', error);
        });
    }

    // Listen for service worker messages
    const handleMessage = (event) => {
      if (event.data && event.data.type === 'UPDATE_AVAILABLE') {
        console.log('Update available:', event.data.message);
        setUpdateAvailable(true);
      }
      
      if (event.data && event.data.type === 'SW_ACTIVATED') {
        console.log('Service Worker activated:', event.data.message);
      }
    };

    // Listen for online/offline status
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    navigator.serviceWorker.addEventListener('message', handleMessage);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const checkForUpdate = () => {
    if (registration) {
      registration.update();
    }
  };

  const applyUpdate = () => {
    if (registration && registration.waiting) {
      // Tell the waiting service worker to skip waiting and become active
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      
      // Reload the page to use the new service worker
      window.location.reload();
    }
  };

  const dismissUpdate = () => {
    setUpdateAvailable(false);
  };

  return {
    updateAvailable,
    isOnline,
    checkForUpdate,
    applyUpdate,
    dismissUpdate,
    registration
  };
};
