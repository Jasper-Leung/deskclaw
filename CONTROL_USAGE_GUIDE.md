# Keyboard and Mouse Control - Usage Guide

## Overview

This guide shows how to use the keyboard and mouse control features in DeskClaw. These features enable AI agents to interact with your computer's UI, automate tasks, and perform screen-based operations.

## Quick Start

### 1. Get Screen Information

Before performing mouse operations, get the screen dimensions:

```typescript
const screenResult = await screen_info.handler({});
// Returns: { width: 1920, height: 1080, screenCount: 1, ... }
```

### 2. Take a Screenshot

Let the AI see the current screen state:

```typescript
const screenshot = await screenshot.handler({});
// Returns base64 encoded image data
```

### 3. Move Mouse

Move the cursor to a specific position:

```typescript
await mouse_move.handler({ x: 960, y: 540 }); // Center of 1920x1080 screen
```

### 4. Click

Click at the current or specified position:

```typescript
// Click at current position
await mouse_click.handler({ button: 'left' });

// Click at specific position
await mouse_click.handler({
  x: 500,
  y: 300,
  button: 'left',
  double: false,
});
```

### 5. Type Text

Enter text into the focused input field:

```typescript
await keyboard_type.handler({
  text: 'Hello, World!',
  delay: 100,
});
```

### 6. Press Keys

Press special keys or key combinations:

```typescript
// Press Enter
await keyboard_press.handler({ key: 'Enter' });

// Press Ctrl+C
await keyboard_press.handler({ key: 'Control+c' });

// Press Alt+Tab
await keyboard_press.handler({ key: 'Alt+Tab' });
```

## Common Workflows

### Workflow 1: Click a Button

1. Take screenshot to see screen
2. Get screen info for dimensions
3. Move mouse to button position
4. Click button

```typescript
// Step 1: See screen
const screen = await screenshot.handler({});

// Step 2: Get dimensions
const info = await screen_info.handler({});
const { width, height } = info.result;

// Step 3: Move to button (example: top-right corner)
await mouse_move.handler({ x: width - 100, y: 50 });

// Step 4: Click
await mouse_click.handler({ button: 'left' });
```

### Workflow 2: Fill a Form

1. Move to first input field
2. Click to focus
3. Type text
4. Press Tab to move to next field
5. Type more text
6. Press Enter to submit

```typescript
// Focus first field
await mouse_move.handler({ x: 400, y: 200 });
await mouse_click.handler({ button: 'left' });

// Type name
await keyboard_type.handler({ text: 'John Doe', delay: 100 });

// Move to next field
await keyboard_press.handler({ key: 'Tab' });

// Type email
await keyboard_type.handler({ text: 'john@example.com', delay: 100 });

// Submit form
await keyboard_press.handler({ key: 'Enter' });
```

### Workflow 3: Drag and Drop

1. Move to source position
2. Hold mouse button
3. Move to destination
4. Release button

```typescript
await mouse_drag.handler({
  from_x: 100,
  from_y: 100,
  to_x: 500,
  to_y: 300,
  button: 'left',
  duration: 1000,
});
```

## AI Agent Integration

### Enable in Agent Nodes

When creating agent nodes in workflows, enable these tools:

```json
{
  "type": "agent",
  "data": {
    "modelId": "your-model-id",
    "enabledTools": [
      "screen_info",
      "screenshot",
      "mouse_move",
      "mouse_click",
      "keyboard_type",
      "keyboard_press"
    ]
  }
}
```

### Example AI Prompt

```
Open the calculator application, enter "123+456", and calculate the result.
```

The AI will:

1. Take screenshot to see current state
2. Use mouse_click to open calculator
3. Use keyboard_type to enter the expression
4. Use keyboard_press to press Enter
5. Take screenshot to show result

## Tool Parameters Reference

### mouse_move

| Parameter | Type   | Required | Description                       |
| --------- | ------ | -------- | --------------------------------- |
| x         | number | Yes      | X coordinate (0 to screen width)  |
| y         | number | Yes      | Y coordinate (0 to screen height) |

### mouse_click

| Parameter | Type    | Required | Description                           |
| --------- | ------- | -------- | ------------------------------------- |
| button    | string  | No       | "left" (default) or "right"           |
| x         | number  | No       | Move to this X before clicking        |
| y         | number  | No       | Move to this Y before clicking        |
| double    | boolean | No       | Perform double click (default: false) |

### mouse_drag

| Parameter | Type   | Required | Description                        |
| --------- | ------ | -------- | ---------------------------------- |
| from_x    | number | Yes      | Starting X coordinate              |
| from_y    | number | Yes      | Starting Y coordinate              |
| to_x      | number | Yes      | Ending X coordinate                |
| to_y      | number | Yes      | Ending Y coordinate                |
| button    | string | No       | "left" (default) or "right"        |
| duration  | number | No       | Drag duration in ms (default: 500) |

### keyboard_type

| Parameter | Type   | Required | Description                                   |
| --------- | ------ | -------- | --------------------------------------------- |
| text      | string | Yes      | Text to type                                  |
| delay     | number | No       | Delay between keystrokes in ms (default: 100) |

### keyboard_press

| Parameter | Type   | Required | Description                           |
| --------- | ------ | -------- | ------------------------------------- |
| key       | string | Yes      | Key name or combination               |
| modifiers | string | No       | Key modifiers (e.g., "Control+Shift") |

