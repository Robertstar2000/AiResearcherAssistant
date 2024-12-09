import { supabase } from './api'
import { store } from '../store'
import { setUser, logout } from '../store/slices/authSlice'
import { Session, AuthChangeEvent, User as SupabaseUser } from '@supabase/supabase-js'
import { ResearchError, ResearchException } from './researchErrors'

interface UserMetadata {
  name?: string;
  occupation?: string;
  geolocation?: string;
}

interface AuthUser {
  id: string;
  email: string;
  name: string;
  occupation?: string;
  geolocation?: string;
}

const createAuthUser = (user: SupabaseUser, metadata: UserMetadata): AuthUser => ({
  id: user.id,
  email: user.email || '',
  name: metadata.name || '',
  occupation: metadata.occupation || '',
  geolocation: metadata.geolocation || '',
});

// Initialize session persistence
export const initializeAuth = async (): Promise<void> => {
  try {
    // Get session from storage
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;

    if (session?.user) {
      const metadata = session.user.user_metadata as UserMetadata;
      store.dispatch(setUser(createAuthUser(session.user, metadata)));
    }

    // Listen for auth changes
    supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const metadata = session.user.user_metadata as UserMetadata;
        store.dispatch(setUser(createAuthUser(session.user, metadata)));
      } else if (event === 'SIGNED_OUT') {
        store.dispatch(logout());
      }
    });
  } catch (error) {
    console.error('Auth initialization error:', error);
    throw new ResearchException(
      ResearchError.AUTH_ERROR,
      `Failed to initialize authentication: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// Handle sign out
export const signOut = async (): Promise<void> => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    store.dispatch(logout());
  } catch (error) {
    throw new ResearchException(
      ResearchError.AUTH_ERROR,
      `Failed to sign out: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
