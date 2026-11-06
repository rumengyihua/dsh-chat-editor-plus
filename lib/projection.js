/**
 * The model-side half of an edit: a pure message projection over the session log.
 *
 * `dsh-session` lets a plugin register one interpreter per event type. When a record of that
 * type is appended, the interpreter returns `Map<seq, message | null>`: the surface stores it and
 * every later `deriveMessages()` — the agent's request builder — reads the mapped message instead
 * of the log event. A `null` removes the node from the request while the surface keeps it, so a
 * deletion needs no placeholder and a rewrite keeps the original message id.
 *
 * No I/O and no core imports, so the maintainer tests can drive it directly.
 */
import { STEALTH_RECORD } from './view.js'

/** The message one log event contributes to the model's history, before any projection. */
export function logMessageOf(event) {
  switch (event?.type) {
    case 'user/message': return event.data ?? null
    case 'system/message':
    case 'developer/message':
    case 'assistant/message': return event.data?.message ?? null
    case 'tool/result': return event.data?.message ?? null
    default: return null
  }
}

/**
 * Swap the text of a message, keeping everything the model needs (role, id, source) and any
 * non-text blocks the user attached. Assistant edits are refused on the route today; this helper
 * is generic so a future assistant rewrite (thinking included) can reuse it.
 */
export function rewriteMessage(base, text) {
  const kept = Array.isArray(base?.content) ? base.content.filter(block => block?.type !== 'text' && block?.type !== 'reasoning') : []
  return { ...base, content: [...kept, { type: 'text', text }] }
}

export const rewriteProjection = {
  type: STEALTH_RECORD,
  project(event, context) {
    const out = new Map()
    const events = context?.events ?? []
    const baseSeq = Number.isSafeInteger(context?.baseSeq) ? context.baseSeq : 0
    const applied = context?.messages
    for (const target of event?.data?.targets ?? []) {
      const seq = target?.seq
      if (!Number.isSafeInteger(seq)) continue
      // Build on the projections earlier records already applied: a deleted seq stays null, so a
      // later edit can never resurrect it.
      const base = applied?.has?.(seq) === true ? applied.get(seq) : logMessageOf(events[seq - baseSeq])
      if (target.op !== 'edit' || typeof target.text !== 'string') { out.set(seq, null); continue }
      out.set(seq, base === null || base === undefined ? null : rewriteMessage(base, target.text))
    }
    return out
  },
}
