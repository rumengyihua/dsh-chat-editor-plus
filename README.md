# dsh-chat-editor-plus

**改掉模型已经记住的那句话。**

在 DeepSeek Harness 里，一条已经发出去的消息、一段已经回过的思考、一次工具返回的结果，通常就定型了。
这个插件让你**改写或删除它们**，而且模型下一次请求直接看到改后的版本——消息本身仍留在会话里，
位置（`seq`）不变，没有占位符顶替，也没有「用户更正了回复」这种一眼穿帮的前缀。

而且**随时可以退回去**：所有修改都以追加记录的形式写在会话日志旁边，原文一个字节都没被删。
关掉插件，原对话完整回来。

## 它解决什么

- **改用户消息**：把说漏嘴/说错的话改掉、补一句，模型以为你从一开始就是这么说的。
- **改助手回复**：正文照你的写；思考块也能改（模型看到的推理和正文保持一致，不会自相矛盾）。
- **改工具结果**：把工具的返回改成你想要的内容，模型把它当成工具的原始输出。
- **删除任意一条**：用户消息、某条回复、某次工具调用与结果、或者**整轮助手输出一次清空**。
- **从任意一轮分叉**：保留前半段、换一条路继续跑。
- **只改界面**：只想自己看着顺眼、不动模型上下文时，用显示模式，日志与请求都不碰。

## 为什么可以放心用

| | |
|---|---|
| **可逆** | 每一笔修改都是一条追加记录（`plugin:chat-editor-plus/rewrite`），从不覆盖或删除原文。想还原：再改成原文本，或者直接停用插件——**原对话无损恢复**。 |
| **不破坏会话** | 消息在会话表层的位置、`seq`、`messageId` 全部保留，不改写日志、不伪造事件，也不新增占位消息。 |
| **不碰核心** | 只用核心公开的 `registerMessageProjection` 与 `appendPluginRecord`，没有 patch、没有 monkey-patch。 |
| **对你透明** | 面板里就是那条消息的新旧对照；改了什么、删了什么一目了然。 |

> 想彻底恢复时：停用/卸载插件，或重启桌面端。已经写过记录的会话会把那些记录当作「无法解释的事件」跳过，
> 于是你看到的、模型读到的，都回到修改前。

## 三种入口

- **会话标题栏**的铅笔：整段会话，配合分类和搜索，找哪条改哪条。
- **每条回复下方**的铅笔：只看**本轮**——这次回复的正文、思考块，以及这次调用产生的工具结果。
- **每条自己发的消息下方**的铅笔：只看**这一条**。

面板顶部显示当前范围，点「显示全部」回到整段会话；停在「本轮」时多一个**清除本轮回复**，
一次删掉这一轮的全部助手输出（正文、思考、工具调用与工具结果），用户消息与注入上下文保留。

## 面板

- **搜索**：顶部独立悬浮的搜索框（放大镜 + 关键词），列表滚动时它不跟着滚；`回车` 下一个、
  `Shift+回车` 上一个，右侧显示「第几个 / 共几个」，命中词在对白里高亮。
- **分类**：全部 / 我 / 助手 / 思考 / 工具结果 / 上下文 / 压缩摘要。搜索只在当前分类里进行，
  分类与入口范围叠加生效。
- **思考默认展开**：每条助手消息上方直接给出它的 reasoning，点标题可折叠；折叠时若搜索命中思考，
  会在正文下方补一段高亮摘录。
- 打开面板走预取 + 缓存，点击即出内容，不会先闪一个空壳。

## 三种模式

| 模式 | 作用 | 存储 |
|---|---|---|
| **显示** | 只改你看到的内容，日志与模型上下文不动 | `$DSH_HOME/chat-edits.json` |
| **上下文** | 改模型真正收到的东西：用户改写、助手改写、工具结果改写、任意删除都走消息投影 | 会话日志内的 `plugin:` 记录 |
| **分叉** | 在该轮之前复制会话（`ctx.agents.create({ seed })` + 工作区挂接），可选把编辑文本作为分叉后的第一条消息 | 新会话 |

上下文模式的细节：

