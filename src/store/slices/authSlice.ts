import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface AuthState {
  isAuthenticated: boolean
  user: {
    id: string
    email: string
    name: string
    occupation?: string
    geolocation?: string
  } | null
  error: string | null
}

const initialState: AuthState = {
  isAuthenticated: false,
  user: null,
  error: null,
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<AuthState['user']>) => {
      state.user = action.payload
      state.isAuthenticated = !!action.payload
    },
    setAuthError: (state, action: PayloadAction<string>) => {
      state.error = action.payload
    },
    clearAuthError: (state) => {
      state.error = null
    },
    logout: (state) => {
      state.isAuthenticated = false
      state.user = null
      state.error = null
    },
  },
})

export const { setUser, setAuthError, clearAuthError, logout } = authSlice.actions

export default authSlice.reducer
