# dsh-termux-shell

DeepSeek Harness（dsh）在 **Android / Termux** 上的 shell 工具插件：注册一个 `termux_bash` 工具，通过 `ctx.subprocess` 直接运行 `bash -c`。

## 环境声明（Environment）

本项目在 **MIUI 系统 + 小米 10 手机 + Termux（Android）** 环境下开发与验证。
如果你在本地部署失败，可能与本地系统环境（系统版本、Android 权限、Termux 配置等）有关，而非项目本身的问题。
此时可以让你的 AI Agent 查阅 **Android 官方文档**、**Termux 官方文档** 以及 **你所用系统的官方文档** 来排查解决。

## 为什么需要它

dsh 自带的 bash 工具走 `@deepseek-ai/dsh-sandbox-local`，其 runner 链（bwrap、Landlock）在 Android 上没有可用后端，因此在 `read-only` / `workspace-write` 策略下每条命令都会 fail-closed 报 `SANDBOX_UNAVAILABLE`。`danger-full-access` 不走 runner 链（直接以进程权限执行），此时内置 `bash` 可用。本插件不改动沙箱层，只额外提供一个**无文件隔离**的 shell 工具；它在任何预设下都不受文件沙箱约束。

插件还会通过 system prompt 章节提示模型：沙箱预设下内置 `bash` 不可用，请改用 `termux_bash`；`danger-full-access` 下两者都可用。

## 功能

- `termux_bash` 工具参数：`command`（必填）、`description`（必填）、`workdir`、`timeoutMs`
- Termux 环境：`$PREFIX/bin` 置于 `PATH` 首位、`TMPDIR=$PREFIX/tmp`、UTF-8 locale、`TERM=dumb`/`NO_COLOR=1`/`PAGER=cat`
- 输出与内置 bash 工具一致的形态：stdout、`[stderr]`、`[exit code: N]` / `[killed by signal: X]` / `[timed out after Nms]`
- 输出上限 64 KiB（尾部截断），超出部分写 spill 文件
- 复用 `@deepseek-ai/dsh-subprocess` 的进程管理：超时 `SIGTERM` → `SIGKILL`、调用取消、组合卸载时回收进程

## 安装

```bash
dsh plugin --profile <profile> add ~/dsh-plugins/dsh-termux-shell
```

本包声明了 `dsh.bundle`，所以安装后会自动加入该 profile 的 `dsh.profile.bundles`（即默认启用）。插件行由包内的 `cordis.patch.yml` 插入（`id: termux-bash`），**不需要**手改 profile 的 patch 层。

安装后可在 Web 侧边栏 **Plugins** 页面查看并开关：

- bundle 级开关：选中/取消 `dsh-termux-shell` 这个 layer
- 行级开关：`termux-bash`（精确标识是 `include:termux-bash`，`plugin_manager` 工具要传这个 entryId）

没有 HMR 时改动需重启 dsh 生效；profile 的 `dsh.profile.bundles` 与 `cordis.patch.yml` 会记录开关状态。

## 配置

| 字段 | 默认 | 说明 |
|---|---|---|
| `acknowledgeUnconfined` | `false` | **必须显式设为 `true`**，否则工具在启动进程前直接报错。Android 没有可用文件沙箱，开启即表示接受无隔离执行 |
| `shellPath` | `$PREFIX/bin/bash` | shell 可执行文件 |
| `cwd` | 会话工作目录 | 未传 `workdir` 时的默认目录 |
| `timeoutMs` / `maxTimeoutMs` | `120000` / `600000` | 默认超时与上限 |
| `maxOutputBytes` | `64000` | 单流内存上限 |
| `graceMs` | `3000` | 终止宽限期 |

## 版本要求

| 字段 | 要求 |
|---|---|
| `engines.dsh` | `>=0.2.2-rc.3 <0.3.0` |

dsh 在加载 profile 时会先读 `engines.dsh`（优先于 `@deepseek-ai/dsh-*` peerDependencies）做兼容性判定；不满足时该插件行会被禁用并在 stderr 打印未满足的要求，而不是等到运行时才报错。升级 dsh 到 0.3 之前需要先在本插件里放宽/更新这个范围。

## 目录结构

```
dsh-termux-shell/
├── package.json        # 插件清单：dsh.bundle、engines.dsh、exports
├── cordis.patch.yml    # bundle 层：插入 termux-bash 行
├── lib/
│   ├── index.js        # 插件定义：Config、termux_bash 工具、system prompt 章节
│   └── termux.js       # 纯函数：shell 解析、环境构造、结果渲染、模型可见文案
├── test/
│   └── termux.test.mjs # node --test 单元测试
├── README.md
├── LICENSE
└── .gitignore
```

## 测试

```bash
cd ~/dsh-plugins/dsh-termux-shell
node --test
```

单元测试覆盖环境构造、shell 解析、结果渲染与模型可见文案；端到端验证通过 `dsh <profile> '用 termux_bash 执行 …'` 完成。

## 安全说明

`termux_bash` 以 harness 进程自身权限执行命令，**没有**文件隔离。`acknowledgeUnconfined` 只是防误配的显式开关，不是安全边界。

## 协议

MIT License，见 [LICENSE](LICENSE)。

## 变更记录

- **0.1.1**
  - 声明 `engines.dsh: ">=0.2.2-rc.3 <0.3.0"`：dsh 的兼容性预检会按此禁用不兼容的插件行，而不是静默放行（此前 peerDependencies 全为 `*`，任何版本都通过）。
  - 修正工具描述与 system prompt 章节中“内置 `bash` 必然失败”的说法：该结论仅在 `read-only` / `workspace-write` 下成立；`danger-full-access` 下 `dsh-bash-sandbox` 直接以进程权限执行，内置 `bash` 同样可用。
  - 在描述中补充：`termux_bash` 在沙箱预设下也不受文件沙箱约束。
- **0.1.0**：首个版本。
