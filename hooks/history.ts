import type { EngineInterface, ModelUsage } from 'claude-code'

import type { UsageReading } from '../types'

type TranscriptRow = {
  type?: string
  uuid?: string
  isSidechain?: boolean
  isMeta?: boolean
  isCompactSummary?: boolean
  isVisibleInTranscriptOnly?: boolean
  isApiErrorMessage?: boolean
  origin?: { kind?: string }
  requestId?: string
  turnPosition?: { turnIndex?: number }
  message?: {
    id?: string
    model?: string
    content?: string | Array<{ type?: string }>
    usage?: Partial<ModelUsage>
  }
}

type History = Pick<UsageReading, 'turns' | 'steps' | 'contextTokens' | 'cacheHitPercent'>

export function inputUsage(usage: Partial<ModelUsage>) {
  const { input_tokens, cache_read_input_tokens, cache_creation_input_tokens } = usage
  const total = (input_tokens ?? 0) + (cache_read_input_tokens ?? 0) + (cache_creation_input_tokens ?? 0)
  return {
    contextTokens: total > 0 ? total : null,
    cacheHitPercent: total > 0 && typeof cache_read_input_tokens === 'number'
      ? Math.round(cache_read_input_tokens * 100 / total)
      : null,
  }
}

export async function loadHistory($: EngineInterface, path: string): Promise<History> {
  const { size } = await $.fs.stat(path)
  const history: History = { turns: 0, steps: 0, contextTokens: null, cacheHitPercent: null }
  const seenPrompts = new Set<string>()
  const seenRequests = new Set<string>()
  let lastTurnIndex: number | undefined
  let lastRequestKeys = new Set<string>()

  function add(line: string) {
    let row: TranscriptRow | null
    try {
      row = JSON.parse(line) as TranscriptRow | null
    } catch {
      return
    }
    if (!row?.message || row.isSidechain || row.isMeta || row.isVisibleInTranscriptOnly) return

    if (row.type === 'user') {
      const { content } = row.message
      if (row.isCompactSummary || (row.origin?.kind && row.origin.kind !== 'human')) return
      if (Array.isArray(content) && content.some(block => block?.type === 'tool_result')) return
      if (row.uuid && seenPrompts.has(row.uuid)) return
      if (row.uuid) seenPrompts.add(row.uuid)
      const turnIndex = row.turnPosition?.turnIndex
      if (turnIndex !== undefined && turnIndex === lastTurnIndex) return
      lastTurnIndex = turnIndex
      history.turns += 1
      history.steps = 0
      return
    }

    if (row.type !== 'assistant' || row.isApiErrorMessage || row.message.model === '<synthetic>') return
    const keys: string[] = []
    if (row.requestId) keys.push(`request:${row.requestId}`)
    if (row.message.id) keys.push(`message:${row.message.id}`)
    if (keys.length === 0) return

    const isNew = keys.every(key => !seenRequests.has(key))
    for (const key of keys) seenRequests.add(key)
    if (isNew) {
      history.steps += 1
      lastRequestKeys = new Set(keys)
    }
    if (keys.some(key => lastRequestKeys.has(key))) {
      for (const key of keys) lastRequestKeys.add(key)
      if (row.message.usage) {
        const usage = inputUsage(row.message.usage)
        if (usage.contextTokens !== null) Object.assign(history, usage)
      }
    }
  }

  const chunkSize = 1024 * 1024
  let pending = ''
  for (let offset = 0; offset < size; offset += chunkSize) {
    const chunk = await $.fs.read(path, { offset, length: Math.min(chunkSize, size - offset) })
    const lines = (pending + chunk).split('\n')
    pending = lines.pop() ?? ''
    for (const line of lines) add(line)
  }
  if (pending) add(pending)
  return history
}
