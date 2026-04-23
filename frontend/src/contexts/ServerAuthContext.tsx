import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { getServerAuthStatus, serverLogin } from '../api/serverAuth';

interface ServerAuthContextType {
  isAuthEnabled: boolean;
  isServerAuthed: boolean;
  isLoading: boolean;
  showLoginModal: boolean;
  login: (password: string) => Promise<void>;
  logout: () => void;
  requestLogin: () => void;
  closeLoginModal: () => void;
}

const ServerAuthContext = createContext<ServerAuthContextType | null>(null);

export const useServerAuth = () => {
  const context = useContext(ServerAuthContext);
  if (!context) {
    throw new Error('useServerAuth must be used within ServerAuthProvider');
  }
  return context;
};

interface ServerAuthProviderProps {
  children: ReactNode;
}

export const ServerAuthProvider: React.FC<ServerAuthProviderProps> = ({ children }) => {
  const [isAuthEnabled, setIsAuthEnabled] = useState(false);
  const [isServerAuthed, setIsServerAuthed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const status = await getServerAuthStatus();
        setIsAuthEnabled(status.enabled);
        if (status.enabled) {
          const token = localStorage.getItem('filebox_server_token');
          if (token) {
            setIsServerAuthed(true);
          }
        }
      } catch {
        setIsAuthEnabled(false);
      }
      setIsLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    const handleExpired = () => {
      localStorage.removeItem('filebox_server_token');
      setIsServerAuthed(false);
      setShowLoginModal(true);
    };
    window.addEventListener('server-auth-expired', handleExpired);
    return () => window.removeEventListener('server-auth-expired', handleExpired);
  }, []);

  const login = useCallback(async (password: string) => {
    const result = await serverLogin(password);
    if (result.success && result.token) {
      localStorage.setItem('filebox_server_token', result.token);
      setIsServerAuthed(true);
      setShowLoginModal(false);
    } else {
      throw new Error(result.error || 'Login failed');
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('filebox_server_token');
    setIsServerAuthed(false);
  }, []);

  const requestLogin = useCallback(() => {
    setShowLoginModal(true);
  }, []);

  const closeLoginModal = useCallback(() => {
    setShowLoginModal(false);
  }, []);

  return (
    <ServerAuthContext.Provider
      value={{
        isAuthEnabled,
        isServerAuthed,
        isLoading,
        showLoginModal,
        login,
        logout,
        requestLogin,
        closeLoginModal,
      }}
    >
      {children}
    </ServerAuthContext.Provider>
  );
};
