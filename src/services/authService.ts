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
    // Create user in Supabase Auth first
    const { data: authData, error: authError } = await researchApi.supabase.auth.signUp({
      email: credentials.email,
      password: credentials.password,
      options: {
        data: credentials.metadata,
        emailRedirectTo: 'https://airesearcherassistant.netlify.app/research'
      }
    });

    if (authError || !authData.user) {
      throw new ResearchException(
        ResearchError.AUTH_ERROR,
        `Failed to create auth user: ${authError?.message || 'No user data returned'}`,
        { error: authError }
      );
    }

    // Wait for session to be established
    const { data: { session }, error: sessionError } = await researchApi.supabase.auth.getSession();
    
    if (sessionError || !session) {
      throw new ResearchException(
        ResearchError.AUTH_ERROR,
        'Failed to establish session after signup',
        { error: sessionError }
      );
    }

    // Get the current max ID to generate a new one
    const { data: maxIdResult } = await researchApi.supabase
      .from('AiResearcherAssistant')
      .select('id')
      .order('id', { ascending: false })
      .limit(1)
      .single();

    const newId = maxIdResult ? maxIdResult.id + 1 : 1;

    // Insert user data into custom table using the established session
    const { data: profile, error: profileError } = await researchApi.supabase
      .from('AiResearcherAssistant')
      .insert([{
        id: newId,
        username: credentials.email,
        password: credentials.password,
        occupation: credentials.metadata?.occupation || '',
        location: credentials.metadata?.geolocation || '',
        auth_id: authData.user.id,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (profileError || !profile) {
      console.error('Profile creation error:', profileError);
      throw new ResearchException(
        ResearchError.AUTH_ERROR,
        'Failed to create user profile',
        { error: profileError }
      );
    }

    // Return the created user
    return {
      id: profile.id.toString(),
      email: profile.username,
      name: credentials.metadata?.name || profile.username,
      occupation: profile.occupation || '',
      geolocation: profile.location || ''
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
    // First authenticate with Supabase Auth
    const { data: authData, error: authError } = await researchApi.supabase.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
    });

    if (authError || !authData.user) {
      throw new ResearchException(
        ResearchError.AUTH_ERROR,
        'Invalid email or password',
        { error: authError }
      );
    }

    // Get user profile from custom table
    const { data: profile, error: profileError } = await researchApi.supabase
      .from('AiResearcherAssistant')
      .select('*')
      .eq('username', credentials.email)
      .single();

    if (profileError || !profile) {
      console.error('Profile fetch error:', profileError);
      throw new ResearchException(
        ResearchError.AUTH_ERROR,
        'User profile not found',
        { error: profileError }
      );
    }

    // Return user data
    return {
      id: profile.id.toString(),
      email: profile.username,
      name: profile.username,
      occupation: profile.occupation || '',
      geolocation: profile.location || ''
    };
  } catch (err) {
    console.error('Login error:', err);
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
    const { error } = await researchApi.supabase.auth.signOut();
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
