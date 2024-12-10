import { supabase } from './api';
import { ResearchError, ResearchException } from './researchErrors';

// Types for research data
export interface ResearchEntry {
  id: string;
  created_at: string;
  user_id: string;
  title: string;
  content: ResearchContent;
  references: string[];
}

interface Section {
  title: string;
  content: string;
  number: string;
  subsections?: Section[];
}

interface ResearchContent {
  sections: Section[];
}

export interface ResearchEntryData {
  userId: string;
  title: string;
  content: ResearchContent;
  references: string[];
  created_at?: string;
  updated_at?: string;
}

// Initialize real-time subscription
export const initializeRealtimeSubscription = (onUpdate: (payload: any) => void) => {
  const channel = supabase.channel('custom-filter-channel')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'research'
      },
      (payload) => onUpdate(payload)
    )
    .subscribe();

  return () => {
    channel.unsubscribe();
  };
};

// Research operations
export const saveResearchEntry = async (data: ResearchEntryData): Promise<{ id: string }> => {
  try {
    const { data: result, error } = await supabase
      .from('research')
      .insert({
        user_id: data.userId,
        title: data.title,
        content: data.content,
        references: data.references,
        created_at: data.created_at || new Date().toISOString(),
        updated_at: data.updated_at || new Date().toISOString()
      })
      .select('id')
      .single();

    if (error) throw error;
    if (!result) throw new Error('No data returned from insert');

    return { id: result.id };
  } catch (error) {
    console.error('Error saving research entry:', error);
    throw new ResearchException(
      ResearchError.DATABASE_ERROR,
      'Failed to save research entry',
      { originalError: error }
    );
  }
};

export const getResearchEntries = async (userId: string): Promise<ResearchEntry[]> => {
  try {
    const { data, error } = await supabase
      .from('research')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching research entries:', error);
    throw new ResearchException(
      ResearchError.DATABASE_ERROR,
      'Failed to fetch research entries',
      { originalError: error }
    );
  }
};

export const updateResearchEntry = async (
  id: string,
  updates: Partial<Omit<ResearchEntry, 'id' | 'created_at'>>
): Promise<void> => {
  try {
    const { error } = await supabase
      .from('research')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  } catch (error) {
    console.error('Error updating research entry:', error);
    throw new ResearchException(
      ResearchError.DATABASE_ERROR,
      'Failed to update research entry',
      { originalError: error }
    );
  }
};

export const deleteResearchEntry = async (id: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('research')
      .delete()
      .eq('id', id);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting research entry:', error);
    throw new ResearchException(
      ResearchError.DATABASE_ERROR,
      'Failed to delete research entry',
      { originalError: error }
    );
  }
};

export async function createUser(userData: any): Promise<void> {
  try {
    const { error } = await supabase
      .from('users')
      .insert([userData]);

    if (error) {
      throw new ResearchException(
        ResearchError.DATABASE_ERROR,
        `Failed to create user: ${error.message}`,
        { error }
      );
    }
  } catch (error) {
    throw new ResearchException(
      ResearchError.DATABASE_ERROR,
      error instanceof Error ? error.message : 'Failed to create user',
      { error }
    );
  }
}

export async function authenticateUser(credentials: any): Promise<any> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword(credentials);

    if (error) {
      throw new ResearchException(
        ResearchError.DATABASE_ERROR,
        `Authentication failed: ${error.message}`,
        { error }
      );
    }

    return data;
  } catch (error) {
    throw new ResearchException(
      ResearchError.DATABASE_ERROR,
      error instanceof Error ? error.message : 'Authentication failed',
      { error }
    );
  }
}
