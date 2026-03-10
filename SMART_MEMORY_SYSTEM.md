# Intelligent Memory System - Implementation Summary

## Overview

Implemented a comprehensive intelligent memory system that automatically evaluates, deduplicates, and adjusts memory importance for the DeskClaw application. This addresses the user's question: "Does this project know when to add conversation records to memory and when not to?"

## Answer: YES - Now it does!

The system now intelligently decides what to save as memory through three integrated services:

---

## 1. Memory Evaluator Service (`electron/main/memory/evaluator.ts`)

### Purpose

Intelligently evaluates whether content should be saved as memory and what importance level it should have.

### Key Features

#### Content Pattern Recognition

- **7 Memory Types**: fact, preference, task, relationship, decision, skill, event
- Each type has specific indicator patterns
- Automatic type detection with confidence scoring

#### Smart Content Filtering

- **Minimum Requirements**:
  - 15-2000 characters
  - 3-300 words
  - 30% information density (unique words / total words)

- **Exclusion Patterns**:
  - Greetings ("hello", "hi", "hey")
  - Simple responses ("yes", "no", "ok", "thanks")
  - Short questions without context
  - Empty or emoji-only content

#### Importance Scoring

- Base importance: 0.3
- Adjustments for:
  - Content length (optimal: 100-500 chars)
  - Conversation context
  - Time since last memory
  - Role (user statements +10%, assistant -5%)
  - Type detection confidence

### Usage Example

```typescript
import { evaluateContentForMemory } from './memory/evaluator.js';

const result = evaluateContentForMemory(db, content, {
  agentId: 'agent-123',
  role: 'user',
  conversationLength: 5,
  timeSinceLastMemory: 3600000,
  recentMemoryCount: 3,
  totalMemoryCount: 50,
});

// Result:
// {
//   shouldSave: true,
//   confidence: 0.75,
//   reason: "Identified as preference with relevance score",
//   suggestedImportance: 0.65,
//   memoryType: "preference",
//   extractedContent: "I prefer working in the morning"
// }
```

---

## 2. Memory Deduplication Service (`electron/main/memory/deduplication.ts`)

### Purpose

Prevents storing duplicate or near-duplicate memories using semantic similarity.

### Key Features

#### Semantic Duplicate Detection

- Uses vector embeddings to find similar memories
- Configurable similarity threshold (default: 85%)
- Checks against recent N memories (default: 50)

#### Merge Capabilities

- **3 Merge Strategies**:
  - `highest_importance`: Keep most important
  - `most_recent`: Keep newest
  - `combined`: Keep longest + most important

#### Duplicate Review Suggestions

- Suggests potential duplicates for manual review
- Shows similarity scores for each group
- Lower threshold (75%) for review suggestions

### Usage Example

```typescript
import { checkForDuplicateMemories } from './memory/deduplication.js';

const result = await checkForDuplicateMemories(db, agentId, content, {
  similarityThreshold: 0.85,
  checkCount: 50,
  useSemanticSearch: true,
});

// Result:
// {
//   isDuplicate: false,
//   similarity: 0.72,
//   similarMemories: [...],
//   reason: "Found 2 similar memories, but none above 85% threshold"
// }
```

---

## 3. Memory Importance Adjuster Service (`electron/main/memory/importance-adjuster.ts`)

### Purpose

Automatically adjusts memory importance based on usage patterns and feedback.

### Key Features

#### Access Tracking

- Tracks all memory access (retrieved, viewed, edited, referenced)
- Records retrieval rank and context
- Stores query information for analysis

#### Automatic Importance Adjustment

- **Boost Factors**:
  - Recent access (+5%)
  - High retrieval success rate (+2.5%)
  - Good retrieval rank (top 3) (+1.5%)

- **Decay Factors**:
  - Age decay after 30 days (-1% per month)
  - No access for 14 days (additional decay)

- **Bounds**: 0.1 (min) to 1.0 (max)

#### User Feedback Integration

- Positive feedback: +20% importance
- Negative feedback: -30% importance

### Usage Example

```typescript
import { trackMemoryAccess, adjustMemoryImportance } from './memory/importance-adjuster.js';

// Track when memory is retrieved
trackMemoryAccess(db, memoryId, 'retrieved', {
  retrievalRank: 1,
  retrievalCount: 5,
  query: 'user preferences',
});

// Adjust importance based on patterns
const adjustment = adjustMemoryImportance(db, memoryId, {
  boostFactor: 0.05,
  decayFactor: 0.01,
  minImportance: 0.1,
  maxImportance: 1.0,
});
```

