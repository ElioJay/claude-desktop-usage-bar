export type UsageReading = {
  sessionId: string
  turnId: string
  turns: number
  steps: number
  tokensPerSecond: number | null
  cacheHitPercent: number | null
  contextTokens: number | null
  contextPercent: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'desktop-usage-bar': { reading: UsageReading }
  }
}
