# codex-switch

`codex-switch` 是一个本地优先、无需图形界面的 Codex 与 Claude Code 中转站管理工具。它提供 `codexs` 命令，用来保存多个 OpenAI-compatible provider、切换模型与密钥、自动按优先级故障转移，并在每次修改前备份 Codex 配置。

- GitHub：<https://github.com/airpot/codex-switch>
- 当前版本：`0.3.1`
- CLI 命令：`codexs`
- Node.js：`>=22.13`，推荐使用最新 Node.js 22 LTS
- Codex：面向使用顶层 `model` / `model_provider` 的当前版本，建议 `0.134.0+`

> 注意：项目已经独立发布到 GitHub，但尚未发布到 npm registry。当前请通过 GitHub 安装，不要安装 npm 上由其他项目占用的无作用域 `codex-switch` 包。

## 能做什么

- 管理多个 Codex 中转站的 URL、API key、模型、备注和标签。
- 在中转站之间手工切换，并同步更新 `config.toml` 与 `auth.json`。
- 运行本地自动路由：严格按 `lxapi -> rivo -> ...` 的顺序尝试中转站。
- 遇到连接错误、超时、限流或服务端错误时自动切换到下一站。
- 使用熔断与冷却机制，避免反复请求已经失败的中转站。
- 保留当前 Codex `model_provider` id，避免启用自动路由后看不到原有会话历史。
- 正常重启路由时复用本地 token，避免 VSCode/Codex 因 token 改变而持续返回 401。
- 管理 Claude Code 的多份完整 `settings.json` 配置。
- 对所有重要配置修改建立备份，并支持检查、回滚和 JSON 自动化输出。

自动路由的数据路径如下：

```text
Codex / VSCode
      |
      | http://127.0.0.1:15721/v1（本地 token 鉴权）
      v
codex-switch router
      |
      +--> 1. lxapi（独立 URL、API key、模型）
      +--> 2. rivo（独立 URL、API key、模型）
      +--> 3. 其他备用中转站
```

路由只监听 `127.0.0.1`，不向局域网或公网开放。

## 安装与升级

### 从 GitHub 安装

安装当前稳定标签：

```bash
npm install -g github:airpot/codex-switch#v0.3.1
codexs --version
```

安装或更新到 `main` 最新代码：

```bash
npm install -g github:airpot/codex-switch#main --force
codexs --version
```

如果自动路由已经运行，升级时应先停止再重新启动，让 worker 加载新代码：

```bash
codexs route stop
npm install -g github:airpot/codex-switch#main --force
codexs route start
codexs route status
```

正常 `route stop/start` 不会轮换本地 token。正在生成中的请求会在停止 worker 时中断，因此应先等待当前回答结束。

### 从源码开发安装

```bash
git clone https://github.com/airpot/codex-switch.git
cd codex-switch
npm ci
npm test
npm link
codexs --version
```

## 首次配置 Codex 中转站

### 1. 初始化工具目录

```bash
codexs init
```

默认会创建：

```text
~/.config/codex-switch/
  codex-switch.json
  providers.json
  backups/
```

如需管理其他 Codex 目录：

```bash
codexs init --codex-dir /path/to/codex-home
```

也可以设置：

```bash
export CODEXS_CODEX_DIR=/path/to/codex-home
export CODEXS_HOME=/path/to/codex-switch-state
```

### 2. 添加中转站

交互模式不会把 API key 直接写入 shell 历史，推荐日常使用：

```bash
codexs add
```

完整的非交互示例：

```bash
codexs add lxapi \
  --profile lxapi \
  --model gpt-5.6-sol \
  --api-key '<LXAPI_API_KEY>' \
  --base-url 'https://relay-a.example.com/v1' \
  --note 'primary relay' \
  --tag primary

codexs add rivo \
  --profile rivo \
  --model gpt-5.6-sol \
  --api-key '<RIVO_API_KEY>' \
  --base-url 'https://relay-b.example.com/v1' \
  --note 'fallback relay' \
  --tag fallback
```

字段含义：

| 参数 | 含义 |
| --- | --- |
| provider 名称 | `lxapi`、`rivo` 等本地记录名，也是路由排序时使用的名字 |
| `--profile` | 投影到 Codex 的 `model_provider` id；不要仅为更新 URL/token 随意改名 |
| `--model` | 发送给该中转站的模型名；路由会按 provider 单独重写请求中的 model |
| `--api-key` | 该中转站自己的上游密钥，不是本地路由 token |
| `--base-url` | OpenAI-compatible API 根地址，通常以 `/v1` 结尾 |
| `--note` / `--tag` | 仅用于本地识别，不发送给中转站 |

