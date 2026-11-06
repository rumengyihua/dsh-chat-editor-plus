# dsh-chat-editor-plus

DeepSeek Harness 消息编辑器：改写 / 删除 / 折叠任意一条消息，或从任意一轮之前分叉会话。
本仓库是 [WZZNNE/DSH-CyberWorkStation](https://github.com/WZZNNE/DSH-CyberWorkStation) 中
`plugins/dsh-chat-editor`（MIT）针对 **DSH 桌面端 0.2.1-rc.2** 的二次开发版本。

> An edited fork of `dsh-chat-editor` from DSH-CyberWorkStation, adapted for the
> DeepSeek Harness desktop client 0.2.1-rc.2. Same features, same MIT license.

## 功能

- 会话头部 ✎ 按钮打开消息面板：列出整段会话（用户、助手、注入上下文、工具结果、压缩摘要）；
- 每条完成的助手消息旁边有内联 ✎，直接定位到那条；
- 三种模式，按操作选择：
  - **显示（display）**：只改你看到的内容，日志与模型上下文不动（`$DSH_HOME/chat-edits.json`）；
  - **上下文（context）**：改模型真正收到的东西。**用户消息的改写**和**任意删除**走核心的消息投影
    （`registerMessageProjection` + `plugin:chat-editor-plus/rewrite` 记录，由 `appendPluginRecord` 写入）：
    模型侧 `deriveMessages()` 看到的就是新文本，删除则整条消失——surface 节点、seq、messageId 全部保持不变，
    没有占位符，也没有「用户更正了回复」之类的前缀。原文仍在日志里：改写可以再改成原文本撤销，
    删除在面板里没有撤销按钮（模型那份已经没了，日志里仍然保留原文）。
    **助手文本的改写**仍走核心的压缩路径：`compaction/prune`（影子计价）+ 带
    `surfaceOp:{op:'replace'}` 与 `sourceEventSeqs` 的替换节点，在 `agent.runMaintenance` 里执行。
  - **分叉（fork）**：在该轮之前复制会话（`ctx.agents.create({ seed })` + 工作区挂接），可选把编辑文本作为分叉后的第一条消息。
- 折叠只影响显示，点一下展开。

## 与原版的差异（桌面端适配）

| 改动 | 原因 |
|---|---|
| 客户端改用 **`useChat`** 读会话节点（保留旧字段回退） | 原版读 `useSession(s => s.chat.nodes)`，`SessionSnapshot` 从来没有 `chat` 字段——在 0.1.5 和 0.2.1 上这段都是死的，导致显示层的改/藏/折叠永远不生效 |
| DOM 行锚点优先读 **`data-chat-node-key`** | 0.2.x 的推理分组行 `data-chat-flow-key` 是 JSON 编码的渲染 key，不再等于节点 key |
| 删掉 `kind === 'tool'` 分支 | 0.2.x 的 chat node 没有 `tool` 这种 kind（工具结果在 `turn-process` / `assistant-step` 的 data 里） |
| 用户改写 / 删除改用**消息投影**（`lib/projection.js`） | surface replace 必须插入一个节点、且助手消息不能以助手身份被替换；投影不挪节点、可删除、可撤销 |
| 删除助手消息时**级联删除**它发起的工具结果 | 请求里不能出现「调用过但没返回」的 call；单独删工具结果会被拒绝 |
| `dsh-cyberworkstation-kit` 的两个文件 **vendored 进 `lib/kit/`** | 该包只存在于原仓库、未发布 npm，桌面端 profile 无法解析 |
| 包名 / 插件 id / 路由 / 槽位 id 加 `-plus` | 可与原版并存安装，互不抢路由和 slot |
| 补 LICENSE、README、仓库元数据 | MIT 义务 + 区分上游 |
| 编辑后的正文**原位替换**消息气泡里的文本节点 | 旧做法隐藏整行再插一个裸 div，气泡样式、对齐和行内时间都不见了；现在只换文字，气泡与动作栏保持原生渲染 |
| 去掉 `window.confirm` 确认框 | 桌面端把原生确认框画成与主题不匹配的系统对话框；面板行本身已写明操作后果 |

## 安装（桌面端）

DSH 桌面端没有 `dsh` CLI 在 PATH 上，用自带的那份：

```bash
# 把本仓库放到任意目录，例如 D:\workplace\dsh-chat-editor-plus
D:\dsh\resources\runtime\cli\bin\dsh.cmd plugin --profile desktop add file:D:\workplace\dsh-chat-editor-plus
```

也可以走应用内「插件管理器」：本地路径安装，装完会自动把包登记进
`~/.dsh/profiles/desktop/package.json` 的 `dsh.profile.bundles`（因为本包声明了 `dsh.bundle.patch`）。
装好后重启桌面端，会话头部就会出现 ✎。

## 要求

- DSH 桌面端 **0.2.1-rc.2**（已按该版本核对 `session.append` 的 `surfaceOp`/`sourceEventSeqs` 契约、
  `compaction/prune` 计价、`toolPairingBalancedBefore/After`、`agentPresets`、`workspaceRegistry`、
  `webServer.register({kind:'prefix'})`，以及 `registerMessageProjection` / `appendPluginRecord`）。
- Node 侧依赖核心自带的 `@deepseek-ai/dsh-home-paths`、`@deepseek-ai/dsh-session`；
  `dsh-compaction` / `dsh-llm` 为可选 peer（只影响助手改写与 fork 首条消息）。

## 已知限制

- **助手文本的改写不能以助手身份生效**：核心禁止 `assistant/message` 携带 `sourceEventSeqs`，且助手的
  thinking 块会带签名回放，只换文本会自相矛盾。所以「改助手回复」在上下文模式下落成一条 user 角色的
  更正节点（带明确前缀）。若只想改自己看到的内容，用显示模式。
- 上下文模式要求会话空闲（agent 未在生成），否则返回 409。
- 子代理会话只读。
- 卸载本插件后，含 rewrite 记录的会话在缺少投影定义时无法构建请求
  （核心报 `session message projection "…" was removed or replaced`）——保留插件，或重启后重新加载。
- token meter 按原文计费，不统计投影后的文本；压缩摘要按投影后的文本。

## License

MIT。原始版权：`Copyright (c) 2026 DSH Suite contributors`（DSH-CyberWorkStation）；
本仓库修改部分：`Copyright (c) 2026 rumengyihua`。详见 [LICENSE](LICENSE)。
