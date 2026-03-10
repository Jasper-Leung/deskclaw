/**
 * Channels Module Index
 *
 * Exports all channel-related functionality.
 */

export * from './channel-plugin.js';
export * from './channel-registry.js';
export * from './channel-message.js';
export * from './channel-router.js';

// Import channel implementations to register them
// Tier 1: Major messaging platforms
import './telegram/index.js';
import './discord/index.js';
import './slack/index.js';
import './whatsapp/index.js';
import './signal/index.js';

// Tier 2: Chinese platforms
import './lark/index.js';
import './dingtalk/index.js';
import './wecom/index.js';
import './qq/index.js';

// Tier 3: Enterprise & Collaboration
import './googlechat/index.js';
import './msteams/index.js';
import './matrix/index.js';
import './mattermost/index.js';
import './nextcloud/index.js';

// Tier 4: Apple ecosystem
import './bluebubbles/index.js';

// Tier 5: Other platforms
import './irc/index.js';
import './line/index.js';
import './nostr/index.js';
import './synology/index.js';
import './twitch/index.js';
import './zalo/index.js';

// Tier 6: Built-in
import './webchat/index.js';