- 改写走 `registerMessageProjection`：`deriveMessages()` 在这个 `seq` 上直接产出新消息，surface 节点不动。
- 删除是投影返回 `null`：模型那份整条消失，日志里仍在。
- 助手改写**原位替换**第一个文本块，`role` / `id` / `source` 不变；**thinking 默认原样保留**，
  也可以在同一个编辑框里一起改（编辑助手消息时多出一个「思考」输入框）。
- 改思考只替换 reasoning 块的 `text`，replay 签名保持不变：实测 DeepSeek Messages 端点不校验
  「签名 ↔ 思考文本」的一致性，核心的 replay 校验也只比较块数量与类型，所以签名照发即可。
- 工具结果只替换 `content` 块，`toolCallId` / `source` / 配对关系不动。
- 删除带工具调用的助手消息时，会**级联删除**它发起的工具结果——请求里不能出现「调用过但没返回」的 call。

## 安装（桌面端）

DSH 桌面端没有 `dsh` CLI 在 PATH 上，用自带的那份：

```bash
# 把本仓库放到任意目录，例如 D:\workplace\dsh-chat-editor-plus
D:\dsh\resources\runtime\cli\bin\dsh.cmd plugin --profile desktop add file:D:\workplace\dsh-chat-editor-plus
```

也可以走应用内「插件管理器」：本地路径安装，装完会自动把包登记进
`~/.dsh/profiles/desktop/package.json` 的 `dsh.profile.bundles`（因为本包声明了 `dsh.bundle.patch`）。
装好后重启桌面端，会话头部就会出现铅笔图标。

包名、插件 id、路由前缀、槽位 id 都带 `-plus`，因此**可以和上游版本并存安装**，互不抢路由与 slot。

## 适配范围

- **DSH 运行时：`>=0.2.1-rc.2 <0.3.0`**（`package.json` 的 `engines.dsh`）。桌面端在导入插件前会拿它和
  运行时版本做兼容性检查，不满足时安装/启动会被拒绝；可用
  `dsh plugin allow-version <package@version> --dsh-version <runtime> --accept-risk` 逐版本豁免。
  该范围覆盖 0.2.x 的全部正式版与预发布版，不含 0.2.1-rc.2 之前与 0.3.0 及以后。
- **实测环境**：DSH 桌面端 **0.2.1-rc.2**（Windows x64），profile `desktop`；0.2.2 及以上未实测。
- **依赖的核心契约**：`SessionStore.registerMessageProjection`、`appendPluginRecord`、
  `Session.surface` / `deriveMessages` / `snapshotEvents` / `eventAt` / `flush`、
  `webServer.register({kind:'prefix'})`、`ctx.agents.get/create/resume`、
  `agent.runMaintenance` / `send` / `status`、`agentPresets.resolve/mount`、
  `workspaceRegistry.list/attachSession`、`tokenMeter.estimateMessage`、
  `toolPairingBalancedBefore/After`、`llm.createUserMessage`。
  其中投影契约（`project(event, {events, baseSeq, messages, nodes})` 的形状、投影被移除时的 fail-closed 行为）
  一旦变化，本插件需要同步适配。
- **依赖包**：`@deepseek-ai/dsh-home-paths`（必需）、`@deepseek-ai/dsh-session`（改写/删除必需）；
  `@deepseek-ai/dsh-llm`、`@deepseek-ai/dsh-compaction` 为可选（只影响分叉首条消息与 token 估算，缺失时相应接口 503）。
- **为什么需要 0.2.1-rc.2 以上**：更早的核心（如 0.1.5）只有一个同名不同义的 `session-projection`
  （面向客户端的日志派生状态注册表），没有消息投影所需的 `registerMessageProjection` 与 `appendPluginRecord`。
  缺这两个 API 时，改写助手消息只能退回 surface replace——助手消息无法以助手身份被替换，删除必须留占位节点。

## 已知限制

- **改的是「模型看到的那一份」，不是全库替换**：删除或改写一条消息，不会顺带清理其他消息里对它的引用。
  最常见的坑是**保留下来的助手消息的 thinking**——它可能原样写着被删内容（实测过：删掉一轮问答后，
  模型仍能从另一条回复的 thinking 里说出被删的字符串）。要彻底无痕，得把引用它的思考也一起改掉。
