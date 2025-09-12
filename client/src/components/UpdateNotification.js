import React from 'react';
import { RefreshCw, X, Download } from 'lucide-react';
import './UpdateNotification.css';

const UpdateNotification = ({ 
  updateAvailable, 
  applyUpdate, 
  dismissUpdate, 
  isOnline 
}) => {
  if (!updateAvailable) return null;

  return (
    <div className="update-notification">
      <div className="update-notification-content">
        <div className="update-notification-icon">
          <Download size={20} />
        </div>
        <div className="update-notification-text">
          <h4>Update Available</h4>
          <p>A new version is ready to install.</p>
        </div>
        <div className="update-notification-actions">
          {isOnline ? (
            <button 
              className="update-button"
              onClick={applyUpdate}
              title="Update now"
            >
              <RefreshCw size={16} />
              Update
            </button>
          ) : (
            <span className="offline-indicator">Offline</span>
          )}
          <button 
            className="dismiss-button"
            onClick={dismissUpdate}
            title="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpdateNotification;
