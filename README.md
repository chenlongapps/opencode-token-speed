# opencode-token-speed

OpenCode TUI 插件:在会话侧边栏显示生成速度指标 —— 实时 TPS、会话平均 TPS、平均 TTFT。

## 显示效果

打开侧边栏(命令面板 → "Show sidebar")后,在 Context 块下方显示:

```text
Speed
TPS: 82.4
AVG: 61.0
TTFT: 1.2s
```

| 指标 | 含义 |
| --- | --- |
| TPS | 实时生成速度,基于最近 5 秒滑动窗口的流式采样估算;单条消息生成时长(不含 TTFT)不足 1s 时,完成后改用官方 token 统计(output + reasoning)÷ 实际时长;工具调用等停顿期间及响应结束后保留最后一次有效值 |
| AVG | 本会话已完成消息的平均生成速度(tokens ÷ 生成时长,不含 TTFT) |
| TTFT | 本会话平均首 token 延迟(请求发出 → 收到首个响应) |

## 安装(本地路径)

```bash
opencode plugin /Users/chenlong/Downloads/opencode-token-speed/opencode-token-speed --global
```

注意:命令是 `opencode plugin <路径>`,没有 `install` 子命令。

本地路径插件直接从源码目录加载,修改 `tui.tsx` 后重启 opencode 即生效,无需重新安装。

要求 `opencode >= 1.3.14`。

## 调整显示位置

插件注册在 `sidebar_content` 槽位,`order` 为 `150`(紧跟内置 Context 块之后)。内置块的叠放顺序为:Context=100、MCP=200、LSP=300、TODO=400、Files=500;修改 `tui.tsx` 中 `api.slots.register({ order: ... })` 的值即可调整位置。

## 参考项目

- https://github.com/Tarquinen/oc-tps
- https://github.com/ChiR24/opencode-tps-meter
- https://github.com/XiaomiMiMo/MiMo-Code
