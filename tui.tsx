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

type TrackerState = {
  streamSamplesBySession: Record<string, StreamSample[]>
  messageTimingByID: Record<string, MessageTiming>
  sessionAverageByID: Record<string, SessionAverage>
  lastLiveTpsBySession: Record<string, string>
}

type TrackerListener = () => void

function estimateStreamTokens(delta: string) {
  return Math.max(1, Math.ceil(Buffer.byteLength(delta, "utf8") / 5))
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
    sessionAverageByID: {},
    lastLiveTpsBySession: {},
  }

  const listeners = new Set<TrackerListener>()

  const bump = () => {
    for (const listener of listeners) listener()
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

  const appendSample = (sessionID: string, messageID: string, sample: StreamSample) => {
    const now = sample.at
    tracker.streamSamplesBySession[sessionID] = [
      ...(tracker.streamSamplesBySession[sessionID] ?? []).filter((item) => now - item.at <= STREAM_WINDOW_MS),
      sample,
    ]
    const timing = tracker.messageTimingByID[messageID]
    if (timing) {
      tracker.messageTimingByID[messageID] = timing.firstTokenAt
        ? { ...timing, lastTokenAt: now }
        : {
            ...timing,
            firstResponseAt: timing.firstResponseAt ?? now,
            firstTokenAt: now,
            lastTokenAt: now,
          }
    }
    bump()
  }

  const onDelta = api.event.on("message.part.delta", (evt) => {
    if (evt.properties.field !== "text") return
    const parts = api.state.part(evt.properties.messageID)
    const part = parts.find((item) => item.id === evt.properties.partID)
    if (!part) return
    if (part.type !== "text" && part.type !== "reasoning") return
    appendSample(evt.properties.sessionID, evt.properties.messageID, {
      at: Date.now(),
      tokens: estimateStreamTokens(evt.properties.delta),
    })
  })

  const onMessage = api.event.on("message.updated", (evt) => {
    if (evt.properties.info.role !== "assistant") return
    const sessionID = evt.properties.info.sessionID ?? evt.properties.sessionID

    if (!evt.properties.info.time.completed) {
      const existing = tracker.messageTimingByID[evt.properties.info.id]
      tracker.messageTimingByID[evt.properties.info.id] = {
        sessionID,
        requestStartAt: existing?.requestStartAt ?? Date.now(),
        firstResponseAt: existing?.firstResponseAt,
        firstTokenAt: existing?.firstTokenAt,
        lastTokenAt: existing?.lastTokenAt,
        lastToolCallAt: existing?.lastToolCallAt,
      }
      bump()
      return
    }

    const timing = tracker.messageTimingByID[evt.properties.info.id]
    if (timing?.sessionID === sessionID && typeof timing.firstResponseAt === "number") {
      const totalTokens = evt.properties.info.tokens.output + evt.properties.info.tokens.reasoning
      const now = Date.now()
      const endAt = evt.properties.info.finish === "tool-calls" ? (timing.lastToolCallAt ?? now) : now
      const rawDurationMs = endAt - timing.firstResponseAt
      if (rawDurationMs <= 0) {
        delete tracker.messageTimingByID[evt.properties.info.id]
        pruneSamples()
        bump()
        return
      }
      const durationMs = Math.max(rawDurationMs, MIN_MESSAGE_DURATION_MS)
      const ttftMs = Math.max(timing.firstResponseAt - timing.requestStartAt, 0)
      if (totalTokens > 0 && durationMs) {
        const totals = tracker.sessionAverageByID[sessionID] ?? {
          totalTokens: 0,
          totalDurationMs: 0,
          totalTtftMs: 0,
          messageCount: 0,
        }
        tracker.sessionAverageByID[sessionID] = {
          totalTokens: totals.totalTokens + totalTokens,
          totalDurationMs: totals.totalDurationMs + durationMs,
          totalTtftMs: totals.totalTtftMs + ttftMs,
          messageCount: totals.messageCount + 1,
        }
      }
      if (rawDurationMs < SHORT_MESSAGE_OFFICIAL_TPS_MS && totalTokens > 0) {
        const value = formatRate(totalTokens / (durationMs / 1000))
        if (value) {
          tracker.lastLiveTpsBySession[sessionID] = value
          clearLiveSamples(sessionID)
        }
      }
    }
    delete tracker.messageTimingByID[evt.properties.info.id]
    pruneSamples()
    bump()
  })

  const onPart = api.event.on("message.part.updated", (evt) => {
    if (evt.properties.part.type !== "tool") return
    const sessionID = evt.properties.part.sessionID ?? evt.properties.sessionID
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
        firstResponseAt: timing.firstResponseAt ?? Date.now(),
      }
      bump()
      return
    }
    if (evt.properties.part.state.status !== "running") return
    tracker.messageTimingByID[evt.properties.part.messageID] = {
      ...timing,
      lastToolCallAt: Date.now(),
    }
    bump()
  })

  const timer = setInterval(() => {
    pruneSamples()
    bump()
  }, 1000)

  api.lifecycle.onDispose(() => {
    onDelta()
    onMessage()
    onPart()
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
