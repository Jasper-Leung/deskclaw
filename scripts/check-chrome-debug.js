/* eslint-disable no-undef, no-useless-escape */
/**
 * Chrome DevTools Connection Checker
 *
 * This script checks if Chrome is running with remote debugging enabled.
 */

import http from 'http';

const CHROME_CDP_PORT = 9222;

async function checkChromeDevTools() {
  console.log('检查 Chrome DevTools Protocol 连接...\n');

  // Try to connect to Chrome DevTools
  const options = {
    hostname: 'localhost',
    port: CHROME_CDP_PORT,
    path: '/json/version',
    method: 'GET',
    timeout: 5000,
  };

  return new Promise((resolve) => {
    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const info = JSON.parse(data);
            console.log('✅ 成功连接到 Chrome DevTools！');
            console.log('\nChrome 信息:');
            console.log(`  - Browser: ${info['Browser']}`);
            console.log(`  - Protocol-Version: ${info['Protocol-Version']}`);
            console.log(`  - WebSocket URL: ${info['webSocketDebuggerUrl']}`);
            console.log('\n现在可以启动应用程序使用 MCP 浏览器服务。');
            resolve(true);
          } catch {
            console.log('❌ 无法解析 Chrome 响应:', data);
            resolve(false);
          }
        } else {
          console.log(`❌ Chrome DevTools 返回状态码: ${res.statusCode}`);
          console.log('\n这表明端口 9222 上有服务运行，但不是 Chrome DevTools。');
          console.log('\n请检查：');
          console.log('  1. 是否有其他程序占用了 9222 端口');
          console.log('  2. 尝试使用其他端口，如 9223');
          resolve(false);
        }
      });
    });

    req.on('error', (error) => {
      console.log('❌ 无法连接到端口 9222 上的 Chrome DevTools');
      console.log('\n错误:', error.message);
      console.log('\n请按以下步骤操作：\n');
      console.log('1. 关闭所有 Chrome 窗口');
      console.log('2. 使用以下命令启动 Chrome：\n');
      console.log('   Windows:');
      console.log(
        '   chrome.exe --remote-debugging-port=9222 --user-data-dir="%TEMP%\chrome-debug"\n'
      );
      console.log('   或找到 Chrome 安装路径：');
      console.log(
        '   "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222\n'
      );
      console.log('3. 确保 Chrome 正在运行');
      console.log('4. 重新运行此检查脚本\n');
      console.log('或者使用快捷方式：');
      console.log('  1. 复制 Chrome 快捷方式');
      console.log('  2. 右键 -> 属性 -> 目标');
      console.log('  3. 在路径后添加: --remote-debugging-port=9222');
      console.log('  4. 使用此快捷方式启动 Chrome\n');
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      console.log('❌ 连接超时');
      console.log('\n请确保 Chrome 已启动并启用了远程调试。');
      resolve(false);
    });

    req.end();
  });
}

// Run the check
checkChromeDevTools().then((success) => {
  process.exit(success ? 0 : 1);
});
