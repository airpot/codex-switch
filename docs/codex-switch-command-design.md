# codex-switch 命令设计说明

> 状态说明：这份文档是历史跨版本参考，不是当前 release contract。
> 当前事实源请改看 [`docs/cli-usage.md`](./cli-usage.md)、[`docs/PRD/codex-switch-prd-v0.2.1.md`](./PRD/codex-switch-prd-v0.2.1.md)、[`docs/Design/codex-switch-v0.2.1-design.md`](./Design/codex-switch-v0.2.1-design.md)。

## 文档信息

- 文档类型：命令设计文档
- 适用范围：`codex-switch` MVP
- 关联文档：
  - [`PRD/codex-switch-prd-v0.1.0.md`](./PRD/codex-switch-prd-v0.1.0.md)
  - [`codex-switch-technical-architecture.md`](./codex-switch-technical-architecture.md)

## 1. 文档目标

这份文档把 `codex-switch` 的每个 CLI 命令拆开描述，重点沉淀下面这些内容：

- 命令用途
- 输入参数
- 成功输出
- 失败错误码
- 关键行为语义
- 对 AI / 自动化调用的注意事项

这份文档是 PRD 的命令规格落地版，也是技术架构文档的命令视角补充。

## 1.1 与 `cc-switch` / `codex-auth` 的命令形态差异

为了帮助后续继续演进，这里先明确三者的命令/交互边界：

- `codex-switch`
  - 目标是稳定 CLI 命令
  - 聚焦 provider/profile 切换、导入导出、诊断、回滚
- `codex-auth`
  - 更偏账号 / auth 管理 CLI
  - 对本项目的参考点是命令组织方式
- `cc-switch`
  - 更偏 GUI / 桌面管理器
  - 即使内部也有切换逻辑，用户主入口不是命令行，而是桌面界面

这意味着 `codex-switch` 的命令设计原则应继续保持：

- 参数显式
- 输出稳定
- 能被 AI 和脚本直接消费
- 交互只作为 TTY 中的人类增强层，而不是自动化契约

## 2. 公共命令约定

### 2.1 命令入口

统一命令名：

```bash
codexs
```

### 2.2 公共参数

所有支持的命令共享以下全局参数：

- `--json`
  - 返回统一 JSON envelope
- `--codex-dir <path>`
  - 指定目标工作目录

### 2.3 JSON 输出结构

统一 envelope：

```json
{
  "ok": true,
  "command": "list",
  "data": {},
  "warnings": [],
  "error": null
}
```

失败时：

```json
{
  "ok": false,
  "command": "list",
  "data": null,
  "warnings": [],
  "error": {
    "code": "PROVIDERS_NOT_FOUND",
    "message": "providers.json does not exist.",
    "details": {
      "file": "C:\\Users\\name\\.codex\\providers.json"
    }
  }
}
```

### 2.4 固定错误码

当前命令层统一使用：

- `CONFIG_NOT_FOUND`
- `PROVIDERS_NOT_FOUND`
- `PROVIDERS_PARSE_ERROR`
- `PROVIDER_NOT_FOUND`
- `PROFILE_NOT_FOUND`
- `BACKUP_FAILED`
- `CODEX_LOGIN_FAILED`
- `ROLLBACK_FAILED`
- `INVALID_IMPORT_FILE`

### 2.5 渐进式交互约定

- `--json` 一律禁用交互
- 非 TTY 一律不进入交互
- 交互主要服务于人类高频写命令，不改变自动化显式参数契约
- 用户取消 prompt、`Ctrl+C`、或确认选择否时，不应产生任何文件写入

## 3. 命令清单概览

```bash
codexs list
codexs current
codexs switch <provider>
codexs status
codexs import <file>
codexs export <file>
codexs add <provider>
codexs remove <provider>
codexs doctor
codexs rollback
```

## 4. 命令逐项设计

### 4.1 `codexs list`

#### 目标

列出当前 `providers.json` 中的 provider 清单。

#### 输入

```bash
codexs list [--json] [--codex-dir <path>]
```

#### 成功输出

默认输出示意：

```text
freemodel -> freemodel
packycode -> packycode tags=daily note=primary
```

JSON 输出示意：

```json
{
  "ok": true,
  "command": "list",
  "data": {
    "providers": [
      {
        "name": "freemodel",
        "profile": "freemodel",
        "note": null,
        "tags": []
      }
    ],
    "count": 1
  },
  "warnings": [],
  "error": null
}
```

#### 失败错误码

- `PROVIDERS_NOT_FOUND`
- `PROVIDERS_PARSE_ERROR`

#### AI 调用建议

- 优先使用 `--json`
- 不要依赖默认输出格式做机器解析

### 4.2 `codexs current`

#### 目标

返回当前 `config.toml` 顶层 `profile`。

#### 输入

```bash
codexs current [--json] [--codex-dir <path>]
```

#### 成功输出

默认：

```text
Current profile: packycode
```

JSON：