### 3. 手工切换与检查

```bash
codexs list
codexs show lxapi
codexs switch lxapi
codexs current
codexs status
codexs doctor
```

`show` 的普通文本输出会隐藏 API key；`show --json` 会返回完整本地记录，使用时不要把输出贴到工单或公开日志。

## 自动路由

### 新安装的推荐流程

```bash
codexs switch lxapi
codexs route configure lxapi rivo
codexs route start
codexs route status
```

顺序是严格的：每个新请求优先使用 `lxapi`，只有符合故障切换条件时才尝试 `rivo`。

### 已有重要会话历史时

Codex/VSCode 可能按 `model_provider` id 组织或筛选会话。启用自动路由前如果已经有重要历史：

1. 不要先执行会改变当前 provider id 的 `codexs switch`。
2. 直接配置路由并执行 `codexs route start`。
3. `route start` 会保留当前 `model_provider` id，只把该 id 的 `base_url` 临时投影到本地路由。

```bash
codexs current
codexs route configure lxapi rivo
codexs route start
```

这样上游可以在 `lxapi` 和 `rivo` 之间切换，但本地会话仍留在原来的 provider 命名空间。

### 默认故障策略

| 设置 | 默认值 | 作用 |
| --- | ---: | --- |
| 连续失败阈值 | 3 | 达到后打开该 provider 的熔断器 |
| 冷却时间 | 60 秒 | 冷却后允许一次半开探测 |
| 流式首字节超时 | 60 秒 | 在没有向 Codex 输出前允许切到下一站 |
| 流式空闲超时 | 120 秒 | 已开始的流长时间无数据时终止 |
| 非流式请求超时 | 600 秒 | 等待完整响应的最大时长 |

自定义示例：

```bash
codexs route configure lxapi rivo \
  --failure-threshold 3 \
  --cooldown-seconds 60 \
  --first-byte-timeout-seconds 60 \
  --stream-idle-timeout-seconds 120 \
  --request-timeout-seconds 600
```

以下情况会在响应尚未交付给 Codex 时尝试下一站：

- TCP、TLS、DNS 等网络连接错误。
- 首字节或完整请求超时。
- `401`、`403`、`408`、`429` 和 `5xx` 等 provider 级失败。

`400`、`405`、`406`、`413`、`414`、`415`、`422`、`501` 被视为请求本身的问题，不会盲目换站重放。

一旦流式内容已经发送给 Codex，后续断流不会在另一个 provider 上重放同一个请求，以避免重复回答、重复工具调用或重复计费。

### Responses 工具命名空间兼容

较新的 Codex Responses 请求可能包含 `type: "namespace"` 工具，以及历史
`function_call` 项中的 `namespace` 字段。部分严格的 OpenAI-compatible 中转站
不接受这些字段，会返回类似 `input[95].namespace unknown_parameter` 的错误。

router 会在发送到 provider 前把命名空间工具压平成兼容的函数名，并移除请求中的
`namespace` 元数据；收到响应后会恢复原始的函数名和 namespace，Codex/VSCode 仍能
按原来的工具协议继续工作。这个转换同时覆盖非流式 JSON 和 SSE 流，不需要修改
会话文件，也不需要轮换本地 token。

### 熔断状态

```bash
codexs route status
```

- `closed`：正常接收请求。
- `open`：冷却中，暂时跳过。
- `half-open`：冷却结束后的单次恢复探测；成功后回到 `closed`。
- `failures=0`：没有尚未被成功请求清除的连续失败。

## 中转站更新与维护

路由 worker 在启动时读取 `providers.json`。修改中转站 URL、token 或模型后，必须重启路由才能生效。正常维护流程统一为：

```bash
codexs route stop
# 修改 provider
codexs route start
codexs route status
```

### 更新 API key/token

推荐使用交互模式，避免新 key 留在 shell 历史：

```bash
codexs route stop
codexs edit lxapi
codexs route start
```

自动化环境可以显式传值：

```bash
codexs route stop
codexs edit lxapi --api-key '<NEW_API_KEY>' --json
codexs route start
```

这里更新的是 `lxapi` 上游 API key。它和 `~/.config/codex-switch/router-token` 中的本地路由 token 是两回事。

### 更新中转地址

```bash
codexs route stop
codexs edit lxapi --base-url 'https://new-relay.example.com/v1'
codexs route start
```

### 更新模型

```bash
codexs route stop
codexs edit lxapi --model gpt-5.6-sol
codexs edit rivo --model gpt-5.6-sol
codexs route start
```

### 同时更新地址、key 和模型

