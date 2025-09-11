// Notification utility functions for PWA
class NotificationManager {
  constructor() {
    this.isSupported = 'Notification' in window;
    this.permission = this.isSupported ? (window.Notification ? window.Notification.permission : 'denied') : 'denied';
    this.registration = null;
  }

  // Request notification permission
  async requestPermission() {
    if (!this.isSupported) {
      console.warn('This browser does not support notifications');
      return false;
    }

    if (this.permission === 'granted') {
      return true;
    }

    if (this.permission === 'denied') {
      console.warn('Notification permission has been denied');
      return false;
    }

    try {
      const permission = await window.Notification.requestPermission();
      this.permission = permission;
      return permission === 'granted';
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  }

  // Check if notifications are supported and permitted
  canNotify() {
    return this.isSupported && this.permission === 'granted';
  }

  // Show a local notification (for testing)
  async showLocalNotification(title, options = {}) {
    if (!this.canNotify()) {
      console.warn('Cannot show notification: permission not granted');
      return false;
    }

    try {
      const notification = new window.Notification(title, {
        icon: '/manifest.json',
        badge: '/manifest.json',
        vibrate: [200, 100, 200],
        requireInteraction: true,
        ...options
      });

      // Auto-close after 5 seconds
      setTimeout(() => {
        notification.close();
      }, 5000);

      return true;
    } catch (error) {
      console.error('Error showing notification:', error);
      return false;
    }
  }

  // Get service worker registration for push notifications
  async getServiceWorkerRegistration() {
    if (!('serviceWorker' in navigator)) {
      console.warn('Service Worker not supported');
      return null;
    }

    if (this.registration) {
      return this.registration;
    }

    try {
      this.registration = await navigator.serviceWorker.ready;
      return this.registration;
    } catch (error) {
      console.error('Error getting service worker registration:', error);
      return null;
    }
  }

  // Subscribe to push notifications (requires VAPID keys from server)
  async subscribeToPush() {
    if (!this.canNotify()) {
      console.warn('Cannot subscribe to push: permission not granted');
      return null;
    }

    const registration = await this.getServiceWorkerRegistration();
    if (!registration) {
      console.warn('No service worker registration available');
      return null;
    }

    try {
      // Get VAPID public key from server
      const response = await fetch('/api/push-notifications/vapid-key');
      const { publicKey } = await response.json();
      
      if (!publicKey) {
        throw new Error('VAPID public key not available');
      }

      // Convert VAPID key to Uint8Array
      const applicationServerKey = this.urlBase64ToUint8Array(publicKey);

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey
      });

      console.log('Push subscription successful:', subscription);
      
      // Send subscription to server
      await this.sendSubscriptionToServer(subscription);
      
      return subscription;
    } catch (error) {
      console.error('Error subscribing to push notifications:', error);
      return null;
    }
  }

  // Send subscription to server
  async sendSubscriptionToServer(subscription) {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/push-notifications/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ subscription })
      });

      if (response.ok) {
        console.log('Subscription sent to server successfully');
        return true;
      } else {
        const error = await response.json();
        console.error('Failed to send subscription to server:', error);
        return false;
      }
    } catch (error) {
      console.error('Error sending subscription to server:', error);
      return false;
    }
  }

  // Convert VAPID key from base64 to Uint8Array
  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // Unsubscribe from push notifications
  async unsubscribeFromPush() {
    const registration = await this.getServiceWorkerRegistration();
    if (!registration) {
      return false;
    }

    try {
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        console.log('Push unsubscription successful');
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error unsubscribing from push notifications:', error);
      return false;
    }
  }

  // Check if user is subscribed to push notifications
  async isSubscribedToPush() {
    const registration = await this.getServiceWorkerRegistration();
    if (!registration) {
      return false;
    }

    try {
      const subscription = await registration.pushManager.getSubscription();
      return !!subscription;
    } catch (error) {
      console.error('Error checking push subscription:', error);
      return false;
    }
  }

  // Send a test notification
  async sendTestNotification() {
    return await this.showLocalNotification('BB Chat Test', {
      body: 'This is a test notification from BB Chat!',
      tag: 'test-notification'
    });
  }
}

// Create a singleton instance
const notificationManager = new NotificationManager();

export default notificationManager;
