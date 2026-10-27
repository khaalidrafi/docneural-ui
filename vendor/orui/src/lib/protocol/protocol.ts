// WebSocket protocol between this UI and org-roam-lite-ui.el.
//
// This file is THE contract. The elisp side is frozen (it is what people have
// installed in Emacs), so every shape here mirrors org-roam-lite-ui.el exactly:
//
//   Emacs -> browser: `{type: ..., data: ...}`   (json-encode alists)
//   browser -> Emacs: `{command: ..., data: ...}` (org-roam-lite-ui--ws-on-message)
//
// Message types Emacs sends:
//   graphdata  - full graph snapshot (nodes, links, tags). Sent on connect and
//                on every org-roam save. Large: parsed once, then diffed.
//   command    - Emacs asking the UI to act (follow/zoom/local/change-local-graph)
//   variables  - org-roam directories + katex macros
//   theme      - Emacs theme colors (keys may contain dashes, e.g. "bg-alt")
//   orgText    - the org source text of a node, in reply to a getText request

import type { OrgRoamGraphReponse, OrgRoamLink, OrgRoamNode } from '../api'

/** Full graph snapshot; `tags` is the distinct tag list across the vault. */
export type GraphdataMessage = {
  type: 'graphdata'
  data: OrgRoamGraphReponse
}

/** `commandName` values Emacs can send, with their optional extras. */
export type CommandMessage = {
  type: 'command'
  data: {
    commandName: 'follow' | 'zoom' | 'local' | 'change-local-graph'
    id?: string
    /** zoom/local only: animation speed in ms */
    speed?: number
    /** zoom/local only: viewport padding in px */
    padding?: number
    /** change-local-graph only: "add" | "remove" */
    manipulation?: string
  }
}

/** org-roam directories and LaTeX macros, used by preview rendering. */
export type VariablesMessage = {
  type: 'variables'
  data: {
    subDirs: string[]
    dailyDir: string
    attachDir: string
    useInheritance: boolean
    roamDir: string
    katexMacros: string
  }
}

/** Emacs theme colors. Keys are elisp-style, e.g. `bg-alt` — keep dashes. */
export type ThemeMessage = {
  type: 'theme'
  data: Record<string, string>
}

/** Org source of one node, in reply to a `getText` request. */
export type OrgTextMessage = {
  type: 'orgText'
  data: string
}

/**
 * Incremental graph change set, sent instead of a full `graphdata` snapshot
 * when the diff is small (e.g. one org file saved). Node objects have the
 * same shape as in `graphdata`. New links follow the same {source,target,type}
 * shape; they are deduplicated and dangling ones stay hidden until their
 * endpoints exist. Forward-compatible: the client accepts both message types
 * forever, and older UIs simply ignore `graphupdate` (unknown type → null).
 */
export type GraphupdateMessage = {
  type: 'graphupdate'
  data: {
    upserts: OrgRoamNode[]
    removals: string[]
    links: OrgRoamLink[]
  }
}

const isGraphupdateData = (d: unknown): d is GraphupdateMessage['data'] => {
  if (typeof d !== 'object' || d === null) return false
  const { upserts, removals, links } = d as Record<string, unknown>
  return Array.isArray(upserts) && Array.isArray(removals) && Array.isArray(links)
}

export type ServerMessage =
  | GraphdataMessage
  | GraphupdateMessage
  | CommandMessage
  | VariablesMessage
  | ThemeMessage
  | OrgTextMessage

/** What this UI can ask Emacs to do (see org-roam-lite-ui--ws-on-message). */
export type ClientCommand = 'getText' | 'open' | 'delete' | 'create'

export type ClientMessage =
  | { command: 'getText'; data: { id: string } }
  | { command: 'open'; data: { id: string } }
  | { command: 'delete'; data: { id: string; file: string } }
  | { command: 'create'; data: { id: string; title: string; ref?: string } }

/**
 * Parse one raw websocket text frame into a typed ServerMessage.
 * Returns null (never throws) for anything unrecognized so a protocol
 * mismatch degrades to "ignore the frame" instead of killing the connection.
 */
export function parseServerMessage(raw: string): ServerMessage | null {
  let parsed: { type?: unknown; data?: unknown }
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  switch (parsed.type) {
    case 'graphdata':
    case 'command':
    case 'variables':
    case 'theme':
    case 'orgText':
      // Runtime field validation happens where each message is consumed;
      // here we only trust the discriminator.
      return parsed as ServerMessage
    case 'graphupdate':
      // The only message with extra structural validation: a malformed
      // diff applied blindly could corrupt the store, so shape-check it.
      return isGraphupdateData(parsed.data) ? (parsed as GraphupdateMessage) : null
    default:
      return null
  }
}

/** Serialize a client request for Emacs. Inverse of the elisp reader. */
export function encodeClientMessage(msg: ClientMessage): string {
  return JSON.stringify(msg)
}

// Re-exported so consumers only need this module, not the root api.d.ts.
export type { OrgRoamGraphReponse, OrgRoamLink, OrgRoamNode }
