# 待解决问题

## OI-1 卸载插件后，使用过投影的会话报 `session message projection "…" was removed or replaced`

**状态**：未解决（2026-11-06 记录）

**现象**
- 运行中卸载/停用 `dsh-chat-editor-plus` 后，已经用过投影的活跃会话在下一次构建请求时报
  `session message projection "plugin:chat-editor-plus/rewrite" was removed or replaced; restore the session with its owning plugin`。
- 卸载后**重启**则不复现：冷重放把 `plugin:` 记录当作不可解释事件跳过，会话正常打开。

**机理**
- 会话 surface 是重放算出来的；`applySurfacePlan` 的 project 分支把投影对象记进 `state.projections`，
  同时缓存 `projectedMessages`。
- `SurfaceManager._assertProjections()`（`dsh-session/lib/index.js:580-585`）要求：已用过的投影必须仍在
  `registerMessageProjection` 的注册表里，否则拒绝沿用它解释出的消息缓存。
- 这是核心的 fail-closed 设计，不是日志损坏：静默退回原文会让模型看到用户以为已删除/已改写的文字。

**后果**
- 重启后会话可用，但改写/删除效果全部失效：原文回来、被删消息重新进入模型上下文、UI 也回到原始状态。
- 日志里的 `plugin:chat-editor-plus/rewrite` 记录仍然保留（`ignorable: true`，几百字节，无副作用）；
  重新安装插件后效果会因确定性重放而原样恢复。

**待选方案**
1. **companion 包**（推荐）：拆出 `dsh-chat-editor-projection`，只做 `registerMessageProjection`，
   不含 UI/路由，常驻 profile。卸载编辑器 UI 后历史仍按改写/删除后的样子呈现。
2. **`/bake` 路由**：把 rewrite 记录固化成普通 surface 状态（编辑 → 新 user/message 替换；
   删除 → `content: []` 的 developer/message 替换），之后即使没有插件，效果也保留。
   代价：messageId 变化、token 按替换后计量、不可逆。

## OI-2 token meter 按原文计费

投影只改变 `deriveMessages()` 的输出，`@deepseek-ai/dsh-token-meter` 用不带投影的
`deriveEventMessage(event)` 计价，因此面板里的 token 估算仍是原文。属于已知限制；
若要修，需要在插件侧对投影后的消息重新估算并覆盖展示值。
