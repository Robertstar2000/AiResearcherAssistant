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
    // Check if profile exists by email
    const { data: profile, error: profileError } = await researchApi.supabase
      .from('AiResearcherAssistant')
      .select()
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

// Just clear local state
export const signOut = async (): Promise<void> => {
  try {
    store.dispatch(logout());
  } catch (error) {
    console.error('Sign out error:', error);
    throw error;
  }
};
