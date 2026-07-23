# Codex 配置参考整理

本文档基于 OpenAI 官方 Codex 配置文档整理，目标是把零散的键级 reference 和 advanced config 内容，重组为一份更适合日常查阅的参考手册。

它不是 OpenAI 官方原文，也不是逐段直译版。

整理来源：

- Advanced Configuration: https://developers.openai.com/codex/config-advanced
- Configuration Reference: https://developers.openai.com/codex/config-reference

本文档内容基于 2026-05-14 抓取的官方页面整理。

## 1. 这份文档覆盖什么

这份整理主要回答三类问题：

- Codex 会从哪些地方读取配置
- 实际最重要的配置族有哪些
- `config.toml` 和 `requirements.toml` 应该怎么理解和组合使用

它不会逐项穷举官方 reference 中的所有配置键，而是按主题分组，覆盖高频和结构性最强的内容。

## 2. 配置文件与本地状态位置

Codex 的本地状态目录由 `CODEX_HOME` 决定，默认值是：

```toml
~/.codex
```

在这个目录下，常见文件包括：

- `config.toml`：用户级本地配置
- `auth.json`：基于文件的认证信息
- 系统 keychain/keyring：支持的平台上也可能把认证存到操作系统凭证存储中
- `history.jsonl`：本地会话历史，前提是开启了 history persistence
- 其他缓存、日志和本地状态文件

官方文档把配置层大致分成三类：

- 用户级配置：`~/.codex/config.toml`
- 项目级配置：`<repo>/.codex/config.toml`
- 管理员强制约束：`requirements.toml`

## 3. 配置层级与优先级

Codex 允许多层配置叠加，日常最常见的是以下四层。

### 3.1 用户级配置

你的长期默认配置通常写在：

```toml
~/.codex/config.toml
```

适合放这里的内容包括：

- 默认模型
- approval policy
- sandbox mode
- provider 定义
- 通知
- telemetry / analytics
- shell 环境传递策略

### 3.2 项目级配置

Codex 支持在仓库里放：

```toml
<repo>/.codex/config.toml
```

官方文档给出的行为规则是：

- Codex 会从 project root 一路向当前工作目录方向查找 `.codex/config.toml`
- 路径上遇到的每一层 `.codex/config.toml` 都会加载
- 如果多个文件定义了同一个 key，离当前工作目录最近的那层优先
- 只有 trusted project 才会加载项目级 `.codex/` 配置
- 如果项目被标记为 untrusted，Codex 会忽略项目级 config、hooks 和 rules
- 项目级配置中的相对路径，是相对于包含该 `config.toml` 的 `.codex/` 目录解析的

相关 key：

- `project_root_markers`
- `projects.<path>.trust_level`
- `project_doc_max_bytes`
- `project_doc_fallback_filenames`

### 3.3 命令行一次性覆盖

如果你只想临时改某次运行，不必修改 `config.toml`。

官方建议：

- 有专门 flag 的场景优先用专门 flag，比如 `--model`
- 需要覆盖任意 key 时用 `-c` / `--config`

官方示例：

```bash
codex --model gpt-5.4
codex --config model='"gpt-5.4"'
codex --config sandbox_workspace_write.network_access=true
codex --config 'shell_environment_policy.include_only=["PATH","HOME"]'
```

这里有两个非常重要的点：

- `--config` 的值按 TOML 解析，不是 JSON
- 支持 dot notation 设置嵌套 key
- 如果某个值无法按 TOML 解析，Codex 会把它当成字符串

### 3.4 Profiles

Profile 是命名好的配置覆盖集合，定义在 `config.toml` 里。

官方行为：

- 定义在 `[profiles.<name>]`
- 通过 `codex --profile <name>` 选择
- 顶层 `profile = "<name>"` 可以设置默认 profile
- profiles 目前还是 experimental
- Codex IDE extension 目前不支持 profile
- profile 可以覆盖 `model_catalog_json`

核心 key：

- `profile`
- `profiles.<name>.*`
- `profiles.<name>.model_catalog_json`
- `profiles.<name>.model_instructions_file`
- `profiles.<name>.web_search`
- `profiles.<name>.windows.sandbox`
- 以及 profile 级别的 analytics、reasoning、personality、service tier、oss provider 等配置

