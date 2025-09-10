// API Configuration
// TEMPORARY: Use local IP for development
const LOCAL_IP = '192.168.1.136'; // Change this to your actual local IP
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 
  (import.meta.env.PROD ? window.location.origin : `http://${LOCAL_IP}:3001`);
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 
  (import.meta.env.PROD ? window.location.origin : `http://${LOCAL_IP}:3001`);

// Debug logging
console.log('API_BASE_URL:', API_BASE_URL);
console.log('SERVER_URL:', SERVER_URL);

export const config = {
  apiBaseUrl: API_BASE_URL,
  serverUrl: SERVER_URL,
  endpoints: {
    auth: {
      login: '/api/auth/login',
      register: '/api/auth/register',
      me: '/api/auth/me'
    },
    chats: '/api/chats',
    messages: '/api/messages'
  }
};

// Helper function to get full API URL
export const getApiUrl = (endpoint) => {
  return `${config.apiBaseUrl}${endpoint}`;
};

export default config;
