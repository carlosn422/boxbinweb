import { toast } from 'sonner';
import i18n from 'i18next';
import { createClient, type User as SupabaseUser } from '@supabase/supabase-js';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://xfqmknrtozlxoscotcqa.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_2y7JVetNKfSr-0bBR19srg_Thlc65NA';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export interface AppUser {
  id: string; // Supabase UUID
  uid: string; // Inventory owner ID managed by Supabase Auth app_metadata (UUID by default)
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  getIdToken: () => Promise<string>;
  rawUser: SupabaseUser;
}

export function formatSupabaseUser(user: SupabaseUser | null): AppUser | null {
  if (!user) return null;

  const inventoryUserId = (user.app_metadata?.inventory_user_id as string) || user.id;
  const displayName =
    (user.user_metadata?.displayName as string) ||
    (user.user_metadata?.full_name as string) ||
    (user.user_metadata?.name as string) ||
    user.email?.split('@')[0] ||
    'User';
  const photoURL =
    (user.user_metadata?.avatar_url as string) ||
    (user.user_metadata?.picture as string) ||
    null;

  return {
    id: user.id,
    uid: inventoryUserId,
    email: user.email ?? null,
    displayName,
    photoURL,
    getIdToken: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token || '';
    },
    rawUser: user,
  };
}

export const loginWithGoogle = async () => {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/home`,
      },
    });
    if (error) throw error;
    return { data, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
};

export const loginWithApple = async () => {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: `${window.location.origin}/home`,
      },
    });
    if (error) throw error;
    return { data, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
};

export const loginWithYahoo = async () => {
  try {
    // Supabase supports custom OIDC/OAuth or Google/Apple primarily
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/home`,
      },
    });
    if (error) throw error;
    return { data, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
};

export const logoutUser = async () => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return { success: true, error: null };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

export const syncUserProfile = async (user: AppUser | null) => {
  if (!user) return;
  try {
    const { error } = await supabase.rpc('app_sync_profile');
    if (error) throw error;
  } catch (e) {
    console.warn('Could not sync user profile to supabase:', e);
    toast.error(String(i18n.t('records.profileFailed')), { id: 'profile-sync-failed' });
  }
};