示例：

```toml
model = "gpt-5.4"
approval_policy = "on-request"
profile = "deep-review"

[profiles.deep-review]
model = "gpt-5-pro"
model_reasoning_effort = "high"
approval_policy = "never"
```

对 `codex-switch` 0.1.1 的补充说明：

- 官方 Codex 仍然支持 profiles
- `codex-switch` 不再把顶层 `profile` 视为推荐的受管 runtime selector
- 在 `codex-switch` 里，legacy `profile` 和 `[profiles.*]` 主要用于 `migrate`、`doctor` 和 `config` 检视的 adopt / inspect 场景

## 4. `config.toml` 主题整理

### 4.1 模型、推理强度与输出风格

这一组配置决定 Codex 用什么模型，以及模型“想得多不多、说得长不长”。

常用 key：

- `model`：当前模型，例如 `gpt-5.5`
- `model_reasoning_effort`：`minimal | low | medium | high | xhigh`
- `model_reasoning_summary`：`auto | concise | detailed | none`
- `model_verbosity`：`low | medium | high`
- `model_context_window`：上下文窗口大小
- `model_auto_compact_token_limit`：自动压缩 history 的 token 阈值
- `service_tier`：`flex | fast`
- `personality`：`none | friendly | pragmatic`
- `plan_mode_reasoning_effort`：Plan mode 的推理强度覆盖

官方特别说明：

- `model_reasoning_effort` 只对支持的 Responses API 模型生效
- `model_verbosity` 只对走 Responses API 的 provider 生效
- Chat Completions provider 会忽略 `model_verbosity`

### 4.2 Web search

Codex 把 web search 做成了顶层配置，而不是附属开关。

核心 key：

- `web_search`：`disabled | cached | live`

官方行为：

- 默认值是 `"cached"`
- cached 模式使用 OpenAI 维护的索引，不直接抓取实时网页
- 如果使用 `--yolo` 或其他 full-access sandbox 组合，默认值会变成 `"live"`
- `"live"` 适合需要最新信息的场景
- `"disabled"` 会直接移除这个工具能力

旧的 `features.web_search`、`features.web_search_cached`、`features.web_search_request` 仍然存在，但官方 reference 已经把它们视为过时入口，推荐直接使用顶层 `web_search`。

### 4.3 Providers 与 API 路由

Codex 把“当前使用哪个 provider”和“provider 怎么定义”拆开了。

核心 key：

- `model_provider`
- `model_providers.<id>`
- `model_providers.<id>.base_url`
- `model_providers.<id>.env_key`
- `model_providers.<id>.env_key_instructions`
- `model_providers.<id>.http_headers`
- `model_providers.<id>.env_http_headers`
- `model_providers.<id>.query_params`
- `model_providers.<id>.request_max_retries`
- `model_providers.<id>.wire_api`
- `model_providers.<id>.requires_openai_auth`

自定义 provider 的认证方式包括：

- `env_key`
- `experimental_bearer_token`
- `model_providers.<id>.auth.*` 这种“命令返回 bearer token”的方式

官方倾向是：

- 优先使用 `env_key`
- 不推荐直接写死 bearer token

内置或保留 provider 行为：

- `openai`、`ollama`、`lmstudio` 是保留 id
- 这些 id 不能被自定义 provider 覆盖
- `amazon-bedrock` 是内置 provider，支持嵌套 AWS 配置

Bedrock 相关 key：

- `model_providers.amazon-bedrock.aws.profile`
- `model_providers.amazon-bedrock.aws.region`

#### `codex-switch` 0.1.1 的受管投影

当 `codex-switch` 为 Codex `0.134.0+` 管理一个 direct OpenAI-compatible route 时，它会有意把运行态投影限制在一组更窄的字段上：

- 顶层 `model` 是活动模型选择器
- 顶层 `model_provider` 是活动路由选择器
- 投影后的 `[model_providers.<id>]` 保留 `base_url`
- 投影后的 `[model_providers.<id>]` 固定写 `wire_api = "responses"`
- 投影后的 `[model_providers.<id>]` 固定写 `requires_openai_auth = true`
- 受管运行态投影不会保留 `env_key`
- 受管运行态投影不会保留 `env_key_instructions`

