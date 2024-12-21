import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { ResearchSection, ResearchMode, ResearchType } from '../../types/research';

interface ResearchState {
  mode: ResearchMode;
  type: ResearchType;
  researchTarget: string;
  sections?: ResearchSection[];
  error?: string;
}

const initialState: ResearchState = {
  mode: 'basic',
  type: 'general',
  researchTarget: '',
};

export const researchSlice = createSlice({
  name: 'research',
  initialState,
  reducers: {
    setMode: (state, action: PayloadAction<ResearchMode>) => {
      state.mode = action.payload;
    },
    setType: (state, action: PayloadAction<ResearchType>) => {
      state.type = action.payload;
    },
    setResearchTarget: (state, action: PayloadAction<string>) => {
      state.researchTarget = action.payload;
    },
    setSections: (state, action: PayloadAction<ResearchSection[]>) => {
      state.sections = action.payload;
    },
    setError: (state, action: PayloadAction<string | undefined>) => {
      state.error = action.payload;
    },
  },
});

export const { setMode, setType, setResearchTarget, setSections, setError } = researchSlice.actions;

export default researchSlice.reducer;
