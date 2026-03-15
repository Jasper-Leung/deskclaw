/**
 * Token Counter Tests
 */

import { describe, it, expect, vi } from 'vitest';

// Mock tiktoken dynamically
const mockEncoding = {
  encode: vi.fn((text: string) => {
    // Simple mock: return array of words
    return text.split(/\s+/).filter(Boolean).map((_, i) => i);
  }),
  decode: vi.fn((tokens: number[]) => {
    return tokens.join(' ');
  }),
};

vi.mock('js-tiktoken', () => ({
  getEncoding: vi.fn(() => mockEncoding),
  encodingForModel: vi.fn(() => mockEncoding),
}));

describe('Token Counter', () => {
  describe('countMessageTokens', () => {
    it('should count tokens in a message', async () => {
      const { countMessageTokens } = await import('./token-counter.js');
      const message = {
        role: 'user' as const,
        content: 'Hello, world!',
      };
      const count = countMessageTokens(message, 'gpt-4');
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThan(0);
    });

    it('should handle empty content', async () => {
      const { countMessageTokens } = await import('./token-counter.js');
      const message = {
        role: 'user' as const,
        content: '',
      };
      const count = countMessageTokens(message, 'gpt-4');
      expect(typeof count).toBe('number');
    });

    it('should handle long content', async () => {
      const { countMessageTokens } = await import('./token-counter.js');
      const longContent = 'word '.repeat(1000);
      const message = {
        role: 'user' as const,
        content: longContent,
      };
      const count = countMessageTokens(message, 'gpt-4');
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThan(0);
    });

    it('should handle different models', async () => {
      const { countMessageTokens } = await import('./token-counter.js');
      const message = {
        role: 'user' as const,
        content: 'Test message',
      };

      const gpt4Count = countMessageTokens(message, 'gpt-4');
      const gpt35Count = countMessageTokens(message, 'gpt-3.5-turbo');
      const claudeCount = countMessageTokens(message, 'claude-3-opus');

      expect(typeof gpt4Count).toBe('number');
      expect(typeof gpt35Count).toBe('number');
      expect(typeof claudeCount).toBe('number');
    });

    it('should handle system messages', async () => {
      const { countMessageTokens } = await import('./token-counter.js');
      const message = {
        role: 'system' as const,
        content: 'You are a helpful assistant.',
      };
      const count = countMessageTokens(message, 'gpt-4');
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThan(0);
    });

    it('should handle assistant messages', async () => {
      const { countMessageTokens } = await import('./token-counter.js');
      const message = {
        role: 'assistant' as const,
        content: 'Here is my response.',
      };
      const count = countMessageTokens(message, 'gpt-4');
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThan(0);
    });

    it('should handle messages with timestamp', async () => {
      const { countMessageTokens } = await import('./token-counter.js');
      const message = {
        role: 'user' as const,
        content: 'Test message',
        timestamp: Date.now(),
      };
      const count = countMessageTokens(message, 'gpt-4');
      expect(typeof count).toBe('number');
    });

    it('should handle special characters', async () => {
      const { countMessageTokens } = await import('./token-counter.js');
      const message = {
        role: 'user' as const,
        content: 'Test with emoji 🎉 and special chars: @#$%^&*()',
      };
      const count = countMessageTokens(message, 'gpt-4');
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThan(0);
    });

    it('should handle code blocks', async () => {
      const { countMessageTokens } = await import('./token-counter.js');
      const message = {
        role: 'user' as const,
        content: '```javascript\nconst x = 42;\nconsole.log(x);\n```',
      };
      const count = countMessageTokens(message, 'gpt-4');
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThan(0);
    });
  });

  describe('countMessagesTokens', () => {
    it('should count tokens in multiple messages', async () => {
      const { countMessagesTokens } = await import('./token-counter.js');
      const messages = [
        { role: 'system' as const, content: 'You are a helpful assistant.' },
        { role: 'user' as const, content: 'Hello!' },
        { role: 'assistant' as const, content: 'Hi there!' },
      ];
      const count = countMessagesTokens(messages, 'gpt-4');
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThan(0);
    });

    it('should handle empty message array', async () => {
      const { countMessagesTokens } = await import('./token-counter.js');
      const count = countMessagesTokens([], 'gpt-4');
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('should handle single message', async () => {
      const { countMessagesTokens } = await import('./token-counter.js');
      const messages = [
        { role: 'user' as const, content: 'Single message' },
      ];
      const count = countMessagesTokens(messages, 'gpt-4');
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThan(0);
    });

    it('should handle conversation with tools', async () => {
      const { countMessagesTokens } = await import('./token-counter.js');
      const messages = [
        { role: 'user' as const, content: 'What is the weather?' },
        { role: 'assistant' as const, content: '{"tool": "web_search", "parameters": {"query": "weather"}}' },
        { role: 'tool_result' as const, content: '{"result": "Sunny, 25°C"}', timestamp: Date.now() },
        { role: 'assistant' as const, content: 'The weather is sunny and 25°C.' },
      ];
      const count = countMessagesTokens(messages, 'gpt-4');
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThan(0);
    });

    it('should handle long conversation', async () => {
      const { countMessagesTokens } = await import('./token-counter.js');
      const messages = [];
      for (let i = 0; i < 50; i++) {
        messages.push({ role: 'user' as const, content: `Message ${i}` });
        messages.push({ role: 'assistant' as const, content: `Response ${i}` });
      }
      const count = countMessagesTokens(messages, 'gpt-4');
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThan(0);
    });
  });

  describe('estimateTokens', () => {
    it('should provide fallback estimation', async () => {
      const { estimateTokens } = await import('./token-counter.js');
      const text = 'This is a test message for token estimation.';
      const estimate = estimateTokens(text);
      expect(typeof estimate).toBe('number');
      expect(estimate).toBeGreaterThan(0);
    });

    it('should handle empty string', async () => {
      const { estimateTokens } = await import('./token-counter.js');
      const estimate = estimateTokens('');
      expect(typeof estimate).toBe('number');
      expect(estimate).toBe(0);
    });

    it('should handle very long text', async () => {
      const { estimateTokens } = await import('./token-counter.js');
      const longText = 'word '.repeat(10000);
      const estimate = estimateTokens(longText);
      expect(typeof estimate).toBe('number');
      expect(estimate).toBeGreaterThan(0);
    });
  });

  describe('getTokenLimit', () => {
    it('should return token limit for known models', async () => {
      const { getTokenLimit } = await import('./token-counter.js');

      expect(getTokenLimit('gpt-4')).toBeGreaterThan(0);
      expect(getTokenLimit('gpt-4-32k')).toBeGreaterThan(0);
      expect(getTokenLimit('gpt-3.5-turbo')).toBeGreaterThan(0);
    });

    it('should return default limit for unknown models', async () => {
      const { getTokenLimit } = await import('./token-counter.js');
      const limit = getTokenLimit('unknown-model');
      expect(typeof limit).toBe('number');
      expect(limit).toBeGreaterThan(0);
    });

    it('should handle claude models', async () => {
      const { getTokenLimit } = await import('./token-counter.js');

      expect(getTokenLimit('claude-3-opus')).toBeGreaterThan(0);
      expect(getTokenLimit('claude-3-sonnet')).toBeGreaterThan(0);
      expect(getTokenLimit('claude-3-haiku')).toBeGreaterThan(0);
    });
  });

  describe('isNearTokenLimit', () => {
    it('should detect when approaching limit', async () => {
      const { isNearTokenLimit } = await import('./token-counter.js');

      const nearLimit = isNearTokenLimit(7000, 'gpt-4'); // 8k context
      expect(typeof nearLimit).toBe('boolean');
    });

    it('should handle different thresholds', async () => {
      const { isNearTokenLimit } = await import('./token-counter.js');

      const near80 = isNearTokenLimit(6500, 'gpt-4', 0.8);
      const near90 = isNearTokenLimit(7300, 'gpt-4', 0.9);

      expect(typeof near80).toBe('boolean');
      expect(typeof near90).toBe('boolean');
    });

    it('should return false for low token counts', async () => {
      const { isNearTokenLimit } = await import('./token-counter.js');
      const nearLimit = isNearTokenLimit(1000, 'gpt-4');
      expect(nearLimit).toBe(false);
    });
  });

  describe('truncateToTokenLimit', () => {
    it('should truncate content to fit within limit', async () => {
      const { truncateToTokenLimit } = await import('./token-counter.js');
      const longContent = 'word '.repeat(10000);
      const truncated = truncateToTokenLimit(longContent, 'gpt-4', 1000);
      expect(typeof truncated).toBe('string');
      expect(truncated.length).toBeLessThan(longContent.length);
    });

    it('should not truncate short content', async () => {
      const { truncateToTokenLimit } = await import('./token-counter.js');
      const shortContent = 'Short content';
      const truncated = truncateToTokenLimit(shortContent, 'gpt-4', 1000);
      expect(truncated).toBe(shortContent);
    });

    it('should add truncation indicator', async () => {
      const { truncateToTokenLimit } = await import('./token-counter.js');
      const longContent = 'word '.repeat(10000);
      const truncated = truncateToTokenLimit(longContent, 'gpt-4', 100);
      expect(truncated).toContain('...');
    });
  });
});