### screenshot

| Parameter | Type   | Required | Description              |
| --------- | ------ | -------- | ------------------------ |
| x         | number | No       | Region X coordinate      |
| y         | number | No       | Region Y coordinate      |
| width     | number | No       | Region width             |
| height    | number | No       | Region height            |
| format    | string | No       | "png" (default) or "jpg" |

### screen_info

No parameters required.

## Platform-Specific Notes

### Windows

- Works without additional setup
- Coordinates are relative to primary monitor

### macOS

- May require accessibility permissions:
  - System Preferences → Security & Privacy → Privacy → Accessibility
  - Add your terminal or app to the list

### Linux

- Works with X11 window system
- Wayland may require additional configuration
- Some distributions may need permission setup

## Safety Tips

⚠️ **Important:**

1. **Test Coordinates**: Always use `screen_info` to verify screen dimensions
2. **Check Focus**: Ensure the correct window is focused before typing
3. **Use Delays**: Add delays between operations for reliability
4. **Monitor Actions**: Watch the screen during automation
5. **Have Stop Plan**: Know how to quickly stop the automation if needed

## Troubleshooting

### Mouse clicks don't work

- Verify coordinates are within screen bounds
- Ensure target application is in foreground
- Check if UAC/admin permissions are needed

### Typing is wrong

- Verify correct window has focus
- Check keyboard layout settings
- Ensure text parameter is properly encoded

### Screenshots fail

- Check platform permissions (especially macOS)
- Verify sufficient memory available
- Try smaller region if full screen fails

### Coordinates are off

- Multi-monitor setups may offset coordinates
- Check screen scaling/DPI settings
- Use `screen_info` to verify dimensions

## Advanced Usage

### Coordinate Calculation

Calculate relative positions:

```typescript
const info = await screen_info.handler({});
const { width, height } = info.result;

// Center of screen
const centerX = Math.floor(width / 2);
const centerY = Math.floor(height / 2);

// Top-right corner
const topRightX = Math.floor(width * 0.9);
const topRightY = Math.floor(height * 0.1);

// Bottom-left corner
const bottomLeftX = Math.floor(width * 0.1);
const bottomLeftY = Math.floor(height * 0.9);
```

### Error Handling

Always handle errors gracefully:

```typescript
const result = await mouse_move.handler({ x: 500, y: 300 });
if (result.error) {
  console.error('Failed to move mouse:', result.error);
  // Handle error appropriately
} else {
  console.log('Mouse moved successfully');
}
```

### Performance Optimization

For faster automation:

```typescript
// Reduce typing delay
await keyboard_type.handler({
  text: 'Fast typing',
  delay: 50, // Faster than default 100ms
});

// Faster mouse movements (nut-js handles this automatically)
await mouse_move.handler({ x: 500, y: 300 });
```

## Examples

### Example 1: Automated Login

```typescript
// Open login page
await mouse_move.handler({ x: 500, y: 100 });
await mouse_click.handler({ button: 'left' });
await new Promise((resolve) => setTimeout(resolve, 2000));

// Enter username
await keyboard_type.handler({ text: 'myusername', delay: 100 });
await keyboard_press.handler({ key: 'Tab' });

// Enter password
await keyboard_type.handler({ text: 'mypassword', delay: 100 });
await keyboard_press.handler({ key: 'Enter' });
```

### Example 2: Screenshot Comparison

```typescript
// Take before screenshot
const before = await screenshot.handler({});

// Perform action
await mouse_click.handler({ x: 500, y: 300 });

// Wait for change
await new Promise((resolve) => setTimeout(resolve, 1000));

// Take after screenshot
const after = await screenshot.handler({});

// Compare (pseudo-code)
const changed = before.result.data !== after.result.data;
```

### Example 3: Menu Navigation

```typescript
// Open menu (Alt+F)
await keyboard_press.handler({ key: 'Alt+f' });
await new Promise((resolve) => setTimeout(resolve, 500));

// Navigate down 3 times
for (let i = 0; i < 3; i++) {
  await keyboard_press.handler({ key: 'ArrowDown' });
  await new Promise((resolve) => setTimeout(resolve, 200));
}

// Select menu item
await keyboard_press.handler({ key: 'Enter' });
```

## Best Practices

1. **Always verify screen dimensions** before mouse operations
2. **Use delays** between operations for reliability
3. **Take screenshots** before and after actions for debugging
4. **Handle errors** gracefully with try-catch blocks
5. **Test on small areas** before full-screen automation
6. **Document coordinates** for repeatable workflows
7. **Monitor execution** especially during development
8. **Use relative coordinates** for better cross-system compatibility

## API Reference

For complete API details, see:

- Implementation: `electron/main/tools/control.ts`
- Examples: `electron/main/tools/control.test.ts`
- README: `electron/main/tools/CONTROL_README.md`

## Support

For issues or questions:

1. Check this guide's troubleshooting section
2. Review example usage in `control.test.ts`
3. Examine implementation in `control.ts`
4. Consult `@nut-tree/nut-js` documentation

## Changelog

### Version 1.0.0 (2026-03-09)

- Initial release
- 7 control tools: mouse_move, mouse_click, mouse_drag, keyboard_type, keyboard_press, screenshot, screen_info
- Cross-platform support (Windows, macOS, Linux)
- Full TypeScript support with strict typing
- Comprehensive error handling
- Workflow engine integration
- Complete documentation
