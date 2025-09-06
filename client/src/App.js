import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SocketProvider, useSocket } from './contexts/SocketContext';
import Login from './components/Login';
import Register from './components/Register';
import ChatList from './components/ChatList';
import ChatWindow from './components/ChatWindow';
import './App.css';

function ChatApp() {
  const { setCurrentChat: setSocketCurrentChat } = useSocket();
  const [currentChat, setCurrentChat] = useState(null);

  const handleChatSelect = (chat) => {
    setCurrentChat(chat);
    setSocketCurrentChat(chat?.id || null);
  };

  return (
    <div className="app">
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
                <h1>BB Chat</h1>
                <p>Select a chat to start messaging</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="app-loading">
        <div className="loading-spinner"></div>
        <p>Loading BB Chat...</p>
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