```json
{
  "ok": true,
  "command": "current",
  "data": {
    "profile": "packycode"
  },
  "warnings": [],
  "error": null
}
```

#### 失败错误码

- `CONFIG_NOT_FOUND`
- `PROFILE_NOT_FOUND`

### 4.3 `codexs status`

#### 目标

给出本地配置的浅状态概览。

#### 输入

```bash
codexs status [--json] [--codex-dir <path>]
```

#### 当前返回字段

- `codexDir`
- `configExists`
- `providersExists`
- `currentProfile`
- `currentProfileMapped`
- `provider`

#### 成功输出

JSON 示例：

```json
{
  "ok": true,
  "command": "status",
  "data": {
    "codexDir": "C:\\Users\\name\\.codex",
    "configExists": true,
    "providersExists": true,
    "currentProfile": "packycode",
    "currentProfileMapped": true,
    "provider": "packycode"
  },
  "warnings": [],
  "error": null
}
```

#### 设计说明

- `status` 是概览，不做深度建议
- 深度问题检测交给 `doctor`

### 4.4 `codexs switch <provider>`

#### 目标

切换到指定 provider，并默认同步更新登录状态。

#### 输入

```bash
codexs switch <provider> [--no-login] [--json] [--codex-dir <path>]
```

#### 交互行为

- 当 `<provider>` 缺失且当前是 TTY 时，先从 `providers.json` 读取 provider 列表，再用选择器选择 provider
- 当 `<provider>` 已显式传入时，不额外确认
- `--no-login` 仍保持显式 flag，不进入提问

#### 前置校验

- `providers.json` 必须存在
- provider 必须存在
- provider 对应的 `profile` 必须存在于 `config.toml`

#### 执行步骤

1. 读取 provider 数据
2. 校验 profile
3. 备份 `config.toml`
4. 如果存在，备份 `auth.json`
5. 更新顶层 `profile`
6. 默认执行 `codex login --with-api-key`
7. 成功则保存为最近一次备份
8. 失败则按 manifest 回滚

#### 成功输出

JSON 示例：

```json
{
  "ok": true,
  "command": "switch",
  "data": {
    "provider": "freemodel",
    "profile": "freemodel",
    "loginPerformed": true,
    "backupPath": "C:\\Users\\name\\.codex\\backups\\20260511-221550-switch"
  },
  "warnings": [],
  "error": null
}
```

#### 失败错误码

- `PROVIDER_NOT_FOUND`
- `PROFILE_NOT_FOUND`
- `BACKUP_FAILED`
- `CODEX_LOGIN_FAILED`
- `ROLLBACK_FAILED`

#### 注意事项

- `--no-login` 仅跳过登录，不跳过备份和 profile 修改
- 登录失败时当前实现会附带 `rollbackApplied: true`

### 4.5 `codexs import <file>`

#### 目标

整体替换当前 `providers.json`。

#### 输入

```bash
codexs import <file> [--json] [--codex-dir <path>]
```

#### 行为语义

- 只支持整体替换
- 不支持 merge
- 写入前备份当前 `providers.json`
- 路径参数必须显式传入
- TTY 中实际替换前增加一次确认

#### 成功输出

```json
{
  "ok": true,
  "command": "import",
  "data": {
    "importedProviders": ["imported"],
    "backupPath": "C:\\Users\\name\\.codex\\backups\\20260511-221457-import"
  },
  "warnings": [],
  "error": null
}
```

#### 失败错误码

- `INVALID_IMPORT_FILE`
- `BACKUP_FAILED`
- `ROLLBACK_FAILED`

### 4.6 `codexs export <file>`

#### 目标

导出当前 `providers.json` 到指定位置。

#### 输入

```bash
codexs export <file> [--force] [--json] [--codex-dir <path>]
```

#### 行为语义

- 默认不覆盖已有文件
- 传 `--force` 后允许覆盖
- 路径参数必须显式传入
- 当目标文件已存在、当前是 TTY 且未传 `--force` 时，可通过确认后继续覆盖

#### 成功输出

```json
{
  "ok": true,
  "command": "export",
  "data": {
    "exportedTo": "C:\\path\\providers-export.json",
    "count": 3
  },
  "warnings": [],
  "error": null
}
```

#### 失败错误码

- `INVALID_IMPORT_FILE`
- `PROVIDERS_NOT_FOUND`
- `PROVIDERS_PARSE_ERROR`

### 4.7 `codexs add <provider>`

#### 目标

新增一条 provider 记录。

#### 输入

```bash
codexs add <provider> \
  --profile <name> \
  --api-key <key> \
  [--base-url <url>] \
  [--note <text>] \
  [--tag <tag>] \
  [--json] \
  [--codex-dir <path>]
```

#### 行为语义

