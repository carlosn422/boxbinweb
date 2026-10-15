import type { AxiosError, AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { supabase } from './supabase';
import axios from 'axios';

const apiUrl = import.meta.env.VITE_API_URL;
console.log(apiUrl);

const api: AxiosInstance = axios.create({
  baseURL: apiUrl,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      if (config.headers) {
        config.headers.Authorization = `Bearer ${session.access_token}`;
      }
    }
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

// Interceptor de respuesta
api.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  (error: AxiosError) => {
    if (error.response) {
      const status = error.response.status;
      switch (status) {
        case 401:
          console.error('Error 401: No autorizado');
          break;
        case 403:
          console.error('Error 403: Acceso prohibido');
          break;
        case 404:
          console.error('Error 404: Recurso no encontrado');
          break;
        case 500:
          console.error('Error 500: Error interno del servidor');
          break;
        default:
          console.error(`Error ${status}: ${error.message}`);
      }
    } else if (error.request) {
      console.error('Error de red: No se recibió respuesta del servidor');
    } else {
      console.error('Error de configuración de Axios:', error.message);
    }
    return Promise.reject(error);
  }
);

export default api;
