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
 * Rewrite a message in place. `edit` is a text string (older records) or an object with any of:
 *
 * - `text`     — the visible answer text; the first text block is replaced where it stands, so the
 *                block order a provider expects survives;
 * - `thinking` — the reasoning text of the first reasoning block. The replay signature that was
 *                issued with that block stays attached: the Messages endpoint does not bind the
 *                signature to the wording (verified against the live endpoint), and the core's
 *                replay validation only compares block counts and types.
 *
 * Everything else the model needs survives untouched: role, id, source, tool calls, images and
 * any other non-text block. Rewriting never adds or removes blocks when only one field is given,
 * because the core rejects a replay whose block count differs from the recorded one.
 */
export function rewriteMessage(base, edit) {
  const spec = typeof edit === 'string' ? { text: edit } : (edit && typeof edit === 'object' ? edit : {})
  const wantText = typeof spec.text === 'string'
  const wantThinking = typeof spec.thinking === 'string'
  const blocks = Array.isArray(base?.content) ? base.content : []
  const out = []
  let placedText = !wantText
  let placedThinking = !wantThinking
  for (const block of blocks) {
    if (!placedThinking && block?.type === 'reasoning' && typeof block.text === 'string') {
      out.push({ ...block, text: spec.thinking })
      placedThinking = true
      continue
    }
    if (block?.type === 'text' && wantText) {
      if (!placedText) { out.push({ type: 'text', text: spec.text }); placedText = true }
      continue
    }
    out.push(block)
  }
  // A message with no text block (or none the reply owned) may still accept the new text; a
  // message without a reasoning block never gets one appended, since that would change the block
  // count the provider's replay state was recorded with.
  if (!placedText) out.push({ type: 'text', text: spec.text })
  return { ...base, content: out }
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
      const edit = target?.op === 'edit' && (typeof target.text === 'string' || typeof target.thinking === 'string')
        ? {
          ...(typeof target.text === 'string' ? { text: target.text } : {}),
          ...(typeof target.thinking === 'string' ? { thinking: target.thinking } : {}),
        }
        : null
      if (edit === null) { out.set(seq, null); continue }
      out.set(seq, base === null || base === undefined ? null : rewriteMessage(base, edit))
    }
    return out
  },
}
