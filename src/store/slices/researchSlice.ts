import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export enum ResearchMode {
  Basic = 'basic',
  Advanced = 'advanced',
  Article = 'article'
}

export enum ResearchType {
  General = 'general',
  Literature = 'literature',
  Experiment = 'experiment'
}

export enum CitationStyle {
  APA = 'APA',
  MLA = 'MLA',
  Chicago = 'Chicago',
  Harvard = 'Harvard'
}

export interface ResearchSection {
  title: string
  content: string
  number: string
  subsections?: ResearchSection[]
}

export interface ResearchHistory {
  id: string
  title: string
  content: ResearchSection[]
  references: string[]
  timestamp: string
}

interface ResearchState {
  title: string
  mode: ResearchMode
  type: ResearchType
  citationStyle: CitationStyle
  sections: ResearchSection[]
  references: string[]
  loading: boolean
  error: string | null
  history: ResearchHistory[]
}

const initialState: ResearchState = {
  title: '',
  mode: ResearchMode.Basic,
  type: ResearchType.General,
  citationStyle: CitationStyle.APA,
  sections: [],
  references: [],
  loading: false,
  error: null,
  history: []
}

const researchSlice = createSlice({
  name: 'research',
  initialState,
  reducers: {
    setTitle: (state, action: PayloadAction<string>) => {
      state.title = action.payload
    },
    setMode: (state, action: PayloadAction<ResearchMode>) => {
      state.mode = action.payload
    },
    setType: (state, action: PayloadAction<ResearchType>) => {
      state.type = action.payload
    },
    setCitationStyle: (state, action: PayloadAction<CitationStyle>) => {
      state.citationStyle = action.payload
    },
    setSections: (state, action: PayloadAction<ResearchSection[]>) => {
      state.sections = action.payload
    },
    setReferences: (state, action: PayloadAction<string[]>) => {
      state.references = action.payload
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
    },
    addToHistory: (state, action: PayloadAction<ResearchHistory>) => {
      state.history.unshift(action.payload)
    }
  }
})

export const {
  setTitle,
  setMode,
  setType,
  setCitationStyle,
  setSections,
  setReferences,
  setLoading,
  setError,
  addToHistory
} = researchSlice.actions

export default researchSlice.reducer