认证信息会通过 `auth.json` 里的 `OPENAI_API_KEY` 投影，而不是通过运行态 `config.toml` 中的 `env_key`。

这属于 `codex-switch` 的产品约束，不是 Codex 官方能力限制。如果你是手工维护或独立维护 Codex config，`env_key` 仍然是官方支持的方式。

### 4.3.1 `openai_base_url` 和自定义 provider 的区别

如果你只是想把内置 `openai` provider 指向公司网关、路由层或者某个数据驻留 endpoint，官方建议直接用：

```toml
openai_base_url = "https://us.api.openai.com/v1"
```

只有在你需要：

- 单独的 provider 身份
- 不同的认证逻辑
- 自定义请求头或 query 参数

时，才更适合定义新的 `model_providers.<id>`。

### 4.3.2 OSS 模式

Codex 支持通过 `--oss` 指向本地 open-source provider。

核心 key：

- `oss_provider`：`lmstudio | ollama`

如果传了 `--oss` 但没有显式指定 provider，Codex 会把 `oss_provider` 当默认本地 provider。

### 4.4 Approval policy 与 sandbox

这部分决定 Codex 什么时候暂停要你批准，以及子进程拥有什么本地访问能力。

核心 key：

- `approval_policy`
- `approvals_reviewer`
- `sandbox_mode`
- `sandbox_workspace_write.network_access`
- `sandbox_workspace_write.writable_roots`
- `sandbox_workspace_write.exclude_slash_tmp`
- `sandbox_workspace_write.exclude_tmpdir_env_var`
- `windows.sandbox`
- `windows.sandbox_private_desktop`

顶层 `approval_policy` 支持：

- `untrusted`
- `on-request`
- `never`
- granular 模式

granular 示例：

```toml
approval_policy = { granular = {
  sandbox_approval = true,
  rules = true,
  mcp_elicitations = false,
  request_permissions = true,
  skill_approval = true
} }
```

granular 子项包括：

- `approval_policy.granular.sandbox_approval`
- `approval_policy.granular.rules`
- `approval_policy.granular.mcp_elicitations`
- `approval_policy.granular.request_permissions`
- `approval_policy.granular.skill_approval`

`sandbox_mode` 的官方值：

- `read-only`
- `workspace-write`
- `danger-full-access`

最核心的理解方式是：

- approval policy 决定“何时暂停等待批准”
- sandbox mode 决定“文件系统和网络边界”

### 4.5 命名权限配置（Named permission profiles）

除了直接设置 sandbox，Codex 还支持通过权限配置复用一组更细的本地访问策略。

相关 key：

- `default_permissions`
- `[permissions.<name>]`

内置 profile 名：

- `:read-only`
- `:workspace`
- `:danger-no-sandbox`

自定义 permissions profile 可以控制：

- `permissions.<name>.filesystem`
- `permissions.<name>.network.enabled`
- `permissions.<name>.network.mode`
- `permissions.<name>.network.domains`
- `permissions.<name>.network.proxy_url`
- `permissions.<name>.network.socks_url`
- `permissions.<name>.network.unix_sockets`

如果你需要的不是“全开/半开/只读”这种粗粒度策略，而是团队自己的精细规则，这一层会很有用。

### 4.6 Shell 环境变量传递策略

Codex 可以细粒度控制把哪些环境变量带给它启动的子进程。

主配置表：

```toml
[shell_environment_policy]
inherit = "none"
set = { PATH = "/usr/bin", MY_FLAG = "1" }
ignore_default_excludes = false
exclude = ["AWS_*", "AZURE_*"]
include_only = ["PATH", "HOME"]
```

关键 key：

- `shell_environment_policy.inherit`：`all | core | none`
- `shell_environment_policy.set`
- `shell_environment_policy.exclude`
- `shell_environment_policy.include_only`
- `shell_environment_policy.ignore_default_excludes`
- `shell_environment_policy.experimental_use_profile`

官方说明：

- 模式匹配是大小写不敏感的 glob
- 当 `ignore_default_excludes = false` 时，Codex 会先自动过滤包含 `KEY` / `SECRET` / `TOKEN` 的环境变量，再执行你的 include/exclude 规则

