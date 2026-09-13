import React, { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import { authStore } from '../services/auth';

const AuthContext = createContext(null);

// React observes the session; the independent controller handles credentials and races.
export function AuthProvider({ children }) {
  const snapshot = useSyncExternalStore(authStore.subscribe, authStore.getSnapshot, authStore.getSnapshot);
  useEffect(() => { authStore.hydrate(); }, []);
  return <AuthContext.Provider value={{ ...snapshot, signIn: authStore.signIn, signOut: authStore.signOut, authorization: authStore.authorization }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth richiede AuthProvider');
  return context;
}
