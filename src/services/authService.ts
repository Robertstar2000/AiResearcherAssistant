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

    // Insert user data into profiles table
    const { error: profileError } = await supabase
      .from('profiles')
      .insert([
        {
          id: data.user.id,
          email: data.user.email,
          name: credentials.metadata?.name || '',
          occupation: credentials.metadata?.occupation || '',
          geolocation: credentials.metadata?.geolocation || '',
          updated_at: new Date().toISOString()
        }
      ]);

    if (profileError) {
      console.error('Error creating user profile:', profileError);
      throw new ResearchException(
        ResearchError.AUTH_ERROR,
        'Failed to create user profile',
        { error: profileError }
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
    // First check if the email exists in the database
    const { error: userCheckError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', credentials.email)
      .single();

    if (userCheckError && userCheckError.code !== 'PGRST116') {
      console.error('Error checking user existence:', userCheckError);
      throw new ResearchException(
        ResearchError.AUTH_ERROR,
        'Error verifying user account',
        { error: userCheckError }
      );
    }

    // Attempt to sign in
    const { data, error } = await supabase.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password
    });

    if (error) {
      console.error('Authentication error:', error);
      // Handle specific error cases
      if (error.message.includes('Email not confirmed')) {
        // Check if the user exists but email is not confirmed
        const { data: userExists } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', credentials.email)
          .single();
        
        if (userExists) {
          // If user exists, allow sign in despite email not being confirmed
          console.log('User exists, proceeding with authentication despite email not being confirmed');
        } else {
          throw new ResearchException(
            ResearchError.AUTH_ERROR,
            'Invalid email or password',
            { error }
          );
        }
      } else {
        throw new ResearchException(
          ResearchError.AUTH_ERROR,
          'Authentication failed: Invalid credentials',
          { error }
        );
      }
    }

    if (!data?.user) {
      throw new ResearchException(
        ResearchError.AUTH_ERROR,
        'Authentication successful but no user data returned'
      );
    }

    // Get the user's metadata from their profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('name, occupation, geolocation')
      .eq('id', data.user.id)
      .single();

    let metadata: UserMetadata = {
      name: data.user.user_metadata?.name || '',
      occupation: data.user.user_metadata?.occupation || '',
      geolocation: data.user.user_metadata?.geolocation || ''
    };

    if (profile && !profileError) {
      metadata = {
        name: profile.name || metadata.name,
        occupation: profile.occupation || metadata.occupation,
        geolocation: profile.geolocation || metadata.geolocation
      };
    }

    return createAuthUser(data.user, metadata);
  } catch (error) {
    console.error('Authentication error:', error);
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
