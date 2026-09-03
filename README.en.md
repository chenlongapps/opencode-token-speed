# opencode-token-speed

[![OpenCode](https://img.shields.io/badge/OpenCode-%E2%89%A51.3.14-blue?style=flat-square)](https://opencode.ai/)
[![npm version](https://img.shields.io/npm/v/opencode-token-speed?logo=npm&style=flat-square)](https://www.npmjs.com/package/opencode-token-speed)

[中文](README.md)

OpenCode TUI plugin that displays generation speed metrics in the session sidebar: real-time TPS, session-average TPS, and average TTFT.

## Preview

After opening the sidebar (Command Palette → **Show sidebar**), the metrics are displayed below the Context block:

![Preview](https://raw.githubusercontent.com/chenlongapps/opencode-token-speed/main/assets/demo.gif)

- **TPS**: Real-time generation speed
- **AVG**: Average generation speed for the current session
- **TTFT**: Average time to first token for the current session

> Note: TTFT/TPS are estimates. Actual values may vary depending on the model, network, and runtime environment.

## Installation

```bash
opencode plugin opencode-token-speed@latest --global
```

Requires `opencode >= 1.3.14`.

## Uninstallation

Edit the OpenCode global configuration file at `~/.config/opencode/opencode.json` and remove `opencode-token-speed` from the `plugin` array. Then restart OpenCode.

## References

- https://github.com/Tarquinen/oc-tps
- https://github.com/ChiR24/opencode-tps-meter
- https://github.com/XiaomiMiMo/MiMo-Code
