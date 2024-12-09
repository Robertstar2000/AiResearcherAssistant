import { supabase } from './api'
import { store } from '../store'
import { setUser, logout } from '../store/slices/authSlice'

// Initialize session persistence
export const initializeAuth = async () => {
  // Get session from storage
  const { data: { session }, error } = await supabase.auth.getSession()
  
  if (session) {
    // Set the user in Redux store
    store.dispatch(setUser({
      id: session.user.id,
      email: session.user.email!,
      name: session.user.user_metadata.name || '',
      occupation: session.user.user_metadata.occupation,
      geolocation: session.user.user_metadata.geolocation,
    }))
  }

  // Listen for auth changes
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      store.dispatch(setUser({
        id: session.user.id,
        email: session.user.email!,
        name: session.user.user_metadata.name || '',
        occupation: session.user.user_metadata.occupation,
        geolocation: session.user.user_metadata.geolocation,
      }))
    } else if (event === 'SIGNED_OUT') {
      store.dispatch(logout())
    }
  })
}

// Handle sign out
export const signOut = async () => {
  const { error } = await supabase.auth.signOut()
  if (error) {
    console.error('Error signing out:', error.message)
    throw error
  }
  store.dispatch(logout())
}
