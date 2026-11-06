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
  - **上下文（context）**：改模型看到的内容——按核心写压缩的方式追加
    `compaction/prune` + 带 `surfaceOp:{op:'replace'}` 与 `sourceEventSeqs` 的替换节点，
    在 `agent.runMaintenance` 里执行，原文始终留在日志里；
  - **分叉（fork）**：在该轮之前复制会话（`ctx.agents.create({ seed })` + 工作区挂接），可选把编辑文本作为分叉后的第一条消息。
- 折叠只影响显示，点一下展开。

## 与原版的差异（桌面端适配）

| 改动 | 原因 |
|---|---|
| 客户端改用 **`useChat`** 读会话节点（保留旧字段回退） | 原版读 `useSession(s => s.chat.nodes)`，`SessionSnapshot` 从来没有 `chat` 字段——在 0.1.5 和 0.2.1 上这段都是死的，导致显示层的改/藏/折叠永远不生效 |
| DOM 行锚点优先读 **`data-chat-node-key`** | 0.2.x 的推理分组行 `data-chat-flow-key` 是 JSON 编码的渲染 key，不再等于节点 key |
| 删掉 `kind === 'tool'` 分支 | 0.2.x 的 chat node 没有 `tool` 这种 kind（工具结果在 `turn-process` / `assistant-step` 的 data 里） |
| `dsh-cyberworkstation-kit` 的两个文件 **vendored 进 `lib/kit/`** | 该包只存在于原仓库、未发布 npm，桌面端 profile 无法解析 |
| 包名 / 插件 id / 路由 / 槽位 id 加 `-plus` | 可与原版并存安装，互不抢路由和 slot |
| 补 LICENSE、README、仓库元数据 | MIT 义务 + 区分上游 |

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
  `webServer.register({kind:'prefix'})`）。
- Node 侧只依赖 `@deepseek-ai/dsh-home-paths`（核心自带）；`dsh-compaction` / `dsh-llm` 为可选 peer。

## 已知限制

- **助手的消息不能以助手身份被替换**：核心禁止 `assistant/message` 携带 `sourceEventSeqs`，
  所以「改助手回复」在上下文模式下落成一条 user 角色的更正节点（带明确前缀）。
  若只想改自己看到的内容，用显示模式。
- 上下文模式要求会话空闲（agent 未在生成），否则返回 409。
- 子代理会话只读。

## License

MIT。原始版权：`Copyright (c) 2026 DSH Suite contributors`（DSH-CyberWorkStation）；
本仓库修改部分：`Copyright (c) 2026 rumengyihua`。详见 [LICENSE](LICENSE)。
