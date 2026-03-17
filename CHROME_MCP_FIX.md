# Chrome MCP 浏览器控制修复说明

## 问题原因

项目无法控制浏览器的主要原因是：

1. Chrome 没有使用 `--remote-debugging-port=9222` 参数启动
2. `chrome-devtools-mcp` 需要使用 `--browserUrl` 参数连接到现有的 Chrome 实例

## 修复内容

### 1. 创建了 Chrome 启动脚本

文件：`start-chrome-debug.bat`

使用方法：

```bash
# 双击运行或命令行执行
.\start-chrome-debug.bat
```

该脚本会：

- 关闭所有现有的 Chrome 窗口
- 使用临时用户数据目录启动 Chrome（避免配置文件冲突）
- 启用远程调试端口 9222
- 自动测试连接是否成功

### 2. 修复了 MCP 连接配置

文件：`electron/main/browser/mcp-browser-service.ts`

主要修改：

- 将 `hostname` 从 `localhost` 改为 `127.0.0.1`（避免 IPv6 问题）
- 使用 `--browserUrl http://127.0.0.1:9222` 参数启动 `chrome-devtools-mcp`
- 使用 `cmd.exe` 包装 `npx` 命令以提高 Windows 兼容性
- 将 `syncSessions` 方法改为 `public` 以便外部调用
- 使用 `list_pages` 工具代替 `chrome_devtools_protocol`

### 3. 修复了 TypeScript 错误

- 移除了未使用的导入和函数
- 修复了类型导入问题

## 使用步骤

### 方法 A：使用启动脚本（推荐）

1. 关闭所有 Chrome 窗口
2. 运行启动脚本：
   ```bash
   .\start-chrome-debug.bat
   ```
3. 等待脚本显示 "SUCCESS: Chrome DevTools is available!"
4. 启动应用并连接浏览器控制

### 方法 B：手动启动 Chrome

1. 关闭所有 Chrome 窗口
2. 使用以下命令启动 Chrome：
   ```bash
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%TEMP%\chrome-debug-profile"
   ```
3. 在应用中点击"连接浏览器"

### 方法 C：使用现有用户数据目录

如果你想使用现有的 Chrome 书签、扩展等：

1. 关闭所有 Chrome 窗口
2. 使用以下命令启动 Chrome：
   ```bash
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\Users\Sewaken\AppData\Local\Google\Chrome\User Data"
   ```
3. **注意**：这可能会关闭你现有的 Chrome 窗口

## 验证连接

### 1. 检查 Chrome DevTools 是否可用

在浏览器中打开：http://127.0.0.1:9222/json

你应该能看到当前打开的页面列表。

### 2. 测试 MCP 连接

运行测试脚本：

```bash
node test-mcp-connection.mjs
```

如果显示 "✅ All tests passed!"，则连接成功。

## 常见问题

### Q: Chrome 启动后没有显示窗口

A: 检查任务管理器，Chrome 可能已经在后台运行。关闭所有 Chrome 进程后重新运行启动脚本。

### Q: 端口 9222 被占用

A: 运行以下命令查找占用端口的进程：

```bash
netstat -ano | findstr :9222
```

然后终止该进程或重启电脑。

### Q: 连接超时

A: Chrome 可能需要更长时间启动。等待 10-15 秒后再试。

### Q: chrome-devtools-mcp 启动失败

A: 确保已安装 Node.js 和 npm。运行：

```bash
npm install -g chrome-devtools-mcp
```

### Q: 防火墙阻止连接

A: 允许 localhost:9222 通过防火墙，或暂时关闭防火墙测试。

## 技术细节

### chrome-devtools-mcp 参数说明

- `--browserUrl http://127.0.0.1:9222`: 连接到现有的 Chrome 实例
- `--wsEndpoint ws://...`: 或者使用 WebSocket 端点直接连接
- `--autoConnect`: 自动连接（仅适用于 Chrome 144+）
- `--no-usage-statistics`: 禁用使用统计收集

### MCP 工具列表

连接成功后，可以使用以下工具：

- `list_pages`: 获取所有打开的页面
- `navigate_page`: 导航到 URL
- `take_screenshot`: 截图
- `click`: 点击元素
- `fill`: 填充表单
- `type_text`: 输入文本
- `press_key`: 按键
- `evaluate_script`: 执行 JavaScript
- 等等...

## 下一步

连接成功后，你可以在应用中：

1. 查看当前打开的 Chrome 页面
2. 选择要控制的页面
3. 使用各种工具控制浏览器
4. 自动化工作流程
