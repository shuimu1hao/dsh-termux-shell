# 在 Termux 安装 dsh-termux-shell

dsh 在 Termux 上装插件与桌面不同：这个插件没有发布到 npm，`git clone` / `github:` 安装又常被网络阻断和 pnpm 的构建许可拦住。下面的流程按「下载源码 → 从本地目录安装（pnpm link）」走，不需要联网编译，也绕开了这些坑。

## 前置条件

- Termux（Android）里 dsh 已能正常启动（`dsh web` 能打开页面）。
- **Node.js ≥ 24.9**：`node -v`。dsh 0.2.2 起要求 24.9 以上。
- **pnpm 在 PATH**：`pnpm -v`。缺失时 `npm install -g pnpm`；`dsh plugin` 找不到 pnpm 时会提示 `pnpm was not found`。
- **dsh ≥ 0.2.2-rc.3**：`dsh --version`。更低版本会被插件的 `engines.dsh` 预检禁用；先升级 dsh：`npm install -g @deepseek-ai/dsh`。
- **源码和 profile 都放在 Termux 家目录**（`$HOME`，即 `/data/data/com.termux/files/home`）。不要放在 `/storage/emulated/0` 等共享存储：那里是 FUSE 文件系统，pnpm 需要的符号链接和权限会失败。

## 1. 获取插件源码

方式 A（推荐，`github.com` 被墙时也能用；实测可用）：

```bash
mkdir -p "$HOME/dsh-plugins"
cd "$HOME/dsh-plugins"
curl -fL -o dsh-termux-shell.zip \
  https://codeload.github.com/shuimu1hao/dsh-termux-shell/zip/refs/heads/master
unzip -q dsh-termux-shell.zip
mv dsh-termux-shell-master dsh-termux-shell
rm dsh-termux-shell.zip
```

方式 B（`github.com` 可达时用 git）：

```bash
mkdir -p "$HOME/dsh-plugins"
cd "$HOME/dsh-plugins"
git clone --depth 1 https://github.com/shuimu1hao/dsh-termux-shell.git
```

> 克隆卡住或报 `Failed to connect to github.com:443` 属于主域被阻断，不是插件问题；改用方式 A。`api.github.com` 和 `codeload.github.com` 通常仍可达。

校验：

```bash
ls "$HOME/dsh-plugins/dsh-termux-shell"
node -e "console.log(require(process.env.HOME + '/dsh-plugins/dsh-termux-shell/package.json').version)"
```

版本应为 `0.1.2` 或更新。

## 2. 安装到 profile

先停掉正在运行的 dsh（`Ctrl+C`），二选一：

**方式 A：命令行（推荐）**

```bash
dsh plugin --profile web add "$HOME/dsh-plugins/dsh-termux-shell"
```

- 这是 pnpm 的本地 link 安装：不联网、不编译。
- 成功后输出里会有 `+ dsh-termux-shell`，并自动把 `dsh-termux-shell` 加进该 profile 的 `dsh.profile.bundles`。
- 要装到其他 profile，把 `web` 换成对应名字。

**方式 B：Web 页面**

启动 `dsh web`，打开侧边栏 **Plugins** → **Add plugin**，填入绝对路径：

```
/data/data/com.termux/files/home/dsh-plugins/dsh-termux-shell
```

点安装，等它显示已安装/已启用。本插件没有构建脚本，不会出现待批准的构建。

> 不要用 `dsh plugin --profile web add dsh-termux-shell`（npm 上没有这个包）或 `... add github:shuimu1hao/dsh-termux-shell`（需要 pnpm 允许 `prepare` 构建，且依赖 `github.com` 网络，Termux 上容易失败）。

## 3. 重启并确认

```bash
# 之前停掉的 dsh web 重新启动
dsh web
```

检查：

- 新会话里模型应能调用 `termux_bash`；沙箱预设（`read-only` / `workspace-write`）下内置 `bash` 会报 `SANDBOX_UNAVAILABLE`，用 `termux_bash`。
- Web 的 **Plugins** → `dsh-termux-shell` → `termux-bash` 行，页面底部有参数表单（0.1.2 起）。
- 命令行核对组合结果：

```bash
dsh --profile web --dump-config | grep -A 3 'termux-bash'
```

## 4. 在页面上自定义参数（0.1.2 起）

打开 **Plugins** → `dsh-termux-shell` → `termux-bash` 行，页面底部表单可改：

| 参数 | 说明 |
|---|---|
| 允许无隔离执行 | 必开；Android 没有可用文件沙箱 |
| Shell 路径 / 默认工作目录 | 留空恢复默认（`$PREFIX/bin/bash` / 会话工作目录） |
| 默认超时 / 超时上限 | 毫秒，> 0 |
| 单流输出上限 / spill 上限 | 字节，> 0 |
| 终止宽限期 | 毫秒，> 0 |

保存后写入当前 profile 配置层，**下一次 `termux_bash` 调用即生效，无需重启**；清空某个字段表示恢复默认，带“已覆盖”标记的字段表示被用户覆盖。

## 5. 升级

```bash
cd "$HOME/dsh-plugins/dsh-termux-shell"
git pull            # git 安装
# 或 zip 安装：重新执行第 1 节的下载解压，覆盖原目录
```

重启 dsh 生效。`link` 安装不需要重新执行 `dsh plugin add`。

## 6. 卸载

```bash
dsh plugin --profile web remove dsh-termux-shell
```

或在 **Plugins** 页面选中 `dsh-termux-shell` → Uninstall。之后可删除源码目录。

## 常见问题

| 现象 | 处理 |
|---|---|
| `pnpm was not found` | `npm install -g pnpm` |
| `dsh: plugin command failed; diagnostics: <path>` | 打开该 log 看 pnpm 报错，常见是网络或权限 |
| `git clone` 卡住 / `Failed to connect to github.com:443` | 主域被阻断，改用第 1 节方式 A（codeload zip） |
| 安装后没有 `termux_bash` | 没重启 dsh；或插件行被禁用；检查 `dsh --version` 是否满足 `engines.dsh` |
| 页面没有参数表单 | 重启后仍没有：确认 bundle 已启用，并检查 Plugins 里该行是否为 `termux-bash` |
| `EACCES` / `operation not permitted` | 源码或 profile 在共享存储上，移到 `$HOME` 后重装 |
| 内置 bash 报 `SANDBOX_UNAVAILABLE` | 这是预期行为；改用 `termux_bash`（`danger-full-access` 预设下内置 bash 也可用） |

## 安全说明

`termux_bash` 以 harness 进程自身权限执行命令，**没有文件隔离**。`acknowledgeUnconfined` 只是防误配的显式开关，不是安全边界；只在你信任当前会话与命令来源时使用。