- **thinking 的块结构不能变**：只能替换已有 reasoning 块的文本，不能增删 thinking 块——
  核心的 replay 校验要求块数量与类型和 `replayState` 一一对应。同理，只发起了工具调用的助手步骤
  不能补正文（会多出 text 块），只能改它的思考。
- **改思考后界面同步显示**：折叠摘要与展开正文都换成新文本，但按原生紧凑行距呈现，
  原生空行分段会被压成单行换行；发给模型的仍是你在输入框里写的那份文本。
- token meter 仍按**原文**计费，不统计投影后的文本；压缩摘要则按投影后的文本。
- 旧版本写入的「助手更正节点」是真实 user 消息（带 `[The user corrected …]` 前缀），新代码不会追溯改写，
  在面板里重新编辑一次即可改为投影记录。
- 上下文模式要求会话空闲（agent 未在生成），否则返回 409；子代理会话只读。
- **运行中卸载**插件时，已经用过投影的活跃会话会在下一次请求前报
  `session message projection "…" was removed or replaced`——这是核心的 fail-closed 保护：
  不能在缺少解释器时静默沿用缓存消息，否则模型会突然看到未改写/未删除的原文。
  这不是日志损坏，**重启一次即可恢复**，之后会话正常打开、原文回来（也就是上面说的无损恢复）。

## 与原版的差异（桌面端适配）

| 改动 | 原因 |
|---|---|
| 客户端改用 **`useChat`** 读会话节点（保留旧字段回退） | 上游读 `useSession(s => s.chat.nodes)`，`SessionSnapshot` 从来没有 `chat` 字段——在 0.1.5 和 0.2.1 上这段都是死的，显示层的改/藏/折叠永远不生效 |
| DOM 行锚点优先读 **`data-chat-node-key`** | 0.2.x 的推理分组行 `data-chat-flow-key` 是 JSON 编码的渲染 key，不再等于节点 key |
| 删掉 `kind === 'tool'` 分支 | 0.2.x 的 chat node 没有 `tool` 这种 kind（工具结果在 `turn-process` / `assistant-step` 的 data 里） |
| 助手改写改用**消息投影**：文本块原位替换，保留 thinking 与签名 | surface replace 只能落成带前缀的 user 更正节点，模型一眼看穿 |
| 思考可在面板里改：只换 reasoning 文本，签名照旧 | 核心只校验块数量/类型，端点不校验签名与文本 |
| 思考改完后**折叠摘要与展开正文同步显示** | 记录同时驱动模型请求与界面，两边不再各说各话 |
| 工具结果内容可改（只动 content 块） | 核心自己的 surface 替换也规定 tool/result 只允许改 content |
| 用户改写 / 删除改用**消息投影**（`lib/projection.js`） | surface replace 必须插入节点、且助手消息不能以助手身份替换 |
| 删除助手消息时**级联删除**其工具结果 | 请求里不能出现「调用过但没返回」的 call |
| `dsh-cyberworkstation-kit` 的两个文件 **vendored 进 `lib/kit/`** | 该包只存在于上游仓库、未发布 npm |
| 包名 / 插件 id / 路由 / 槽位 id 加 `-plus` | 可与上游版本并存安装 |
| 编辑后的正文**原位替换**气泡里的文本节点 | 旧做法隐藏整行再插裸 div，气泡样式、对齐、行内时间全丢 |
| 去掉 `window.confirm` 确认框 | 桌面端把原生确认框画成与主题不匹配的系统对话框；面板行本身已写明后果 |
| 新增分类 / 搜索 / 清除本轮 / 预取缓存 | 消息多了以后按条找太慢 |

## 致谢

本项目基于 [WZZNNE/DSH-CyberWorkStation](https://github.com/WZZNNE/DSH-CyberWorkStation) 中的
`plugins/dsh-chat-editor`（MIT）——最初的插件结构、面板与显示覆盖都来自那里，感谢原作者与贡献者。
本仓库是针对 DSH 桌面端的适配分支，在上述基础上补齐了桌面端兼容、消息投影式改写/删除、思考与工具结果编辑、
以及面板的搜索与分类。

MIT。原始版权：`Copyright (c) 2026 DSH Suite contributors`；
本仓库修改部分：`Copyright (c) 2026 rumengyihua`。详见 [LICENSE](LICENSE)。
