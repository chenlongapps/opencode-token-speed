/** @jsxImportSource @opentui/solid */
import type { BoxRenderable, TextRenderable } from "@opentui/core"
import type { TuiPlugin } from "@opencode-ai/plugin/tui"
import { createEffect, onCleanup } from "solid-js"

export type TrackerListener = () => void

export type SpeedMetrics = {
  live?: number
  avg?: number
  ttft?: number
}

function formatRate(value: number | undefined, includeUnit = false) {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return undefined
  const formatted = value >= 100 ? `${Math.round(value)}` : value >= 10 ? value.toFixed(1) : value.toFixed(2)
  return includeUnit ? `${formatted} tok/s` : formatted
}

function formatTtft(value: number | undefined, includeUnit = false) {
  if (value === undefined || !Number.isFinite(value) || value < 0) return undefined
  const formatted = value.toFixed(1)
  return includeUnit ? `${formatted} s` : formatted
}

export function SidebarSpeed(props: {
  api: Parameters<TuiPlugin>[0]
  sessionID: string
  layout: "sidebar" | "inline"
  visible?: boolean
  metrics: (sessionID: string) => SpeedMetrics
  subscribe: (listener: TrackerListener) => () => void
  mountSidebar?: (sessionID: string) => () => void
}) {
  let liveText: TextRenderable | undefined
  let avgText: TextRenderable | undefined
  let ttftText: TextRenderable | undefined
  let inlineBox: BoxRenderable | undefined
  let inlineText: TextRenderable | undefined
  let preferredWidth = 0
  let lines = statusLines()

  const theme = () => props.api.theme.current

  const inlineContent = (width: number) => {
    const full = `${lines.live} · ${lines.avg} · ${lines.ttft}`
    const rates = `${lines.live} · ${lines.avg}`
    if (full.length <= width) return full
    if (rates.length <= width) return rates
    return lines.live
  }

  const syncInline = () => {
    if (!inlineBox) return
    // The ref callback can run before Yoga has produced a computed width.
    // Start with the full content and let the first resize pass choose the
    // compact form when the parent constrains this slot.
    const availableWidth = inlineBox.width > 0 ? inlineBox.width : Number.POSITIVE_INFINITY
    const content = inlineContent(availableWidth)
    if (inlineText) inlineText.content = content
    const width = content.length
    if (width !== preferredWidth) {
      preferredWidth = width
      inlineBox.flexBasis = width
    }
  }

  const onRendererResize = () => {
    if (!inlineBox) return
    const content = inlineContent(Number.POSITIVE_INFINITY)
    if (inlineText) inlineText.content = content
    const width = content.length
    if (width !== preferredWidth) {
      preferredWidth = width
      inlineBox.flexBasis = width
    }
  }

  const sync = () => {
    lines = statusLines()
    if (liveText) liveText.content = lines.live
    if (avgText) avgText.content = lines.avg
    if (ttftText) ttftText.content = lines.ttft
    syncInline()
    props.api.renderer.requestRender()
  }

  const unsubscribe = props.subscribe(sync)
  onCleanup(unsubscribe)

  createEffect(() => {
    const release = props.mountSidebar?.(props.sessionID)
    if (release) onCleanup(release)
  })
  createEffect(() => {
    props.visible
    sync()
  })

  if (props.layout === "inline") {
    // Keep a stable slot root even while hidden: some host versions discard
    // slot contributions whose initial output is empty.
    // A compact basis can otherwise keep its old width across a terminal resize.
    const renderer = props.api.renderer as unknown as {
      on: (event: "resize", listener: () => void) => void
      off: (event: "resize", listener: () => void) => void
    }
    renderer.on("resize", onRendererResize)
    onCleanup(() => renderer.off("resize", onRendererResize))
    return (
      <box
        visible={props.visible !== false}
        height={1}
        minWidth={0}
        maxWidth="100%"
        flexGrow={0}
        flexShrink={1}
        overflow="hidden"
        onSizeChange={syncInline}
        ref={(ref: BoxRenderable) => {
          inlineBox = ref
          sync()
        }}
      >
        <text
          fg={theme().textMuted}
          width="100%"
          height={1}
          wrapMode="none"
          truncate
          ref={(ref: TextRenderable) => {
            inlineText = ref
            syncInline()
          }}
        />
      </box>
    )
  }

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

  function statusLines() {
    const metrics = props.metrics(props.sessionID)
    const includeUnits = props.layout === "sidebar"
    return {
      live: `TPS: ${formatRate(metrics.live, includeUnits) ?? "-"}`,
      avg: `AVG: ${formatRate(metrics.avg, includeUnits) ?? "-"}`,
      ttft: `TTFT: ${formatTtft(metrics.ttft, includeUnits) ?? "-"}`,
    }
  }
}
