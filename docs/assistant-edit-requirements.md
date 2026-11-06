# 需求：改写 AI 回复（assistant message），且模型不可察觉

> 目标：把某条 assistant 回复的正文换成新文本，**不重新生成**、不新增 user 消息、
> 不出现任何“被更正”的痕迹；后续请求里模型看到的是新文本，UI 也显示新文本。
> 约束：只使用核心公开 API（`registerMessageProjection` + `appendPluginRecord`），不改核心。

## 1. 现状（为什么现在做不到）

- `/context/edit` 对 assistant 走 `replaceRange`：`session.append('compaction/prune', …)` +
  `session.append('user/message', {surfaceOp:'replace'}, {sourceEventSeqs})`。
- 之所以落成 **user 角色**，是因为核心禁止 `assistant/message` 携带 `sourceEventSeqs`
  （`dsh-session/lib/index.js:316`），surface replace 无法把一条 assistant 换成 assistant。
- 于是模型看到一条带 `[The user corrected the assistant's earlier reply. …]` 前缀的 user 消息 →
  **一眼看出是人为更正**，不满足“不可察觉”。
- 另外历史 thinking 会被原样回放（带签名），只改正文会与新推理矛盾。

## 2. 功能需求

### F1 入口与交互
- F1.1 每条 assistant 消息保留 ✎ 入口（turn-tail 的 `conversation.chat.assistant-actions`）；
  面板中 assistant 行也可编辑。
- F1.2 编辑框预填**当前生效文本**（投影后的文本），不是原文。
- F1.3 保存直接生效，无确认框（与 user 编辑一致）。
- F1.4 支持多行与 Markdown 原文；保存即渲染。

### F2 无痕改写（核心）
- F2.1 写入一条投影记录，把目标 seq 的 message 文本替换为新文本。
- F2.2 请求里**不得**出现：旧正文、`[The user corrected …]` 前缀、额外 user 消息、
  `compaction/prune` 占位。
- F2.3 该消息的 `id` / `seq` / 在 surface 的位置保持不变。
- F2.4 只替换 `type:'text'` 块；`tool-call` 块及其顺序、id 原样保留；不新增/删除工具调用。
- F2.5 记录格式带 `version`，便于后续扩展（如 v2 增加 thinking 策略字段）。

### F3 thinking 处理（关键决策）
- F3.1 已定策略（用户 m02902 + m02970）：默认**保留**该条消息的 reasoning/thinking 块及其 replay 签名；
  同时在编辑助手消息时提供「思考」输入框，可以把 reasoning 文本一起改掉。
- F3.2 改 thinking 只替换 reasoning 块的 `text`，**签名原样保留**；块数量/类型不变（核心 replay 校验
  要求与 `replayState.blocks` 一一对应，不能增删块）。
- F3.3 不伪造签名：签名是服务端下发的 36 字符类 UUID 标识，不含内容摘要；实测（probe4，2026-11-06）
  改 thinking 文本后回放仍 200 接受 → 端点不校验「签名 ↔ 文本」。
- F3.4 不因缺 thinking 而让请求失败：DeepSeek 侧 `requiresReasoningContentOnAssistantMessages`
  会补空 `reasoning_content`；Anthropic 系无 thinking 可正常发送。
- F3.5 记录里 `targets` 用 `text` / `thinking` 两个可选字段，缺省表示该字段不动。

### F4 删除助手回复（回归项，已实现）
- F4.1 投影置 `null`；带 `tool-call` 时级联删除对应 `tool/result`。
- F4.2 单独删除 `tool/result` 必须拒绝，并给出可操作提示。
- F4.3 删除后 UI 与面板一致隐藏，且可被后续记录恢复（可逆）。

### F5 显示一致性
- F5.1 UI 用**原位替换**方式显示新文本（保留气泡、对齐、动作栏、时间）。
- F5.2 面板显示「已改」徽标，可查看原文。
- F5.3 显示层不写 sidecar，直接解释日志记录（与模型层同源）。

### F6 可逆与追溯
- F6.1 再次编辑覆盖前一次（后写记录优先）。
- F6.2「还原原文」= 追加一条把文本改回原文的记录（不删记录）。
- F6.3 原始文本永久保留在日志中。

### F7 边界与拒绝
- F7.1 压缩摘要（compaction）不通过本入口改写。
- F7.2 工具结果不可单独改写（保持现状）。
- F7.3 会话正在生成时返回 409，提示稍后再试。
- F7.4 子代理会话只读。
- F7.5 目标 seq 已不在 surface（被 replace 遮蔽）时返回 409 并提示刷新。

### F8 上下文影响
- F8.1 只影响目标消息，后续消息不变。
- F8.2 分叉：分叉点之前的记录会复制到子会话，效果同样生效。
- F8.3 与压缩共存：压缩摘要按投影后文本生成（核心已如此）。

### F9 多 provider 兼容
- F9.1 生成的请求在 deepseek-account / openai / anthropic 兼容路径下均可序列化。
- F9.2 不得出现空 content + 无 tool_calls 的 assistant 消息（会被适配器跳过或报错）。

### F10 已知限制（文档写明）
- F10.1 token meter 仍按原文计费。
- F10.2 若其它**存活**的 assistant 消息在其 thinking/正文里引用了被改写的旧内容，
  这些内容仍会随历史回放（“联动清理”见 OI 待办）。

## 3. 非功能需求
- N1 不改核心；只用 `ctx.sessions.registerMessageProjection` 与 `@deepseek-ai/dsh-session` 的
  `appendPluginRecord`（动态 import，缺失时 503）。
- N2 单次写入原子：一次 `appendPluginRecord`，失败不落半条。
- N3 插件卸载后行为需在 README 写清（与 OI-1 一致）。
- N4 所有新增逻辑可在 node 里用纯函数 + 折叠重放离线测试（不依赖桌面端）。

## 4. 验收标准
1. 改一条 assistant 回复 → 下一轮请求体中该消息的 `content` 是**新文本**，且不含旧文本、
   不含任何更正前缀、不新增 user 消息。
2. 该消息不再携带旧 thinking（或按开关策略处理）。
3. UI 气泡原位显示新文本，样式不变；面板显示「已改」。
4. 删除一条带工具调用的 assistant 回复 → 请求中既无该正文，也无对应 tool call / tool result。
5. 重启桌面端后效果保持（记录重放）；`/overrides` 能查到改写记录。
6. 离线测试：`foldSurface(events, [rewriteProjection])` 的输出与上面 1/4 一致。

## 5. 待确认（需要用户拍板）
- Q1 thinking：**保留**（m02902 已拍板；实现为 `rewriteMessage` 只换 text 块）。
- Q2 是否允许改「带工具调用」的 assistant 消息正文（推荐：允许，只动 text 块）？
- Q3 是否要「还原原文」按钮（推荐：做）？
- Q4 生成中是否强制 idle（推荐：409 拒绝）？
- Q5 是否顺带修 token meter 的原文计费（OI-2）？
