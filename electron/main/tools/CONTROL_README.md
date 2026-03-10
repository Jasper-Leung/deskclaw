# Keyboard and Mouse Control Tools

This module provides cross-platform keyboard and mouse control functionality for DeskClaw using the `@nut-tree/nut-js` library.

## Features

- **Mouse Control**: Move, click, and drag with precision
- **Keyboard Control**: Type text and press keys/key combinations
- **Screen Capture**: Take screenshots of full screen or specific regions
- **Screen Info**: Get screen dimensions and display information
- **Cross-Platform**: Works on Windows, macOS, and Linux
- **Type-Safe**: Full TypeScript support with no `any` types

## Installation

The required dependency `@nut-tree/nut-js` is already installed in the project.

## Available Tools

### 1. `mouse_move`

Move the mouse cursor to specified coordinates.

**Parameters:**

- `x` (number, required): X coordinate in pixels
- `y` (number, required): Y coordinate in pixels

**Example:**

```typescript
await mouse_move.handler({ x: 500, y: 300 });
```

### 2. `mouse_click`

Perform a mouse click at current or specified position.

**Parameters:**

- `button` (string, optional): "left" (default) or "right"
- `x` (number, optional): X coordinate to move to before clicking
- `y` (number, optional): Y coordinate to move to before clicking
- `double` (boolean, optional): Perform double click (default: false)

**Example:**

```typescript
// Single left click at current position
await mouse_click.handler({ button: 'left' });

// Double right click at specific position
await mouse_click.handler({
  button: 'right',
  x: 500,
  y: 300,
  double: true,
});
```

### 3. `mouse_drag`

Drag the mouse from one position to another.

**Parameters:**

- `from_x` (number, required): Starting X coordinate
- `from_y` (number, required): Starting Y coordinate
- `to_x` (number, required): Ending X coordinate
- `to_y` (number, required): Ending Y coordinate
- `button` (string, optional): "left" (default) or "right"
- `duration` (number, optional): Drag duration in milliseconds (default: 500)

**Example:**

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

### 4. `keyboard_type`

Type text using the keyboard.

**Parameters:**

- `text` (string, required): The text to type
- `delay` (number, optional): Delay between keystrokes in ms (default: 100)

**Example:**

```typescript
await keyboard_type.handler({
  text: 'Hello, World!',
  delay: 100,
});
```

### 5. `keyboard_press`

Press a keyboard key or key combination.

**Parameters:**

- `key` (string, required): The key to press
- `modifiers` (string, optional): Key modifiers (e.g., "Control+Shift")

**Supported Keys:**

- Letters: a-z
- Numbers: 0-9
- Special keys: Enter, Tab, Escape, Space, Backspace, Delete
- Navigation: Home, End, PageUp, PageDown
- Arrow keys: ArrowUp, ArrowDown, ArrowLeft, ArrowRight
- Modifiers: Control, Alt, Shift, Meta (Win/Command)
- Function keys: F1-F12

**Example:**

```typescript
// Press Enter
await keyboard_press.handler({ key: 'Enter' });

// Press Ctrl+C
await keyboard_press.handler({ key: 'Control+c' });

// Press Alt+Tab
await keyboard_press.handler({ key: 'Alt+Tab' });
```

### 6. `screenshot`

Take a screenshot of the screen or a specific region.

**Parameters:**

- `x` (number, optional): X coordinate of region
- `y` (number, optional): Y coordinate of region
- `width` (number, optional): Width of region
- `height` (number, optional): Height of region
- `format` (string, optional): "png" (default) or "jpg"

**Example:**

```typescript
// Full screen screenshot
await screenshot.handler({});

// Region screenshot
await screenshot.handler({
  x: 0,
  y: 0,
  width: 800,
  height: 600,
  format: 'png',
});
```

### 7. `screen_info`

Get information about screen dimensions and configuration.

**Parameters:** None

**Example:**

```typescript
await screen_info.handler({});
// Returns: { width: 1920, height: 1080, screenCount: 1, ... }
```

## Usage in Workflows

