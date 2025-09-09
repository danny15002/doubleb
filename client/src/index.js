import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Prevent pinch-to-zoom on mobile devices
const preventZoom = (e) => {
  if (e.touches && e.touches.length > 1) {
    e.preventDefault();
  }
};

const preventDoubleTapZoom = (e) => {
  const now = new Date().getTime();
  if (now - (window.lastTouchEnd || 0) <= 300) {
    e.preventDefault();
  }
  window.lastTouchEnd = now;
};

// Add event listeners to prevent zoom
document.addEventListener('touchstart', preventZoom, { passive: false });
document.addEventListener('touchend', preventDoubleTapZoom, { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gestureend', (e) => e.preventDefault(), { passive: false });

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('SW registered: ', registration);
      })
      .catch((registrationError) => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
