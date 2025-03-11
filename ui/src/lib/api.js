import axios from 'axios';
import Cookies from 'js-cookie';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Add JWT token to requests
api.interceptors.request.use((config) => {
  const token = Cookies.get('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const fetchTrack = async (trackId, secret) => {
  const url = secret 
    ? `/tracks/${trackId}?secret=${secret}`
    : `/tracks/${trackId}`;
  
  const response = await api.get(url);
  return response.data;
};

export default api;