/**
 * dsh-chat-editor-plus browser half (desktop-adapted fork of DSH-CyberWorkStation's dsh-chat-editor).
 *
 *  - a "✎ messages" button in the session header opens the message panel: every message of
 *    the conversation (yours, the assistant's, injected context, tool results) with edit /
 *    delete / branch actions in the three modes the host implements;
 *  - an inline ✎ on each finished assistant message opens the panel limited to that turn;
 *  - a ✎ under each of your own messages opens it limited to that one message (DOM-side, since
 *    the shell exposes no user-actions slot);
 *  - the panel filters by category (you / assistant / thinking / tool results / context) and
 *    searches inside the current category, with a next-match arrow and an n/total counter;
 *  - display-only overrides are applied to the rendered bubbles: the text is swapped or the
 *    message is hidden, anchored on the original text, never touching the log or the model.
 *
 * Loaded through window.__ModuleLoader__ like every dsh client plugin.
 */
window.__ModuleLoader__.load({
  id: 'dsh-chat-editor-plus',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const h = React.createElement
    const EMPTY_NODES = Object.freeze([])

    // ── i18n ──
    const ZH = {
      open: '消息编辑', title: '消息编辑', close: '关闭', clear_turn: '清除本轮回复', clear_turn_hint: '删除这一轮里所有助手输出（正文、思考、工具调用与工具结果），用户消息保留',
      hint: '「改」和「删」同时作用于你看到的和模型看到的;「折叠」只收起显示,点一下能展开;「分叉」从这条之前新开一个会话。原文始终留在日志里。',
      role_user: '我', role_assistant: '助手', role_context: '上下文', role_tool: '工具', role_checkpoint: '压缩摘要',
      edit_msg: '改', del_msg: '删除', collapse: '折叠', uncollapse: '取消折叠', fork: '分叉', save: '保存', cancel: '取消',
      edited_badge: '已改', hidden_badge: '已删除', collapsed_badge: '已折叠', shadowed: '已被替换(模型看不到)', off_surface: '模型看不到',
      expand_hint: '点一下展开',
      fork_send: '分叉后立即发送编辑框里的内容',
      done: '已完成', failed: '失败:', loading: '读取中…', empty: '没有消息', busy: '处理中…',
      forked: '已分叉出新会话 {id}(在会话列表里打开)', readonly: '子代理会话只读',
      tool_note: '工具结果可改内容：模型会当成工具的原始返回', cp_note: '压缩摘要请在启动器「记忆与上下文」页编辑',
      think_label: '思考（thinking，随回复一起发给模型）', think_short: '思考', text_label: '回复正文',
      tool_step_note: '这条回复只发起了工具调用，没有正文（只能改思考）',
      cat_all: '全部', cat_user: '我', cat_assistant: '助手', cat_thinking: '思考', cat_tool: '工具结果',
      cat_context: '上下文', cat_checkpoint: '压缩摘要',
      search_ph: '搜索关键词…', search_none: '没有匹配', search_total: '共 {n} 条', search_next: '跳到下一个结果', search_prev: '跳到上一个结果',
      edit_user: '编辑这条', scope_turn: '本轮回复', scope_user: '这条消息', scope_all: '显示全部',
    }
    const EN = {
      open: 'Edit messages', title: 'Message editor', close: 'Close', clear_turn: 'Clear turn', clear_turn_hint: 'Delete every assistant output of this turn (text, thinking, tool calls and their results); the user message stays',
      hint: 'Edit and delete apply to what you see and what the model sees, together. Collapse only folds it away — click to open it again. Branch starts a new session from before this message. The original always stays in the log.',
      role_user: 'You', role_assistant: 'Assistant', role_context: 'Context', role_tool: 'Tool', role_checkpoint: 'Compaction summary',
      edit_msg: 'Edit', del_msg: 'Delete', collapse: 'Collapse', uncollapse: 'Uncollapse', fork: 'Branch', save: 'Save', cancel: 'Cancel',
      edited_badge: 'edited', hidden_badge: 'deleted', collapsed_badge: 'collapsed', shadowed: 'replaced (model cannot see it)', off_surface: 'model cannot see it',
      expand_hint: 'click to expand',
      fork_send: 'Send the text in the box as the first message of the branch',
      done: 'Done', failed: 'Failed: ', loading: 'Loading…', empty: 'No messages', busy: 'Working…',
      forked: 'Branched into {id} (open it from the session list)', readonly: 'subagent sessions are read-only',
      tool_note: 'tool results are editable: the model treats the text as the tool\'s own output', cp_note: 'compaction summaries are edited on the launcher\'s Memory & context page',
      think_label: 'Thinking (sent to the model with the reply)', think_short: 'Thinking', text_label: 'Reply text',
      tool_step_note: 'This step only made tool calls and has no reply text — only the thinking can change',
      cat_all: 'All', cat_user: 'You', cat_assistant: 'Assistant', cat_thinking: 'Thinking', cat_tool: 'Tool results',
      cat_context: 'Context', cat_checkpoint: 'Compaction',
      search_ph: 'Search messages…', search_none: 'No matches', search_total: '{n} messages', search_next: 'Next match', search_prev: 'Previous match',
      edit_user: 'Edit this message', scope_turn: 'This turn’s reply', scope_user: 'This message', scope_all: 'Show all',
    }
    const zh = String(navigator.language ?? '').toLowerCase().startsWith('zh')
    const t = (key, vars) => { let s = (zh ? ZH : EN)[key] ?? key; for (const [k, v] of Object.entries(vars ?? {})) s = s.split('{' + k + '}').join(String(v)); return s }

    // ── shared state (the DOM half and the React half both read it) ──
    const store = (window.__dshChatEditorStore ??= {
      sessionId: undefined,
      overrides: [],
      open: false,
      focusSeq: undefined,
      scope: undefined,
      listeners: new Set(),
      emit() { for (const fn of [...this.listeners]) { try { fn() } catch { /* a stale subscriber */ } } },
      set(patch) { Object.assign(this, patch); this.emit() },
    })
    function useStore() {
      const [, force] = React.useReducer(x => x + 1, 0)
      React.useEffect(() => { store.listeners.add(force); return () => { store.listeners.delete(force) } }, [force])
      return store
    }

    const api = async (path, body, options) => {
      const init = body === undefined
        ? { cache: 'no-store', ...(options ?? {}) }
        : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), ...(options ?? {}) }
      const r = await fetch('/dsh-chat-editor-plus' + path, init)
      try { return await r.json() } catch { return { ok: false, message: 'HTTP ' + r.status } }
    }

    // The panel used to paint empty ("读取中") and then fill in ~200ms later, which reads as a
    // reload. Keep the last payload per session so a reopen is instant, and prefetch on hover so
    // even the first open rarely waits. Deliberately bounded and shape-checked: this map lives as
    // long as the client module, so an unbounded cache would retain one payload per session.
    const PAYLOAD_CACHE_LIMIT = 6
    const payloadCache = new Map()
    const prefetching = new Set()
    let messagesRequestId = 0
    const messagesRequestBySession = new Map()

    function beginMessagesRequest(sessionId) {
      const id = ++messagesRequestId
      messagesRequestBySession.set(sessionId, id)
      // Bound the bookkeeping too, in case sessions are opened one after another.
      if (messagesRequestBySession.size > 64) {
        for (const key of messagesRequestBySession.keys()) {
          if (messagesRequestBySession.size <= 32) break
          if (key !== sessionId) messagesRequestBySession.delete(key)
        }
      }
      return id
    }

    function isLatestMessagesRequest(sessionId, id) {
      return messagesRequestBySession.get(sessionId) === id
    }

    // Only a well-formed successful payload may enter the cache. Anything else (HTTP error body,
    // truncated JSON, unexpected shape) would otherwise be replayed on every subsequent open.
    function cacheablePayload(sessionId, data) {
      return typeof sessionId === 'string' && sessionId !== ''
        && data !== null && typeof data === 'object'
        && data.ok !== false
        && Array.isArray(data.messages)
    }

    function writePayloadCache(sessionId, data, requestId) {
      if (!cacheablePayload(sessionId, data)) return false
      // A slow response started before the latest request for this session must not overwrite
      // fresher data.
      if (requestId !== undefined && !isLatestMessagesRequest(sessionId, requestId)) return false
      payloadCache.delete(sessionId)
      payloadCache.set(sessionId, data)
      while (payloadCache.size > PAYLOAD_CACHE_LIMIT) {
        const oldest = payloadCache.keys().next()
        if (oldest.done) break
        payloadCache.delete(oldest.value)
      }
      return true
    }

    function readPayloadCache(sessionId) {
      const hit = payloadCache.get(sessionId)
      if (hit === undefined) return null
      payloadCache.delete(sessionId)
      payloadCache.set(sessionId, hit) // touch: the entry just read becomes the most recent
      return hit
    }

    function prefetchMessages(sessionId) {
      if (!sessionId || payloadCache.has(sessionId) || prefetching.has(sessionId)) return
      prefetching.add(sessionId)
      const requestId = beginMessagesRequest(sessionId)
      const timeout = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(8000)
        : undefined
      api('/messages?sessionId=' + encodeURIComponent(sessionId), undefined, timeout ? { signal: timeout } : undefined)
        .then(data => { writePayloadCache(sessionId, data, requestId) })
        .catch(() => {})
        .finally(() => { prefetching.delete(sessionId) })
    }

    // Exact row identity comes from the core's live chat-node projection, never rendered text.
    const expandedKeys = new Set()
    const rowIndex = new Map()
    let overrideGeneration = 0
    let domDisposed = false
    let scheduled = null
    const rowKey = seq => store.sessionId + ':' + seq
    // 0.2.x puts both keys on the seat (data-chat-node-key is the node identity, data-chat-flow-key
    // is the render key, already JSON-encoded for grouped rows); 0.1.x only has data-chat-flow-key.
    const ROW_SELECTOR = '[data-chat-node-key],[data-chat-flow-key]'
    const rowKeyOf = row => row.getAttribute('data-chat-node-key') ?? row.getAttribute('data-chat-flow-key')
    function messageSeq(node) {
      const d = node?.data
      if (['user', 'steering', 'context', 'compaction'].includes(node?.kind)) return d?.seq
      if (node?.kind === 'assistant-step') return d?.status === 'running' ? undefined : d?.finalNode?.seq
      if (node?.kind === 'manual-compaction') return d?.compaction?.seq
      return undefined
    }
    function setRows(nodes) {
      rowIndex.clear()
      for (const node of nodes ?? []) {
        const seq = messageSeq(node)
        if (Number.isSafeInteger(seq) && seq >= 0) rowIndex.set(node.key, seq)
      }
      schedule()
    }
    // The edited text replaces the text element inside the message bubble itself, so the bubble,
    // its padding, its alignment and the row's action bar keep their native rendering. Matching
    // ignores whitespace because block rendering drops the newlines the stored text still has.
    const textHostCache = new WeakMap()
    const stripWs = value => String(value ?? '').replace(/\s+/g, '')
    // Markdown rendering drops punctuation the stored text still carries, so a second, looser form
    // lets formatted messages keep their bubble too.
    const looseText = value => stripWs(value).replace(/[*_`~#>\[\]()!]/g, '')
    function findTextHost(row, original) {
      const exact = stripWs(original)
      if (!exact) return null
      const approx = looseText(original)
      const cached = textHostCache.get(row)
      if (cached !== undefined && cached.exact === exact && row.contains(cached.host)) return cached.host
      const hit = el => {
        if (el.hasAttribute('data-dsh-ce-overlay') || el.hasAttribute('data-dsh-ce-orig')) return false
        // Never mistake the reasoning disclosure or its summary for the answer text.
        if (el.closest('[data-variant="think"]') !== null || el.closest('[data-disclosure-header]') !== null) return false
        const text = stripWs(el.textContent)
        return text === exact || (approx.length > 0 && looseText(el.textContent) === approx)
      }
      let host = null
      for (const el of row.querySelectorAll('*')) {
        if (!hit(el)) continue
        if ([...el.children].some(hit)) continue
        host = el
      }
      if (host !== null) textHostCache.set(row, { exact, host })
      return host
    }
    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
    function inlineMarkdown(raw) {
      const code = []
      let text = escapeHtml(raw).replace(/`([^`\n]+)`/g, (_m, value) => { code.push('<code>' + value + '</code>'); return '\u0000' + (code.length - 1) + '\u0000' })
      text = text
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
        .replace(/~~([^~]+)~~/g, '<del>$1</del>')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
      return text.replace(/\u0000(\d+)\u0000/g, (_m, index) => code[Number(index)])
    }
    // A deliberately small renderer: the replacement text is raw markdown like the log, and showing it
    // verbatim inside a rendered bubble is what made an edited reply look unformatted.
    function renderMarkdown(raw) {
      const lines = String(raw ?? '').replace(/\r\n?/g, '\n').split('\n')
      const out = []
      let i = 0
      while (i < lines.length) {
        const line = lines[i]
        if (/^\s*$/.test(line)) { i += 1; continue }
        const fence = /^\s*```(.*)$/.exec(line)
        if (fence) {
          const body = []
          i += 1
          while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) { body.push(lines[i]); i += 1 }
          i += 1
          out.push('<pre><code>' + escapeHtml(body.join('\n')) + '</code></pre>')
          continue
        }
        const heading = /^\s*(#{1,6})\s+(.*)$/.exec(line)
        if (heading) { out.push('<h' + heading[1].length + '>' + inlineMarkdown(heading[2]) + '</h' + heading[1].length + '>'); i += 1; continue }
        if (/^\s*>\s?/.test(line)) {
          const body = []
          while (i < lines.length && /^\s*>\s?/.test(lines[i])) { body.push(lines[i].replace(/^\s*>\s?/, '')); i += 1 }
          out.push('<blockquote>' + inlineMarkdown(body.join('\n')).replace(/\n/g, '<br>') + '</blockquote>')
          continue
        }
        const bullet = /^\s*([-*+])\s+(.*)$/.exec(line)
        const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
        if (bullet || numbered) {
          const ordered = numbered !== null
          const items = []
          while (i < lines.length) {
            const m = ordered ? /^\s*\d+[.)]\s+(.*)$/.exec(lines[i]) : /^\s*[-*+]\s+(.*)$/.exec(lines[i])
            if (!m) break
            items.push('<li>' + inlineMarkdown(m[1]) + '</li>')
            i += 1
          }
          out.push((ordered ? '<ol>' : '<ul>') + items.join('') + (ordered ? '</ol>' : '</ul>'))
          continue
        }
        const para = []
        while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^\s*(```|#{1,6}\s|>|[-*+]\s|\d+[.)]\s)/.test(lines[i])) {
          para.push(lines[i]); i += 1
        }
        out.push('<p>' + inlineMarkdown(para.join('\n')).replace(/\n/g, '<br>') + '</p>')
      }
      return out.join('')
    }
    /** The rendered text containers of one assistant row, excluding the reasoning disclosure. */
    function markdownHosts(row) {
      return [...row.querySelectorAll('[class*="markdown"]')].filter(el => el.closest('[data-variant="think"]') === null)
    }
    /** Show a rewritten reasoning text in the disclosure (collapsed preview + expanded body). */
    function applyThinkingText(row, text) {
      const root = row.querySelector('[data-variant="think"]')
      if (root === null) return
      // Model reasoning sometimes carries literal escape sequences ("\\n" as two characters) and the
      // disclosure is a reading surface, so render them as the line breaks they stand for; the text sent
      // to the model is untouched. Runs of blank lines are collapsed the way the markdown renderer spaces
      // paragraphs, otherwise a stray "\\n" next to a real newline leaves an extra empty line.
      // The disclosure renders reasoning as tight single-spaced lines, so paragraph breaks collapse to
      // one line break as well; otherwise every paragraph gains an empty line the original never showed.
      const shown = text.replace(/\\r\\n|\\n/g, '\n').replace(/\\t/g, '\t').replace(/\n{2,}/g, '\n')
      const summary = root.querySelector('[class*="summaryText"]')
      if (summary !== null) {
        const preview = (shown.split('\n').map(line => line.trim()).find(line => line.length > 0) ?? shown).slice(0, 160)
        if (!summary.hasAttribute('data-dsh-ce-think-orig')) summary.setAttribute('data-dsh-ce-think-orig', summary.textContent ?? '')
        if (summary.textContent !== preview) summary.textContent = preview
      }
      const body = root.querySelector('[class*="thinkBody"]')
      if (body === null) return
      const inner = body.firstElementChild
      if (inner === null) return
      // The expanded body is the `conversation.chat.reasoning.body` slot. Its typography lives on the
      // deepest rendered node (the markdown text holder), not on thinkBody or on the slot wrapper, so
      // replace the text on that node itself and leave every wrapper class in place.
      let leaf = inner
      while (leaf.children.length === 1) leaf = leaf.children[0]
      if (!leaf.hasAttribute('data-dsh-ce-think-orig')) leaf.setAttribute('data-dsh-ce-think-orig', leaf.textContent ?? '')
      if (leaf.textContent !== shown) leaf.textContent = shown
      // Keep the original line breaking; only supply pre-wrap when the node would otherwise collapse it.
      if (getComputedStyle(leaf).whiteSpace === 'normal') leaf.style.whiteSpace = 'pre-wrap'
    }
    function clearRow(row) {
      for (const key of ['data-dsh-ce-hidden', 'data-dsh-ce-collapsed', 'data-dsh-ce-rowhide']) row.removeAttribute(key)
      for (const el of row.querySelectorAll('[data-dsh-ce-orig]')) el.removeAttribute('data-dsh-ce-orig')
      for (const layer of row.querySelectorAll('[data-dsh-ce-overlay]')) layer.remove()
      for (const el of row.querySelectorAll('[data-dsh-ce-think-orig]')) {
        el.textContent = el.getAttribute('data-dsh-ce-think-orig') ?? ''
        el.removeAttribute('data-dsh-ce-think-orig')
      }
      textHostCache.delete(row)
    }
    /**
     * The plugin's pencil, drawn as a linear icon instead of the ✎ glyph so it sits with the
     * toolbar's other icons: 24-grid outline, 1.65 stroke, currentColor, tip at bottom-left.
     */
    const PENCIL_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true" style="display:block;opacity:.72"><path d="M3.5 20.5 4.3 16.3 16.2 4.4 19.6 7.8 7.7 19.7Z"/><path d="M13.8 6.8 17.2 10.2"/></svg>'

    function PencilIcon(props) {
      const size = props && props.size ? props.size : 14
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinejoin: 'round',
        strokeLinecap: 'round',
        'aria-hidden': 'true',
        style: { display: 'block', flex: 'none', opacity: 0.72 },
      },
        h('path', { d: 'M3.5 20.5 4.3 16.3 16.2 4.4 19.6 7.8 7.7 19.7Z' }),
        h('path', { d: 'M13.8 6.8 17.2 10.2' }))
    }

    /** A pencil on every user bubble: opens the panel limited to that single message. */
    function ensureUserButton(row) {
      if (row.getAttribute('data-chat-flow-kind') !== 'user') return
      if (row.querySelector('[data-dsh-ce-userbtn]') !== null) return
      const holder = row.querySelector('[class*="actions"]') ?? row
      const button = document.createElement('button')
      button.type = 'button'
      button.setAttribute('data-dsh-ce-userbtn', '')
      button.innerHTML = PENCIL_SVG
      button.title = t('edit_user')
      button.style.cssText = 'border:none;background:none;cursor:pointer;padding:2px 6px;font-size:12px;line-height:1;opacity:1;color:inherit;display:inline-flex;align-items:center'
      button.addEventListener('click', event => {
        event.preventDefault()
        event.stopPropagation()
        const seq = rowIndex.get(row.getAttribute('data-chat-node-key') ?? row.getAttribute('data-chat-flow-key'))
        const sessionId = store.sessionId
        if (seq === undefined || sessionId === undefined) return
        store.set({ sessionId, open: true, focusSeq: seq, scope: { kind: 'user', seq } })
      })
      holder.appendChild(button)
    }
    function applyRows() {
      for (const row of document.querySelectorAll('[data-chat-flow-kind="user"]')) ensureUserButton(row)
      const overrides = new Map(store.overrides.map(o => [o.seq, o]))
      for (const row of document.querySelectorAll(ROW_SELECTOR)) {
        const seq = rowIndex.get(rowKeyOf(row))
        const hit = seq === undefined ? undefined : overrides.get(seq)
        if (!hit) { clearRow(row); continue }
        const flag = (key, enabled) => {
          if (enabled) { if (!row.hasAttribute(key)) row.setAttribute(key, '') }
          else row.removeAttribute(key)
        }
        flag('data-dsh-ce-hidden', hit.hidden === true)
        flag('data-dsh-ce-collapsed', hit.hidden !== true && hit.collapsed === true && !expandedKeys.has(rowKey(seq)))
        // One assistant step renders as two rows that share data-chat-node-key: a reasoning row and the
        // answer row. The answer text only lives in the latter; touching the reasoning row hid the
        // thinking disclosure instead of the reply.
        const reasoningRow = row.getAttribute('data-chat-group-part') === 'reasoning'
        const textChanged = typeof hit.text === 'string' && hit.text !== hit.original
        const edited = hit.hidden !== true && textChanged && !reasoningRow
        // Rewritten reasoning is displayable too: the same record the model reads also drives the
        // disclosure, so the panel and the request never disagree about what the thinking says.
        if (hit.hidden !== true && reasoningRow && typeof hit.thinking === 'string') applyThinkingText(row, hit.thinking)
        if (edited) {
          // Hide the rendered text itself, never the row: the row also carries the reasoning disclosure
          // and the action bar. The new text goes back through a small markdown renderer so an edited
          // reply keeps its formatting instead of showing raw `**`/`#` markers.
          let host = findTextHost(row, hit.original)
          if (host === null) {
            const bodies = markdownHosts(row)
            if (bodies.length > 0) {
              for (const el of bodies) el.setAttribute('data-dsh-ce-orig', '')
              host = bodies[bodies.length - 1]
            }
          }
          if (host === null) {
            flag('data-dsh-ce-rowhide', true)
          } else {
            flag('data-dsh-ce-rowhide', false)
            if (!host.hasAttribute('data-dsh-ce-orig')) host.setAttribute('data-dsh-ce-orig', '')
          }
          const mount = host?.parentElement ?? row
          let layer = row.querySelector('[data-dsh-ce-overlay]')
          if (!layer) { layer = document.createElement('div'); layer.setAttribute('data-dsh-ce-overlay', '') }
          if (layer.parentElement !== mount) mount.appendChild(layer)
          if (layer.dataset.text !== hit.text) { layer.dataset.text = hit.text; layer.innerHTML = renderMarkdown(hit.text) }
          const style = host === null ? null : getComputedStyle(host)
          for (const [prop, value] of [
            ['fontSize', style?.fontSize], ['lineHeight', style?.lineHeight], ['fontFamily', style?.fontFamily],
            ['fontWeight', style?.fontWeight], ['letterSpacing', style?.letterSpacing], ['color', style?.color],
          ]) layer.style[prop] = value ?? ''
        } else {
          row.removeAttribute('data-dsh-ce-rowhide')
          for (const el of row.querySelectorAll('[data-dsh-ce-orig]')) el.removeAttribute('data-dsh-ce-orig')
          row.querySelector('[data-dsh-ce-overlay]')?.remove()
        }
      }
    }
    function schedule() {
      if (domDisposed || scheduled !== null) return
      scheduled = setTimeout(() => { scheduled = null; if (!domDisposed) applyRows() }, 16)
    }
    async function refreshOverrides() {
      const sessionId = store.sessionId
      const generation = ++overrideGeneration
      if (!sessionId) { store.set({ overrides: [] }); schedule(); return }
      const d = await api('/overrides?sessionId=' + encodeURIComponent(sessionId))
      if (domDisposed || generation !== overrideGeneration || store.sessionId !== sessionId) return
      if (!d || d.ok === false || !Array.isArray(d.overrides)) throw new Error(d?.message || 'Cannot read message overrides')
      store.set({ overrides: d.overrides })
      const live = new Set(store.overrides.filter(o => o.collapsed === true).map(o => rowKey(o.seq)))
      for (const key of expandedKeys) if (!live.has(key)) expandedKeys.delete(key)
      schedule()
    }
    function startDomHalf() {
      window.__dshChatEditorDispose?.()
      domDisposed = false
      const style = document.createElement('style')
      style.textContent = '[data-dsh-ce-hidden]{display:none!important}'
        + '[data-dsh-ce-orig]{display:none!important}'
        + '[data-dsh-ce-rowhide]>:not([data-dsh-ce-overlay]){display:none!important}'
        + '[data-dsh-ce-overlay]{overflow-wrap:anywhere}'
        + '[data-dsh-ce-overlay] p{margin:0 0 8px}'
        + '[data-dsh-ce-overlay] p:last-child{margin-bottom:0}'
        + '[data-dsh-ce-overlay] pre{margin:8px 0;padding:10px 12px;border-radius:8px;background:var(--dsw-alias-markdown-code-block);overflow:auto}'
        + '[data-dsh-ce-overlay] code{font:var(--dsw-font-markdown-code-block-small)}'
        + '[data-dsh-ce-overlay] ul,[data-dsh-ce-overlay] ol{margin:0 0 8px;padding-left:22px}'
        + '[data-dsh-ce-overlay] blockquote{margin:0 0 8px;padding-left:12px;border-left:2px solid var(--dsw-alias-border-l2)}'
        + '[data-dsh-ce-collapsed]{max-height:46px!important;overflow:hidden!important;cursor:zoom-in}'
        + '.dsh-ce-panel textarea{border:1px solid transparent;background:rgba(255,255,255,.045);border-radius:8px;padding:8px;color:inherit;outline:none;field-sizing:content;min-height:44px;max-height:160px;overflow:auto;resize:vertical}'
        + '.dsh-ce-panel textarea:focus{border-color:var(--dsw-alias-state-business-primary,#4c8dff);background:rgba(255,255,255,.07)}'
        + '.dsh-ce-headbtn:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}'
        + '.dsh-ce-primary:disabled{opacity:.55;cursor:default}'
      document.head.appendChild(style)
      const mo = new MutationObserver(schedule)
      mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-chat-node-key', 'data-chat-flow-key'] })
      const click = event => {
        const row = event.target.closest?.('[data-dsh-ce-collapsed]')
        if (!row) return
        const seq = rowIndex.get(rowKeyOf(row))
        if (seq !== undefined) { expandedKeys.add(rowKey(seq)); row.removeAttribute('data-dsh-ce-collapsed') }
      }
      document.addEventListener('click', click)
      store.listeners.add(schedule)
      const timer = setInterval(() => { if (!store.open) refreshOverrides().catch(() => {}) }, 8000)
      const dispose = () => {
        domDisposed = true; overrideGeneration++
        mo.disconnect(); clearTimeout(scheduled); scheduled = null; clearInterval(timer)
        document.removeEventListener('click', click); store.listeners.delete(schedule)
        for (const row of document.querySelectorAll(ROW_SELECTOR)) clearRow(row)
        rowIndex.clear(); expandedKeys.clear(); style.remove()
        if (window.__dshChatEditorDispose === dispose) delete window.__dshChatEditorDispose
      }
      window.__dshChatEditorDispose = dispose
      return dispose
    }

    // ── UI ──
    const S = {
      btn: { display: 'inline-flex', alignItems: 'center', gap: '4px', height: '24px', padding: '0 8px', borderRadius: '6px', border: '1px solid var(--dsw-alias-border-l1)', background: 'transparent', color: 'var(--dsw-alias-label-secondary)', fontSize: '12px', cursor: 'pointer' },
      mini: { padding: '2px 8px', borderRadius: '6px', border: '1px solid var(--dsw-alias-border-l1)', background: 'transparent', color: 'var(--dsw-alias-label-secondary)', fontSize: '11px', cursor: 'pointer' },
      overlay: { position: 'fixed', inset: '0', background: 'rgba(0,0,0,.45)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center' },
      panel: { width: 'min(860px, 92vw)', maxHeight: '84vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--dsw-alias-bg-layer-1, #1b1b1b)', color: 'var(--dsw-alias-label-primary, #eee)', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '12px', padding: '16px', zIndex: 9999, boxShadow: '0 12px 48px rgba(0,0,0,.5)' },
      // The search bar floats above the scrolling list, so jumping never moves it out of reach.
      searchBar: { display: 'flex', alignItems: 'center', gap: '6px', margin: '2px 0 10px', padding: '6px 8px', borderRadius: '10px', border: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-layer-2, #111)', boxShadow: '0 4px 14px rgba(0,0,0,.28)', position: 'relative', zIndex: 3 },
      searchWrap: { flex: 1, display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 },
      searchIcon: { flex: 'none', opacity: .55, display: 'block' },
      list: { flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', paddingRight: '4px' },
      row: { border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '12px', padding: '10px 12px', marginBottom: '8px', background: 'var(--dsw-alias-bg-layer-2, #111)', boxShadow: '0 2px 10px rgba(0,0,0,.22)' },
      meta: { fontSize: '11px', color: 'var(--dsw-alias-label-tertiary)', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' },
      text: { whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '12.5px', margin: '6px 0', maxHeight: '160px', overflow: 'auto' },
      area: { width: '100%', maxWidth: '100%', boxSizing: 'border-box', display: 'block', fontFamily: 'inherit', fontSize: '12.5px' },
      headBtn: { height: '24px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-layer-2, #111)', color: 'var(--dsw-alias-label-secondary)', fontSize: '12px', cursor: 'pointer' },
      primary: { height: '24px', padding: '0 12px', borderRadius: '6px', border: '1px solid transparent', background: 'var(--dsw-alias-state-business-primary, #4c8dff)', color: '#fff', fontSize: '12px', fontWeight: 500, cursor: 'pointer' },
      actions: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' },
      badge: { padding: '0 6px', borderRadius: '8px', border: '1px solid var(--dsw-alias-border-l1)', fontSize: '10.5px' },
      stack: { display: 'grid', gap: '6px' },
      label: { fontSize: '11px', color: 'var(--dsw-alias-label-tertiary)' },
      toolbar: { display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginBottom: '8px' },
      chip: { padding: '3px 10px', borderRadius: '999px', border: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-layer-2, #111)', color: 'var(--dsw-alias-label-secondary)', fontSize: '11px', lineHeight: 1.5, cursor: 'pointer', outline: 'none', userSelect: 'none', display: 'inline-flex', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,.22)' },
      chipOn: { borderColor: 'var(--dsw-alias-label-tertiary)', color: 'var(--dsw-alias-label-primary)', background: 'linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.02))', boxShadow: '0 2px 8px rgba(0,0,0,.30), inset 0 0 0 1px rgba(255,255,255,.07)' },
      search: { flex: 1, minWidth: 0, padding: '2px 0', border: 'none', outline: 'none', background: 'transparent', color: 'inherit', fontSize: '12.5px' },
      arrow: { padding: '2px 8px', borderRadius: '6px', border: '1px solid var(--dsw-alias-border-l1)', background: 'transparent', color: 'var(--dsw-alias-label-secondary)', fontSize: '11px', cursor: 'pointer' },
      // Search hits: a soft amber wash instead of the browser's default yellow, so it reads as a
      // marker without fighting the app's own accent colours in either theme.
      mark: { background: 'rgba(255, 197, 61, .26)', color: 'inherit', borderRadius: '3px', padding: '0 1px' },
      thinkSnippet: { marginTop: '4px', paddingLeft: '8px', borderLeft: '2px solid var(--dsw-alias-border-l1)', color: 'var(--dsw-alias-label-secondary)', fontSize: '11px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
      thinkBox: { margin: '4px 0 6px', paddingLeft: '10px', borderLeft: '2px solid var(--dsw-alias-border-l2)', color: 'var(--dsw-alias-label-secondary)' },
      thinkHead: { fontSize: '11px', color: 'var(--dsw-alias-label-tertiary)', cursor: 'pointer', userSelect: 'none', marginBottom: '2px' },
      thinkBody: { fontSize: '12px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: '220px', overflow: 'auto' },
    }

    /** Wraps every case-insensitive occurrence of `needle` in a <mark>, leaving the rest untouched. */
    function highlightText(text, needle) {
      const src = String(text ?? '')
      if (needle === '' || src === '') return src
      const lower = src.toLowerCase()
      const parts = []
      let at = 0
      let k = 0
      for (;;) {
        const hit = lower.indexOf(needle, at)
        if (hit < 0) {
          if (at < src.length) parts.push(src.slice(at))
          return parts
        }
        if (hit > at) parts.push(src.slice(at, hit))
        parts.push(h('mark', { key: 'm' + k++, style: S.mark }, src.slice(hit, hit + needle.length)))
        at = hit + needle.length
      }
    }

    /** A short window around the first hit, so a reasoning-only match still shows its context. */
    function snippetAround(text, needle, radius = 70) {
      const src = String(text ?? '')
      const at = src.toLowerCase().indexOf(needle)
      if (at < 0) return ''
      const body = /\s/.test(needle) ? src : src.replace(/\s+/g, ' ')
      const at2 = body.toLowerCase().indexOf(needle)
      if (at2 < 0) return ''
      const start = Math.max(0, at2 - radius)
      const end = Math.min(body.length, at2 + needle.length + radius)
      return (start > 0 ? '…' : '') + body.slice(start, end) + (end < body.length ? '…' : '')
    }

    function MessageRow({ m, sessionId, editable, busy, run, highlight, matchNote, needle }) {
      const [mode, setMode] = React.useState(null)
      // The effective text may come from a log rewrite (projection) or a display-only override;
      // editing again must start from what is actually shown, not from the stored original.
      const shown = m.override && m.override.hidden !== true && typeof m.override.text === 'string' && m.override.text.length > 0 ? m.override.text : m.text
      const [draft, setDraft] = React.useState(shown)
      React.useEffect(() => { setDraft(shown) }, [shown])
      // A reply may carry reasoning alongside its text; the panel edits both together so the two
      // always describe the same reply. The reasoning shown here is the effective one — an earlier
      // thinking rewrite is already folded into m.thinking.
      const canThink = m.role === 'assistant' && typeof m.thinking === 'string' && m.thinking.length > 0
      const [draftThink, setDraftThink] = React.useState(canThink ? m.thinking : '')
      const [openThink, setOpenThink] = React.useState(true)
      React.useEffect(() => { setDraftThink(canThink ? m.thinking : '') }, [canThink, m.thinking])
      const roleLabel = t('role_' + m.role)
      const canContext = editable && !m.contextDeleted && m.onSurface && m.role !== 'checkpoint'
      const hasDisplayRow = m.role !== 'tool' || [...rowIndex.values()].includes(m.seq)
      const note = !hasDisplayRow && !canContext ? (zh ? '此工具结果没有独立显示行，暂不支持显示修改。' : 'This tool result has no independent display row; display edits are unavailable.') : m.role === 'tool' ? t('tool_note') : m.role === 'checkpoint' ? t('cp_note') : ''
      const close = () => setMode(null)
      const reasoningHit = needle !== '' && typeof m.thinking === 'string' && m.thinking.toLowerCase().includes(needle)
      const body = mode === null
        ? h('div', null,
          h('div', { style: S.text },
            m.override && m.override.hidden ? '—' : highlightText(shown, needle),
            reasoningHit && needle !== '' && (!openThink || !m.thinking) && !String(shown ?? '').toLowerCase().includes(needle)
              ? h('div', { style: S.thinkSnippet }, highlightText(snippetAround(m.thinking, needle), needle))
              : null),
          m.thinking
            ? h('div', { style: S.thinkBox },
              h('div', { style: S.thinkHead, onClick: () => setOpenThink(v => !v) }, (openThink ? '▾ ' : '▸ ') + t('think_short')),
              openThink ? h('div', { style: S.thinkBody }, m.thinking) : null)
            : null)
        : mode === 'edit' && canThink
          ? h('div', { style: S.stack },
            h('div', { style: S.label }, t('think_label')),
            h('textarea', { rows: 6, style: S.area, value: draftThink, onChange: e => setDraftThink(e.target.value) }),
            m.hasText === false
              ? h('div', { style: S.label }, t('tool_step_note'))
              : h('div', { style: S.stack },
                h('div', { style: S.label }, t('text_label')),
                h('textarea', { rows: 6, style: S.area, value: draft, onChange: e => setDraft(e.target.value) })))
          : h('textarea', { rows: 6, style: S.area, value: draft, onChange: e => setDraft(e.target.value) })
      const collapsed = m.override !== undefined && m.override.collapsed === true
      const deleted = m.override !== undefined && m.override.hidden === true
      const actions = mode === null
        ? h('div', { style: S.actions },
          editable && !m.contextDeleted && (hasDisplayRow || canContext) ? h('button', { style: S.mini, disabled: busy, onClick: () => setMode('edit') }, t('edit_msg')) : null,
          // No undo button: the model's copy is replaced by a record appended to the log, and
          // putting the message back on screen while the model still cannot see it is exactly the
          // split between "your view" and "its view" that this panel no longer has. The original is
          // in the log either way.
          editable && !deleted && hasDisplayRow ? h('button', {
            style: S.mini,
            disabled: busy,
            onClick: () => {
              // No confirmation step: the panel row already says what the action does, and the
              // native dialog cannot be styled to match the app.
              return run(async () => {
                // Context changes have one authoritative log write; display is derived from it.
                if (canContext) return api('/context/delete', { sessionId, seq: m.seq })
                return api('/display', { sessionId, seq: m.seq, original: m.text, hidden: true })
              })
            },
          }, t('del_msg')) : null,
          editable && hasDisplayRow ? h('button', {
            style: S.mini,
            disabled: busy,
            onClick: () => run(() => api('/display', {
              sessionId, seq: m.seq, original: m.text,
              collapsed: !collapsed,
              ...(m.override && typeof m.override.text === 'string' && m.override.text.length > 0 ? { text: m.override.text } : {}),
              ...(deleted ? { hidden: true } : {}),
            })),
          }, collapsed ? t('uncollapse') : t('collapse')) : null,
          editable && m.forkBoundary !== undefined ? h('button', { style: S.mini, onClick: () => setMode('fork') }, t('fork')) : null,
          note ? h('span', { style: S.meta }, note) : null,
        )
        : h('div', { style: S.actions },
          h('button', {
            className: 'dsh-ce-primary',
            style: S.primary,
            disabled: busy,
            onClick: () => {
              if (mode === 'edit') {
                return run(async () => {
                  if (canContext) {
                    // A tool-use step has no text block to rewrite; sending text would be refused by
                    // the host, so save the thinking alone.
                    const payload = canThink && m.hasText === false
                      ? { thinking: draftThink }
                      : { text: draft, ...(canThink ? { thinking: draftThink } : {}) }
                    return api('/context/edit', { sessionId, seq: m.seq, ...payload })
                  }
                  return api('/display', { sessionId, seq: m.seq, text: draft, original: m.text })
                }, close)
              }
              return run(() => api('/fork', { sessionId, seq: m.seq, text: draft }), close)
            },
          }, mode === 'fork' ? t('fork') : t('save')),
          h('button', { style: S.mini, onClick: close }, t('cancel')),
          mode === 'fork' ? h('span', { style: S.meta }, t('fork_send')) : null,
        )
      return h('div', {
        style: {
          ...S.row,
          ...(m.onSurface ? {} : { opacity: .6 }),
          ...(highlight ? { borderColor: 'var(--dsw-alias-state-business-primary, #4c8dff)', boxShadow: '0 0 0 2px rgba(76,141,255,.22), 0 2px 10px rgba(0,0,0,.22)' } : {}),
        },
        'data-seq': m.seq,
      },
        h('div', { style: S.meta },
          h('b', null, roleLabel),
          matchNote ? h('span', { style: S.badge }, matchNote) : null,
          h('span', null, 'seq ' + m.seq),
          m.turn === null ? null : h('span', null, 'turn ' + m.turn),
          m.onSurface ? null : h('span', { style: S.badge }, m.shadowedBy === undefined ? t('off_surface') : t('shadowed')),
          m.override && m.override.hidden ? h('span', { style: S.badge }, t('hidden_badge')) : null,
          m.override && m.override.collapsed ? h('span', { style: S.badge }, t('collapsed_badge')) : null,
          m.override && !m.override.hidden && typeof m.override.text === 'string' && m.override.text.length > 0
            ? h('span', { style: S.badge }, t('edited_badge')) : null,
          h('span', null, m.chars + ' chars'),
        ),
        body,
        actions,
      )
    }

    function Panel({ sessionId }) {
      const s = useStore()
      const [data, setData] = React.useState(() => readPayloadCache(sessionId))
      const [busy, setBusy] = React.useState(false)
      const [note, setNote] = React.useState('')
      const [category, setCategory] = React.useState('all')
      const [query, setQuery] = React.useState('')
      const [cursor, setCursor] = React.useState(0)
      // Every hook must stay above the early returns below (open / no data): a ref declared after
      // them would change the hook count between the loading and loaded renders.
      const noteTimer = React.useRef(0)
      const lastFocused = React.useRef(undefined)
      React.useEffect(() => { setData(readPayloadCache(sessionId)) }, [sessionId])
      const requestVersion = React.useRef(0)
      const lifecycle = React.useRef(0)
      const activeAction = React.useRef(false)
      const reload = React.useCallback(async () => {
        const version = ++requestVersion.current
        const requestId = beginMessagesRequest(sessionId)
        const cached = readPayloadCache(sessionId)
        if (cached) setData(cached)
        let d
        try { d = await api('/messages?sessionId=' + encodeURIComponent(sessionId)) }
        catch (error) { d = { ok: false, messages: [], message: String(error?.message ?? error) } }
        if (version !== requestVersion.current || sessionId !== store.sessionId) return
        writePayloadCache(sessionId, d, requestId)
        setData(d)
        if (d && d.ok === false) setNote(t('failed') + (d.message ?? ''))
        await refreshOverrides()
      }, [sessionId])
      React.useEffect(() => {
        const epoch = ++lifecycle.current
        activeAction.current = false; setBusy(false); setNote(''); lastFocused.current = undefined
        if (s.open) reload().catch(error => { if (lifecycle.current === epoch) setNote(t('failed') + String(error?.message ?? error)) })
        return () => { requestVersion.current++; lifecycle.current++ }
      }, [s.open, reload])
      React.useEffect(() => {
        if (!s.open || s.focusSeq === undefined || data === null) return
        // Only for the open that asked for it: a later reload (after an edit) must leave the list
        // where the reader left it instead of pulling it back to the entry point.
        if (lastFocused.current === s.focusSeq) return
        const el = document.querySelector('.dsh-ce-panel [data-seq="' + s.focusSeq + '"]')
        if (el) { el.scrollIntoView({ block: 'center' }); lastFocused.current = s.focusSeq }
      }, [s.open, s.focusSeq, data])

      // Scope (this turn / this message) narrows the source list; the category chip and the
      // search box narrow it further, so a jump never leaves the category the reader picked.
      const messages = data && Array.isArray(data.messages) ? data.messages : []
      const scope = s.scope
      const scoped = scope === undefined || scope === null ? messages : messages.filter(m => (
        scope.kind === 'user'
          ? m.seq === scope.seq
          : m.turn === scope.turn && (m.role === 'assistant' || m.role === 'tool')
      ))
      const needle = query.trim().toLowerCase()
      const thinkingOf = m => (typeof m.thinking === 'string' ? m.thinking : '')
      const inCategory = m => category === 'all' ? true
        : category === 'thinking' ? thinkingOf(m).length > 0
          : category === 'tool' ? m.role === 'tool'
            : category === 'context' ? m.role === 'context'
              : category === 'checkpoint' ? m.role === 'checkpoint'
                : category === 'user' ? m.role === 'user'
                  : category === 'assistant' ? m.role === 'assistant'
                    : true
      const haystack = m => category === 'thinking'
        ? thinkingOf(m).toLowerCase()
        : ((m.text ?? '') + (category === 'all' ? '\n' + thinkingOf(m) : '')).toLowerCase()
      const categoryRows = scoped.filter(inCategory)
      const matches = needle === '' ? categoryRows : categoryRows.filter(m => haystack(m).includes(needle))
      const index = matches.length === 0 ? 0 : Math.min(cursor, matches.length - 1)
      // Scroll to the result the counter points at; it re-runs on every keystroke and every jump.
      React.useEffect(() => {
        if (!s.open || matches.length === 0) return
        const el = document.querySelector('.dsh-ce-panel [data-seq="' + matches[index].seq + '"]')
        if (el) el.scrollIntoView({ block: 'center' })
      }, [s.open, needle, category, cursor])
      if (!s.open) return null
      // Nothing cached yet: stay invisible for the ~200ms the first fetch takes rather than showing
      // an empty shell that then visibly re-populates.
      if (data === null) return null
      const showNote = (message, clearAfter) => {
        setNote(message)
        if (noteTimer.current) { clearTimeout(noteTimer.current); noteTimer.current = 0 }
        if (clearAfter) noteTimer.current = setTimeout(() => { setNote('') }, clearAfter)
      }
      const run = async (fn, after) => {
        if (activeAction.current) return
        activeAction.current = true
        const epoch = lifecycle.current
        const current = () => epoch === lifecycle.current && sessionId === store.sessionId
        setBusy(true); setNote(t('busy'))
        try {
          const r = await fn()
          if (!current()) return
          if (r && r.ok === false) showNote(t('failed') + (r.message ?? ''), 8000)
          else {
            // Success needs no words: the row itself changes (edited badge / disappearing line), and a
            // branch is the one case whose result is not visible here, so only that one is reported.
            const branched = r && r.sessionId && r.sessionId !== sessionId
            showNote(branched ? t('forked', { id: r.sessionId }) : '', branched ? 8000 : 0)
            after?.()
            await reload()
          }
        } catch (error) { if (current()) setNote(t('failed') + String(error?.message ?? error)) } finally { if (current()) { activeAction.current = false; setBusy(false) } }
      }
      const canJump = needle !== '' && matches.length > 0
      // Two arrows: next wraps forward, previous wraps back; the counter always reflects `index`.
      const jumpTo = delta => {
        if (!canJump) return
        setCursor((index + delta + matches.length) % matches.length)
      }
      const jump = () => jumpTo(1)
      const counter = matches.length === 0 ? t('search_none')
        : needle === '' ? t('search_total', { n: matches.length })
          : (index + 1) + '/' + matches.length
      const CHIPS = [['all', 'cat_all'], ['user', 'cat_user'], ['assistant', 'cat_assistant'], ['thinking', 'cat_thinking'], ['tool', 'cat_tool'], ['context', 'cat_context'], ['checkpoint', 'cat_checkpoint']]
      return h('div', { style: S.overlay, onClick: e => { if (e.target === e.currentTarget) store.set({ open: false, focusSeq: undefined }) } },
        h('div', { className: 'dsh-ce-panel', style: S.panel },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' } },
            h('b', null, t('title')),
            scope === undefined || scope === null ? null : h('span', { style: S.badge }, scope.kind === 'user' ? t('scope_user') : t('scope_turn')),
            h('span', { style: S.meta }, data && data.editable === false ? t('readonly') : ''),
            h('span', { style: { flex: 1 } }),
            scope === undefined || scope === null ? null
              : h('button', { className: 'dsh-ce-headbtn', style: S.headBtn, onClick: () => store.set({ scope: undefined, focusSeq: undefined }) }, t('scope_all')),
            scope !== undefined && scope !== null && scope.kind === 'turn' && typeof scope.seq === 'number'
              ? h('button', {
                className: 'dsh-ce-headbtn',
                style: S.headBtn,
                disabled: busy,
                title: t('clear_turn_hint'),
                onClick: () => run(() => api('/context/clear-turn', { sessionId, seq: scope.seq })),
              }, t('clear_turn'))
              : null,
            h('button', { className: 'dsh-ce-headbtn', style: S.headBtn, onClick: () => store.set({ open: false, focusSeq: undefined, scope: undefined }) }, t('close')),
          ),
          h('div', { style: S.searchBar },
            h('div', { style: S.searchWrap },
              h('svg', { width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none', style: S.searchIcon, 'aria-hidden': 'true' },
                h('circle', { cx: 7, cy: 7, r: 4.4, stroke: 'currentColor', strokeWidth: 1.5 }),
                h('path', { d: 'M10.4 10.4 L14 14', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' })),
              h('input', {
                style: S.search,
                placeholder: t('search_ph'),
                value: query,
                onChange: e => { setQuery(e.target.value); setCursor(0) },
                onKeyDown: e => { if (e.key === 'Enter') { e.preventDefault(); jumpTo(e.shiftKey ? -1 : 1) } },
              }),
            ),
            h('span', { style: { ...S.meta, minWidth: '52px', justifyContent: 'flex-end' } }, counter),
            h('button', {
              style: canJump ? S.arrow : { ...S.arrow, opacity: .45, cursor: 'default' },
              title: t('search_prev'),
              disabled: !canJump,
              onClick: e => { e.currentTarget.blur(); jumpTo(-1) },
            }, '◀'),
            h('button', {
              style: canJump ? S.arrow : { ...S.arrow, opacity: .45, cursor: 'default' },
              title: t('search_next'),
              disabled: !canJump,
              onClick: e => { e.currentTarget.blur(); jumpTo(1) },
            }, '▶'),
          ),
          h('div', { style: S.toolbar },
            // Deliberately a span, not a button: a native button keeps DOM focus after the click and
            // the shell paints a focus ring on it, which then looks like a second active category.
            CHIPS.map(([id, label]) => h('span', {
              // Keying by category remounts the strip on every switch: a reused chip node was
              // keeping its old "selected" border painted (the white edge), so the previous
              // category looked active until something forced a repaint.
              key: id + ':' + category,
              role: 'button',
              className: 'dsh-ce-chip',
              style: category === id ? { ...S.chip, ...S.chipOn } : S.chip,
              onMouseDown: e => e.preventDefault(),
              onClick: () => { setCategory(id); setCursor(0) },
            }, t(label))),
          ),
          h('div', { style: { ...S.meta, marginBottom: '8px' } }, t('hint')),
          note ? h('div', { style: { ...S.meta, marginBottom: '8px' } }, note) : null,
          h('div', { style: S.list },
            matches.length === 0 ? h('div', { style: S.meta }, t('search_none'))
                : matches.map(m => h(MessageRow, {
                  key: m.seq, m, sessionId, editable: data.editable !== false, busy, run, reload, needle,
                  highlight: needle !== '' && matches[index] !== undefined && matches[index].seq === m.seq,
                  // When the query only hit the reasoning, say so — otherwise the row looks like a false positive.
                  matchNote: needle !== '' && !(m.text ?? '').toLowerCase().includes(needle)
                    && thinkingOf(m).toLowerCase().includes(needle) ? t('cat_thinking') : null,
                })),
          ),
        ),
      )
    }

    /** Session-header entry: publishes the current session id and hosts the panel. */
    function HeaderEntry(props) {
      const sessionId = props.sessionId
      // chat nodes come from the `chat` hook (0.1.x and 0.2.x both register it); the old
      // `useSession(...).chat` lookup never resolved, which left the display half inert.
      const useChat = props.useChat ?? props.useSession
      const nodes = useChat(snapshot => (snapshot?.nodes ?? snapshot?.chat?.nodes)?.values?.() ?? EMPTY_NODES)
      React.useEffect(() => {
        if (sessionId && store.sessionId !== sessionId) {
          overrideGeneration++
          rowIndex.clear(); expandedKeys.clear()
          store.set({ sessionId, overrides: [], open: false, focusSeq: undefined })
          refreshOverrides().catch(() => {})
        }
        return () => {
          if (store.sessionId === sessionId) { overrideGeneration++; rowIndex.clear(); store.set({ sessionId: undefined, overrides: [], open: false }); schedule() }
        }
      }, [sessionId])
      React.useEffect(() => { if (store.sessionId === sessionId) setRows(nodes) }, [sessionId, nodes])
      if (!sessionId) return null
      return h(React.Fragment, null,
        h('button', {
          style: S.btn,
          title: t('open'),
          onPointerEnter: () => prefetchMessages(sessionId),
          onFocus: () => prefetchMessages(sessionId),
          onClick: () => store.set({ open: true, focusSeq: undefined, scope: undefined }),
        }, PencilIcon({ size: 18 })),
        h(Panel, { sessionId }),
      )
    }

    /** Inline action on a finished assistant message: open the panel focused on it. */
    function AssistantAction(props) {
      const messageId = props.messageId
      const version = React.useRef(0)
      React.useEffect(() => () => { version.current++ }, [props.sessionId])
      return h('button', {
        style: { ...S.mini, border: 'none', padding: '2px 6px', display: 'inline-flex', alignItems: 'center' },
        title: t('open'),
        onPointerEnter: () => prefetchMessages(props.sessionId ?? store.sessionId),
        onClick: async () => {
          const sid = props.sessionId ?? store.sessionId
          if (!sid) return
          const request = ++version.current
          const requestId = beginMessagesRequest(sid)
          let d
          try { d = await api('/messages?sessionId=' + encodeURIComponent(sid)) }
          catch { if (request === version.current && store.sessionId === sid) store.set({ open: true, focusSeq: undefined }); return }
          if (request !== version.current || store.sessionId !== sid) return
          writePayloadCache(sid, d, requestId)
          const hit = Array.isArray(d.messages) ? d.messages.find(m => m.messageId === messageId) : undefined
          // The turn-tail button is about this reply, not the whole conversation: think, tool calls
          // and text of this turn are what the reader came to fix.
          const scope = hit && typeof hit.turn === 'number' ? { kind: 'turn', turn: hit.turn, seq: hit.seq } : undefined
          store.set({ sessionId: sid, open: true, focusSeq: hit ? hit.seq : undefined, scope })
        },
      }, PencilIcon({ size: 16 }))
    }

    async function apply(ctx) {
      ctx.effect(startDomHalf, 'chat-editor-plus: display lifecycle')
      const slots = ctx.get('slots')
      if (slots === undefined) return
      slots.inject('conversation.session.header.actions', () => slots.register(
        { name: 'conversation.session.header.actions', id: 'chat-editor-plus', order: -4 }, HeaderEntry,
      ))
      slots.inject('conversation.chat.assistant-actions', () => slots.register(
        { name: 'conversation.chat.assistant-actions', id: 'chat-editor-plus', order: 5 }, AssistantAction,
      ))
    }

    exports.apply = apply
    // Declared so the client runner mounts this half after the slots service exists (0.1.5 orders by inject).
    exports.inject = ['slots']
    return module.exports
  },
})
