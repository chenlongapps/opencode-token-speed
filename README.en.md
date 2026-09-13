# opencode-token-speed

[![OpenCode](https://img.shields.io/badge/OpenCode-%E2%89%A51.3.14-blue?style=flat-square)](https://opencode.ai/)
[![npm version](https://img.shields.io/npm/v/opencode-token-speed?logo=npm&style=flat-square)](https://www.npmjs.com/package/opencode-token-speed)

[中文](README.md)

OpenCode TUI plugin that displays generation speed metrics in the session sidebar or at the bottom right of the prompt: real-time TPS, session-average TPS, and average TTFT.

## Preview

- **Sidebar open**: Metrics appear below the Context block, on three lines in the Speed section, with the `tok/s` and `s` units.
- **Sidebar closed**: Metrics appear at the bottom right of the prompt, on the same row as the model information, for example `TPS: 42.0 · AVG: 38.5 · TTFT: 1.2`.
- **Limited space**: TTFT is hidden first, then AVG, keeping TPS as the priority. Extremely narrow layouts truncate the text to stay on one line. More metrics reappear automatically when space becomes available.

The display follows automatic sidebar visibility, manual toggles, and terminal resizing without configuration or resetting the statistics. By default, OpenCode automatically shows the sidebar when the terminal is wider than 120 columns.

Sidebar preview:

![Preview](https://raw.githubusercontent.com/chenlongapps/opencode-token-speed/main/assets/demo.gif)

- **TPS**: Real-time generation speed
- **AVG**: Average generation speed for the current session
- **TTFT**: Average time to first token for the current session

> Note: TTFT/TPS are estimates. Actual values may vary depending on the model, network, and runtime environment.

## Installation

Global installation:

```bash
opencode plugin opencode-token-speed@latest --global
```

Project-level installation (run from the project root):

```bash
opencode plugin opencode-token-speed@latest
```

Requires `opencode >= 1.3.14`.

## Uninstallation and Cache Refresh

Remove the plugin configuration from OpenCode, then delete the plugin cache directory. OpenCode's official documentation lists the default cache root as `~/.cache/opencode` on macOS/Linux and `%USERPROFILE%\.cache\opencode` on Windows. Depending on the OpenCode version, npm plugins may be stored under either `packages/...@latest` or `node_modules/...`.

Quit OpenCode, then run the command for your platform to remove this plugin's cache:

macOS/Linux:

```bash
rm -rf ~/.cache/opencode/packages/opencode-token-speed@latest
rm -rf ~/.cache/opencode/node_modules/opencode-token-speed
```

Windows PowerShell:

```powershell
Remove-Item -Recurse -Force "$env:USERPROFILE\.cache\opencode\packages\opencode-token-speed@latest" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$env:USERPROFILE\.cache\opencode\node_modules\opencode-token-speed" -ErrorAction SilentlyContinue
```

Windows Command Prompt:

```bat
rmdir /s /q "%USERPROFILE%\.cache\opencode\packages\opencode-token-speed@latest"
rmdir /s /q "%USERPROFILE%\.cache\opencode\node_modules\opencode-token-speed"
```

When using Windows with WSL, run the macOS/Linux command inside WSL. If neither plugin directory exists, follow the official documentation and delete the entire cache root for your platform, then restart OpenCode to reinstall the plugin.

References: [OpenCode plugin documentation](https://opencode.ai/docs/plugins/#how-plugins-are-installed) and [OpenCode troubleshooting documentation](https://opencode.ai/docs/troubleshooting/#clear-the-cache).

## References

- https://github.com/Tarquinen/oc-tps
- https://github.com/ChiR24/opencode-tps-meter
- https://github.com/XiaomiMiMo/MiMo-Code
