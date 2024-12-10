import { supabase } from './api';
import { store } from '../store';
import { setUser, logout } from '../store/slices/authSlice';
import { Session, AuthChangeEvent, User as SupabaseUser } from '@supabase/supabase-js';
import { ResearchError, ResearchException } from './researchErrors';

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

interface AuthCredentials {
  email: string;
  password: string;
  metadata?: UserMetadata;
}

const createAuthUser = (user: SupabaseUser, metadata: UserMetadata): AuthUser => ({
  id: user.id,
  email: user.email || '',
  name: metadata.name || '',
  occupation: metadata.occupation || '',
  geolocation: metadata.geolocation || '',
});

// Initialize session persistence
export const initializeAuth = async (callback?: () => void): Promise<() => void> => {
  try {
    // Get session from storage
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      throw new ResearchException(ResearchError.AUTH_ERROR, 'Failed to get session');
    }

    // Set initial user state
    if (session?.user) {
      const metadata: UserMetadata = {
        name: session.user.user_metadata.name,
        occupation: session.user.user_metadata.occupation,
        geolocation: session.user.user_metadata.geolocation
      };
      store.dispatch(setUser(createAuthUser(session.user, metadata)));
    }

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        try {
          if (event === 'SIGNED_IN' && session?.user) {
            const metadata: UserMetadata = {
              name: session.user.user_metadata.name,
              occupation: session.user.user_metadata.occupation,
              geolocation: session.user.user_metadata.geolocation
            };
            store.dispatch(setUser(createAuthUser(session.user, metadata)));
          } else if (event === 'SIGNED_OUT') {
            store.dispatch(logout());
          }
        } catch (error) {
          console.error('Error handling auth state change:', error);
        }
      }
    );

    // Call the callback function
    if (callback) {
      callback();
    }

    // Return cleanup function
    return () => {
      subscription.unsubscribe();
    };
  } catch (error) {
    console.error('Auth initialization error:', error);
    throw new ResearchException(
      ResearchError.AUTH_ERROR,
      error instanceof Error ? error.message : 'Failed to initialize auth',
      { error }
    );
  }
};

export async function createUser(credentials: AuthCredentials): Promise<AuthUser> {
  try {
    const { data, error } = await supabase.auth.signUp({
      email: credentials.email,
      password: credentials.password,
      options: {
        data: credentials.metadata
      }
    });

    if (error) {
      throw new ResearchException(
        ResearchError.AUTH_ERROR,
        `Failed to create user: ${error.message}`,
        { error }
      );
    }

    if (!data.user) {
      throw new ResearchException(
        ResearchError.AUTH_ERROR,
        'User creation successful but no user data returned'
      );
    }

    return createAuthUser(data.user, credentials.metadata || {});
  } catch (error) {
    throw new ResearchException(
      ResearchError.AUTH_ERROR,
      error instanceof Error ? error.message : 'Failed to create user',
      { error }
    );
  }
}

export async function authenticateUser(credentials: AuthCredentials): Promise<AuthUser> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password
    });

    if (error) {
      throw new ResearchException(
        ResearchError.AUTH_ERROR,
        `Authentication failed: ${error.message}`,
        { error }
      );
    }

    if (!data.user) {
      throw new ResearchException(
        ResearchError.AUTH_ERROR,
        'Authentication successful but no user data returned'
      );
    }

    const metadata = data.user.user_metadata as UserMetadata;
    return createAuthUser(data.user, metadata);
  } catch (error) {
    throw new ResearchException(
      ResearchError.AUTH_ERROR,
      error instanceof Error ? error.message : 'Authentication failed',
      { error }
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
    console.error('Sign out error:', error);
    throw new ResearchException(
      ResearchError.AUTH_ERROR,
      'Failed to sign out',
      { originalError: error }
    );
  }
}
