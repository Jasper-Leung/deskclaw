# Control Tools Quick Reference

## Available Tools

| Tool             | Description             | Key Parameters                     |
| ---------------- | ----------------------- | ---------------------------------- |
| `mouse_move`     | Move cursor to position | `x`, `y`                           |
| `mouse_click`    | Click at position       | `button`, `x`, `y`, `double`       |
| `mouse_drag`     | Drag from A to B        | `from_x`, `from_y`, `to_x`, `to_y` |
| `keyboard_type`  | Type text               | `text`, `delay`                    |
| `keyboard_press` | Press key/combo         | `key`, `modifiers`                 |
| `screenshot`     | Capture screen          | `x`, `y`, `width`, `height`        |
| `screen_info`    | Get dimensions          | none                               |

## Quick Examples

### Get Screen Size

```typescript
await screen_info.handler({});
// → { width: 1920, height: 1080, ... }
```

### Take Screenshot

```typescript
await screenshot.handler({});
// → { data: "base64...", format: "image/png" }
```

### Move & Click

```typescript
await mouse_move.handler({ x: 500, y: 300 });
await mouse_click.handler({ button: 'left' });
```

### Type Text

```typescript
await keyboard_type.handler({
  text: 'Hello, World!',
  delay: 100,
});
```

### Press Key

```typescript
await keyboard_press.handler({ key: 'Enter' });
await keyboard_press.handler({ key: 'Control+c' });
```

### Drag & Drop

```typescript
await mouse_drag.handler({
  from_x: 100,
  from_y: 100,
  to_x: 500,
  to_y: 300,
  duration: 1000,
});
```

## Common Keys

| Key         | Code                         |
| ----------- | ---------------------------- |
| Enter       | `Enter`                      |
| Tab         | `Tab`                        |
| Escape      | `Escape`                     |
| Space       | `Space`                      |
| Backspace   | `Backspace`                  |
| Delete      | `Delete`                     |
| Arrow Up    | `ArrowUp`                    |
| Arrow Down  | `ArrowDown`                  |
| Arrow Left  | `ArrowLeft`                  |
| Arrow Right | `ArrowRight`                 |
| Control     | `Control` or `Ctrl`          |
| Alt         | `Alt`                        |
| Shift       | `Shift`                      |
| Win/Cmd     | `Meta` or `Win` or `Command` |

## Key Combinations

```
Control+c      → Copy
Control+v      → Paste
Control+z      → Undo
Alt+Tab        → Switch windows
Control+a      → Select all
Control+s      → Save
```

## Mouse Buttons

| Button       | Value              |
| ------------ | ------------------ |
| Left click   | `left` (default)   |
| Right click  | `right`            |
| Double click | Set `double: true` |

## Coordinate System

```
(0,0) ────────────── (width,0)
  │                     │
  │     Screen Area     │
  │                     │
  │                     │
(0,height) ─────── (width,height)
```

- Origin: Top-left corner
- X: Horizontal (left to right)
- Y: Vertical (top to bottom)
- Use `screen_info` to get dimensions

## Workflow Integration

### In Agent Nodes

```json
{
  "type": "agent",
  "data": {
    "enabledTools": [
      "mouse_move",
      "mouse_click",
      "keyboard_type",
      "keyboard_press",
      "screenshot",
      "screen_info"
    ]
  }
}
```

### In Tool Nodes

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

## Tips

💡 **Always** get screen info before mouse operations
💡 **Use** delays for reliable automation
💡 **Test** coordinates with small movements first
💡 **Check** window focus before typing
💡 **Monitor** screen during automation
💡 **Handle** errors in production code

## Safety

⚠️ These tools control your actual computer
⚠️ Test in safe environments first
⚠️ Verify coordinates are valid
⚠️ Have a stop plan ready

## Error Handling

```typescript
const result = await mouse_move.handler({ x: 500, y: 300 });
if (result.error) {
  console.error('Failed:', result.error);
} else {
  console.log('Success:', result.result);
}
```

## Full Documentation

- Technical: `electron/main/tools/CONTROL_README.md`
- Usage: `CONTROL_USAGE_GUIDE.md`
- Summary: `IMPLEMENTATION_SUMMARY.md`
- Examples: `electron/main/tools/control.test.ts`

## Platform Notes

### Windows

✅ Works out of the box

### macOS

⚠️ May need accessibility permissions
System Preferences → Security → Privacy → Accessibility

### Linux

✅ Works with X11
⚠️ Wayland may need configuration
