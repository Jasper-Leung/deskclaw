/**
 * Control Tools Demo
 *
 * This script demonstrates how to use the keyboard/mouse control tools
 * in the DeskClaw application.
 *
 * IMPORTANT: These tools should only be run within the Electron app context,
 * not standalone. This demo shows the API and expected behavior.
 */

console.log('🎮 DeskClaw Control Tools Demo\n');
console.log('='.repeat(60));

console.log('\n📋 Available Tools:');
console.log('  1. screen_info  - Get screen dimensions');
console.log('  2. screenshot   - Capture screen (returns base64)');
console.log('  3. mouse_move   - Move mouse to coordinates');
console.log('  4. mouse_click  - Click mouse button');
console.log('  5. mouse_drag   - Drag mouse');
console.log('  6. keyboard_type- Type text');
console.log('  7. keyboard_press- Press key/combo');

console.log('\n📖 Usage Examples:\n');

// Example 1: Get screen info
console.log('--- Example 1: Get Screen Info ---');
console.log('await executeTool("screen_info", {});');
console.log('// Returns: { width: 1920, height: 1080, ... }');

// Example 2: Take a screenshot
console.log('\n--- Example 2: Take Screenshot ---');
console.log('await executeTool("screenshot", {});');
console.log('// Returns: { data: "base64...", size: 12345, format: "image/png" }');

// Example 3: Move mouse
console.log('\n--- Example 3: Move Mouse ---');
console.log('await executeTool("mouse_move", { x: 100, y: 200 });');
console.log('// Returns: { x: 100, y: 200, message: "Mouse moved to (100, 200)" }');

// Example 4: Click
console.log('\n--- Example 4: Click Mouse ---');
console.log('await executeTool("mouse_click", { button: "left" });');
console.log('// Clicks at current position');
console.log('await executeTool("mouse_click", { button: "left", x: 500, y: 300 });');
console.log('// Moves to (500, 300) then clicks');

// Example 5: Type text
console.log('\n--- Example 5: Type Text ---');
console.log('await executeTool("keyboard_type", { text: "Hello World!" });');
console.log('// Types the text character by character');

// Example 6: Press key
console.log('\n--- Example 6: Press Key ---');
console.log('await executeTool("keyboard_press", { key: "Enter" });');
console.log('await executeTool("keyboard_press", { key: "Control+c" });');
console.log('await executeTool("keyboard_press", { key: "Alt+Tab" });');

// Example 7: AI Workflow
console.log('\n--- Example 7: AI Agent Workflow ---');
console.log('// AI prompt: "Open calculator and calculate 123+456"');
console.log('//');
console.log('// Step 1: Take screenshot to see screen');
console.log('await executeTool("screenshot", {});');
console.log('//');
console.log('// Step 2: Click on calculator (AI analyzes screenshot)');
console.log('await executeTool("mouse_click", { x: 100, y: 500 });');
console.log('//');
console.log('// Step 3: Type the expression');
console.log('await executeTool("keyboard_type", { text: "123+456" });');
console.log('//');
console.log('// Step 4: Press Enter');
console.log('await executeTool("keyboard_press", { key: "Enter" });');
console.log('//');
console.log('// Step 5: Take screenshot to show result');
console.log('await executeTool("screenshot", {});');

console.log('\n' + '='.repeat(60));
console.log('\n🎯 Key Features:');
console.log('  ✅ Cross-platform (Windows/macOS/Linux)');
console.log('  ✅ Strict TypeScript types (no "any")');
console.log('  ✅ Comprehensive error handling');
console.log('  ✅ Screen boundary validation');
console.log('  ✅ AI/LLM integration ready');

console.log('\n🔒 Safety Features:');
console.log('  • Coordinate validation (prevents out-of-bounds errors)');
console.log('  • Parameter type checking');
console.log('  • Clear error messages');
console.log('  • Configurable delays (prevents too-fast actions)');

console.log('\n📚 For more details, see:');
console.log('  • electron/main/tools/CONTROL_README.md');
console.log('  • CONTROL_USAGE_GUIDE.md');
console.log('  • electron/main/tools/control.test.ts');

console.log('\n' + '='.repeat(60));
console.log('✅ Ready to use! Start the app with: npm run dev\n');
