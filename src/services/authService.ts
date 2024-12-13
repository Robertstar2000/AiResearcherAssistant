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
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
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

    // Insert user data into custom table using Supabase auth ID
    const { error: profileError } = await supabase
      .from('AiResearcherAssistant')
      .insert({
        id: parseInt(data.user.id.replace(/-/g, '')),  // Convert UUID to number
        "User-Name": credentials.metadata?.name || '',
        "PassWord": credentials.password,
        "Occupation": credentials.metadata?.occupation || '',
        "Location": credentials.metadata?.geolocation || '',
        created_at: new Date().toISOString()
      });

    if (profileError) {
      console.error('Full profile error object:', JSON.stringify(profileError, null, 2));
      
      const errorMessage = typeof profileError === 'object' && profileError !== null
        ? profileError.message || profileError.details || 'Unknown database error'
        : 'Failed to create profile';

      throw new ResearchException(
        ResearchError.AUTH_ERROR,
        `Failed to create user profile: ${errorMessage}`,
        { error: profileError }
      );
    }

    return createAuthUser(data.user, credentials.metadata || {});
  } catch (err) {
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
    // Check credentials against our custom table
    const { data: profile, error: profileError } = await supabase
      .from('AiResearcherAssistant')
      .select('*')
      .eq('User-Name', credentials.email)
      .eq('PassWord', credentials.password)
      .single();

    if (profileError || !profile) {
      console.error('Authentication error:', profileError);
      throw new ResearchException(
        ResearchError.AUTH_ERROR,
        'Invalid email or password',
        { error: profileError }
      );
    }

    // Create auth user from profile data
    return {
      id: profile.id.toString(),
      email: profile["User-Name"],
      name: profile["User-Name"],
      occupation: profile["Occupation"] || '',
      geolocation: profile["Location"] || ''
    };
  } catch (err) {
    if (err instanceof ResearchException) {
      throw err;
    }
    throw new ResearchException(
      ResearchError.AUTH_ERROR,
      'Invalid email or password',
      { error: err }
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
