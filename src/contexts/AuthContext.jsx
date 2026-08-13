import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/firebase.js';
import { useLoading } from './LoadingContext.jsx';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // Supabase auth user
  const [profile, setProfile] = useState(null); // public.profiles row
  const [initializing, setInitializing] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const { completeInitialization } = useLoading();

  // Restore / track session on mount.
  useEffect(() => {
    let mounted = true;

    const getSession = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (!mounted) return;
      if (error) {
        console.error('getSession error', error);
        setUser(null);
      } else {
        setUser(session?.user ?? null);
      }
      setInitializing(false);
      completeInitialization();
    };

    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!mounted) return;
        setUser(session?.user ?? null);
        if (!session?.user) {
          setProfile(null);
          setProfileLoading(false);
        }
      },
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [completeInitialization]);

  // Subscribe to the profile row with a realtime listener.
  useEffect(() => {
    if (!user) {
      setProfile(null);
      setProfileLoading(false);
      return undefined;
    }

    setProfileLoading(true);

    // One-off fetch.
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
      .then(({ data, error }) => {
        if (error) {
          // If the profile row doesn't exist yet (rare on fresh sign-up), create it.
          if (error.code === 'PGRST116') {
            supabase.rpc('register_profile', {
              p_username: user.user_metadata?.username || `لاعب`,
              p_avatar: user.user_metadata?.avatar || '🦁',
            });
          } else {
            console.error('profile fetch error', error);
          }
          setProfile(null);
        } else {
          setProfile(data);
        }
        setProfileLoading(false);
      });

    // Realtime: keep the profile in sync when stats change.
    const channel = supabase
      .channel(`public:profiles:id=${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          setProfile(payload.new);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const logout = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) console.error('logout error', error);
    setUser(null);
    setProfile(null);
  }, []);

  const value = {
    user,
    profile,
    isAuthenticated: !!user,
    initializing,
    profileLoading,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
