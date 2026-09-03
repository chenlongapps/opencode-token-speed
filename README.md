# opencode-token-speed

[![OpenCode](https://img.shields.io/badge/OpenCode-%E2%89%A51.3.14-blue?style=flat-square)](https://opencode.ai/)
[![npm version](https://img.shields.io/npm/v/opencode-token-speed?logo=npm&style=flat-square)](https://www.npmjs.com/package/opencode-token-speed)

[English](README.en.md)

OpenCode TUI 插件:在会话侧边栏显示生成速度指标 —— 实时 TPS、会话平均 TPS、平均 TTFT。

## 显示效果

终端宽度 > 120 时显示侧边栏，指标位于 Context 块下方:

![演示效果](https://raw.githubusercontent.com/chenlongapps/opencode-token-speed/main/assets/demo.gif)

- **TPS**：实时生成速度
- **AVG**：本会话平均生成速度
- **TTFT**：本会话平均首 token 延迟

> 注：TTFT/TPS 均为估算值，实际数值可能因模型、网络和运行环境而有所差异。

## 安装

```bash
opencode plugin opencode-token-speed@latest --global
```

要求 `opencode >= 1.3.14`。

## 卸载

编辑 OpenCode 全局配置文件 `~/.config/opencode/opencode.json`，从 `plugin` 数组中移除 `opencode-token-speed`，然后重启 OpenCode。

## 参考项目

- https://github.com/Tarquinen/oc-tps
- https://github.com/ChiR24/opencode-tps-meter
- https://github.com/XiaomiMiMo/MiMo-Code
