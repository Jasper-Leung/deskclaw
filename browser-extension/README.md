# DeskClaw Browser Controller - 浏览器扩展

这是一个无需远程调试即可控制浏览器的扩展方案。

## 安装方法

### Chrome/Edge (开发者模式)

1. 打开浏览器，访问 `chrome://extensions/` (Edge: `edge://extensions/`)
2. 启用右上角的 "Developer mode"
3. 点击 "Load unpacked"
4. 选择此扩展所在的文件夹：`D:\code\20260305\miniclaw7\browser-extension`
5. 扩展安装完成！

## 使用方法

### 1. 启动 DeskClaw Extension Bridge 服务

在 DeskClaw 中启动扩展桥接服务（将在UI中添加此功能）。

### 2. 使用扩展控制浏览器

扩展会自动连接到 DeskClaw，然后你可以：

- **导航到URL**：自动打开网页
- **获取页面快照**：读取页面内容
- **点击元素**：通过CSS选择器点击
- **输入文本**：在输入框中输入文字
- **执行脚本**：在页面中执行JavaScript
- **截图**：获取当前页面截图

## 工作原理

```
┌─────────────┐         WebSocket         ┌──────────────────┐
│  DeskClaw   │◄────────────────────────────────►│ Browser Extension │
│   App       │                            │  (Chrome/Edge)     │
└─────────────┘         Commands           └──────────────────┘
```

## 优势

- ✅ 无需 `--remote-debugging-port` 参数
- ✅ 无需启动额外的浏览器实例
- ✅ 保留所有Cookie和登录状态
- ✅ 可以使用浏览器扩展
- ✅ 不影响正常浏览体验

## 注意事项

- 扩展需要在浏览器启动时才能工作
- 某些敏感网站可能禁止扩展访问
- 需要DeskClaw运行时扩展才能工作
