import { supabase } from './api'

// Types for research data
export interface ResearchEntry {
  id: bigint
  created_at: string
  'User-Name': string
  'PassWord': string
  Occupation: string
  Location: string
  title: string
  content: any
  references: string
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

interface ResearchEntryData {
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
        table: 'AiResearcherAssistant'
      },
      (payload) => {
        console.log('Change received!', payload)
        onUpdate(payload)
      }
    )
    .subscribe()

  return () => {
    channel.unsubscribe()
  }
}

// User operations
export const createUser = async (userData: {
  'User-Name': string,
  'PassWord': string,
  Occupation: string,
  Location: string,
  title: string,
  content: string,
  references: string
}) => {
  try {
    // First check if user already exists
    const { data: existingUser, error: searchError } = await supabase
      .from('AiResearcherAssistant')
      .select('User-Name')
      .eq('User-Name', userData['User-Name'])
      .maybeSingle()

    if (searchError) {
      console.error('Error checking existing user:', searchError)
      throw new Error('Error checking user existence')
    }

    if (existingUser) {
      throw new Error('Username already exists')
    }

    // Create new user with RLS enabled
    const { data, error: insertError } = await supabase
      .from('AiResearcherAssistant')
      .insert([userData])
      .select()
      .single()

    if (insertError) {
      console.error('Error creating user:', insertError)
      throw new Error('Failed to create user')
    }

    return data
  } catch (error) {
    console.error('Error in createUser:', error)
    throw error
  }
}

export const authenticateUser = async (userName: string, password: string) => {
  try {
    const { data, error } = await supabase
      .from('AiResearcherAssistant')
      .select('*')
      .eq('User-Name', userName)
      .eq('PassWord', password)
      .maybeSingle()

    if (error) {
      console.error('Error authenticating:', error)
      throw new Error('Authentication failed')
    }

    if (!data) {
      throw new Error('Invalid username or password')
    }

    return data
  } catch (error) {
    console.error('Error in authenticateUser:', error)
    throw error
  }
}

export const getUserByUsername = async (userName: string) => {
  try {
    const { data, error } = await supabase
      .from('AiResearcherAssistant')
      .select('*')
      .eq('User-Name', userName)
      .maybeSingle()

    if (error) {
      console.error('Error getting user:', error)
      throw new Error('Failed to get user')
    }

    return data
  } catch (error) {
    console.error('Error in getUserByUsername:', error)
    throw error
  }
}

// Research operations
export const saveResearchEntry = async (data: ResearchEntryData): Promise<{ id: string }> => {
  try {
    console.log('Saving research entry:', data);
    
    const { data: savedData, error } = await supabase
      .from('AiResearcherAssistant')
      .insert([{
        'User-Name': data.userId,
        title: data.title,
        content: JSON.stringify(data.content),
        references: JSON.stringify(data.references),
        'PassWord': '', // Required field but not used for research entries
        Occupation: '', // Required field but not used for research entries
        Location: '', // Required field but not used for research entries
        created_at: data.created_at || new Date().toISOString()
      }])
      .select('id')
      .single();

    if (error) {
      console.error('Error saving research:', error);
      throw error;
    }

    return savedData;
  } catch (error) {
    console.error('Error in saveResearchEntry:', error);
    throw error;
  }
};

export const getResearchEntries = async (userName: string) => {
  try {
    const { data, error } = await supabase
      .from('AiResearcherAssistant')
      .select('*')
      .eq('User-Name', userName)

    if (error) {
      console.error('Error getting research:', error)
      throw new Error('Failed to get research entries')
    }

    return data
  } catch (error) {
    console.error('Error in getResearchEntries:', error)
    throw error
  }
}

export const updateResearchEntry = async (
  id: bigint,
  updates: Partial<Omit<ResearchEntry, 'id' | 'created_at'>>
) => {
  try {
    const { data, error } = await supabase
      .from('AiResearcherAssistant')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating research:', error)
      throw new Error('Failed to update research')
    }

    return data
  } catch (error) {
    console.error('Error in updateResearchEntry:', error)
    throw error
  }
}

export const deleteResearchEntry = async (id: bigint) => {
  try {
    const { error } = await supabase
      .from('AiResearcherAssistant')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting research:', error)
      throw new Error('Failed to delete research')
    }
  } catch (error) {
    console.error('Error in deleteResearchEntry:', error)
    throw error
  }
}
