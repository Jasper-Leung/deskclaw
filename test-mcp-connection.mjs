/**
 * Test script for MCP browser connection
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function testMCPConnection() {
  console.log('Testing MCP browser connection...\n');

  let transport = null;
  let client = null;

  try {
    console.log('1. Creating transport...');
    transport = new StdioClientTransport({
      command: process.platform === 'win32' ? 'cmd.exe' : 'npx',
      args:
        process.platform === 'win32'
          ? [
              '/c',
              'npx',
              '-y',
              'chrome-devtools-mcp@latest',
              '--browserUrl',
              'http://127.0.0.1:9222',
              '--no-usage-statistics',
            ]
          : [
              '-y',
              'chrome-devtools-mcp@latest',
              '--browserUrl',
              'http://127.0.0.1:9222',
              '--no-usage-statistics',
            ],
    });

    console.log('2. Creating client...');
    client = new Client(
      {
        name: 'test-mcp-browser',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    console.log('3. Connecting to chrome-devtools-mcp...');
    await client.connect(transport);
    console.log('✅ Connected to chrome-devtools-mcp!\n');

    console.log('4. Listing available tools...');
    const tools = await client.listTools();
    console.log(`   Found ${tools.tools.length} tools:\n`);
    tools.tools.forEach((tool) => {
      console.log(`   - ${tool.name}: ${tool.description?.substring(0, 80)}...`);
    });

    console.log('\n5. Testing chrome_devtools_protocol tool...');
    const result = await client.request(
      {
        method: 'tools/call',
        params: {
          name: 'chrome_devtools_protocol',
          arguments: {
            method: 'Target.getTargets',
          },
        },
      },
      await import('@modelcontextprotocol/sdk/types.js').then((m) => m.CallToolResultSchema)
    );

    console.log('✅ Tool call result:');
    if (result?.content?.[0]?.text) {
      const data = JSON.parse(result.content[0].text);
      if (data.targetInfos) {
        console.log(`   Found ${data.targetInfos.length} targets:`);
        data.targetInfos
          .filter((t) => t.type === 'page')
          .forEach((t) => {
            console.log(`   - ${t.title} (${t.url.substring(0, 60)}...)`);
          });
      }
    }

    console.log('\n✅ All tests passed!\n');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.message.includes('ECONNREFUSED') || error.message.includes('connect')) {
      console.error('\nMake sure Chrome is running with --remote-debugging-port=9222');
      console.error('Run: start-chrome-debug.bat');
    }
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
    }
    if (transport && transport.close) {
      await transport.close();
    }
  }
}

testMCPConnection();