- provider 名必须唯一
- 写入前备份旧 `providers.json`
- 显式参数模式保持可用
- 当缺少必填字段且 stdin/stdout 都是 TTY 时，允许渐进式提问
- `--json` 或非 TTY 场景下仍要求显式传入必填参数
- `profile` 优先从 `config.toml` 已有 profile 列表里选择，获取失败时退回文本输入
- `apiKey` 使用隐藏输入并要求二次确认

#### 成功输出

```json
{
  "ok": true,
  "command": "add",
  "data": {
    "provider": "temp",
    "profile": "freemodel",
    "backupPath": "C:\\Users\\name\\.codex\\backups\\20260511-221457-add"
  },
  "warnings": [],
  "error": null
}
```

#### 失败错误码

- `INVALID_IMPORT_FILE`
- `BACKUP_FAILED`
- `ROLLBACK_FAILED`

### 4.8 `codexs remove <provider>`

#### 目标

删除一条 provider 记录。

#### 输入

```bash
codexs remove <provider> [--force] [--json] [--codex-dir <path>]
```

#### 行为语义

- TTY 中若缺少 `<provider>`，允许先选择 provider
- TTY 中始终需要确认，确认文案必须带 provider 名
- TTY 中即使未传 `--force`，也可通过确认完成删除
- 非 TTY 或 `--json` 场景下仍要求显式 `<provider> --force`
- 先备份再删除

#### 失败错误码

- `PROVIDER_NOT_FOUND`
- `INVALID_IMPORT_FILE`
- `BACKUP_FAILED`
- `ROLLBACK_FAILED`

### 4.9 `codexs doctor`

#### 目标

返回结构化问题列表，而不是只给一个总体状态。

#### 输入

```bash
codexs doctor [--json] [--codex-dir <path>]
```

#### 当前诊断项

- `config.toml` 是否存在
- `providers.json` 是否存在
- `providers.json` 是否可解析
- provider 的 profile 是否存在
- `codex` CLI 是否可执行

#### 当前返回结构

```json
{
  "ok": true,
  "command": "doctor",
  "data": {
    "healthy": false,
    "issues": [
      {
        "code": "CODEX_LOGIN_FAILED",
        "message": "codex CLI is not available.",
        "cause": "spawnSync codex EPERM"
      }
    ],
    "codexDir": "C:\\Users\\name\\.codex"
  },
  "warnings": ["doctor found 1 issue(s)"],
  "error": null
}
```

#### 说明

- 当前实现把 codex CLI 缺失归到 `CODEX_LOGIN_FAILED`
- 后续可按需要拆分更细错误码

### 4.10 `codexs rollback`

#### 目标

恢复最近一次备份对应的文件状态。

#### 输入

```bash
codexs rollback [--json] [--codex-dir <path>]
```

#### 行为语义

- 读取 `backups/latest.json`
- 恢复 manifest 中记录的文件
- 如果最近一次备份包含 `auth.json`，一并恢复
- TTY 中执行前会展示备份目录和受影响文件摘要，并请求确认

#### 成功输出

```json
{
  "ok": true,
  "command": "rollback",
  "data": {
    "restoredFiles": ["config.toml", "auth.json"],
    "backupPath": "C:\\Users\\name\\.codex\\backups\\20260511-221550-switch"
  },
  "warnings": [],
  "error": null
}
```

#### 失败错误码

- `ROLLBACK_FAILED`

## 5. 默认输出与敏感信息策略

默认输出遵循：

- 不打印完整 `apiKey`
- 不打印无关调试信息
- 成功时尽量只返回命令核心结果

JSON 输出也遵循相同策略：

- `error.details` 不应包含完整 `apiKey`
- 主要返回路径、命令对象、回滚状态等可操作信息

## 6. AI / 自动化调用建议

对 AI 代理或自动化脚本，推荐以下调用约定：

- 一律使用 `--json`
- 严格按 `error.code` 判断失败类型
- 对 `switch` 命令关注：
  - `provider`
  - `profile`
  - `loginPerformed`
  - `backupPath`
  - `rollbackApplied`
- 对 `doctor` 命令关注：
  - `healthy`
  - `issues[]`

推荐模式：

1. 先调用 `status --json`
2. 再调用 `doctor --json`
3. 满足前置条件后调用 `switch --json`
4. 失败时根据错误码决定是否提示用户手动执行 `rollback`

## 7. 后续命令演进建议

如果继续扩展命令面，建议新增命令时遵守下面三条：

- 不破坏当前 JSON envelope
- 不复用语义不匹配的错误码
- 所有写命令默认纳入备份与回滚模型

未来候选命令：

- `codexs show <provider>`
- `codexs edit <provider>`
- `codexs backups list`
- `codexs rollback <backup-id>`
- `codexs import --merge`

## 8. 结论

`codex-switch` 当前命令设计已经具备下面几个工程特征：

- 命令面稳定
- 参数风格统一
- JSON 输出可机器解析
- 写操作具备安全语义
- 错误码已可作为 AI 调用契约

这意味着它已经不再只是“能切换配置的脚本集合”，而是一套具备持续演进空间的 CLI 命令体系。
