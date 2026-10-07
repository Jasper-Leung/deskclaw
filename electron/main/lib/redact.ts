/**
 * Secret Redaction Module
 *
 * Detects and redacts API keys, tokens, and other sensitive information
 * from text before logging or returning to the renderer process.
 * TypeScript port of Hermes agent/redact.py
 */

// Secret detection patterns
const SECRET_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  // OpenAI keys
  { pattern: /\bsk-[A-Za-z0-9_-]{10,}\b/g, label: 'OpenAI Key' },
  {
    pattern: /\bsk-[A-Za-z0-9]{20,}T3BlbkFJ[A-Za-z0-9]{10,}\b/g,
    label: 'OpenAI Key (long)',
  },
  // Anthropic keys
  { pattern: /\bsk-ant-api[A-Za-z0-9-_]{20,}\b/g, label: 'Anthropic Key' },
  // GitHub tokens
  { pattern: /\bghp_[A-Za-z0-9]{36}\b/g, label: 'GitHub PAT' },
  { pattern: /\bgithub_pat_[A-Za-z0-9_]{10,}\b/g, label: 'GitHub Fine-grained PAT' },
  // Google API keys
  { pattern: /\bAIza[A-Za-z0-9_-]{35}\b/g, label: 'Google API Key' },
  // AWS Access Keys
  { pattern: /\bAKIA[0-9A-Z]{16}\b/g, label: 'AWS Access Key' },
  // Slack tokens
  { pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, label: 'Slack Token' },
  // Stripe keys
  { pattern: /\bsk_live_[A-Za-z0-9]{10,}\b/g, label: 'Stripe Live Key' },
  { pattern: /\bsk_test_[A-Za-z0-9]{10,}\b/g, label: 'Stripe Test Key' },
  // Private keys
  {
    pattern: /-----BEGIN[A A-Z ]*PRIVATE KEY-----[\s\S]*?-----END[A A-Z ]*PRIVATE KEY-----/g,
    label: 'Private Key',
  },
  // Authorization headers
  { pattern: /Authorization:\s*Bearer\s+\S+/gi, label: 'Auth Header' },
  // Database connection strings
  { pattern: /postgres(?:ql)?:\/\/[^\s'"]+/gi, label: 'PostgreSQL Connection String' },
  { pattern: /mysql:\/\/[^\s'"]+/gi, label: 'MySQL Connection String' },
  { pattern: /mongodb(?:\+srv)?:\/\/[^\s'"]+/gi, label: 'MongoDB Connection String' },
];

// Environment variable assignments
const ENV_ASSIGNMENT_PATTERN =
  /(?<=^|[\s;,"'])((?:API_KEY|SECRET|TOKEN|PASSWORD|PASS|PRIVATE_KEY|ACCESS_KEY|SECRET_KEY|AUTH_TOKEN|SESSION_KEY|CREDENTIALS?)(?:_[A-Z0-9_]*)?)\s*=\s*["']?([^\s"']{8,})["']?/gim;

// JSON fields with sensitive values
const JSON_FIELD_PATTERN =
  /"((?:api[_-]?key|token|secret|password|access[_-]?token|refresh[_-]?token|private[_-]?key|auth))"\s*:\s*"([^"]{8,})"/gi;

/**
 * Redact a matched secret value
 * Short tokens (<18 chars) → ***, longer tokens → first6...last4
 */
function redactValue(match: string): string {
  // Strip quotes and whitespace
  const value = match.trim();
  if (value.length < 18) {
    return '***';
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

/**
 * Redact secrets from text
 * Returns the text with all detected secrets replaced by redacted versions
 */
export function redactSecrets(text: string): string {
  if (!text || typeof text !== 'string') {
    return text;
  }

  let result = text;

  // Apply each secret pattern
  for (const { pattern } of SECRET_PATTERNS) {
    // Reset lastIndex since patterns have global flag
    const regex = new RegExp(pattern.source, pattern.flags);
    result = result.replace(regex, (match) => redactValue(match));
  }

  // Redact environment variable assignments
  result = result.replace(ENV_ASSIGNMENT_PATTERN, (_match, key, _value) => {
    return `${key}=***REDACTED***`;
  });

  // Redact JSON fields
  result = result.replace(JSON_FIELD_PATTERN, (_match, key, _value) => {
    return `"${key}":"***REDACTED***"`;
  });

  return result;
}

/**
 * Check if text contains any detectable secrets
 */
export function hasSecrets(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }

  for (const { pattern } of SECRET_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    if (regex.test(text)) {
      return true;
    }
  }

  if (ENV_ASSIGNMENT_PATTERN.test(text)) {
    return true;
  }

  if (JSON_FIELD_PATTERN.test(text)) {
    return true;
  }

  return false;
}
