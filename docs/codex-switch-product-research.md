# codex-switch 产品研究与 PRD 输入稿

## 背景与当前结论

这份文档的定位不是正式 PRD，而是 `codex-switch` 的前置分析稿。它用于整合当前对参考项目、产品边界和技术方向的判断，并为后续单独编写 `PRD/codex-switch-prd-v0.1.0.md` 提供输入。

当前已经相对明确、可以先锁定的基础结论如下：

- 产品展示名使用 `codex-switch`
- CLI 命令名使用 `codexs`
- 第一阶段做 CLI，不做 GUI
- 技术路线优先 TypeScript / Node.js

为什么需要 `codex-switch`：

- 现有方案里，有的过重
  - 偏 GUI、偏完整账号体系、偏桌面应用或代理接管，不适合只想快速管理本地 Codex provider/profile 的场景
- 也有方案过轻
  - 单个 PowerShell 脚本虽然能完成切换，但不够产品化，不利于统一安装、稳定命令调用和后续 AI 使用

当前仓库里的 [`codex-provider-switch/README.md`](./codex-provider-switch/README.md) 已经验证了一个最小可行方向：

- 切换 `~/.codex/config.toml` 顶层 `profile`
- 通过 `codex login --with-api-key` 更新当前 API key
- 在失败时回滚 `config.toml`
- 以 `providers.json` 维护 provider 到 profile / key 的映射

这说明 `codex-switch` 的第一阶段并不需要先做成重型系统。它更像一个“可分发、可维护、对 AI 友好、默认安全”的本地配置管理 CLI。

## 参考项目一：codex-auth

官方项目：

- 仓库：<https://github.com/Loongphy/codex-auth>
- README：<https://github.com/Loongphy/codex-auth/blob/main/README.md>
- 命令文档入口：<https://github.com/Loongphy/codex-auth/blob/main/docs/commands/README.md>

### 产品定位

根据官方 README，`codex-auth` 是一个 command-line tool for switching Codex accounts。它的核心对象是 Codex 的账号 / 认证状态，而不是 provider/profile 映射本身。

更具体地说，它解决的是：

- 多个 Codex 账号的保存与管理
- 当前活跃账号的切换
- 认证文件的导入导出
- 账号使用状态与限制信息的查看

因此它更接近：

- 账号管理器
- 本地认证状态切换器
- 已经产品化的全局 CLI 工具

### 安装与分发方式

根据 README，`codex-auth` 的主安装方式是 npm：

```bash
npm install -g @loongphy/codex-auth
```

同时也支持：

```bash
npx @loongphy/codex-auth list
```

README 还明确写到 npm 包支持 Linux、macOS、Windows 的 x64 / arm64 组合。这说明它虽然是 CLI，但分发思路已经是“可直接安装使用的产品”，而不是仓库里的脚本集合。

### 主要命令与功能域

根据 README 和命令文档入口，`codex-auth` 至少公开了以下命令域：

- 账号管理
  - `list`
  - `login`
  - `switch`
  - `remove`
  - `status`
- 导入与维护
  - `import`
  - `export`
  - `clean`
- 配置与后台能力
  - `config`
  - `daemon`

从命令集合可以看出，它已经不只是“切换一下 auth.json”，而是在做一整套账号状态管理与刷新机制，包括：

- 本地账号注册表维护
- 认证数据导入导出
- 使用量 / 限额刷新
- 可选的后台自动切换
- 面向多个 Codex 客户端的兼容

### 它解决的是账号 / auth 管理，还是 provider / profile 切换

结论很明确：`codex-auth` 主要解决的是账号 / auth 管理，不是 provider/profile 切换。

依据有三点：

- README 直接把产品定义为切换 Codex accounts 的 CLI
- 主要命令围绕 `login`、`switch account`、`import auth`、`export auth`、usage refresh 展开
- README 明确提到它面向 Codex CLI、VS Code extension、Codex App，而不只是本地 `config.toml` / `providers.json` 模型

所以它与 `codex-switch` 的关系是“产品形态相近，但核心对象不同”：

- 相近点：都是 CLI-first，都强调可安装、可切换、可管理
- 不同点：`codex-auth` 的主对象是账号和认证状态，`codex-switch` 的主对象应是 provider/profile 与本地配置文件

### 哪些能力值得借鉴

- CLI-first 形态是对的
  - 它证明这类工具可以先以全局 CLI 成型，而不是先做桌面界面
- npm 分发路线值得借鉴
  - 对 `codex-switch` 来说，这和 TypeScript / Node.js 路线天然一致
- 命令入口清晰、职责分组明确
  - 这对后续 AI 调用尤其重要
- `import` / `export` / `status` 这类产品化命令值得保留
  - 它们比单纯脚本更接近可维护工具
