/** @jsxImportSource @opentui/solid */
import type { TextRenderable } from "@opentui/core"
import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { onCleanup } from "solid-js"

type StreamSample = {
  at: number
  tokens: number
}

const STREAM_WINDOW_MS = 5_000
const LIVE_STALE_MS = 1_500
const SINGLE_SAMPLE_MS = 1_000
const MIN_MESSAGE_DURATION_MS = 250
const MIN_SESSION_DURATION_MS = 1_000
const SHORT_MESSAGE_OFFICIAL_TPS_MS = 1_000
const MESSAGE_STALE_MS = 10_000
const SESSION_RETENTION_MS = 24 * 60 * 60 * 1000
const BUMP_THROTTLE_MS = 100
const utf8Encoder = new TextEncoder()

type MessageTiming = {
  sessionID: string
  requestStartAt: number
  firstResponseAt?: number
  firstTokenAt?: number
  lastTokenAt?: number
  lastToolCallAt?: number
}

type SessionAverage = {
  totalTokens: number
  totalDurationMs: number
  totalTtftMs: number
  messageCount: number
}

type MessageAverage = {
  sessionID: string
  totalTokens: number
  totalDurationMs: number
  totalTtftMs: number
}

type TrackerState = {
  streamSamplesBySession: Record<string, StreamSample[]>
  messageTimingByID: Record<string, MessageTiming>
  messageAverageByID: Record<string, MessageAverage>
  sessionAverageByID: Record<string, SessionAverage>
  lastLiveTpsBySession: Record<string, string>
  sessionActiveAtByID: Record<string, number>
}

type TrackerListener = () => void

function estimateStreamTokens(delta: string) {
  return Math.max(1, Math.ceil(utf8Encoder.encode(delta).byteLength / 5))
}

function formatRate(value: number) {
  if (!Number.isFinite(value) || value <= 0) return undefined
  if (value >= 100) return `${Math.round(value)} tok/s`
  if (value >= 10) return `${value.toFixed(1)} tok/s`
  return `${value.toFixed(2)} tok/s`
}

function formatTtft(value: number) {
  if (!Number.isFinite(value) || value < 0) return undefined
  return `${value.toFixed(1)} s`
}

function activeDurationMs(samples: StreamSample[], tailAt?: number) {
  if (samples.length === 0) return 0
  if (samples.length === 1) {
    const tailDuration = tailAt ? Math.max(0, tailAt - samples[0].at) : SINGLE_SAMPLE_MS
    return Math.min(Math.max(tailDuration, 250), SINGLE_SAMPLE_MS)
  }

  let duration = 0
  for (let i = 1; i < samples.length; i++) {
    duration += Math.max(0, samples[i].at - samples[i - 1].at)
  }

  if (tailAt) {
    duration += Math.max(0, tailAt - samples[samples.length - 1].at)
  }

  return Math.max(duration, SINGLE_SAMPLE_MS)
}

function lastTimingActivity(timing: MessageTiming) {
  return Math.max(timing.requestStartAt, timing.firstResponseAt ?? 0, timing.lastTokenAt ?? 0, timing.lastToolCallAt ?? 0)
}

