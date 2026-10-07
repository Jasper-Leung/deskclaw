/**
 * Session Search IPC Handlers
 *
 * Full-text search across session messages using FTS5.
 */

import Database from 'better-sqlite3';

export interface SearchResult {
  sessionId: string;
  sessionTitle: string;
  role: string;
  content: string;
  snippet: string;
  timestamp: number;
  rank: number;
}

export interface SearchSuggestion {
  text: string;
  count: number;
}

/**
 * Search sessions using FTS5 MATCH query
 */
export const searchSessions = (
  db: Database.Database,
  query: string,
  limit: number = 20
): SearchResult[] => {
  if (!query || !query.trim()) return [];

  // Sanitize query for FTS5 - escape special characters
  const sanitized = query.replace(/"/g, '""').replace(/[*]/g, '').trim();

  const ftsQuery = `"${sanitized}"*`;

  const stmt = db.prepare(`
    SELECT
      sm.session_id,
      s.title as session_title,
      sm.role,
      sm.content,
      snippet(session_messages_fts, 0, '>>>', '<<<', '...', 32) as snippet,
      sm.timestamp,
      rank
    FROM session_messages_fts
    JOIN session_messages sm ON session_messages_fts.rowid = sm.id
    JOIN sessions s ON sm.session_id = s.id
    WHERE session_messages_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `);

  const results = stmt.all(ftsQuery, limit) as any[];

  return results.map((r) => ({
    sessionId: r.session_id,
    sessionTitle: r.session_title,
    role: r.role,
    content: r.content,
    snippet: r.snippet,
    timestamp: r.timestamp,
    rank: r.rank,
  }));
};

/**
 * Get autocomplete suggestions based on a prefix
 */
export const getSearchSuggestions = (
  db: Database.Database,
  prefix: string,
  limit: number = 10
): SearchSuggestion[] => {
  if (!prefix || prefix.length < 2) return [];

  // Get distinct words starting with the prefix from recent messages
  const sanitized = prefix.replace(/[%_]/g, '\\$&');

  const stmt = db.prepare(`
    SELECT DISTINCT substr(content, 1, 100) as text, 1 as count
    FROM session_messages
    WHERE content LIKE ? ESCAPE '\\'
    ORDER BY timestamp DESC
    LIMIT ?
  `);

  const results = stmt.all(`${sanitized}%`, limit) as any[];

  return results.map((r) => ({
    text: r.text,
    count: r.count,
  }));
};