这部分的核心作用是：

- 避免 secret 泄漏给子进程
- 同时保留任务真正需要的 PATH、HOME、feature flag 或运行参数

### 4.7 指令文件、AGENTS.md 与项目文档发现

Codex 既支持直接替换内置指令，也支持从项目文档中读取指导信息。

相关 key：

- `model_instructions_file`
- `project_doc_max_bytes`
- `project_doc_fallback_filenames`

官方行为：

- `model_instructions_file` 会替代内置 instructions，而不是继续走 `AGENTS.md`
- Codex 会读取 `AGENTS.md` 及相关文件，并在会话第一轮注入有限量的项目指导
- `project_doc_max_bytes` 控制每个 `AGENTS.md` 最多读多少字节
- `project_doc_fallback_filenames` 允许在找不到 `AGENTS.md` 时尝试其他候选文件名

### 4.8 Hooks、agents 与 features

Codex 的 feature 面很大，但本地配置里最常见的还是下面这些。

常用 feature key：

- `features.codex_hooks`
- `features.codex_git_commit`
- `features.apps`
- `features.memories`
- `features.multi_agent`
- `features.personality`
- `features.shell_tool`
- `features.shell_snapshot`
- `features.fast_mode`

advanced config 明确把 hooks 归类为 experimental。

hooks 常见位置：

- `~/.codex/hooks.json`
- `~/.codex/config.toml`
- `<repo>/.codex/hooks.json`
- `<repo>/.codex/config.toml`

项目级 hooks 跟项目级 config 一样，也受 trusted project 约束。

### 4.9 通知与 TUI 配置

Codex 同时支持“外部通知命令”和“内置 TUI 通知”。

外部通知 key：

- `notify`：命令数组，Codex 会把 JSON payload 传给它

TUI 通知相关 key：

- `tui.notifications`
- `tui.notification_method`：`auto | osc9 | bel`
- `tui.notification_condition`：`unfocused | always`

其他常见 TUI key：

- `tui.animations`
- `tui.alternate_screen`
- `tui.status_line`
- `tui.terminal_title`
- `tui.theme`
- `tui.show_tooltips`

官方区分得很明确：

- `notify`：适合 webhook、桌面通知器、CI hook 或其他外部 side-channel
- `tui.notifications`：适合交互式终端 UI 的内置通知

### 4.10 History、引用链接与本地交互体验

history 相关 key：

- `history.persistence`：`save-all | none`
- `history.max_bytes`

官方行为：

- 本地历史默认保存在 `CODEX_HOME`
- `history.persistence = "none"` 可以关闭本地历史持久化
- 超过 `history.max_bytes` 后，Codex 会丢弃最旧记录并压缩文件

文件引用点击跳转相关 key：

- `file_opener`：`vscode | vscode-insiders | windsurf | cursor | none`

这个 key 用来控制 Codex 把文件引用改写成哪种编辑器 URI scheme，便于支持的终端或编辑器做可点击跳转。

### 4.11 Telemetry 与 analytics

Codex 把轻量 analytics 和完整 OpenTelemetry 输出分开了。

analytics 相关：

- `analytics.enabled`

OpenTelemetry 相关：

- `otel.environment`
- `otel.exporter`
- `otel.exporter.<id>.endpoint`
- `otel.exporter.<id>.headers`
- `otel.exporter.<id>.protocol`
- `otel.exporter.<id>.tls.*`
- `otel.log_user_prompt`
- `otel.metrics_exporter`
- `otel.trace_exporter`
- `otel.trace_exporter.<id>.*`

官方说明里几个比较关键的点：

- `otel.exporter = "none"` 表示 Codex 记录事件但不发送
- exporter 会异步 batch，并在退出时 flush
- 事件元数据包含 model、sandbox/approval 设置、CLI version、conversation id 等信息
- `otel.log_user_prompt` 需要显式打开，才会把原始用户输入导出到 OTEL

简单理解：

- `analytics.enabled` 更像一个“本机/本 profile 的总开关”
- `otel.*` 是真正接入可观测性系统时用的结构化配置

## 5. `requirements.toml`