These tools are automatically integrated into the workflow engine. You can use them in workflow nodes:

### Agent Node

In agent nodes, enable the tools you want to use:

- `mouse_move`
- `mouse_click`
- `mouse_drag`
- `keyboard_type`
- `keyboard_press`
- `screenshot`
- `screen_info`

The AI will automatically use these tools when needed.

### Tool Node

Create tool nodes with specific parameters:

```json
{
  "type": "tool",
  "data": {
    "toolName": "mouse_click",
    "parameters": {
      "x": 500,
      "y": 300,
      "button": "left"
    }
  }
}
```

## Error Handling

All tools include comprehensive error handling:

- **Parameter Validation**: Checks for missing, invalid, or out-of-range parameters
- **Screen Boundary Validation**: Ensures coordinates are within screen dimensions
- **Platform Compatibility**: Handles platform-specific differences
- **Graceful Degradation**: Returns meaningful error messages for debugging

## Safety Considerations

⚠️ **Important Safety Notes:**

1. **Test Carefully**: Keyboard and mouse actions will affect your actual computer
2. **Focus Awareness**: Ensure the correct window/application is focused
3. **Coordinate Precision**: Screen coordinates are 0-indexed from top-left
4. **Delay Configuration**: Use appropriate delays for your use case
5. **Permission Requirements**: Some platforms may require accessibility permissions

## Platform-Specific Notes

### Windows

- Works out of the box
- No additional permissions required

### macOS

- May require accessibility permissions
- Grant permissions in: System Preferences > Security & Privacy > Privacy > Accessibility

### Linux

- Works with X11 and Wayland
- Wayland may require additional configuration

## Testing

Example usage patterns are provided in `control.test.ts`. To test:

```typescript
import { exampleGetScreenInfo, exampleScreenshot } from './control.test.js';

// Run safe examples
await exampleGetScreenInfo();
await exampleScreenshot();

// Run interactive examples (with caution!)
// await exampleTypeText();
// await exampleClick();
```

## Integration with AI

These tools enable AI agents to:

1. **See the Screen**: Use `screenshot` to capture current screen state
2. **Navigate**: Use `mouse_move` and `mouse_click` to interact with UI elements
3. **Input Data**: Use `keyboard_type` and `keyboard_press` to enter text and commands
4. **Automate Tasks**: Combine tools for complete automation workflows

## Performance

- **Mouse Movement**: Smooth interpolation with configurable speed
- **Typing**: Configurable delay between keystrokes (default: 100ms)
- **Screenshots**: Optimized for speed with base64 encoding
- **Cross-Platform**: Native performance on all supported platforms

## Troubleshooting

### Mouse movements are inaccurate

- Use `screen_info` to verify screen dimensions
- Ensure coordinates are within valid range
- Check for multi-monitor setups

### Typing is too fast/slow

- Adjust the `delay` parameter in `keyboard_type`
- Set `keyboard.config.autoDelayMs` globally

### Screenshots fail

- Check platform-specific permissions
- Verify sufficient memory for image capture
- Try capturing smaller regions

### Keys don't work

- Verify key names are supported
- Check for platform-specific key mappings
- Use key combinations for special characters

## Future Enhancements

Potential improvements for future versions:

1. **Multi-Monitor Support**: Enhanced support for multiple displays
2. **Image Recognition**: Find and click elements by image matching
3. **OCR**: Extract text from screenshots
4. **Window Management**: Focus, move, and resize windows
5. **Recording**: Record and replay mouse/keyboard sequences
6. **Advanced Gestures**: Pinch, zoom, rotate (touchscreen support)

## License

This module is part of DeskClaw and follows the same license terms.

## Contributing

When adding new control features:

1. Maintain cross-platform compatibility
2. Add comprehensive error handling
3. Include detailed parameter descriptions
4. Provide usage examples
5. Update this README

## Support

For issues or questions:

- Check the troubleshooting section
- Review example usage in `control.test.ts`
- Examine the tool implementation in `control.ts`
- Consult `@nut-tree/nut-js` documentation for advanced usage
