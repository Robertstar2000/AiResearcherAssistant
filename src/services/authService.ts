import { researchApi } from './api';
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
  id: user.id.toString(),
  email: user.email || '',
  name: metadata.name || '',
  occupation: metadata.occupation || '',
  geolocation: metadata.geolocation || '',
});

// Initialize session persistence
export const initializeAuth = async (callback?: () => void): Promise<() => void> => {
  try {
    // Get session from storage
    const { data: { session }, error: sessionError } = await researchApi.supabase.auth.getSession();
    console.log('Session check result:', session ? 'Session found' : 'No session found');
    
    if (sessionError) {
      console.error('Session error:', sessionError);
      throw new ResearchException(ResearchError.AUTH_ERROR, 'Failed to get session');
    }

    // Set initial user state
    if (session?.user) {
      console.log('Restoring user session for:', session.user.email);
      const metadata: UserMetadata = {
        name: session.user.user_metadata.name,
        occupation: session.user.user_metadata.occupation,
        geolocation: session.user.user_metadata.geolocation
      };
      store.dispatch(setUser(createAuthUser(session.user, metadata)));
    }

    // Set up auth state listener
    const { data: { subscription } } = researchApi.supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        try {
          console.log('Auth state changed:', event, session ? 'Session exists' : 'No session');
          if (event === 'SIGNED_IN' && session?.user) {
            const metadata: UserMetadata = {
              name: session.user.user_metadata.name,
              occupation: session.user.user_metadata.occupation,
              geolocation: session.user.user_metadata.geolocation
            };
            store.dispatch(setUser(createAuthUser(session.user, metadata)));
            console.log('User signed in:', session.user.email);
          } else if (event === 'SIGNED_OUT') {
            store.dispatch(logout());
            console.log('User signed out');
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

    console.log('Auth initialization completed');
    
    // Return cleanup function
    return () => {
      console.log('Cleaning up auth subscription');
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
    // Create profile directly in the database without any auth
    const { data: profile, error: profileError } = await researchApi.supabase
      .from('AiResearcherAssistant')
      .insert({
        Display_name: credentials.metadata?.name || credentials.email,
        Email: credentials.email,
        Phone: '',
        Providers: 'local',
        Provider_type: 'email',
        Created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (profileError) {
      console.error('Profile creation error:', profileError);
      throw new ResearchException(
        ResearchError.AUTH_ERROR,
        'Failed to create user profile',
        { error: profileError }
      );
    }

    if (!profile) {
      throw new ResearchException(
        ResearchError.AUTH_ERROR,
        'No profile data returned after creation'
      );
    }

    // Return the created user
    return {
      id: profile.UID.toString(),
      email: profile.Email,
      name: profile.Display_name,
      occupation: credentials.metadata?.occupation || '',
      geolocation: credentials.metadata?.geolocation || ''
    };
  } catch (err) {
    console.error('User creation error:', err);
    if (err instanceof ResearchException) {
      throw err;
    }
    throw new ResearchException(
      ResearchError.AUTH_ERROR,
      err instanceof Error ? err.message : 'Failed to create user',
      { error: err }
    );
  }
}

export async function authenticateUser(credentials: AuthCredentials): Promise<AuthUser> {
  try {
    // Just check if the profile exists
    const { data: profile, error: profileError } = await researchApi.supabase
      .from('AiResearcherAssistant')
      .select('*')
      .eq('Email', credentials.email)
      .single();

    if (profileError || !profile) {
      throw new ResearchException(
        ResearchError.AUTH_ERROR,
        'User not found',
        { error: profileError }
      );
    }

    return {
      id: profile.UID.toString(),
      email: profile.Email,
      name: profile.Display_name,
      occupation: '',
      geolocation: ''
    };
  } catch (err) {
    console.error('Login error:', err);
    if (err instanceof ResearchException) {
      throw err;
    }
    throw new ResearchException(
      ResearchError.AUTH_ERROR,
      err instanceof Error ? err.message : 'Failed to authenticate',
      { error: err }
    );
  }
}

// Handle sign out - just clear the local state
export const signOut = async (): Promise<void> => {
  try {
    store.dispatch(logout());
  } catch (error) {
    console.error('Sign out error:', error);
    throw error;
  }
};
