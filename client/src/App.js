import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SocketProvider, useSocket } from './contexts/SocketContext';
import { useServiceWorker } from './hooks/useServiceWorker';
import Login from './components/Login';
import Register from './components/Register';
import ChatList from './components/ChatList';
import ChatWindow from './components/ChatWindow';
import NotificationPermission from './components/NotificationPermission';
import UpdateNotification from './components/UpdateNotification';
import notificationManager from './utils/notifications';
import './App.css';

function ChatApp() {
  const { setCurrentChat: setSocketCurrentChat, socket } = useSocket();
  const [currentChat, setCurrentChat] = useState(null);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  
  // Service worker update handling
  const { 
    updateAvailable, 
    isOnline, 
    applyUpdate, 
    dismissUpdate 
  } = useServiceWorker();

  const handleChatSelect = (chat) => {
    setCurrentChat(chat);
    setSocketCurrentChat(chat?.id || null);
  };

  // Handle notification permission
  const handleNotificationPermission = (granted) => {
    setShowNotificationPrompt(false);
    if (granted) {
      console.log('Notification permission granted');
    } else {
      console.log('Notification permission denied');
    }
  };

  // Handle chat deletion events
  useEffect(() => {
    if (socket) {
      const handleChatDeleted = (data) => {
        // If the current chat was deleted, redirect to chat list
        if (currentChat && currentChat.id === data.chatId) {
          setCurrentChat(null);
          setSocketCurrentChat(null);
        }
      };

      socket.on('chat-deleted', handleChatDeleted);

      return () => {
        socket.off('chat-deleted', handleChatDeleted);
      };
    }
  }, [socket, currentChat, setSocketCurrentChat]);

  // Note: New message notifications are handled in SocketContext.js with proper filtering

  // Show notification prompt after a delay
  useEffect(() => {
    const timer = setTimeout(() => {
      if (notificationManager.isSupported && notificationManager.permission === 'default') {
        setShowNotificationPrompt(true);
      }
    }, 3000); // Show after 3 seconds

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="app">
      {/* Update Notification */}
      <UpdateNotification 
        updateAvailable={updateAvailable}
        applyUpdate={applyUpdate}
        dismissUpdate={dismissUpdate}
        isOnline={isOnline}
      />
      
      <div className="app-container">
        <div className={`chat-list-container ${currentChat ? 'hidden md:block' : 'block'}`}>
          <ChatList onChatSelect={handleChatSelect} selectedChat={currentChat} />
        </div>
        <div className={`chat-window-container ${currentChat ? 'block' : 'hidden md:block'}`}>
          {currentChat ? (
            <ChatWindow 
              chat={currentChat} 
              onBack={() => {
                setCurrentChat(null);
                setSocketCurrentChat(null);
              }} 
            />
          ) : (
            <div className="welcome-screen">
              <div className="welcome-content">
                <h1></h1>
                <p>Select a chat to start messaging</p>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Notification Permission Prompt */}
      {showNotificationPrompt && (
        <NotificationPermission onPermissionGranted={handleNotificationPermission} />
      )}
    </div>
  );
}

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="app-loading">
        <div className="loading-spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="auth-container">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </div>
    );
  }

  return (
    <SocketProvider>
      <ChatApp />
    </SocketProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="App">
          <AppContent />
          <Toaster 
            position="top-right"
            toastOptions={{
              duration: 3000,
              style: {
                background: '#363636',
                color: '#fff',
              },
            }}
          />
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