function SidebarSpeed(props: {
  api: Parameters<TuiPlugin>[0]
  sessionID: string
  tracker: TrackerState
  subscribe: (listener: TrackerListener) => () => void
}) {
  let liveText: TextRenderable | undefined
  let avgText: TextRenderable | undefined
  let ttftText: TextRenderable | undefined

  const theme = () => props.api.theme.current

  const sync = () => {
    const lines = statusLines()
    if (liveText) liveText.content = lines.live
    if (avgText) avgText.content = lines.avg
    if (ttftText) ttftText.content = lines.ttft
    props.api.renderer.requestRender()
  }

  const unsubscribe = props.subscribe(sync)
  onCleanup(unsubscribe)

  return (
    <box>
      <text fg={theme().text}>
        <b>Speed</b>
      </text>
      <text
        fg={theme().textMuted}
        ref={(ref: TextRenderable) => {
          liveText = ref
          sync()
        }}
      >
        {statusLines().live}
      </text>
      <text
        fg={theme().textMuted}
        ref={(ref: TextRenderable) => {
          avgText = ref
          sync()
        }}
      >
        {statusLines().avg}
      </text>
      <text
        fg={theme().textMuted}
        ref={(ref: TextRenderable) => {
          ttftText = ref
          sync()
        }}
      >
        {statusLines().ttft}
      </text>
    </box>
  )

  function sessionAverage() {
    const totals = props.tracker.sessionAverageByID[props.sessionID]
    if (!totals || totals.totalTokens <= 0 || totals.totalDurationMs < MIN_SESSION_DURATION_MS) return undefined
    return formatRate(totals.totalTokens / (totals.totalDurationMs / 1000))
  }

  function sessionTtft() {
    const totals = props.tracker.sessionAverageByID[props.sessionID]
    if (!totals || totals.messageCount <= 0 || totals.totalTtftMs < 0) return undefined
    return formatTtft(totals.totalTtftMs / totals.messageCount / 1000)
  }

  function liveTps() {
    const lastValue = () => props.tracker.lastLiveTpsBySession[props.sessionID]
    const status = props.api.state.session.status(props.sessionID)
    if (status?.type === "idle") return lastValue()
    const samples = props.tracker.streamSamplesBySession[props.sessionID] ?? []
    if (samples.length === 0) return lastValue()
    const now = Date.now()
    const relevant = samples.filter((sample) => now - sample.at <= STREAM_WINDOW_MS)
    if (relevant.length === 0) return lastValue()
    const lastSample = relevant[relevant.length - 1]
    if (!lastSample || now - lastSample.at > LIVE_STALE_MS) return lastValue()
    const total = relevant.reduce((sum, sample) => sum + sample.tokens, 0)
    const durationSeconds = activeDurationMs(relevant, now) / 1000
    if (durationSeconds <= 0) return lastValue()
    const value = formatRate(total / durationSeconds)
    if (value) props.tracker.lastLiveTpsBySession[props.sessionID] = value
    return value
  }

  function statusLines() {
    return {
      live: `TPS: ${liveTps() ?? "-"}`,
      avg: `AVG: ${sessionAverage() ?? "-"}`,
      ttft: `TTFT: ${sessionTtft() ?? "-"}`,
    }
  }
}

