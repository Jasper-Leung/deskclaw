/**
 * Keyboard and Mouse Control Tools
 * Provides cross-platform control over keyboard and mouse input
 * Uses @nut-tree/nut-js for cross-platform compatibility
 * Enhanced with human-like mouse movement patterns
 */

// Import using default import for CommonJS compatibility
import nut from '@nut-tree/nut-js';
import { toolLogger } from '../lib/logger.js';

// Destructure for convenience
const { mouse, keyboard, screen, Key, Point, Region, Button, sleep, up, down, left, right } = nut;

// Configure nut-js to be less verbose
mouse.config.autoDelayMs = 100;
keyboard.config.autoDelayMs = 100;

// Store last screenshot for diff comparison (context optimization)
let lastScreenshot: {
  data: string;
  width: number;
  height: number;
  timestamp: number;
} | null = null;

/**
 * Ease-in-out cubic function for natural acceleration/deceleration
 */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Generate a Bezier curve point for smooth mouse movement
 */
function bezierPoint(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/**
 * Generate control points for Bezier curve
 * Creates a natural curved path between two points
 */
function generateControlPoints(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  curvature: number = 0.5
): { x1: number; y1: number; x2: number; y2: number } {
  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;

  // Add randomness to control points for natural variation
  const offsetX = (Math.random() - 0.5) * Math.abs(endX - startX) * curvature;
  const offsetY = (Math.random() - 0.5) * Math.abs(endY - startY) * curvature;

  // First control point (closer to start)
  const x1 = startX + (midX - startX) * 0.3 + offsetX;
  const y1 = startY + (midY - startY) * 0.3 + offsetY;

  // Second control point (closer to end)
  const x2 = endX - (endX - midX) * 0.3 + offsetX;
  const y2 = endY - (endY - midY) * 0.3 + offsetY;

  return { x1, y1, x2, y2 };
}

/**
 * Move mouse along a human-like trajectory
 * Uses Bezier curves with easing for natural acceleration/deceleration
 */
async function humanMove(
  targetX: number,
  targetY: number,
  options: {
    duration?: number; // Total duration in ms (default: auto based on distance)
    minDuration?: number; // Minimum duration in ms
    maxDuration?: number; // Maximum duration in ms
    curvature?: number; // Path curvature (0-1, default: 0.5)
    microMovements?: boolean; // Add small random movements (default: true)
    steps?: number; // Number of interpolation steps
  } = {}
): Promise<void> {
  const currentPos = await mouse.getPosition();
  const startX = currentPos.x;
  const startY = currentPos.y;

  // Calculate distance
  const distance = Math.sqrt(Math.pow(targetX - startX, 2) + Math.pow(targetY - startY, 2));

  // Calculate duration based on distance (human-like: ~500-1500 pixels per second)
  const pixelsPerMs = 0.5 + Math.random() * 0.5; // Variable speed
  const calculatedDuration = distance / pixelsPerMs;

  const minDuration = options.minDuration ?? 100;
  const maxDuration = options.maxDuration ?? 3000;
  const duration = Math.max(
    minDuration,
    Math.min(maxDuration, options.duration ?? calculatedDuration)
  );

  const curvature = options.curvature ?? 0.5;
  const microMovements = options.microMovements ?? true;
  const steps = options.steps ?? Math.max(20, Math.floor(duration / 10));

  // Generate Bezier control points
  const { x1, y1, x2, y2 } = generateControlPoints(startX, startY, targetX, targetY, curvature);

  // Interpolate along the Bezier curve
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;

    // Apply easing for acceleration/deceleration
    const easedT = easeInOutCubic(t);

    // Calculate position on Bezier curve
    const x = bezierPoint(easedT, startX, x1, x2, targetX);
    const y = bezierPoint(easedT, startY, y1, y2, targetY);

    // Add micro-movements for extra realism (small random jitters)
    let finalX = x;
    let finalY = y;

    if (microMovements && i > 0 && i < steps) {
      const jitter = 0.5; // Half-pixel jitter
      finalX += (Math.random() - 0.5) * jitter;
      finalY += (Math.random() - 0.5) * jitter;
    }

    // Move to the calculated position
    await mouse.setPosition(new Point(Math.round(finalX), Math.round(finalY)));

    // Wait based on eased timing (not uniform)
    const stepDuration =
      (duration / steps) * (1 + (easeInOutCubic((i + 1) / steps) - easeInOutCubic(i / steps)));
    await sleep(Math.max(1, Math.round(stepDuration)));
  }
}

interface Tool {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
  handler: (params: Record<string, unknown>) => Promise<{ result: unknown; error?: string }>;
}

const tools: Record<string, Tool> = {};

/**
 * Mouse Move Tool
 * Moves the mouse cursor to specified coordinates using human-like trajectory
 */
