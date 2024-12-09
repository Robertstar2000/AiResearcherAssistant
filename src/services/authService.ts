import { supabase } from './api'
import { store } from '../store'
import { setUser, logout } from '../store/slices/authSlice'
import { Session, AuthChangeEvent } from '@supabase/supabase-js'

interface UserMetadata {
  name?: string;
  occupation?: string;
  geolocation?: string;
}

interface User {
  id: string;
  email: string;
  name: string;
  occupation?: string;
  geolocation?: string;
}

// Initialize session persistence
export const initializeAuth = async (): Promise<void> => {
  // Get session from storage
  const { data: { session }, error } = await supabase.auth.getSession()
  
  if (session) {
    const metadata = session.user.user_metadata as UserMetadata;
    // Set the user in Redux store
    store.dispatch(setUser({
      id: session.user.id,
      email: session.user.email ?? '',
      name: metadata.name ?? '',
      occupation: metadata.occupation,
      geolocation: metadata.geolocation,
    }))
  }

  // Listen for auth changes
  supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
    if (event === 'SIGNED_IN' && session) {
      const metadata = session.user.user_metadata as UserMetadata;
      store.dispatch(setUser({
        id: session.user.id,
        email: session.user.email ?? '',
        name: metadata.name ?? '',
        occupation: metadata.occupation,
        geolocation: metadata.geolocation,
      }))
    } else if (event === 'SIGNED_OUT') {
      store.dispatch(logout())
    }
  })
}

// Handle sign out
export const signOut = async (): Promise<void> => {
  const { error } = await supabase.auth.signOut()
  if (error) {
    console.error('Error signing out:', error.message)
    throw error
  }
  store.dispatch(logout())
}