`requirements.toml` 是管理员强制施加的配置约束层，主要针对用户不应自行绕开的安全敏感设置。

官方把它定义成“约束系统”，而不是普通便捷配置。

核心用途：

- 限制允许的 approval policy
- 限制允许的 sandbox mode
- 限制允许的 web search mode
- 钉死或禁用某些 features

官方明确点名的 key 族：

- `allowed_approval_policies`
- `allowed_approvals_reviewers`
- `allowed_sandbox_modes`
- `allowed_web_search_modes`
- `[features]`
- `features.<name>`

官方 reference 里明确举例的 feature 限制包括：

- `features.browser_use = false`
- `features.computer_use = false`
- `features.in_app_browser = false`

另外几个重要规则：

- 没写到的 feature key 默认不受约束
- 对 `web_search` 来说，`disabled` 永远是允许值
- 如果 `allowed_web_search_modes` 是空数组，效果基本等于只允许 `disabled`

官方也提到，企业环境下还可能存在 cloud-fetched requirements，具体优先级需要配合安全/管理文档一起看。

## 6. 可直接复用的配置片段

### 6.1 保守型日常默认配置

```toml
model = "gpt-5.5"
approval_policy = "on-request"
sandbox_mode = "workspace-write"
web_search = "cached"
profile = "daily"

[profiles.daily]
model_reasoning_effort = "medium"
service_tier = "flex"
```

### 6.2 通过代理访问 OpenAI

```toml
model = "gpt-5.5"
openai_base_url = "https://us.api.openai.com/v1"
```

这个方案适合“仍然想保留内置 `openai` provider 行为，只是换 base URL”。

### 6.3 使用自定义 provider 和环境变量认证

```toml
model = "gpt-5.4"
model_provider = "proxy"

[model_providers.proxy]
name = "OpenAI via team gateway"
base_url = "https://proxy.example.com/v1"
env_key = "OPENAI_API_KEY"
http_headers = { "X-Team" = "platform" }
```

这段是官方 Codex 风格的自定义 provider 示例。

如果你走的是 `codex-switch` 的受管 direct-provider 投影，运行态会被有意收窄为：

```toml
model = "gpt-5.4"
model_provider = "proxy"

[model_providers.proxy]
name = "proxy"
base_url = "https://proxy.example.com/v1"
wire_api = "responses"
requires_openai_auth = true
```

在这种受管投影下，`OPENAI_API_KEY` 预期写在 `auth.json`，而不是通过 `config.toml` 里的 `env_key` 暴露。

### 6.4 最小暴露的 shell 环境策略

```toml
[shell_environment_policy]
inherit = "none"
include_only = ["PATH", "HOME"]
exclude = ["AWS_*", "AZURE_*"]
ignore_default_excludes = false
```

### 6.5 禁用本地历史

```toml
[history]
persistence = "none"
```

### 6.6 基础 OTEL 日志输出

```toml
[otel]
environment = "prod"
exporter = { otlp-http = {
  endpoint = "https://otel.example.com/v1/logs",
  protocol = "binary"
}}
log_user_prompt = false
```

### 6.7 管理员强制要求

```toml
allowed_approval_policies = ["on-request", "never"]
allowed_sandbox_modes = ["read-only", "workspace-write"]
allowed_web_search_modes = ["cached"]

[features]
browser_use = false
computer_use = false
```

## 7. 建议怎么用这份文档

适合用这份整理的场景：

- 想先理解 Codex 配置体系怎么分层
- 想快速找到某一类配置应该放在哪一层
- 想知道某个 key 族大概负责什么

需要回到官方 reference 的场景：

- 你要查某个冷门 key 的完整类型定义
- 你要看 provider auth、permissions、hooks、OTEL exporter 的完整嵌套 schema
- 你要确认 2026-05-14 之后新增的字段
- 你需要逐项对照所有支持的配置键

## 8. 这次整理里值得单独记住的更新点

- `experimental_instructions_file` 已经更名为 `model_instructions_file`
- `approval_policy = "on-failure"` 已被标记为过时
- 旧的 `features.web_search*` 开关已被顶层 `web_search` 替代
- profiles 目前仍然是 experimental
- Codex IDE extension 目前还不支持 profiles
