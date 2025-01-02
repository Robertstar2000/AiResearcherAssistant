import { researchApi } from './api';
import { store } from '../store';
import { logout } from '../store/slices/authSlice';
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

export async function createUser(credentials: AuthCredentials): Promise<AuthUser> {
  try {
    // Create profile directly in the database
    const { data: profile, error: profileError } = await researchApi.supabase
      .from('AiResearcherAssistant')
      .insert({
        id: `user_${Date.now()}`,  // Simple timestamp-based ID
        email: credentials.email,
        created_at: new Date().toISOString(),
        "User-Name": credentials.metadata?.name || credentials.email,
        PassWord: credentials.password,
        Occupation: credentials.metadata?.occupation || '',
        Location: credentials.metadata?.geolocation || '',
        title: '',
        content: '',
        references: ''
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
        'Failed to create user profile - no profile returned'
      );
    }

    // Return user object
    return {
      id: profile.id,
      email: profile.email,
      name: profile["User-Name"],
      occupation: profile.Occupation,
      geolocation: profile.Location
    };
  } catch (error) {
    console.error('Error in createUser:', error);
    if (error instanceof ResearchException) {
      throw error;
    }
    throw new ResearchException(
      ResearchError.AUTH_ERROR,
      'Failed to create user',
      { error }
    );
  }
}

export async function authenticateUser(credentials: AuthCredentials): Promise<AuthUser> {
  try {
    // First check if user exists with this email
    const { data: profile, error: profileError } = await researchApi.supabase
      .from('AiResearcherAssistant')
      .select('*')  // Select all fields
      .eq('email', credentials.email)  // Match by email field
      .maybeSingle();  // Use maybeSingle to handle no matches gracefully

    if (profileError) {
      console.error('Profile lookup error:', profileError);
      throw new ResearchException(
        ResearchError.AUTH_ERROR,
        'Error looking up user',
        { error: profileError }
      );
    }

    if (!profile) {
      throw new ResearchException(
        ResearchError.AUTH_ERROR,
        'No user found with this email'
      );
    }

    // Verify password match here if needed

    return {
      id: profile.id,
      email: profile.email,
      name: profile["User-Name"],
      occupation: profile.Occupation,
      geolocation: profile.Location
    };
  } catch (error) {
    console.error('Authentication error:', error);
    throw new ResearchException(
      ResearchError.AUTH_ERROR,
      'Authentication failed',
      { error }
    );
  }
}

// Just clear local state
export const signOut = async (): Promise<void> => {
  try {
    store.dispatch(logout());
  } catch (error) {
    console.error('Sign out error:', error);
    throw error;
  }
};
