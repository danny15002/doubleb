// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 
  (import.meta.env.PROD ? window.location.origin : 'http://localhost:5001');
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 
  (import.meta.env.PROD ? window.location.origin : 'http://localhost:5001');

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
