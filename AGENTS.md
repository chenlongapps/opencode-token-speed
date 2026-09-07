# 仓库说明

## 项目结构

- 这是一个单独的 npm 软件包；没有 workspace，也没有生成的源代码目录。
- 根目录的 `tui.tsx` 是唯一的运行时入口，仅转发 `src/tui.tsx` 的默认导出，并通过 `./tui` 暴露；修改时需确保与 OpenCode TUI 和 `@opentui/solid` 兼容。
- `src/tui.tsx` 包含插件主体、指标计算、状态跟踪、事件订阅、生命周期和插槽注册；`src/sidebar-speed.tsx` 包含 `SidebarSpeed`、显示格式化和组件接口类型。
- 侧边栏通过 `sidebar_content` 插槽注册。流式指标来自 `message.part.delta`，消息总数由 `message.updated` 最终确定，工具耗时由 `message.part.updated` 处理。
- 请将指标计算与侧边栏格式化分离：计算和状态跟踪放在插件主体中，显示格式化放在 `SidebarSpeed` 中。
- 修改 README 时，必须同时更新 `README.md` 和 `README.en.md` 两种语言版本。

## 安装与验证

- 使用 `npm ci`，以确保依赖遵循 `package-lock.json`。
- 未定义构建、测试、代码检查、格式化或类型检查脚本/配置。CI 会有意运行 `npm run build --if-present` 和 `npm test --if-present`，目前这些命令会跳过执行。
- 使用 `npm pack --dry-run --json` 检查发布内容。软件包明确包含 `README.md`、`README.en.md`、根目录的 `tui.tsx` 和 `src/` 中的实现文件。
- CI 使用 Node 24.x。软件包采用 ESM（`"type": "module"`），并要求 OpenCode `>=1.3.14`。

### 本地测试

在仓库根目录执行 `npm ci`，然后创建 `.opencode/tui.json`（已有配置请合并）：

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["../tui.tsx"]
}
```

在仓库根目录运行 `opencode`，将终端宽度调至 > 120 列，让模型生成较长回复，检查侧边栏的 TPS、AVG 和 TTFT。

修改 `src/tui.tsx` 或 `src/sidebar-speed.tsx` 后重启 OpenCode 即可，无需构建或发布。上述本地配置继续使用根目录的转发入口。若已配置 npm 版插件，测试期间暂时移除其插件条目，避免冲突。

## 发布

- 正式版本必须通过 GitHub Release 发布。`.github/workflows/publish.yml` 监听 `release.published` 事件并执行 npm 发布。
- 发布前，将 `package.json` 以及 `package-lock.json` 中根级别的两个版本字段（`version` 和 `packages[""].version`）更新为相同的值。
- 发布标签必须严格为 `v<package.json version>`。包含 `-` 的版本必须使用 GitHub 预发布版本；稳定版本发布时使用 npm 的 `latest` dist-tag，预发布版本使用 `next`。
- 正式发布时不要手动运行 `npm publish`；请使用 GitHub Release 工作流。
