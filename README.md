# opencode-token-speed

[![OpenCode](https://img.shields.io/badge/OpenCode-%E2%89%A51.3.14-blue?style=flat-square)](https://opencode.ai/)
[![npm version](https://img.shields.io/npm/v/opencode-token-speed?logo=npm&style=flat-square)](https://www.npmjs.com/package/opencode-token-speed)

[English](README.en.md)

OpenCode TUI 插件：在会话侧边栏或输入框底部右侧显示生成速度指标 —— 实时 TPS、会话平均 TPS、平均 TTFT。

## 显示效果

- **侧边栏打开时**：指标位于 Context 块下方，在 Speed 区块中分三行显示，并保留 `tok/s` 和 `s` 单位。
- **侧边栏关闭时**：指标在输入框底部、模型信息同一行的右侧显示，例如 `TPS: 42.0 · AVG: 38.5 · TTFT: 1.2`。
- **空间不足时**：依次隐藏 TTFT、AVG，优先保留 TPS；极窄时截断显示，始终保持单行。空间恢复后自动显示更多指标。

显示位置随侧边栏自动显隐、手动开关和终端尺寸变化自动切换，无需配置，统计数据不会因切换而重置。终端宽度 > 120 时，OpenCode 默认自动显示侧边栏。

侧边栏显示效果：

![演示效果](https://raw.githubusercontent.com/chenlongapps/opencode-token-speed/main/assets/demo.gif)

- **TPS**：实时生成速度
- **AVG**：本会话平均生成速度
- **TTFT**：本会话平均首 token 延迟

> 注：TTFT/TPS 均为估算值，实际数值可能因模型、网络和运行环境而有所差异。

## 安装

全局安装：

```bash
opencode plugin opencode-token-speed@latest --global
```

项目级安装（在项目根目录执行）：

```bash
opencode plugin opencode-token-speed@latest
```

要求 `opencode >= 1.3.14`。

## 卸载和刷新缓存

从 OpenCode 配置中删除插件配置，然后删除插件缓存目录。OpenCode 官方文档给出的默认缓存根目录为：macOS/Linux 使用 `~/.cache/opencode`，Windows 使用 `%USERPROFILE%\.cache\opencode`。不同 OpenCode 版本的 npm 插件子目录可能是 `packages/...@latest` 或 `node_modules/...`。

退出 OpenCode 后，按系统执行以下命令，删除本插件的缓存：

macOS/Linux：

```bash
rm -rf ~/.cache/opencode/packages/opencode-token-speed@latest
rm -rf ~/.cache/opencode/node_modules/opencode-token-speed
```

Windows PowerShell：

```powershell
Remove-Item -Recurse -Force "$env:USERPROFILE\.cache\opencode\packages\opencode-token-speed@latest" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$env:USERPROFILE\.cache\opencode\node_modules\opencode-token-speed" -ErrorAction SilentlyContinue
```

Windows 命令提示符：

```bat
rmdir /s /q "%USERPROFILE%\.cache\opencode\packages\opencode-token-speed@latest"
rmdir /s /q "%USERPROFILE%\.cache\opencode\node_modules\opencode-token-speed"
```

Windows 使用 WSL 时，请在 WSL 中执行 macOS/Linux 命令。如果上述插件目录都不存在，可按官方文档删除对应平台的整个缓存根目录，然后重启 OpenCode 重新安装插件。

参考：[OpenCode 插件文档](https://opencode.ai/docs/plugins/#how-plugins-are-installed) 和 [OpenCode 故障排查文档](https://opencode.ai/docs/troubleshooting/#clear-the-cache)。

## 参考项目

- https://github.com/Tarquinen/oc-tps
- https://github.com/ChiR24/opencode-tps-meter
- https://github.com/XiaomiMiMo/MiMo-Code
