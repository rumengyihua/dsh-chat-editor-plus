import { EDIT_PLUGIN, EDIT_PREFIX_ASSISTANT, STEALTH_RECORD, messageList, messageText, roleOf, turnIndex } from './view.js'

const surfaceType = e => ['user/message', 'assistant/message', 'tool/result'].includes(e.type)
const isEdit = e => e.type === 'user/message' && e.data?.source?.kind === 'plugin' && e.data.source.plugin === EDIT_PLUGIN && e.surfaceOp?.op === 'replace'

/** Follow replacements in surface order. A seq is a log identity, not a surface position. */
export function editState(events) {
  const nodes = []
  const rootsByNode = new Map()
  const records = new Map()
  const synthetic = new Map()
  for (const e of events) {
    // Model-side rewrites: the surface node keeps its seq, only the effective text / visibility
    // changes. The panel reads the same record the model's projection reads, so the two never drift.
    if (e?.type === STEALTH_RECORD) {
      for (const target of e.data?.targets ?? []) {
        if (!Number.isSafeInteger(target?.seq)) continue
        // A message replaced the old way is a synthetic node: the row it stands for is its root.
        const roots = synthetic.get(target.seq) ?? new Set([target.seq])
        for (const root of roots) {
          const previous = records.get(root)
          if (!previous) continue
          if (target.op === 'delete') records.set(root, { ...previous, hidden: true, revision: e.seq })
          else {
            // An edit may rewrite the answer text, the reasoning text, or both; absent fields keep
            // whatever an earlier record already established.
            const next = { ...previous, revision: e.seq }
            if (typeof target.text === 'string') next.text = target.text
            if (typeof target.thinking === 'string') next.thinking = target.thinking
            records.set(root, next)
          }
        }
      }
      continue
    }
    if (!surfaceType(e)) continue
    const op = e.surfaceOp
    let roots = new Set()
    if (op === 'append') nodes.push(e.seq)
    else if (op?.op === 'replace') {
      const first = nodes.indexOf(op.startSeq ?? op.start), last = nodes.indexOf(op.endSeq ?? op.end)
      if (first < 0 || last < first) continue
      for (const seq of nodes.slice(first, last + 1)) for (const root of rootsByNode.get(seq) ?? []) roots.add(root)
      nodes.splice(first, last - first + 1, e.seq)
    } else continue
    if (isEdit(e)) {
      synthetic.set(e.seq, roots)
      for (const root of roots) {
        const previous = records.get(root)
        if (!previous) continue
        let text = messageText(e)
        if (previous.role === 'assistant' && text.startsWith(EDIT_PREFIX_ASSISTANT)) text = text.slice(EDIT_PREFIX_ASSISTANT.length)
        records.set(root, { ...previous, activeSeq: e.seq, revision: e.seq, text, hidden: e.data.source.editKind === 'delete' || previous.hidden })
      }
    } else {
      roots = new Set([e.seq])
      records.set(e.seq, { seq: e.seq, activeSeq: e.seq, revision: -1, text: messageText(e), original: messageText(e), role: roleOf(e), hidden: false })
    }
    rootsByNode.set(e.seq, roots)
  }
  const live = new Set(nodes)
  for (const record of records.values()) record.onSurface = live.has(record.activeSeq) && !record.hidden
  return { nodes, records, synthetic, rootsByNode }
}

/** Session-log edits are authoritative. Only an explicitly newer display-only write can override them. */
export function effectiveOverrides(events, sidecar = []) {
  const state = editState(events)
  const result = new Map(sidecar.map(o => [o.seq, { ...o }]))
  for (const record of state.records.values()) {
    if (record.revision < 0) continue
    const side = result.get(record.seq)
    const newer = side?.baseEditSeq === record.revision
    const text = newer && typeof side.text === 'string' ? side.text : record.text
    result.set(record.seq, {
      seq: record.seq, role: record.role, original: record.original,
      ...(side?.collapsed ? { collapsed: true } : {}),
      ...(record.hidden ? { hidden: true } : newer && side.hidden ? { hidden: true } : {}),
      // Only a text that really differs is a replacement: a thinking-only record used to carry the
      // original text along, which made the UI swap in an unchanged copy of the reply.
      ...(!record.hidden && typeof text === 'string' && text !== record.original ? { text } : {}),
      ...(!record.hidden && typeof record.thinking === 'string' ? { thinking: record.thinking } : {}),
    })
  }
  // The core also renders replacement context nodes. Their original rows already carry the
  // effective text above; hide the duplicate correction/placeholder using its own exact seq.
  for (const [seq, roots] of state.synthetic) {
    if ([...roots].some(root => state.records.has(root))) result.set(seq, { seq, hidden: true, original: '', role: 'context' })
  }
  return [...result.values()]
}