const tui: TuiPlugin = async (api) => {
  const tracker: TrackerState = {
    streamSamplesBySession: {},
    messageTimingByID: {},
    messageAverageByID: {},
    sessionAverageByID: {},
    lastLiveTpsBySession: {},
    sessionActiveAtByID: {},
  }

  const listeners = new Set<TrackerListener>()

  let bumpTimer: ReturnType<typeof setTimeout> | undefined

  const bump = () => {
    if (bumpTimer !== undefined) return
    bumpTimer = setTimeout(() => {
      bumpTimer = undefined
      for (const listener of listeners) listener()
    }, BUMP_THROTTLE_MS)
  }

  const pruneSamples = (now = Date.now()) => {
    let changed = false

    for (const [sessionID, samples] of Object.entries(tracker.streamSamplesBySession)) {
      const next = samples.filter((sample) => now - sample.at <= STREAM_WINDOW_MS)
      if (next.length !== samples.length) {
        changed = true
        if (next.length > 0) tracker.streamSamplesBySession[sessionID] = next
        else delete tracker.streamSamplesBySession[sessionID]
      }
    }

    if (changed) bump()
  }

  const clearLiveSamples = (sessionID: string) => {
    if (!tracker.streamSamplesBySession[sessionID]?.length) return
    delete tracker.streamSamplesBySession[sessionID]
    bump()
  }

  const touchSession = (sessionID: string) => {
    tracker.sessionActiveAtByID[sessionID] = Date.now()
  }

  const clearSession = (sessionID: string) => {
    delete tracker.streamSamplesBySession[sessionID]
    delete tracker.sessionAverageByID[sessionID]
    delete tracker.lastLiveTpsBySession[sessionID]
    delete tracker.sessionActiveAtByID[sessionID]
    for (const [messageID, timing] of Object.entries(tracker.messageTimingByID)) {
      if (timing.sessionID === sessionID) delete tracker.messageTimingByID[messageID]
    }
    for (const [messageID, contribution] of Object.entries(tracker.messageAverageByID)) {
      if (contribution.sessionID === sessionID) delete tracker.messageAverageByID[messageID]
    }
  }

  const removeMessageAverage = (messageID: string, sessionID?: string) => {
    const contribution = tracker.messageAverageByID[messageID]
    if (!contribution || (sessionID !== undefined && contribution.sessionID !== sessionID)) return false

    delete tracker.messageAverageByID[messageID]
    const totals = tracker.sessionAverageByID[contribution.sessionID]
    if (!totals || totals.messageCount <= 1) {
      delete tracker.sessionAverageByID[contribution.sessionID]
      return true
    }

    tracker.sessionAverageByID[contribution.sessionID] = {
      totalTokens: Math.max(0, totals.totalTokens - contribution.totalTokens),
      totalDurationMs: Math.max(0, totals.totalDurationMs - contribution.totalDurationMs),
      totalTtftMs: Math.max(0, totals.totalTtftMs - contribution.totalTtftMs),
      messageCount: totals.messageCount - 1,
    }
    return true
  }

  const addMessageAverage = (messageID: string, contribution: MessageAverage) => {
    removeMessageAverage(messageID)
    tracker.messageAverageByID[messageID] = contribution
    const totals = tracker.sessionAverageByID[contribution.sessionID] ?? {
      totalTokens: 0,
      totalDurationMs: 0,
      totalTtftMs: 0,
      messageCount: 0,
    }
    tracker.sessionAverageByID[contribution.sessionID] = {
      totalTokens: totals.totalTokens + contribution.totalTokens,
      totalDurationMs: totals.totalDurationMs + contribution.totalDurationMs,
      totalTtftMs: totals.totalTtftMs + contribution.totalTtftMs,
      messageCount: totals.messageCount + 1,
    }
  }

  const removeMessageTracking = (sessionID: string, messageID: string) => {
    let changed = false
    const timing = tracker.messageTimingByID[messageID]
    if (timing?.sessionID === sessionID) {
      delete tracker.messageTimingByID[messageID]
      changed = true
    }

    if (removeMessageAverage(messageID, sessionID)) changed = true

    return changed
  }

  const purgeStaleTimings = (sessionID: string) => {
    let changed = false
    const cutoff = Date.now() - MESSAGE_STALE_MS
    for (const [messageID, timing] of Object.entries(tracker.messageTimingByID)) {
      if (timing.sessionID !== sessionID) continue
      if (lastTimingActivity(timing) > cutoff) continue
      delete tracker.messageTimingByID[messageID]
      changed = true
    }
    return changed
  }

  const appendSample = (sessionID: string, messageID: string, sample: StreamSample) => {
    touchSession(sessionID)
    const now = sample.at
    let samples = tracker.streamSamplesBySession[sessionID]
    if (!samples) samples = tracker.streamSamplesBySession[sessionID] = []
    samples.push(sample)
    while (samples.length > 1 && now - samples[0].at > STREAM_WINDOW_MS) {
      samples.shift()
    }
    const timing = tracker.messageTimingByID[messageID]
    if (timing) {
      if (timing.firstTokenAt) {
        timing.lastTokenAt = now
      } else {
        if (timing.firstResponseAt === undefined) timing.firstResponseAt = now
        timing.firstTokenAt = now
        timing.lastTokenAt = now
      }
    }
    bump()
  }

  // Deltas of the same part arrive in bursts; cache the per-part verdict so
  // only the first delta pays the state lookup and linear find.
  let deltaPartMessageID = ""
  let deltaPartID = ""

  const invalidateDeltaPart = (messageID?: string, partID?: string) => {
    if (messageID !== undefined && deltaPartMessageID !== messageID) return
    if (partID !== undefined && deltaPartID !== partID) return
    deltaPartMessageID = ""
    deltaPartID = ""
  }

  const onDelta = api.event.on("message.part.delta", (evt) => {
    if (evt.properties.field !== "text") return
    if (evt.properties.messageID !== deltaPartMessageID || evt.properties.partID !== deltaPartID) {
      const part = api.state.part(evt.properties.messageID).find((item) => item.id === evt.properties.partID)
      // Do not cache a failed lookup: state can be updated between deltas.
      if (part?.type !== "text" && part?.type !== "reasoning") return
      deltaPartMessageID = evt.properties.messageID
      deltaPartID = evt.properties.partID
    }
    appendSample(evt.properties.sessionID, evt.properties.messageID, {
      at: Date.now(),
      tokens: estimateStreamTokens(evt.properties.delta),
    })
  })

  const onMessage = api.event.on("message.updated", (evt) => {
    if (evt.properties.info.role !== "assistant") return
    const sessionID = evt.properties.info.sessionID ?? evt.properties.sessionID
    const messageID = evt.properties.info.id
    touchSession(sessionID)

    if (evt.properties.info.error) {
      removeMessageTracking(sessionID, messageID)
      clearLiveSamples(sessionID)
      invalidateDeltaPart(messageID)
      bump()
      return
    }

    const completedAt = evt.properties.info.time.completed
    if (typeof completedAt !== "number") {
      const existing = tracker.messageTimingByID[messageID]
      tracker.messageTimingByID[messageID] = {
        sessionID,
        requestStartAt: existing?.requestStartAt ?? evt.properties.info.time.created,
        firstResponseAt: existing?.firstResponseAt,
        firstTokenAt: existing?.firstTokenAt,
        lastTokenAt: existing?.lastTokenAt,
        lastToolCallAt: existing?.lastToolCallAt,
      }
      bump()
      return
    }

    const timing = tracker.messageTimingByID[messageID]
    if (timing?.sessionID === sessionID && typeof timing.firstResponseAt === "number") {
      const totalTokens = evt.properties.info.tokens.output + evt.properties.info.tokens.reasoning
      const endAt = evt.properties.info.finish === "tool-calls" ? (timing.lastToolCallAt ?? completedAt) : completedAt
      const elapsedMs = Math.max(endAt - timing.firstResponseAt, 0)
      const durationMs = Math.max(elapsedMs, MIN_MESSAGE_DURATION_MS)
      const ttftMs = Math.max(timing.firstResponseAt - timing.requestStartAt, 0)
      if (totalTokens > 0) {
        addMessageAverage(messageID, {
          sessionID,
          totalTokens,
          totalDurationMs: durationMs,
          totalTtftMs: ttftMs,
        })
      } else {
        removeMessageAverage(messageID, sessionID)
      }
      if (elapsedMs < SHORT_MESSAGE_OFFICIAL_TPS_MS && totalTokens > 0) {
        const value = formatRate(totalTokens / (durationMs / 1000))
        if (value) {
          tracker.lastLiveTpsBySession[sessionID] = value
          clearLiveSamples(sessionID)
        }
      }
    }
    delete tracker.messageTimingByID[messageID]
    pruneSamples()
    bump()
  })

  const onPart = api.event.on("message.part.updated", (evt) => {
    if (evt.properties.part.type !== "tool") return
    const sessionID = evt.properties.part.sessionID ?? evt.properties.sessionID
    touchSession(sessionID)
    if (
      evt.properties.part.state.status === "running" ||
      evt.properties.part.state.status === "completed" ||
      evt.properties.part.state.status === "error"
    ) {
      clearLiveSamples(sessionID)
    }
    const timing = tracker.messageTimingByID[evt.properties.part.messageID]
    if (!timing) return
    if (evt.properties.part.state.status === "pending") {
      tracker.messageTimingByID[evt.properties.part.messageID] = {
        ...timing,
        firstResponseAt: timing.firstResponseAt ?? evt.properties.time,
      }
      bump()
      return
    }
    if (evt.properties.part.state.status !== "running") return
    tracker.messageTimingByID[evt.properties.part.messageID] = {
      ...timing,
      lastToolCallAt: evt.properties.part.state.time.start,
    }
    bump()
  })

  const onIdle = api.event.on("session.idle", (evt) => {
    const sessionID = evt.properties.sessionID
    touchSession(sessionID)
    clearLiveSamples(sessionID)
    if (purgeStaleTimings(sessionID)) bump()
  })

  const onSessionDeleted = api.event.on("session.deleted", (evt) => {
    clearSession(evt.properties.sessionID)
    invalidateDeltaPart()
    bump()
  })

  const onMessageRemoved = api.event.on("message.removed", (evt) => {
    const { sessionID, messageID } = evt.properties
    touchSession(sessionID)
    const hadTiming = tracker.messageTimingByID[messageID]?.sessionID === sessionID
    const changed = removeMessageTracking(sessionID, messageID)
    invalidateDeltaPart(messageID)
    if (hadTiming) clearLiveSamples(sessionID)
    if (changed) bump()
  })

  const onPartRemoved = api.event.on("message.part.removed", (evt) => {
    const { sessionID, messageID, partID } = evt.properties
    touchSession(sessionID)
    invalidateDeltaPart(messageID, partID)
    const hadTiming = tracker.messageTimingByID[messageID]?.sessionID === sessionID
    const changed = removeMessageTracking(sessionID, messageID)
    if (hadTiming) clearLiveSamples(sessionID)
    if (changed) bump()
  })

  const timer = setInterval(() => {
    const now = Date.now()
    pruneSamples(now)
    let clearedSession = false
    for (const [sessionID, activeAt] of Object.entries(tracker.sessionActiveAtByID)) {
      if (now - activeAt > SESSION_RETENTION_MS) {
        clearSession(sessionID)
        clearedSession = true
      }
    }
    // Without stream samples the rendered values come from caches, so a
    // re-render would draw the same output.
    if (clearedSession || Object.keys(tracker.streamSamplesBySession).length > 0) bump()
  }, 1000)

  api.lifecycle.onDispose(() => {
    onDelta()
    onMessage()
    onPart()
    onIdle()
    onSessionDeleted()
    onMessageRemoved()
    onPartRemoved()
    if (bumpTimer !== undefined) {
      clearTimeout(bumpTimer)
      bumpTimer = undefined
    }
    clearInterval(timer)
  })

  api.slots.register({
    order: 150,
    slots: {
      sidebar_content(_ctx, value) {
        return (
          <SidebarSpeed
            api={api}
            sessionID={value.session_id}
            tracker={tracker}
            subscribe={(listener) => {
              listeners.add(listener)
              return () => {
                listeners.delete(listener)
              }
            }}
          />
        )
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id: "opencode-token-speed",
  tui,
}

export default plugin
