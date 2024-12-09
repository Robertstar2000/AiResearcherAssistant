// Error types for better error handling
export enum ResearchError {
  TOKEN_LIMIT_EXCEEDED = 'TOKEN_LIMIT_EXCEEDED',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  API_ERROR = 'API_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  AUTH_ERROR = 'AUTH_ERROR',
  GENERATION_ERROR = 'GENERATION_ERROR',
  PARSING_ERROR = 'PARSING_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR'  // Added configuration error type
}

export class ResearchException extends Error {
  constructor(
    public type: ResearchError,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ResearchException';
  }
}

export const TOKEN_LIMITS = {
  MAX_TOTAL_TOKENS: 4096,  // Maximum tokens for the model
  MAX_PROMPT_TOKENS: 2048, // Maximum tokens for the prompt
  TOKEN_SAFETY_MARGIN: 100 // Safety margin for token calculations
};
