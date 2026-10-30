import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase, formatSupabaseUser, syncUserProfile, type AppUser } from '@/lib/supabase';

interface AuthContextType {
  currentUser: AppUser | null;
  loading: boolean;
  setCurrentUser: (user: AppUser | null) => void;
  refreshUser: () => Promise<AppUser | null>;
}

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  loading: true,
  setCurrentUser: () => {},
  refreshUser: async () => null,
});

export const useAuth = () => useContext(AuthContext);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async (): Promise<AppUser | null> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = formatSupabaseUser(session?.user ?? null);
      setCurrentUser(user);
      if (user) {
        syncUserProfile(user);
      }
      return user;
    } catch (e) {
      console.warn('Failed to refresh user:', e);
      return null;
    }
  };

  useEffect(() => {
    // 1. Obtener la sesión activa inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = formatSupabaseUser(session?.user ?? null);
      setCurrentUser(user);
      if (user) {
        syncUserProfile(user);
      }
      setLoading(false);
    });

    // 2. Escuchar cambios de estado en Supabase Auth
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const user = formatSupabaseUser(session?.user ?? null);
      setCurrentUser(user);
      if (user) {
        syncUserProfile(user);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const value = {
    currentUser,
    loading,
    setCurrentUser,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