- 兼顾交互式与非交互式调用的思路值得借鉴
  - 人类用户和 AI 代理都能受益

### 哪些能力当前不适合直接照搬

- 多账号体系本身不是 `codex-switch` 的第一阶段核心
- usage limit 刷新与远程 API 调用不是当前 MVP 必需能力
- `daemon`、后台自动切换、实验性自动策略过重
- 面向 Codex App / VS Code / CLI 的统一账号管理范围过大

换句话说，`codex-auth` 值得借鉴的是“工具产品化方法”，不适合直接复制的是“账号系统和后台策略的完整范围”。

## 参考项目二：codex-switcher

官方项目：

- 仓库：<https://github.com/Lampese/codex-switcher>
- README：<https://github.com/Lampese/codex-switcher/blob/main/README.md>

### 产品定位

根据 README，`codex-switcher` 的自我定义是：

- A Desktop Application for Managing Multiple OpenAI Codex CLI Accounts

README 列出的核心功能包括：

- Multi-Account Management
- Quick Switching
- Usage Monitoring
- Dual Login Mode

因此它本质上也是一个多账号管理工具，但它的产品形态不是纯 CLI，而是桌面应用。

### GUI / Desktop 形态

这一点在 README 中非常明确：

- 它直接把自己定义为 Desktop Application
- 核心交互强调 single click 切换
- README 提供的是 `pnpm tauri dev` 与 `pnpm tauri build` 的运行方式
- 仓库结构里同时存在 `src/` 与 `src-tauri/`

这些信息足以说明它的默认交互模式是 GUI-first，而不是 CLI-first。

### Tauri / Rust 技术背景与其产品含义

`codex-switcher` 使用 Tauri，这一点可以从 README 的构建说明和仓库结构直接确认。

它对产品含义的影响比“性能”更重要：

- 选择 Tauri，意味着它想做桌面分发形态
- 使用 Rust，不必然说明这个场景存在高性能需求
- 更真实的原因通常是：桌面壳层、本地能力封装、安装包产出都跟 Tauri 技术栈绑定

也就是说，`codex-switcher` 的 Rust 不是 `codex-switch` 必须跟进的证据。它更像是“因为要做桌面应用，所以自然进入 Rust + Web UI 的组合”。

### 主要功能模块

基于 README 可确认的模块包括：

- 多账号管理
- 一键切换
- 实时 usage 监控
- OAuth 登录
- 导入现有 `auth.json`

以下判断属于推断，但与 README 表述一致：

- 它的核心对象仍然偏账号 / auth，而不是 provider/profile 抽象
- 它更强调可视化状态呈现与交互便利
- 它对单机桌面用户更友好，但不如稳定命令接口那样适合被 AI 代理直接调用

### 哪些交互 / 能力值得借鉴

- 状态可见性强
  - 即使 `codex-switch` 不做 GUI，也可以借鉴“状态汇总要直观”的思路，体现在 `status` / `doctor` 输出里
- 多账号或多配置切换的路径足够短
  - 这提醒 `codex-switch` 的命令设计要减少步骤
- 导入既有本地文件的能力值得借鉴
  - 说明用户迁移成本要低

### 哪些方向不符合 codex-switch 的 CLI-first 目标

- GUI-first 本身不符合当前方向
- Tauri / Rust 桌面分发不是当前第一阶段需要承担的复杂度
- 以账号池、使用量面板、可视化 dashboard 为中心的产品心智，不适合当前 CLI 工具边界

## 对比分析

| 维度 | `codex-auth` | `codex-switcher` | 对 `codex-switch` 的启发 |
| --- | --- | --- | --- |
| 产品形态 | CLI | Desktop App / GUI | 第一阶段更应靠近 CLI |
| 核心对象 | 账号 / auth 状态 | 账号 / auth 状态 | `codex-switch` 需要把核心对象收敛到 provider/profile |
| 安装方式 | npm 全局安装 / `npx` | 从源码构建，依赖 Node.js、pnpm、Rust，产出 Tauri 应用 | 对 CLI-first MVP 来说，npm 分发更轻 |
| 交互方式 | 命令驱动，可交互也可脚本化 | 图形界面、一键点击、桌面操作 | AI 调用更偏好稳定 CLI |
| 是否适合 AI 调用 | 较适合 | 较不适合 | `codex-switch` 应优先提供稳定命令和 `--json` 输出 |
| 技术栈选择的真实原因 | 更像产品化 CLI 分发与作者实现选择，不是因为高 IO 压力 | 更像桌面应用形态带来的 Tauri / Rust 绑定 | 技术选型应服务产品形态，而不是为了“显得更底层” |
| 对 `codex-switch` 的可借鉴点 | 命令分组、安装分发、导入导出、状态命令 | 状态可见性、切换路径短、迁移已有本地文件 | 以 `codex-auth` 为主参考，以 `codex-switcher` 的部分交互思想为辅 |

