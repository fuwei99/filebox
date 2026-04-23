import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import * as authApi from '../api/auth';

export interface User {
  id: string;
  username: string;
  nickname: string;
  avatarCode: string | null;
  avatarEmoji: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (data: authApi.RegisterData) => Promise<void>;
  logout: () => void;
  updateUser: (user: User) => void;
  getToken: () => string | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const getToken = () => localStorage.getItem('filebox_token');

  // Check for existing session on mount
  useEffect(() => {
    const initAuth = async () => {
      const savedToken = localStorage.getItem('filebox_token');
      if (savedToken) {
        setToken(savedToken);
        try {
          const response = await authApi.getMe();
          if (response.success) {
            setUser(response.user);
          } else {
            localStorage.removeItem('filebox_token');
            setToken(null);
          }
        } catch {
          localStorage.removeItem('filebox_token');
          setToken(null);
        }
      }
      setIsLoading(false);
    };
    initAuth();
  }, []);

  const login = async (username: string, password: string) => {
    const response = await authApi.login({ username, password });
    if (response.success) {
      localStorage.setItem('filebox_token', response.token);
      setToken(response.token);
      setUser(response.user);
    } else {
      throw new Error(response.error || 'Login failed');
    }
  };

  const register = async (data: authApi.RegisterData) => {
    const response = await authApi.register(data);
    if (response.success) {
      localStorage.setItem('filebox_token', response.token);
      setToken(response.token);
      setUser(response.user);
    } else {
      throw new Error(response.error || 'Registration failed');
    }
  };

  const logout = () => {
    localStorage.removeItem('filebox_token');
    setToken(null);
    setUser(null);
  };

  const updateUser = (updatedUser: User) => {
    setUser(updatedUser);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        updateUser,
        getToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