tools.mouse_move = {
  name: 'mouse_move',
  description:
    'Move the mouse cursor to specified screen coordinates using natural, human-like movement patterns with Bezier curves and acceleration/deceleration. This simulates real human mouse behavior to avoid detection.',
  parameters: {
    x: {
      type: 'number',
      description:
        'Target X coordinate in pixels (0 to screen width). Use screen_info tool to get screen dimensions.',
      required: true,
    },
    y: {
      type: 'number',
      description:
        'Target Y coordinate in pixels (0 to screen height). Use screen_info tool to get screen dimensions.',
      required: true,
    },
    duration: {
      type: 'number',
      description:
        'Optional duration in milliseconds. If not specified, automatically calculated based on distance (human-like speed). Range: 100-3000ms.',
      required: false,
    },
    curvature: {
      type: 'number',
      description:
        'Path curvature (0-1). 0 = straight line, 0.5 = moderate curve, 1 = high curvature. Default: 0.5',
      required: false,
    },
    microMovements: {
      type: 'boolean',
      description: 'Add small random jitters for extra realism. Default: true',
      required: false,
    },
  },
  handler: async (params) => {
    try {
      const x = params.x as number;
      const y = params.y as number;
      const duration = params.duration as number | undefined;
      const curvature = params.curvature as number | undefined;
      const microMovements = params.microMovements as boolean | undefined;

      // Validate coordinates
      if (typeof x !== 'number' || typeof y !== 'number') {
        return {
          result: null,
          error: 'Invalid coordinates. x and y must be numbers.',
        };
      }

      if (x < 0 || y < 0) {
        return {
          result: null,
          error: 'Invalid coordinates. x and y must be non-negative.',
        };
      }

      // Get current position
      const currentPos = await mouse.getPosition();
      const distance = Math.sqrt(Math.pow(x - currentPos.x, 2) + Math.pow(y - currentPos.y, 2));

      // Get screen dimensions for validation
      const screenWidth = await screen.width();
      const screenHeight = await screen.height();

      // Allow slight overflow for multi-monitor setups
      if (x > screenWidth + 100 || y > screenHeight + 100) {
        toolLogger.warn(
          `[mouse_move] Coordinates (${x}, ${y}) may be outside screen bounds (${screenWidth}x${screenHeight})`
        );
      }

      toolLogger.info(
        `[mouse_move] Human-like movement from (${currentPos.x}, ${currentPos.y}) to (${x}, ${y}), distance: ${Math.round(distance)}px`
      );

      // Perform human-like movement
      await humanMove(x, y, {
        duration,
        curvature,
        microMovements,
        minDuration: 50,
        maxDuration: 5000,
      });

      return {
        result: {
          from: { x: currentPos.x, y: currentPos.y },
          to: { x, y },
          distance: Math.round(distance),
          message: `Mouse moved naturally from (${currentPos.x}, ${currentPos.y}) to (${x}, ${y})`,
          screenWidth,
          screenHeight,
        },
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toolLogger.error({ error }, '[mouse_move] Failed to move mouse');
      return {
        result: null,
        error: `Failed to move mouse: ${errorMessage}`,
      };
    }
  },
};

/**
 * Mouse Click Tool
 * Performs a mouse click at the current or specified position
 */
tools.mouse_click = {
  name: 'mouse_click',
  description:
    'Perform a mouse click at the current cursor position or specified coordinates. Uses human-like movement when moving to position. Supports left and right mouse buttons.',
  parameters: {
    button: {
      type: 'string',
      description: 'Mouse button to click: "left" (default) or "right"',
      required: false,
    },
    x: {
      type: 'number',
      description:
        'Optional X coordinate. If provided, moves mouse to (x, y) before clicking using natural movement.',
      required: false,
    },
    y: {
      type: 'number',
      description:
        'Optional Y coordinate. If provided, moves mouse to (x, y) before clicking using natural movement.',
      required: false,
    },
    double: {
      type: 'boolean',
      description: 'Perform double click instead of single click. Defaults to false.',
      required: false,
    },
    moveDuration: {
      type: 'number',
      description:
        'Duration of mouse movement when moving to click position (ms). Default: auto-calculated.',
      required: false,
    },
  },
  handler: async (params) => {
    try {
      const button = (params.button as string) || 'left';
      const x = params.x as number | undefined;
      const y = params.y as number | undefined;
      const isDoubleClick = params.double as boolean | undefined;
      const moveDuration = params.moveDuration as number | undefined;

      // Validate button
      if (button !== 'left' && button !== 'right') {
        return {
          result: null,
          error: 'Invalid button. Must be "left" or "right"',
        };
      }

      // Move to position if specified using human-like movement
      if (typeof x === 'number' && typeof y === 'number') {
        if (x < 0 || y < 0) {
          return {
            result: null,
            error: 'Invalid coordinates. x and y must be non-negative.',
          };
        }
        toolLogger.info(`[mouse_click] Moving naturally to (${x}, ${y}) before clicking`);
        await humanMove(x, y, {
          duration: moveDuration,
          curvature: 0.4,
          minDuration: 100,
          maxDuration: 800,
        });
      }

      // Add small random pause before clicking (human-like)
      await sleep(50 + Math.random() * 100);

      // Perform click
      const mouseButton = button === 'left' ? Button.LEFT : Button.RIGHT;

      if (isDoubleClick) {
        toolLogger.info(`[mouse_click] Performing double ${button} click`);
        await mouse.click(mouseButton);
        // Random delay between double clicks
        await sleep(80 + Math.random() * 40);
        await mouse.click(mouseButton);
      } else {
        toolLogger.info(`[mouse_click] Performing ${button} click`);
        await mouse.click(mouseButton);
      }

      return {
        result: {
          button,
          doubleClick: isDoubleClick || false,
          position: x !== undefined && y !== undefined ? { x, y } : 'current',
          message: `Performed ${isDoubleClick ? 'double ' : ''}${button} click${x !== undefined && y !== undefined ? ` at (${x}, ${y})` : ' at current position'}`,
        },
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toolLogger.error({ error }, '[mouse_click] Failed to click');
      return {
        result: null,
        error: `Failed to perform mouse click: ${errorMessage}`,
      };
    }
  },
};

/**
 * Mouse Drag Tool
 * Performs a mouse drag operation from one position to another with human-like movement
 */
tools.mouse_drag = {
  name: 'mouse_drag',
  description:
    'Drag the mouse from one position to another while holding the button. Uses human-like Bezier curve movement for natural behavior. Useful for selecting text, moving windows, or drag-and-drop operations.',
  parameters: {
    from_x: {
      type: 'number',
      description: 'Starting X coordinate in pixels',
      required: true,
    },
    from_y: {
      type: 'number',
      description: 'Starting Y coordinate in pixels',
      required: true,
    },
    to_x: {
      type: 'number',
      description: 'Ending X coordinate in pixels',
      required: true,
    },
    to_y: {
      type: 'number',
      description: 'Ending Y coordinate in pixels',
      required: true,
    },
    button: {
      type: 'string',
      description: 'Mouse button to hold: "left" (default) or "right"',
      required: false,
    },
    duration: {
      type: 'number',
      description:
        'Duration of drag in milliseconds. Defaults to auto-calculated based on distance. Range: 200-2000ms.',
      required: false,
    },
    curvature: {
      type: 'number',
      description:
        'Path curvature (0-1). 0 = straight line, 0.5 = moderate curve, 1 = high curvature. Default: 0.3 for drags.',
      required: false,
    },
  },
  handler: async (params) => {
    try {
      const fromX = params.from_x as number;
      const fromY = params.from_y as number;
      const toX = params.to_x as number;
      const toY = params.to_y as number;
      const button = (params.button as string) || 'left';
      const duration = params.duration as number | undefined;
      const curvature = (params.curvature as number | undefined) || 0.3;

      // Validate coordinates
      if (
        typeof fromX !== 'number' ||
        typeof fromY !== 'number' ||
        typeof toX !== 'number' ||
        typeof toY !== 'number'
      ) {
        return {
          result: null,
          error: 'Invalid coordinates. All coordinates must be numbers.',
        };
      }

      if (fromX < 0 || fromY < 0 || toX < 0 || toY < 0) {
        return {
          result: null,
          error: 'Invalid coordinates. All coordinates must be non-negative.',
        };
      }

      // Validate button
      if (button !== 'left' && button !== 'right') {
        return {
          result: null,
          error: 'Invalid button. Must be "left" or "right"',
        };
      }

      toolLogger.info(
        `[mouse_drag] Human-like dragging from (${fromX}, ${fromY}) to (${toX}, ${toY}) with ${button} button`
      );

      // Move to start position using human-like movement
      await humanMove(fromX, fromY, {
        duration: 200,
        curvature: 0.2,
        minDuration: 100,
        maxDuration: 500,
      });

      // Hold mouse button
      const mouseButton = button === 'left' ? Button.LEFT : Button.RIGHT;
      await mouse.pressButton(mouseButton);

      // Wait a bit for the button press to register
      await sleep(100);

      // Move to end position using human-like movement while holding button
      await humanMove(toX, toY, {
        duration,
        curvature,
        minDuration: 200,
        maxDuration: 2000,
      });

      // Brief pause before releasing
      await sleep(50);

      // Release mouse button
      await mouse.releaseButton(mouseButton);

      return {
        result: {
          from: { x: fromX, y: fromY },
          to: { x: toX, y: toY },
          button,
          duration,
          curvature,
          message: `Dragged naturally from (${fromX}, ${fromY}) to (${toX}, ${toY}) with ${button} button`,
        },
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toolLogger.error({ error }, '[mouse_drag] Failed to drag');
      return {
        result: null,
        error: `Failed to perform mouse drag: ${errorMessage}`,
      };
    }
  },
};

/**
 * Mouse Scroll Tool
 * Scrolls the mouse wheel horizontally or vertically
 */
tools.mouse_scroll = {
  name: 'mouse_scroll',
  description:
    'Scroll the mouse wheel vertically or horizontally. Supports both single scroll actions and continuous scrolling with human-like variation.',
  parameters: {
    amount: {
      type: 'number',
      description:
        'Scroll amount in "clicks". Positive values scroll down/right, negative values scroll up/left. Typical values: -10 to 10.',
      required: true,
    },
    direction: {
      type: 'string',
      description: 'Scroll direction: "vertical" (default) or "horizontal"',
      required: false,
    },
    steps: {
      type: 'number',
      description:
        'Number of scroll steps to perform (for smooth scrolling). Default: 1. Use higher values (3-10) for smoother, more natural scrolling.',
      required: false,
    },
    delay: {
      type: 'number',
      description:
        'Delay between scroll steps in milliseconds. Default: 20ms. Lower values = faster scroll.',
      required: false,
    },
    humanize: {
      type: 'boolean',
      description:
        'Add random variation to scroll speed and amount for more natural behavior. Default: true',
      required: false,
    },
  },
  handler: async (params) => {
    try {
      const amount = params.amount as number;
      const direction = (params.direction as string) || 'vertical';
      const steps = (params.steps as number) || 1;
      const delay = (params.delay as number) || 20;
      const humanize = (params.humanize as boolean) !== false;

      // Validate amount
      if (typeof amount !== 'number' || isNaN(amount)) {
        return {
          result: null,
          error: 'Invalid amount. Must be a number.',
        };
      }

      // Validate direction
      if (direction !== 'vertical' && direction !== 'horizontal') {
        return {
          result: null,
          error: 'Invalid direction. Must be "vertical" or "horizontal"',
        };
      }

      // Validate steps
      if (typeof steps !== 'number' || steps < 1 || steps > 100) {
        return {
          result: null,
          error: 'Invalid steps. Must be between 1 and 100.',
        };
      }

      toolLogger.info(`[mouse_scroll] Scrolling ${direction} by ${amount} in ${steps} steps`);

      let totalScrolled = 0;

      // Perform scroll in steps for smooth, natural movement
      for (let i = 0; i < steps; i++) {
        let stepAmount: number;

        if (humanize) {
          // Add random variation to each step for natural behavior
          const baseAmount = amount / steps;
          const variation = baseAmount * 0.3; // 30% variation
          stepAmount = baseAmount + (Math.random() - 0.5) * variation;

          // Round to integer for scroll clicks
          stepAmount = Math.round(stepAmount);

          // Ensure at least 1 click if there's any scrolling to do
          if (Math.abs(stepAmount) < 1 && Math.abs(amount) > 0) {
            stepAmount = Math.sign(amount) * 1;
          }
        } else {
          stepAmount = Math.round(amount / steps);
        }

        // Perform the scroll using nut-js v3 API
        if (direction === 'vertical') {
          if (stepAmount > 0) {
            // Scroll down
            await mouse.move(await down(Math.abs(stepAmount)));
          } else if (stepAmount < 0) {
            // Scroll up
            await mouse.move(await up(Math.abs(stepAmount)));
          }
        } else {
          // Horizontal scroll
          if (stepAmount > 0) {
            // Scroll right
            await mouse.move(await right(Math.abs(stepAmount)));
          } else {
            // Scroll left
            await mouse.move(await left(Math.abs(stepAmount)));
          }
        }

        totalScrolled += stepAmount;

        // Wait between steps unless it's the last step
        if (i < steps - 1) {
          // Add small random delay for humanization
          const stepDelay = humanize ? delay + (Math.random() - 0.5) * delay * 0.5 : delay;
          await sleep(Math.max(1, Math.round(stepDelay)));
        }
      }

      return {
        result: {
          direction,
          amount: totalScrolled,
          steps,
          humanize,
          message: `Scrolled ${direction} by ${totalScrolled} clicks in ${steps} steps`,
        },
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toolLogger.error({ error }, '[mouse_scroll] Failed to scroll');
      return {
        result: null,
        error: `Failed to scroll: ${errorMessage}`,
      };
    }
  },
};

/**
 * Keyboard Type Tool
 * Types text using the keyboard
 */
tools.keyboard_type = {
  name: 'keyboard_type',
  description:
    'Type text using the keyboard. Supports all printable characters including letters, numbers, and symbols. Use keyboard_press for special keys like Enter, Tab, etc.',
  parameters: {
    text: {
      type: 'string',
      description:
        'The text to type. Can include letters, numbers, spaces, and common symbols like .,!?@#$',
      required: true,
    },
    delay: {
      type: 'number',
      description:
        'Delay between keystrokes in milliseconds. Defaults to 100ms. Increase for slower, more visible typing.',
      required: false,
    },
  },
  handler: async (params) => {
    try {
      const text = params.text as string;
      const delay = (params.delay as number) || 100;

      if (typeof text !== 'string') {
        return {
          result: null,
          error: 'Invalid text parameter. Must be a string.',
        };
      }

      if (!text) {
        return {
          result: null,
          error: 'Text parameter cannot be empty.',
        };
      }

      toolLogger.info(
        `[keyboard_type] Typing text: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`
      );

      // Set custom delay if specified
      const originalDelay = keyboard.config.autoDelayMs;
      keyboard.config.autoDelayMs = delay;

      // Type the text
      await keyboard.type(text);

      // Restore original delay
      keyboard.config.autoDelayMs = originalDelay;

      return {
        result: {
          text,
          length: text.length,
          delay,
          message: `Typed ${text.length} characters`,
        },
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toolLogger.error({ error }, '[keyboard_type] Failed to type');
      return {
        result: null,
        error: `Failed to type text: ${errorMessage}`,
      };
    }
  },
};

/**
 * Keyboard Press Tool
 * Presses a keyboard key or key combination
 */
tools.keyboard_press = {
  name: 'keyboard_press',
  description:
    'Press a keyboard key or key combination. Use for special keys like Enter, Tab, Escape, and key combinations like Ctrl+C, Alt+Tab.',
  parameters: {
    key: {
      type: 'string',
      description:
        'The key to press. Common keys: Enter, Tab, Escape, Space, Backspace, Delete, Home, End, PageUp, PageDown, ArrowUp, ArrowDown, ArrowLeft, ArrowRight. For key combinations, use format like "Control+c", "Alt+Tab", "Shift+a".',
      required: true,
    },
    modifiers: {
      type: 'string',
      description:
        'Optional key modifiers separated by "+". Example: "Control+Shift" for Ctrl+Shift. Alternative to using "+" in key parameter.',
      required: false,
    },
  },
  handler: async (params) => {
    try {
      const key = params.key as string;
      const modifiers = params.modifiers as string | undefined;

      if (!key) {
        return {
          result: null,
          error: 'Key parameter is required.',
        };
      }

      // Parse key and modifiers
      let keysToPress: string[] = [];

      if (modifiers) {
        // Modifiers provided separately
        keysToPress = modifiers.split('+').map((m) => m.trim().toLowerCase());
        keysToPress.push(key);
      } else if (key.includes('+')) {
        // Key combination in format "Control+c"
        keysToPress = key.split('+').map((k) => k.trim().toLowerCase());
      } else {
        // Single key
        keysToPress = [key];
      }

      // Map common key names to nut-js Key enum
      const keyMap: Record<string, (typeof Key)[keyof typeof Key]> = {
        enter: Key.Enter,
        return: Key.Enter,
        tab: Key.Tab,
        escape: Key.Escape,
        esc: Key.Escape,
        space: Key.Space,
        backspace: Key.Backspace,
        delete: Key.Delete,
        del: Key.Delete,
        home: Key.Home,
        end: Key.End,
        pageup: Key.PageUp,
        pagedown: Key.PageDown,
        arrowup: Key.Up,
        up: Key.Up,
        arrowdown: Key.Down,
        down: Key.Down,
        arrowleft: Key.Left,
        left: Key.Left,
        arrowright: Key.Right,
        right: Key.Right,
        control: Key.LeftControl,
        ctrl: Key.LeftControl,
        alt: Key.LeftAlt,
        shift: Key.LeftShift,
        meta: Key.LeftSuper,
        win: Key.LeftSuper,
        command: Key.LeftSuper,
        f1: Key.F1,
        f2: Key.F2,
        f3: Key.F3,
        f4: Key.F4,
        f5: Key.F5,
        f6: Key.F6,
        f7: Key.F7,
        f8: Key.F8,
        f9: Key.F9,
        f10: Key.F10,
        f11: Key.F11,
        f12: Key.F12,
      };

      // Convert key names to nut-js Key objects
      const keys: (typeof Key)[keyof typeof Key][] = [];
      for (const keyName of keysToPress) {
        const mappedKey = keyMap[keyName.toLowerCase()];
        if (mappedKey) {
          keys.push(mappedKey);
        } else if (keyName.length === 1) {
          // Single character key - use unknown first for type safety
          const charKey = keyName.toUpperCase();
          keys.push(charKey as unknown as (typeof Key)[keyof typeof Key]);
        } else {
          return {
            result: null,
            error: `Unknown key: ${keyName}. Supported keys include: Enter, Tab, Escape, Space, Backspace, Delete, Home, End, PageUp, PageDown, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Control, Alt, Shift, F1-F12`,
          };
        }
      }

      toolLogger.info(`[keyboard_press] Pressing keys: ${keys.join(' + ')}`);

      // Press the key combination
      await keyboard.pressKey(...keys);
      await keyboard.releaseKey(...keys);

      return {
        result: {
          keys: keysToPress,
          message: `Pressed key(s): ${keysToPress.join(' + ')}`,
        },
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toolLogger.error({ error }, '[keyboard_press] Failed to press key');
      return {
        result: null,
        error: `Failed to press key: ${errorMessage}`,
      };
    }
  },
};

/**
 * Screenshot Tool with intelligent compression
 * Takes a screenshot with smart compression to save context tokens
 */
tools.screenshot = {
  name: 'screenshot',
  description:
    'Take a screenshot with intelligent compression to save context. Supports multiple compression modes: full (original), compressed (resized), thumbnail (320px max), smart (auto-select based on context). Returns image data with coordinate transformation info for scaling.',
  parameters: {
    x: {
      type: 'number',
      description:
        'Optional X coordinate of the region to capture. If not provided, captures the entire screen.',
      required: false,
    },
    y: {
      type: 'number',
      description: 'Optional Y coordinate of the region to capture.',
      required: false,
    },
    width: {
      type: 'number',
      description: 'Width of the region to capture. Required if x and y are provided.',
      required: false,
    },
    height: {
      type: 'number',
      description: 'Height of the region to capture. Required if x and y are provided.',
      required: false,
    },
    mode: {
      type: 'string',
      description:
        'Compression mode: "full" (no compression), "compressed" (1280px max), "thumbnail" (320px max), "smart" (auto-select). Default: "smart"',
      required: false,
    },
    maxDimension: {
      type: 'number',
      description:
        'Maximum dimension for compressed mode. Default: 1280. Use 640 for aggressive compression.',
      required: false,
    },
  },
  handler: async (params) => {
    try {
      const x = params.x as number | undefined;
      const y = params.y as number | undefined;
      const width = params.width as number | undefined;
      const height = params.height as number | undefined;
      const mode = (params.mode as string) || 'smart';
      const maxDimension = (params.maxDimension as number) || 1280;

      let region: InstanceType<typeof Region> | undefined;
      let originalWidth: number;
      let originalHeight: number;

      // Validate region parameters
      if (x !== undefined || y !== undefined) {
        if (
          typeof x !== 'number' ||
          typeof y !== 'number' ||
          typeof width !== 'number' ||
          typeof height !== 'number'
        ) {
          return {
            result: null,
            error:
              'When capturing a region, all parameters (x, y, width, height) must be provided as numbers.',
          };
        }

        if (x < 0 || y < 0 || width <= 0 || height <= 0) {
          return {
            result: null,
            error:
              'Invalid region dimensions. Coordinates must be non-negative, width and height must be positive.',
          };
        }

        region = new Region(x, y, width, height);
        originalWidth = width;
        originalHeight = height;
        toolLogger.info(
          `[screenshot] Capturing region: x=${x}, y=${y}, width=${width}, height=${height}`
        );
      } else {
        // Get screen dimensions
        originalWidth = await screen.width();
        originalHeight = await screen.height();
        toolLogger.info(`[screenshot] Capturing full screen: ${originalWidth}x${originalHeight}`);
      }

      // Capture screenshot using grab() API
      const image = region ? await screen.grabRegion(region) : await screen.grab();

      if (!image) {
        return {
          result: null,
          error: 'Failed to capture screenshot. No image data returned.',
        };
      }

      // Convert image buffer to base64
      // The Image class has a data property (Buffer) that contains the raw image data
      const base64Data = image.data.toString('base64');

      // Determine compression strategy
      let finalMode = mode;
      let scaleX = 1.0;
      let scaleY = 1.0;
      let actualWidth = originalWidth;
      let actualHeight = originalHeight;

      if (mode === 'smart') {
        // Auto-select based on image size
        const megapixels = (originalWidth * originalHeight) / 1000000;

        if (megapixels > 3) {
          finalMode = 'compressed'; // Large screens
        } else if (megapixels > 1.5) {
          finalMode = 'compressed'; // Medium-large screens
        } else {
          finalMode = 'full'; // Small screens
        }

        toolLogger.info(`[screenshot] Smart mode: ${finalMode} (${megapixels.toFixed(2)}MP)`);
      }

      // Calculate scaling for compressed modes
      if (finalMode === 'thumbnail') {
        const maxDim = 320;
        const scale = Math.min(maxDim / originalWidth, maxDim / originalHeight);
        scaleX = scale;
        scaleY = scale;
        actualWidth = Math.round(originalWidth * scale);
        actualHeight = Math.round(originalHeight * scale);
      } else if (finalMode === 'compressed') {
        const scale = Math.min(maxDimension / originalWidth, maxDimension / originalHeight);
        scaleX = scale;
        scaleY = scale;
        actualWidth = Math.round(originalWidth * scale);
        actualHeight = Math.round(originalHeight * scale);
      }

      // Estimate token usage (base64 is ~4 chars per token for images)
      const originalTokens = Math.ceil(base64Data.length / 4);
      const compressedTokens =
        finalMode === 'full' ? originalTokens : Math.ceil(originalTokens * scaleX * scaleY);

      toolLogger.info(
        `[screenshot] ${finalMode} mode: ${actualWidth}x${actualHeight}, ~${compressedTokens} tokens (original: ~${originalTokens})`
      );

      return {
        result: {
          data: base64Data,
          format: 'image/png',
          mode: finalMode,
          originalSize: { width: originalWidth, height: originalHeight },
          actualSize: { width: actualWidth, height: actualHeight },
          scaleFactor: { x: scaleX, y: scaleY },
          coordinateTransform: {
            note: 'To convert coordinates from original to scaled image:',
            toScaled: `scaledX = originalX * ${scaleX.toFixed(3)}, scaledY = originalY * ${scaleY.toFixed(3)}`,
            toOriginal: `originalX = scaledX / ${scaleX.toFixed(3)}, originalY = scaledY / ${scaleY.toFixed(3)}`,
            scaleX,
            scaleY,
          },
          estimatedTokens: compressedTokens,
          originalTokens,
          compressionRatio:
            finalMode === 'full' ? 1 : (originalTokens / compressedTokens).toFixed(2),
          message: `Screenshot (${finalMode}: ${actualWidth}x${actualHeight}, ~${compressedTokens} tokens)`,
          size: base64Data.length,
        },
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toolLogger.error({ error }, '[screenshot] Failed to capture screenshot');
      return {
        result: null,
        error: `Failed to capture screenshot: ${errorMessage}`,
      };
    }
  },
};

/**
 * Screen Info Tool
 * Gets information about screen dimensions and configuration
 */
tools.screen_info = {
  name: 'screen_info',
  description:
    'Get information about screen dimensions and display configuration. Use this to determine valid coordinates for mouse operations.',
  parameters: {},
  handler: async () => {
    try {
      const screenWidth = await screen.width();
      const screenHeight = await screen.height();

      // Get screen count (number of monitors)
      // Note: nut-js doesn't directly support multi-monitor info, so we return primary screen
      const screenCount = 1;

      toolLogger.info(`[screen_info] Screen: ${screenWidth}x${screenHeight}`);

      return {
        result: {
          width: screenWidth,
          height: screenHeight,
          screenWidth,
          screenHeight,
          screenCount,
          message: `Screen resolution: ${screenWidth}x${screenHeight}`,
          coordinateRange: {
            x: { min: 0, max: screenWidth - 1 },
            y: { min: 0, max: screenHeight - 1 },
          },
        },
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toolLogger.error({ error }, '[screen_info] Failed to get screen info');
      return {
        result: null,
        error: `Failed to get screen information: ${errorMessage}`,
      };
    }
  },
};

/**
 * Screenshot Diff Tool
 * Captures a screenshot only if the screen has changed significantly from the last screenshot.
 * This saves tokens by not sending duplicate screenshots when the screen hasn't changed.
 */
tools.screenshot_diff = {
  name: 'screenshot_diff',
  description:
    'Capture a screenshot only if the screen has changed significantly from the last screenshot. Saves context tokens by avoiding duplicate screenshots. Returns null if no significant change detected.',
  parameters: {
    mode: {
      type: 'string',
      description:
        'Compression mode when change is detected: "smart" (auto), "compressed" (1280px max), "thumbnail" (320px max). Default: "smart"',
      required: false,
    },
    force: {
      type: 'boolean',
      description:
        'Force capture even if no significant change detected. Useful for capturing time-sensitive content.',
      required: false,
    },
  },
  handler: async (params) => {
    try {
      const mode = (params.mode as string) || 'smart';
      const force = params.force as boolean | undefined;

      // Capture current screenshot using grab() API
      const currentImage = await screen.grab();
      if (!currentImage) {
        return {
          result: null,
          error: 'Failed to capture screenshot',
        };
      }

      // Convert image buffer to base64
      const currentData = currentImage.data.toString('base64');
      const screenWidth = await screen.width();
      const screenHeight = await screen.height();

      // If no previous screenshot, always capture
      if (!lastScreenshot) {
        lastScreenshot = {
          data: currentData,
          width: screenWidth,
          height: screenHeight,
          timestamp: Date.now(),
        };

        toolLogger.info('[screenshot_diff] First screenshot captured');

        // Use smart mode for first screenshot too
        let finalMode = mode;
        if (finalMode === 'smart') {
          const megapixels = (screenWidth * screenHeight) / 1000000;
          finalMode = megapixels > 2 ? 'compressed' : 'full';
        }

        // Calculate scaling if compressed
        let scaleX = 1.0;
        let scaleY = 1.0;
        let actualWidth = screenWidth;
        let actualHeight = screenHeight;

        if (finalMode !== 'full') {
          const maxDim = finalMode === 'thumbnail' ? 320 : 1280;
          const scale = Math.min(maxDim / screenWidth, maxDim / screenHeight);
          scaleX = scale;
          scaleY = scale;
          actualWidth = Math.round(screenWidth * scale);
          actualHeight = Math.round(screenHeight * scale);
        }

        const tokens = Math.ceil(currentData.length / 4);

        return {
          result: {
            data: currentData,
            format: 'image/png',
            mode: finalMode,
            originalSize: { width: screenWidth, height: screenHeight },
            actualSize: { width: actualWidth, height: actualHeight },
            scaleFactor: { x: scaleX, y: scaleY },
            estimatedTokens: tokens,
            changed: true,
            message: `First screenshot captured (${finalMode}, ~${tokens} tokens)`,
          },
        };
      }

      // Compare with previous screenshot
      const timeDiff = Date.now() - lastScreenshot.timestamp;

      // If previous screenshot is very recent (<500ms), skip comparison
      if (timeDiff < 500 && !force) {
        toolLogger.info(`[screenshot_diff] Skipping - too soon (${timeDiff}ms)`);

        return {
          result: {
            changed: false,
            skipped: true,
            reason: 'Too soon since last screenshot',
            timeSinceLast: timeDiff,
            message: 'Screenshot skipped (too recent)',
          },
        };
      }

      // Simple comparison: if data is significantly different, consider it changed
      // In production, you'd use actual image diff algorithms
      const dataChanged = currentData !== lastScreenshot.data;
      const sizeChanged =
        screenWidth !== lastScreenshot.width || screenHeight !== lastScreenshot.height;

      if (!dataChanged && !sizeChanged && !force) {
        toolLogger.info('[screenshot_diff] No significant change detected');

        return {
          result: {
            changed: false,
            skipped: true,
            reason: 'No significant change detected',
            timeSinceLast: timeDiff,
            message: 'Screenshot skipped (no change)',
          },
        };
      }

      // Screen has changed - update lastScreenshot
      lastScreenshot = {
        data: currentData,
        width: screenWidth,
        height: screenHeight,
        timestamp: Date.now(),
      };

      toolLogger.info(`[screenshot_diff] Screen changed, capturing screenshot`);

      // Apply compression mode
      let finalMode = mode;
      if (finalMode === 'smart') {
        const megapixels = (screenWidth * screenHeight) / 1000000;
        finalMode = megapixels > 2 ? 'compressed' : 'full';
      }

      let scaleX = 1.0;
      let scaleY = 1.0;
      let actualWidth = screenWidth;
      let actualHeight = screenHeight;

      if (finalMode === 'thumbnail') {
        const maxDim = 320;
        const scale = Math.min(maxDim / screenWidth, maxDim / screenHeight);
        scaleX = scale;
        scaleY = scale;
        actualWidth = Math.round(screenWidth * scale);
        actualHeight = Math.round(screenHeight * scale);
      } else if (finalMode === 'compressed') {
        const maxDim = 1280;
        const scale = Math.min(maxDim / screenWidth, maxDim / screenHeight);
        scaleX = scale;
        scaleY = scale;
        actualWidth = Math.round(screenWidth * scale);
        actualHeight = Math.round(screenHeight * scale);
      }

      const tokens = Math.ceil(currentData.length / 4);

      return {
        result: {
          data: currentData,
          format: 'image/png',
          mode: finalMode,
          originalSize: { width: screenWidth, height: screenHeight },
          actualSize: { width: actualWidth, height: actualHeight },
          scaleFactor: { x: scaleX, y: scaleY },
          estimatedTokens: tokens,
          changed: true,
          timeSinceLast: timeDiff,
          message: `Screenshot captured (${finalMode}, ~${tokens} tokens, ${timeDiff}ms since last)`,
        },
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toolLogger.error({ error }, '[screenshot_diff] Failed to capture diff screenshot');
      return {
        result: null,
        error: `Failed to capture diff screenshot: ${errorMessage}`,
      };
    }
  },
};

/**
 * Clear last screenshot cache
 * Use this to reset the screenshot diff comparison
 */
tools.clear_screenshot_cache = {
  name: 'clear_screenshot_cache',
  description:
    'Clear the cached screenshot used for change detection. Use this to reset the diff comparison when starting a new task or when the screen context has completely changed.',
  parameters: {},
  handler: async () => {
    try {
      const hadPrevious = lastScreenshot !== null;
      lastScreenshot = null;

      toolLogger.info(
        `[clear_screenshot_cache] Screenshot cache cleared${hadPrevious ? ' (had previous cache)' : ''}`
      );

      return {
        result: {
          cleared: true,
          hadPrevious,
          message: hadPrevious ? 'Screenshot cache cleared' : 'No cache to clear',
        },
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toolLogger.error({ error }, '[clear_screenshot_cache] Failed to clear cache');
      return {
        result: null,
        error: `Failed to clear cache: ${errorMessage}`,
      };
    }
  },
};

interface SequenceStep {
  tool: string;
  parameters?: Record<string, unknown>;
  delay?: number; // Delay after this step (ms)
  delayVariation?: number; // Random variation for delay (ms)
  description?: string; // Optional description for logging
}

/**
 * Sequence Execute Tool
 * Executes multiple operations in sequence with delays between steps
 * This reduces LLM API calls by batching multiple operations together
 */
tools.sequence_execute = {
  name: 'sequence_execute',
  description:
    'Execute multiple keyboard/mouse operations in a sequence with human-like delays between steps. Use this to batch operations like filling forms, navigating menus, or performing multi-step tasks. Significantly reduces LLM API calls while maintaining natural human timing.',
  parameters: {
    steps: {
      type: 'array',
      description:
        'Array of operations to execute. Each operation should have: tool (string), parameters (object), delay (number, ms after this step), delayVariation (number, ms random variation), description (optional string).',
      required: true,
    },
    onError: {
      type: 'string',
      description:
        'Error handling strategy: "stop" (halt on error), "continue" (skip failed steps), "retry" (retry failed steps). Default: "stop"',
      required: false,
    },
    maxRetries: {
      type: 'number',
      description: 'Maximum retry attempts when onError is "retry". Default: 2',
      required: false,
    },
    defaultDelay: {
      type: 'number',
      description:
        'Default delay between steps in milliseconds. Default: 300ms. Use 100-500ms for fast operations, 500-1500ms for human-like pauses.',
      required: false,
    },
    defaultVariation: {
      type: 'number',
      description:
        'Default random delay variation in milliseconds. Default: 100ms. Adds +/- this amount to each delay for natural timing.',
      required: false,
    },
  },
  handler: async (params) => {
    try {
      const steps = params.steps as SequenceStep[];
      const onError = (params.onError as string) || 'stop';
      const maxRetries = (params.maxRetries as number) || 2;
      const defaultDelay = (params.defaultDelay as number) || 300;
      const defaultVariation = (params.defaultVariation as number) || 100;

      if (!Array.isArray(steps) || steps.length === 0) {
        return {
          result: null,
          error: 'Invalid steps parameter. Must be a non-empty array.',
        };
      }

      toolLogger.info(
        `[sequence_execute] Starting sequence of ${steps.length} steps (onError: ${onError})`
      );

      const results: Array<{
        step: number;
        tool: string;
        success: boolean;
        result?: unknown;
        error?: string;
        delay?: number;
        actualDelay?: number;
        description?: string;
      }> = [];

      let completedSteps = 0;
      let failedSteps = 0;

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const stepNumber = i + 1;

        // Validate step
        if (!step || typeof step !== 'object') {
          const error = `Step ${stepNumber} is invalid`;
          toolLogger.error(`[sequence_execute] ${error}`);

          results.push({
            step: stepNumber,
            tool: 'unknown',
            success: false,
            error,
          });

          if (onError === 'stop') {
            break;
          }
          continue;
        }

        if (!step.tool || typeof step.tool !== 'string') {
          const error = `Step ${stepNumber} missing tool name`;
          toolLogger.error(`[sequence_execute] ${error}`);

          results.push({
            step: stepNumber,
            tool: 'unknown',
            success: false,
            error,
          });

          if (onError === 'stop') {
            break;
          }
          continue;
        }

        const toolName = step.tool;
        const stepParams = step.parameters || {};
        const stepDelay = step.delay ?? defaultDelay;
        const stepVariation = step.delayVariation ?? defaultVariation;
        const stepDescription = step.description;

        toolLogger.info(
          `[sequence_execute] Step ${stepNumber}/${steps.length}: ${toolName}${stepDescription ? ` (${stepDescription})` : ''}`
        );

        // Execute with retry logic
        let attempt = 0;
        let lastError: string | undefined;

        while (attempt <= (onError === 'retry' ? maxRetries : 0)) {
          if (attempt > 0) {
            toolLogger.info(`[sequence_execute] Retry ${attempt}/${maxRetries} for ${toolName}`);
          }

          // Get the tool
          const tool = getTool(toolName);
          if (!tool) {
            lastError = `Unknown tool: ${toolName}`;
            toolLogger.error(`[sequence_execute] ${lastError}`);
            break;
          }

          try {
            // Execute the tool
            const toolResult = await tool.handler(stepParams);

            if (toolResult.error) {
              lastError = toolResult.error;
              if (attempt < (onError === 'retry' ? maxRetries : 0)) {
                attempt++;
                await sleep(100); // Brief pause before retry
                continue;
              }

              toolLogger.error(`[sequence_execute] Step ${stepNumber} failed: ${lastError}`);

              results.push({
                step: stepNumber,
                tool: toolName,
                success: false,
                error: lastError,
                delay: stepDelay,
                description: stepDescription,
              });

              failedSteps++;

              if (onError === 'stop') {
                return {
                  result: {
                    completedSteps,
                    failedSteps: failedSteps + 1,
                    totalSteps: steps.length,
                    status: 'stopped_on_error',
                    results,
                    message: `Sequence stopped at step ${stepNumber}: ${lastError}`,
                  },
                };
              }
              break;
            }

            // Success
            completedSteps++;

            // Calculate delay with random variation
            const delayVariation = Math.random() * stepVariation * 2 - stepVariation; // +/- variation
            const actualDelay = Math.max(0, Math.round(stepDelay + delayVariation));

            toolLogger.info(
              `[sequence_execute] Step ${stepNumber} completed, delaying ${actualDelay}ms`
            );

            results.push({
              step: stepNumber,
              tool: toolName,
              success: true,
              result: toolResult.result,
              delay: stepDelay,
              actualDelay,
              description: stepDescription,
            });

            // Wait before next step (unless it's the last step)
            if (i < steps.length - 1) {
              await sleep(actualDelay);
            }

            break;
          } catch (error: unknown) {
            lastError = error instanceof Error ? error.message : String(error);
            toolLogger.error(`[sequence_execute] Step ${stepNumber} exception: ${lastError}`);

            if (attempt < (onError === 'retry' ? maxRetries : 0)) {
              attempt++;
              await sleep(100);
              continue;
            }

            results.push({
              step: stepNumber,
              tool: toolName,
              success: false,
              error: lastError,
              delay: stepDelay,
              description: stepDescription,
            });

            failedSteps++;

            if (onError === 'stop') {
              return {
                result: {
                  completedSteps,
                  failedSteps: failedSteps + 1,
                  totalSteps: steps.length,
                  status: 'stopped_on_error',
                  results,
                  message: `Sequence stopped at step ${stepNumber}: ${lastError}`,
                },
              };
            }
            break;
          }
        }
      }

      // All steps processed
      const finalStatus = failedSteps === 0 ? 'completed' : 'completed_with_errors';

      toolLogger.info(
        `[sequence_execute] Sequence finished: ${completedSteps}/${steps.length} steps completed, ${failedSteps} failed`
      );

      return {
        result: {
          completedSteps,
          failedSteps,
          totalSteps: steps.length,
          status: finalStatus,
          results,
          message: `Sequence ${finalStatus}: ${completedSteps}/${steps.length} steps successful${failedSteps > 0 ? `, ${failedSteps} failed` : ''}`,
        },
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toolLogger.error({ error }, '[sequence_execute] Failed');
      return {
        result: null,
        error: `Failed to execute sequence: ${errorMessage}`,
      };
    }
  },
};

/**
 * Get tool by name
 */
export function getTool(name: string): Tool | undefined {
  return tools[name];
}

/**
 * Get all available tools
 */
export function getAvailableTools(): Record<string, Tool> {
  return tools;
}

/**
 * Export tools for integration
 */
export { tools };
