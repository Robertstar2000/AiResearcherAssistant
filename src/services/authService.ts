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
    // Normalize email and trim password
    const normalizedEmail = credentials.email.toLowerCase().trim();
    const trimmedPassword = credentials.password.trim();

    // Create profile directly in the database
    const { data: profile, error: profileError } = await researchApi.supabase
      .from('AiResearcherAssistant')
      .insert({
        e_mail: normalizedEmail,
        "User-Name": credentials.metadata?.name || '',
        PassWord: trimmedPassword,
        Occupation: credentials.metadata?.occupation || '',
        Location: credentials.metadata?.geolocation || '',
        title: '',
        content: '',
        references: ''
      })
      .select('*')
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
      email: profile.e_mail,
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
    // Normalize email and trim password
    const normalizedEmail = credentials.email.toLowerCase().trim();
    const trimmedPassword = credentials.password.trim();
    
    console.log('Attempting login with:', { email: normalizedEmail }); // Debug log
    
    const { data: profiles, error: queryError } = await researchApi.supabase
      .from('AiResearcherAssistant')
      .select('*')
      .eq('e_mail', normalizedEmail)
      .eq('PassWord', trimmedPassword);

    if (queryError) {
      console.error('Login query error:', queryError);
      throw new ResearchException(
        ResearchError.AUTH_ERROR,
        'Invalid email or password'
      );
    }

    // Handle case of no results or multiple results
    if (!profiles || profiles.length === 0) {
      console.error('No profile found for email:', normalizedEmail);
      throw new ResearchException(
        ResearchError.AUTH_ERROR,
        'Invalid email or password'
      );
    }

    // Use the first matching profile
    const profile = profiles[0];

    console.log('Login successful for:', { email: normalizedEmail }); // Debug log
    
    return {
      id: profile.id,
      email: profile.e_mail,
      name: profile["User-Name"],
      occupation: profile.Occupation,
      geolocation: profile.Location
    };
  } catch (error) {
    console.error('Authentication error:', error);
    if (error instanceof ResearchException) {
      throw error;
    }
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