从这个对比可以直接得到两个重要结论：

- `codex-switch` 在产品形态上明显更像 `codex-auth`
- `codex-switcher` 的 Rust / Tauri 选择，不能直接推出 `codex-switch` 也应走原生桌面路线

## codex-switch 当前产品方向

### 为什么更像 codex-auth，而不是 codex-switcher

`codex-switch` 当前要解决的问题是：

- 读取本地 `~/.codex/config.toml`
- 读取和维护本地 `providers.json`
- 在多个 provider/profile 之间切换
- 在修改真实配置前做备份、校验和回滚

这个问题天然更适合 CLI：

- 命令边界清楚
- 易于全局安装
- 易于被脚本和 AI 调用
- 不要求用户打开桌面应用

相反，如果先做 GUI，会让第一阶段立刻承担额外复杂度：

- 界面状态管理
- 打包与跨平台桌面分发
- UI 与底层逻辑的双层维护

因此它在产品路径上更接近 `codex-auth` 的 CLI-first 思路，而不是 `codex-switcher` 的 desktop-first 思路。

### 为什么 TypeScript 足够，Rust / Zig 不是当前必要条件

从当前需求看，核心操作主要是：

- 读取 `config.toml`
- 读取和写入 `providers.json`
- 调用 `codex login --with-api-key`
- 做备份、回滚、导入导出、诊断

这些都不是高频计算，也不是重并发服务，几乎不构成“必须用 Rust / Zig 才能解决”的性能问题。

当前阶段更重要的是：

- 安装是否简单
- 命令是否稳定
- 文件修改是否安全
- 备份 / 回滚是否可靠
- AI 是否容易调用

TypeScript / Node.js 在这些点上的现实优势更强：

- npm 全局分发成熟
- CLI 生态成熟
- 开发速度快，迭代成本低
- 后续加 `--json`、交互式命令、配置校验都方便

Rust / Zig 不是不能做，而是当前收益不足。只有在下面这些诉求变强时，它们才更值得考虑：

- 强烈要求零 Node.js 依赖
- 明确要分发单文件原生二进制
- 计划进入桌面 GUI 版本
- 希望把底层逻辑下沉为原生模块长期复用

### MVP 的核心边界

`codex-switch` 第一阶段建议只保留以下高价值核心能力：

- provider/profile 管理
  - 至少支持 list、current、add、remove
- 切换
  - 至少支持 `switch <provider>`
- 备份与回滚
  - 对 `config.toml` 和必要配置文件先备份，失败时可恢复
- 导入导出
  - 允许迁移或备份 `providers.json`
- 状态诊断
  - 至少支持 `status` 与 `doctor`

这些能力和当前仓库里的 PowerShell 最小方案是一致的，只是会从脚本升级为更标准的产品化 CLI。

### 当前明确不做的内容

- GUI
- 常驻后台服务
- 重代理层
- 复杂账号系统
- 自动智能路由
- 远程同步依赖
- 需要联网才能工作的核心主流程

这里尤其要强调两点：

- 不做 GUI，是为了先把核心切换能力做稳
- 不做复杂账号系统，是为了避免把 `codex-switch` 变成另一个 `codex-auth`

## 后续 PRD 输入项

以下内容应留给后续单独的 `PRD/codex-switch-prd-v0.1.0.md` 详细展开，这次只列为输入清单，不在本稿中定死：

- 目标用户和典型场景
  - 例如个人多 provider 用户、需要让 AI 执行切换命令的开发者、需要本地安全回滚的用户
- 最终命令集
  - 哪些命令进入首发，哪些进入后续版本
- `providers.json` / 本地配置模型
  - 字段、默认路径、兼容与迁移策略
- 安全与凭据处理
  - 明文 key、日志脱敏、导出限制、失败回滚规则
- 安装与发布方式
  - npm 全局安装、`npx`、是否需要后续二进制分发
- 成功标准与版本分层
  - MVP 判定标准、后续增强版边界、哪些能力必须延后

## 当前结论

这次合并后的研究结论可以压缩为三句话：

> `codex-switch` 当前应定位为一个 CLI-first、本地优先、默认安全、对 AI 友好的 provider/profile 切换工具。
>
> 它在产品形态上更接近 `codex-auth`，但核心对象应从账号 / auth 收敛为 provider/profile 与本地配置管理。
>
> 现阶段优先使用 TypeScript / Node.js，先把切换、备份回滚、导入导出和状态诊断做稳，再单独编写正式 PRD。
