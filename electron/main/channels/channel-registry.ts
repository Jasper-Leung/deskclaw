/**
 * Channel Registry
 *
 * Manages registration and retrieval of channel plugins.
 */

import type { ChannelPlugin, ChannelType } from './channel-plugin.js';

/**
 * Channel registry class
 */
class ChannelRegistry {
  private plugins = new Map<string, ChannelPlugin>();
  private channelTypes = new Map<string, ChannelType>();

  /**
   * Register a channel plugin
   */
  register(plugin: ChannelPlugin, channelType: ChannelType): void {
    this.plugins.set(channelType.id, plugin);
    this.channelTypes.set(channelType.id, channelType);
  }

  /**
   * Get a plugin by channel type
   */
  getPlugin(channelType: string): ChannelPlugin {
    const plugin = this.plugins.get(channelType);
    if (!plugin) {
      throw new Error(`Unknown channel type: ${channelType}`);
    }
    return plugin;
  }

  /**
   * Get channel type info
   */
  getChannelType(channelType: string): ChannelType | undefined {
    return this.channelTypes.get(channelType);
  }

  /**
   * List all registered channel types
   */
  listChannelTypes(): ChannelType[] {
    return Array.from(this.channelTypes.values());
  }

  /**
   * Check if a channel type is registered
   */
  has(channelType: string): boolean {
    return this.plugins.has(channelType);
  }

  /**
   * Unregister a channel type
   */
  unregister(channelType: string): void {
    this.plugins.delete(channelType);
    this.channelTypes.delete(channelType);
  }

  /**
   * Get all registered plugins
   */
  getAllPlugins(): ChannelPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get the number of registered channel types
   */
  get count(): number {
    return this.plugins.size;
  }
}

/**
 * Global channel registry instance
 */
export const channelRegistry = new ChannelRegistry();

/**
 * Helper to get a plugin instance
 */
export const getPlugin = (channelType: string): ChannelPlugin => {
  return channelRegistry.getPlugin(channelType);
};

/**
 * Helper to list available channel types
 */
export const listChannelTypes = (): ChannelType[] => {
  return channelRegistry.listChannelTypes();
};
