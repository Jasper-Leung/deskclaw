/**
 * Context References IPC Handlers
 *
 * IPC handlers for previewing and expanding context references.
 */

import Database from 'better-sqlite3';
import { expandReferences, previewReference, parseReferences } from '../lib/context-references.js';

export const contextRefsPreview = async (_db: Database.Database, ref: string) => {
  return await previewReference(ref);
};

export const contextRefsExpand = async (_db: Database.Database, text: string) => {
  return await expandReferences(text);
};

export const contextRefsParse = (_db: Database.Database, text: string) => {
  return parseReferences(text);
};