```bash
codexs route stop
codexs edit lxapi \
  --base-url 'https://new-relay.example.com/v1' \
  --api-key '<NEW_API_KEY>' \
  --model gpt-5.6-sol
codexs route start
```

只更新这些字段时，不要修改 `--profile`，否则 Codex/VSCode 可能把它视为另一个会话命名空间。

### 新增备用中转站

```bash
codexs route stop
codexs add backup2 \
  --profile backup2 \
  --model gpt-5.6-sol \
  --api-key '<BACKUP2_API_KEY>' \
  --base-url 'https://relay-c.example.com/v1'
codexs route configure lxapi rivo backup2
codexs route start
```

### 调整优先级

```bash
codexs route stop
codexs route configure rivo lxapi
codexs route start
```

### 删除中转站

先把它从路由顺序中移除，再删除记录：

```bash
codexs route stop
codexs route configure lxapi rivo
codexs remove backup2 --force
codexs route start
```

如果待删除 provider 当前处于手工激活状态，使用 `--switch-to`：

```bash
codexs remove backup2 --switch-to lxapi --force
```

### 批量导入、导出和迁移

导出文件包含真实 API key，应按敏感文件保存：

```bash
codexs export ./providers-backup.json
codexs import ./providers-backup.json --merge
```

provider 文件格式：

```json
{
  "providers": {
    "lxapi": {
      "profile": "lxapi",
      "apiKey": "<LXAPI_API_KEY>",
      "model": "gpt-5.6-sol",
      "baseUrl": "https://relay-a.example.com/v1",
      "note": "primary relay",
      "tags": ["primary"]
    }
  }
}
```

已有旧 Codex 配置需要采用到 `codex-switch` 时，可以运行交互式迁移：

```bash
codexs migrate
```

`migrate` 是高级采用工具；新安装应使用 `init` + `add`。

## 本地 token、VSCode 与会话历史

自动路由使用两层认证：

1. Codex/VSCode 使用本地 token 访问 `127.0.0.1:15721`。
2. router 按 provider 使用各自的 API key 访问中转站。

普通 `route stop/start` 会保留本地 token，因此通常不需要重启所有 Codex 进程或 VSCode。

只有确认本地 token 泄露时才应轮换：

```bash
codexs route stop
codexs route start --rotate-token
```

轮换后，旧 Codex/VSCode 进程可能继续缓存原 token 并收到本地 `401 Unauthorized`。此时在 VSCode 执行 `Developer: Reload Window`，或只重启受影响的 Codex 进程，不需要重启整台机器。

如果启用路由后看不到旧会话，首先检查：

```bash
codexs current
codexs config show
```

关键是保持原来的顶层 `model_provider` id。URL、API key、模型和路由优先级可以更新，但不要为这些维护操作随意改 provider id。

## Claude Code 配置管理

Claude Code 流程与 Codex provider 独立。工具保存并切换完整的 `settings.json`：

```bash
codexs add --claude opus --from-file ~/.claude/settings-opus.json
codexs add --claude backup --from-file ~/.claude/settings-backup.json
codexs list --claude
codexs switch --claude opus
codexs current --claude
codexs show --claude opus
codexs remove --claude backup --force
```

可通过 `CODEXS_CLAUDE_DIR` 指定非默认 Claude Code 目录。

## 状态、日志、备份与恢复

常用诊断：

```bash
codexs status
codexs doctor
codexs route status
codexs route status --json
tail -f ~/.config/codex-switch/router.log
```

自动路由运行时的文件：

```text
~/.config/codex-switch/
  providers.json       # 中转站 URL、模型和真实 API key，权限 0600
  router.json          # 路由顺序与超时策略
  router-state.json    # 当前 worker 元数据，不含上游 key
  router-token         # 持久化本地 token，权限 0600
  router.log           # 路由事件，不记录认证值，权限 0600
  backups/             # 修改前快照与清单
```

查看和恢复备份：

```bash
codexs backups list
codexs rollback
codexs rollback <backup-id>
```

`route stop` 会恢复该次 `route start` 前的 `config.toml` 和 `auth.json`。如果这两个文件在路由运行期间被其他程序修改，停止命令会拒绝覆盖；确认要恢复启动前快照时才使用：

```bash
codexs route stop --force
```

## 常见错误

