import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage } from 'claude-code'

import type { UsageReading } from '../types'
import { inputUsage, loadHistory } from './history'

const initial: UsageReading = {
  sessionId: '',
  turnId: '',
  turns: 0,
  steps: 0,
  tokensPerSecond: null,
  cacheHitPercent: null,
  contextTokens: null,
  contextPercent: null,
}
const reading = atom({ plugin: 'desktop-usage-bar', key: 'reading' } as const, initial)

type SavedReading = { reading: UsageReading }

async function initialize($: EngineInterface, sessionId: string) {
  if ((await read($, reading)).sessionId === sessionId) return

  const { transcriptPath } = await $.session.info()
  const history = transcriptPath ? await loadHistory($, transcriptPath).catch(() => null) : null
  const saved = await $.store.get(`usage:v1:${sessionId}`).catch(() => undefined) as SavedReading | undefined
  const { context } = await $.session.usage()
  const summary = history ?? saved?.reading
  const contextTokens = context.tokens ?? summary?.contextTokens ?? null

  await update($, reading, value => value.sessionId === sessionId ? value : {
    ...initial,
    sessionId,
    turns: summary?.turns ?? 0,
    steps: summary?.steps ?? 0,
    cacheHitPercent: summary?.cacheHitPercent ?? null,
    tokensPerSecond: saved?.reading.tokensPerSecond ?? null,
    contextTokens,
    contextPercent: context.percent ?? (contextTokens !== null && context.window > 0
      ? Math.round(contextTokens * 100 / context.window)
      : null),
  })
}

function contextFields(context: SessionContextUsage) {
  return {
    contextTokens: context.tokens ?? null,
    contextPercent: context.percent ?? null,
  }
}

function formatTokens(tokens: number | null) {
  if (tokens === null) return '—'
  if (tokens < 1000) return `${tokens}`
  if (tokens < 1000000) return `${+(tokens / 1000).toFixed(1)}K`
  return `${+(tokens / 1000000).toFixed(2)}M`
}

function renderRing(percent: number | null) {
  const circumference = 2 * Math.PI * 5
  const progress = Math.min(100, Math.max(0, percent ?? 0))
  const arc = progress > 0
    ? `<circle cx="7" cy="7" r="5" stroke="#4986b5" stroke-dasharray="${circumference * progress / 100} ${circumference}" transform="rotate(-90 7 7)"/>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 14" fill="none" stroke-width="2"><circle cx="7" cy="7" r="5" stroke="#7f7f7f" stroke-opacity="0.42"/>${arc}</svg>`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await initialize($, await $.session.id())
    return result
  })

  on('turn.start', async ($, e, next) => {
    if (!e.agentId) await initialize($, await $.session.id())
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context') && e.context.tokens !== undefined) {
      await update($, reading, value => ({ ...value, ...contextFields(e.context) }))
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId) return yield* next(e)

    await update($, reading, value => ({
      ...value,
      turnId: e.turnId,
      turns: value.turns + (value.turnId === e.turnId ? 0 : 1),
      steps: e.index + 1,
    }))

    const startedAt = await $.clock.now()
    const result = yield* next(e)
    const elapsedMs = (await $.clock.now()) - startedAt
    if (result.usage) {
      const { output_tokens } = result.usage
      const { cacheHitPercent } = inputUsage(result.usage)
      const speed = elapsedMs > 0 && output_tokens > 0 ? Math.round(output_tokens * 1000 / elapsedMs) : null
      const snapshot = await update($, reading, value => ({
        ...value,
        tokensPerSecond: speed ?? value.tokensPerSecond ?? null,
        cacheHitPercent,
      }))
      if (snapshot.sessionId) {
        await $.store.set(`usage:v1:${snapshot.sessionId}`, { reading: snapshot } satisfies SavedReading).catch(() => undefined)
      }
    }
    return result
  })

  on('ui.render', { component: 'AbovePrompt', surface: 'desktop' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const value = await read($, reading)
    const { Box, Svg, Text } = $.ui.resolve(e)
    const { tokensPerSecond } = value
    const speed = tokensPerSecond == null ? '' : ` · ${tokensPerSecond} tok/s`
    const cache = value.cacheHitPercent === null ? '—' : `${value.cacheHitPercent}%`
    const contextPercent = value.contextPercent === null ? '—' : `${value.contextPercent}%`
    const context = `${formatTokens(value.contextTokens)} tok · 缓存 ${cache}`
    const fill = 'rgba(127, 127, 127, 0.12)'

    return (
      <Box flexDirection="row" flexWrap="nowrap" gap="xs" height={1} alignItems="center" justifyContent="center" overflow="hidden">
        <Box backgroundColor={fill} paddingX="xs" flexShrink={1} overflow="hidden">
          <Text size="caption" color="text" tabular wrap="truncate-end">
            {`◷ ${value.turns}轮 ${value.steps}步${speed}`}
          </Text>
        </Box>
        <Box backgroundColor={fill} paddingX="xs" flexShrink={1} overflow="hidden">
          <Text size="caption" color="text" tabular wrap="truncate-end">{`▤ ${context}`}</Text>
        </Box>
        <Box flexDirection="row" alignItems="center" gap="xs" backgroundColor={fill} paddingX="xs" flexShrink={0}>
          <Svg source={renderRing(value.contextPercent)} width={14} height={14} alt="上下文窗口使用比例" />
          <Text size="caption" color="text" weight="medium" tabular wrap="truncate-end">{contextPercent}</Text>
        </Box>
      </Box>
    )
  })
}