---

## 4. Smart Memory Creation (`electron/main/ipc/memory-smart.ts`)

### Purpose

Integrates all three services for automatic intelligent memory creation.

### Features

- Evaluates content before creating
- Checks for duplicates
- Tracks creation for importance adjustment
- Batch processing for conversations

### Quick Chat Integration

Updated `saveQuickChatConversation()` to use smart creation:

- Evaluates all messages in conversation
- Creates up to 3 most relevant memories
- Automatically rejects duplicates
- Tracks all created memories

---

## Database Schema Changes

### New Table: `memory_access_tracking`

```sql
CREATE TABLE IF NOT EXISTS memory_access_tracking (
  id TEXT PRIMARY KEY,
  memory_id TEXT NOT NULL,
  access_type TEXT NOT NULL CHECK(access_type IN ('retrieved', 'viewed', 'edited', 'referenced')),
  retrieval_rank INTEGER,
  retrieval_count INTEGER,
  session_id TEXT,
  query TEXT,
  timestamp INTEGER NOT NULL,
  FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
)
```

### Updated Table: `memories`

- Added `updated_at INTEGER` column
- Added `metadata TEXT` column for storing evaluation results

---

## IPC Handlers Added

### Memory Evaluation

- `memory:smartCreate` - Create memory with intelligent evaluation
- `memory:smartCreateBatch` - Batch create from conversation
- `memory:evaluateContent` - Evaluate content for memory worthiness
- `memory:batchEvaluate` - Evaluate multiple messages

### Memory Deduplication

- `memory:checkDuplicate` - Check for duplicates
- `memory:findMergeDuplicates` - Find and merge duplicate memories
- `memory:getDuplicateStats` - Get duplicate statistics
- `memory:suggestReview` - Get potential duplicates for review

### Memory Importance Adjustment

- `memory:trackAccess` - Track memory access
- `memory:getAccessStats` - Get access statistics
- `memory:adjustImportance` - Adjust single memory importance
- `memory:batchAdjustImportance` - Batch adjust all memories
- `memory:applyFeedback` - Apply user feedback
- `memory:getAdjustmentStats` - Get adjustment statistics
- `memory:getNeedingAdjustment` - Get memories needing adjustment
- `memory:cleanupTracking` - Clean up old tracking records

---

## How It Works: End-to-End Flow

### Quick Chat Example

1. **User sends message**: "I prefer working in the morning"
2. **Conversation ends**
3. **Smart memory creation triggered**:
   - Evaluator analyzes content
   - Detects "preference" type with 85% confidence
   - Suggests importance of 0.7
   - Deduplication check finds no similar memories
   - Memory created with importance 0.7
   - Access tracked for future adjustments

4. **Future conversation**:
   - User asks about work preferences
   - System retrieves relevant memories
   - Access tracked (rank: 1, count: 3)
   - Importance may be boosted if frequently retrieved

5. **Over time**:
   - Frequently accessed memories get importance boosts
   - Old, unused memories decay
   - User feedback can adjust importance manually

---

## Configuration

### Quick Chat Settings

- `memoryEnabled`: Enable/disable memory system
- `memoryMaxCount`: Maximum memories to retrieve (default: 5)
- `memoryMinImportance`: Minimum importance threshold (default: 0.5)
- `autoCreateMemories`: Enable intelligent memory creation

### Tuning Parameters

- Similarity threshold for duplicates: 0.85 (85%)
- Importance boost per access: +0.05 (5%)
- Decay per day of inactivity: -0.01 (1%)
- Decay starts after: 30 days
- Maximum memories per conversation: 3

---

## Benefits

1. **Quality**: Only high-value, unique information saved as memories
2. **Relevance**: Semantic search finds contextually relevant memories
3. **Adaptability**: Importance auto-adjusts based on usage
4. **No Duplication**: Prevents redundant memories
5. **Efficiency**: Automatic evaluation reduces manual curation

---

## Files Created/Modified

### New Files

- `electron/main/memory/evaluator.ts`
- `electron/main/memory/deduplication.ts`
- `electron/main/memory/importance-adjuster.ts`
- `electron/main/ipc/memory-smart.ts`

### Modified Files

- `electron/main/db/index.ts` - Added memory_access_tracking table
- `electron/main/ipc/index.ts` - Registered new IPC handlers
- `electron/main/memory/service.ts` - Added access tracking to retrieval
- `electron/main/quick-chat/settings.ts` - Updated to use smart memory creation
