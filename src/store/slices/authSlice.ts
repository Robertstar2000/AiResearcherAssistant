import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface AuthUser {
  id: bigint
  userName: string
  occupation: string
  location: string
}

interface AuthState {
  isAuthenticated: boolean
  user: AuthUser | null
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
    setUser: (state, action: PayloadAction<AuthUser>) => {
      state.user = action.payload
      state.isAuthenticated = true
      state.error = null
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
