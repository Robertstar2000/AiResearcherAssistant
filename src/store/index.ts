import { configureStore } from '@reduxjs/toolkit'
import researchReducer from './slices/researchSlice'
import authReducer from './slices/authSlice'

export const store = configureStore({
  reducer: {
    research: researchReducer,
    auth: authReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