export function editableMessages(events, options) {
  const state = editState(events)
  return messageList(events, { limit: Infinity }).filter(m => !state.synthetic.has(m.seq)).map(m => {
    const record = state.records.get(m.seq)
    if (!record) return m
    // The panel edits what the model would read, so a rewritten reasoning text replaces the log one.
    return {
      ...m, onSurface: record.onSurface, contextDeleted: record.hidden, activeSeq: record.activeSeq,
      ...(typeof record.thinking === 'string' ? { thinking: record.thinking } : {}),
    }
  }).slice(-(options?.limit ?? 500))
}

export function resolveEditTarget(events, seq) {
  const record = editState(events).records.get(seq)
  if (!record) throw Object.assign(new Error('no original message at this seq'), { status: 404 })
  if (record.hidden) throw Object.assign(new Error('this message was deleted; it cannot be edited or restored into context'), { status: 400 })
  if (!record.onSurface) throw Object.assign(new Error('this message is no longer on the current surface; only display changes are available'), { status: 409 })
  return record
}


/**
 * Turn requested deletions into projection targets: deleting an assistant message also deletes the
 * tool results it called (the request must never carry a call that never returned), and a lone
 * tool-result deletion is refused for the same reason. `onSurface` defaults to the folded log, but
 * callers pass the live surface so the check matches exactly what the core will project.
 * Pure: no session object, no I/O.
 */
export function planDeletes(events, seqs, options = {}) {
  const state = editState(events)
  const surface = new Set(options.onSurface ?? state.nodes)
  const deleted = new Set()
  for (const [seq, record] of state.records) if (record.hidden === true) deleted.add(seq)
  const bySeq = new Map(events.map(event => [event?.seq, event]))
  const seen = new Set()
  const targets = []
  const errors = []
  for (const seq of seqs) {
    if (!Number.isSafeInteger(seq) || seen.has(seq)) continue
    if (!surface.has(seq)) { errors.push({ status: 409, message: `the message at seq ${seq} is no longer on the current surface; reload and retry` }); continue }
    if (deleted.has(seq)) {
      if (!options.skipDeleted) errors.push({ status: 409, message: `the message at seq ${seq} is already deleted from the model's view` })
      continue
    }
    seen.add(seq)
    targets.push({ seq, op: 'delete' })
    const event = bySeq.get(seq)
    if (event?.type !== 'assistant/message') continue
    for (const block of event.data?.message?.content ?? []) {
      if (block?.type !== 'tool-call' || typeof block.id !== 'string') continue
      for (const candidate of events) {
        if (candidate?.type !== 'tool/result' || candidate.data?.message?.toolCallId !== block.id || seen.has(candidate.seq)) continue
        if (!surface.has(candidate.seq)) continue
        seen.add(candidate.seq)
        targets.push({ seq: candidate.seq, op: 'delete' })
      }
    }
  }
  const removed = new Set(targets.map(target => target.seq))
  for (const target of targets) {
    const event = bySeq.get(target.seq)
    if (event?.type !== 'tool/result') continue
    const callId = event.data?.message?.toolCallId
    if (typeof callId !== 'string') continue
    const owner = [...removed].some(seq => {
      const candidate = bySeq.get(seq)
      return candidate?.type === 'assistant/message' && (candidate.data?.message?.content ?? []).some(block => block?.type === 'tool-call' && block.id === callId)
    })
    if (!owner) errors.push({ status: 400, message: 'this tool result cannot be deleted on its own (the model would see a call that never returned); delete the assistant message that called it, or the whole turn' })
  }
  return { targets, errors }
}

export function activeTurnRange(events, seq) {
  const state = editState(events)
  const record = resolveEditTarget(events, seq)
  const { turnOf } = turnIndex(events)
  const turn = turnOf.get(seq)
  if (turn == null) return { start: record.activeSeq, end: record.activeSeq, count: 1 }
  const positions = state.nodes.flatMap((node, at) => [...state.rootsByNode.get(node) ?? []].some(root => turnOf.get(root) === turn) ? [at] : [])
  const first = positions[0], last = positions.at(-1)
  const selected = state.nodes.slice(first, last + 1)
  for (const node of selected) {
    const roots = [...state.rootsByNode.get(node) ?? []]
    if (!roots.length || roots.some(root => turnOf.get(root) !== turn)) throw Object.assign(new Error('the turn now spans another turn or a compaction checkpoint; reload and select individual messages'), { status: 409 })
  }
  return { start: selected[0], end: selected.at(-1), count: selected.length }
}
