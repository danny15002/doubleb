import React, { useState, useEffect } from 'react';
import notificationManager from '../utils/notifications';
import './NotificationPermission.css';

const NotificationPermission = ({ onPermissionGranted }) => {
  const [permissionStatus, setPermissionStatus] = useState('default');
  const [isLoading, setIsLoading] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Check current permission status
    if (notificationManager.isSupported) {
      setPermissionStatus(notificationManager.permission);
      
      // Show prompt if permission hasn't been requested yet
      if (notificationManager.permission === 'default') {
        setShowPrompt(true);
      }
    }
  }, []);

  const handleRequestPermission = async () => {
    setIsLoading(true);
    
    try {
      const granted = await notificationManager.requestPermission();
      setPermissionStatus(notificationManager.permission);
      
      if (granted) {
        setShowPrompt(false);
        onPermissionGranted?.(true);
        
        // Send a test notification
        await notificationManager.sendTestNotification();
      } else {
        onPermissionGranted?.(false);
      }
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      onPermissionGranted?.(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    onPermissionGranted?.(false);
  };

  // Don't show if notifications aren't supported
  if (!notificationManager.isSupported) {
    return null;
  }

  // Don't show if permission is already granted or denied
  if (permissionStatus === 'granted' || permissionStatus === 'denied') {
    return null;
  }

  // Don't show if user dismissed the prompt
  if (!showPrompt) {
    return null;
  }

  return (
    <div className="notification-permission-overlay">
      <div className="notification-permission-card">
        <div className="notification-icon">
          🔔
        </div>
        
        <h3>Enable Notifications</h3>
        <p>
          Get notified when you receive new messages, even when BB Chat is not open.
        </p>
        
        <div className="notification-benefits">
          <div className="benefit">
            <span className="benefit-icon">📱</span>
            <span>Works on mobile and desktop</span>
          </div>
          <div className="benefit">
            <span className="benefit-icon">⚡</span>
            <span>Instant message alerts</span>
          </div>
          <div className="benefit">
            <span className="benefit-icon">🔒</span>
            <span>You can disable anytime</span>
          </div>
        </div>

        <div className="notification-actions">
          <button
            className="btn-secondary"
            onClick={handleDismiss}
            disabled={isLoading}
          >
            Not Now
          </button>
          <button
            className="btn-primary"
            onClick={handleRequestPermission}
            disabled={isLoading}
          >
            {isLoading ? 'Requesting...' : 'Enable Notifications'}
          </button>
        </div>

        <div className="notification-note">
          <small>
            💡 <strong>Tip:</strong> On iOS, you'll need to add BB Chat to your home screen for notifications to work.
          </small>
        </div>
      </div>
    </div>
  );
};

export default NotificationPermission;