| 错误 | 含义与处理 |
| --- | --- |
| `401 Unauthorized`，URL 是 `127.0.0.1:15721` | 本地 token 不匹配。检查 router 是否刚执行过 `--rotate-token`；重新加载受影响的 VSCode 窗口。正常重启不应频繁轮换 token。 |
| 上游返回 `401` / `403` | 中转站 API key 失效或权限不足。停止路由，使用 `codexs edit <provider> --api-key ...` 更新，然后启动。 |
| `503 All provider circuits are cooling down` | 所有 provider 都处于熔断冷却。查看 `route status` 和 `router.log`，等待冷却并修复真实上游问题。 |
| `502 All available providers failed` | 本次请求尝试过的中转站都失败。日志会列出 provider 和失败类型；HTTP 502 本身通常来自中转网关或它的模型上游。 |
| `input[n].namespace unknown_parameter` | 中转站不接受 Codex Responses 的工具命名空间字段。当前版本 router 会自动压平请求并在响应中还原；升级后执行一次 `codexs route stop`、更新工具、再 `codexs route start`。 |
| `ETIMEDOUT` | 网络路径、DNS、TCP/TLS 或地址族选择超时。`0.3.1` 已避开受影响主机上的 Node.js IPv4/IPv6 自动竞速问题；仍出现时应比较本机直连与其他服务器的 DNS、出口 IP 和区域线路。 |
| `stream disconnected before completion` | 上游已经开始输出后断开。为了避免重复回答或重复工具调用，router 不会在另一站重放；重新发送请求并检查中转站长连接稳定性。 |
| `ECONNREFUSED 127.0.0.1:15721` | router 没有运行或状态陈旧。运行 `codexs route status`，必要时停止陈旧状态后重新启动。 |
| 启用路由后旧会话不可见 | 当前 `model_provider` id 发生了变化。使用 `current` / `config show` 核对，后续不要为更新 URL、token 或模型改 id。 |
| `LIVE_STATE_DRIFT` | 路由运行期间 `config.toml` 或 `auth.json` 被其他程序改动。先检查差异，只有确认恢复备份时才使用 `route stop --force`。 |

### 不经过 router 测试中转站

以下示例通过隐藏输入读取 key，避免出现在命令历史中：

```bash
read -rsp 'API key: ' RELAY_API_KEY && echo
curl -sS https://relay.example.com/v1/responses \
  -H "Authorization: Bearer $RELAY_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"gpt-5.6-sol","input":"Reply with OK only.","stream":false,"max_output_tokens":16}'
unset RELAY_API_KEY
```

如果直连同样返回 502 或超时，问题在本机到中转站的网络路径或中转站上游，而不是本地 router。

## 完整命令索引

```text
codexs init
codexs migrate
codexs list [--claude]
codexs show <provider> [--claude]
codexs current [--claude]
codexs status
codexs route configure <provider> [fallback-provider ...]
codexs route start [--rotate-token]
codexs route status
codexs route stop [--force]
codexs config show
codexs config list-profiles
codexs add <provider> [options]
codexs add --claude <name> --from-file <settings.json>
codexs edit <provider> [options]
codexs switch <provider> [--claude]
codexs remove <provider> [--claude] --force
codexs import <file> [--merge]
codexs export <file> [--force]
codexs backups list
codexs rollback [backup-id]
codexs doctor
codexs help <command>
```

所有主要命令都支持 `--json`；Codex 命令可用 `--codex-dir <path>` 指定目标目录。完整参数以 `codexs help <command>` 和 [CLI usage](./docs/cli-usage.md) 为准。

## 安全说明

- 不要提交 `providers.json`、`auth.json`、真实 Claude `settings.json` 或导出的 provider 备份。
- 不要把 `codexs show --json`、shell 环境变量或带认证头的 curl 调试输出贴到公开 issue。
- router 仅监听 localhost，provider 密钥不会返回给 Codex 客户端。
- 日志只记录 provider 名、HTTP 状态和经过清理的网络错误，不记录 key 或本地 token。
- `router-token` 只有泄露时才需要轮换；频繁轮换只会导致仍在运行的客户端收到 401。

## 卸载

先安全停止自动路由并恢复 Codex 配置：

```bash
codexs route stop
npm uninstall -g @airpot/codex-switch
```

卸载命令不会删除 `~/.config/codex-switch` 中的 provider、密钥和备份。确认不再需要恢复后，再手工删除该目录。

## 开发与验证

```bash
npm ci
npm run build
npx tsc --noEmit
npm test
node dist/cli.js --help
node dist/cli.js --version
npm pack --dry-run
```

架构与版本事实源：

- [CLI usage](./docs/cli-usage.md)
- [0.3.0 PRD](./docs/PRD/codex-switch-prd-v0.3.0.md)
- [0.3.0 Design](./docs/Design/codex-switch-v0.3.0-design.md)
- [Technical architecture](./docs/codex-switch-technical-architecture.md)
- [Changelog](./CHANGELOG.md)

## License

[MIT](./LICENSE)
