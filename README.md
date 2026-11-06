# dsh-chat-editor-plus

DeepSeek Harness 消息编辑器：改写 / 删除 / 折叠任意一条消息，或从任意一轮之前分叉会话。
本仓库是 [WZZNNE/DSH-CyberWorkStation](https://github.com/WZZNNE/DSH-CyberWorkStation) 中
`plugins/dsh-chat-editor`（MIT）针对 **DSH 桌面端 0.2.1-rc.2** 的二次开发版本。

> An edited fork of `dsh-chat-editor` from DSH-CyberWorkStation, adapted for the
> DeepSeek Harness desktop client 0.2.1-rc.2. Same features, same MIT license.

## 功能

- 会话头部 ✎ 按钮打开消息面板：列出整段会话（用户、助手、注入上下文、工具结果、压缩摘要）；
- 每条完成的助手消息旁边有内联 ✎，直接定位到那条；
- **工具结果也可改**：面板里工具结果行的「改」走上下文投影，只替换内容块，`toolCallId` / `source` /
  配对关系全部不动，模型会把改后的文本当成工具的原始返回；
- 三种模式，按操作选择：
  - **显示（display）**：只改你看到的内容，日志与模型上下文不动（`$DSH_HOME/chat-edits.json`）；
  - **上下文（context）**：改模型真正收到的东西。**用户消息的改写、助手回复的改写、工具结果内容的改写、以及任意删除**
    都走核心的消息投影（`registerMessageProjection` + `plugin:chat-editor-plus/rewrite` 记录，
    由 `appendPluginRecord` 写入）：模型侧 `deriveMessages()` 看到的就是新文本，删除则整条消失——
    surface 节点、seq、messageId 全部保持不变，没有占位符，也没有「用户更正了回复」之类的前缀。
    改助手回复时，文本块**原位替换**，role / id / source 不变；**thinking 默认原样保留**，也可以在同一个编辑框里
    一起改（编辑助手消息时会多出一个「思考」输入框）。改思考只替换 reasoning 块的 text，replay 签名保持不变——
    实测 DeepSeek Messages 端不校验「签名 ↔ 思考文本」的一致性，核心的 replay 校验也只比较块数量与类型，
    所以签名照发即可。原文仍在日志里：改写可以再改成原文本撤销，
    删除在面板里没有撤销按钮（模型那份已经没了，日志里仍然保留原文）。
  - **分叉（fork）**：在该轮之前复制会话（`ctx.agents.create({ seed })` + 工作区挂接），可选把编辑文本作为分叉后的第一条消息。
- 折叠只影响显示，点一下展开。

## 与原版的差异（桌面端适配）

| 改动 | 原因 |
|---|---|
| 客户端改用 **`useChat`** 读会话节点（保留旧字段回退） | 原版读 `useSession(s => s.chat.nodes)`，`SessionSnapshot` 从来没有 `chat` 字段——在 0.1.5 和 0.2.1 上这段都是死的，导致显示层的改/藏/折叠永远不生效 |
| DOM 行锚点优先读 **`data-chat-node-key`** | 0.2.x 的推理分组行 `data-chat-flow-key` 是 JSON 编码的渲染 key，不再等于节点 key |
| 删掉 `kind === 'tool'` 分支 | 0.2.x 的 chat node 没有 `tool` 这种 kind（工具结果在 `turn-process` / `assistant-step` 的 data 里） |
| 助手改写改用**消息投影**：文本块原位替换，保留 thinking 与签名 | 原来只能落成带前缀的 user 更正节点，模型一眼看穿；投影按 seq 换 message，角色/id/来源不变 |
| 思考（thinking）可在面板里改：只换 reasoning 文本，签名照旧 | 核心只校验块数量/类型，端点不校验签名与文本，所以改思考不需要重新生成 |
| 思考（thinking）改完后，**折叠摘要与展开正文同步显示新文本** | 记录同时驱动模型请求和你的界面，两边不再各说各话；按原生紧凑行距呈现，字面 `\n` 归一成换行 |
| 工具结果内容可改（只动 content 块，`toolCallId`/`source` 不变） | 核心自己的 surface 替换也规定 tool/result 只允许改 content，说明这是受支持的操作；投影路径不需要额外占位 |
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

- **助手改写的 thinking 默认不动**：新正文替换文本块，那条消息原有的 thinking 块连同 replay 签名一起保留；
  如果它内部还写着旧答案，请在同一个编辑框里把「思考」一起改掉。块数量与类型必须保持不变（核心 replay 校验
  要求与记录的块一一对应），所以不能新增/删除 reasoning 块，只能改已有块的文本。
- 旧版本写入的「助手更正节点」是真实 user 消息（带 `[The user corrected …]` 前缀），新代码不会追溯改写它；
  重新编辑一次即可改为投影记录。
- 上下文模式要求会话空闲（agent 未在生成），否则返回 409。
- 子代理会话只读。
- 卸载本插件时，若桌面端仍在运行，**已经用过投影的活跃会话**会在下一次请求前报
  `session message projection "…" was removed or replaced`（核心是 fail-closed：缓存的消息不能
  在没有解释器的情况下继续沿用，否则模型会突然看到未改写/未删除的原文）。
  这不是日志损坏：**重启一次即可恢复**，冷重放会把 `plugin:` 记录当作不可解释事件跳过，
  会话正常打开，但改写/删除的效果随之消失（原文回来）。要长期保留效果，就别卸插件，
  或者用后续的 projection-only companion 包。
- token meter 按原文计费，不统计投影后的文本；压缩摘要按投影后的文本。

## License

MIT。原始版权：`Copyright (c) 2026 DSH Suite contributors`（DSH-CyberWorkStation）；
本仓库修改部分：`Copyright (c) 2026 rumengyihua`。详见 [LICENSE](LICENSE)。
