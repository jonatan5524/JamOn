import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('jamon_access_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('jamon_refresh_token');
        
        if (!refreshToken) {
          throw new Error('No refresh token available');
        }
        const response = await axios.post(`${API_URL}/auth/refresh`, {
          refreshToken: refreshToken,
        });

        const { appAccessToken, appRefreshToken } = response.data;

        localStorage.setItem('jamon_access_token', appAccessToken);
        localStorage.setItem('jamon_refresh_token', appRefreshToken);

        originalRequest.headers.Authorization = `Bearer ${appAccessToken}`;

        return api(originalRequest);
      } catch (refreshError) {
        console.error('Refresh token expired or invalid', refreshError);

        localStorage.removeItem('jamon_access_token');
        localStorage.removeItem('jamon_refresh_token');
        window.location.href = '/login'; 
        
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;