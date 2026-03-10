/**
 * Browser Service
 *
 * Manages browser automation using Playwright.
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { getDatabase } from '../db/index.js';

/**
 * Browser profile configuration
 */
export interface BrowserProfileConfig {
  name: string;
  userDataDir?: string;
  headless?: boolean;
  viewportWidth?: number;
  viewportHeight?: number;
  cdpEndpoint?: string; // Chrome DevTools Protocol endpoint for connecting to existing browsers
}

/**
 * Browser session
 */
export interface BrowserSessionInfo {
  id: string;
  profileId: string;
  pageId: string;
  url?: string;
  title?: string;
}

/**
 * Snapshot format options
 */
export type SnapshotFormat = 'ai' | 'aria' | 'html' | 'text';

/**
 * Browser Service class
 */
class BrowserService {
  private browsers = new Map<string, Browser>();
  private contexts = new Map<string, BrowserContext>();
  private pages = new Map<string, Page>();

  /**
   * Launch a new browser profile or connect to existing browser
   */
  async launchProfile(profileId: string): Promise<string> {
    const db = getDatabase();
    const profile = db.prepare('SELECT * FROM browser_profiles WHERE id = ?').get(profileId) as
      | {
          name: string;
          user_data_dir?: string;
          headless: number;
          viewport_width: number;
          viewport_height: number;
          cdp_endpoint?: string;
        }
      | undefined;

    if (!profile) {
      throw new Error('Profile not found');
    }

    // Check if already running
    if (this.browsers.has(profileId)) {
      throw new Error('Browser profile already running');
    }

    let browser: Browser;

    // Check if CDP endpoint is provided for connecting to existing browser
    if (profile.cdp_endpoint) {
      // Connect to existing Chrome/Edge browser via CDP
      try {
        browser = await chromium.connectOverCDP(profile.cdp_endpoint, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });
      } catch (error) {
        throw new Error(`Failed to connect to CDP endpoint ${profile.cdp_endpoint}: ${error}`);
      }
    } else {
      // Launch new browser instance
      browser = await chromium.launch({
        headless: profile.headless !== 0,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--no-sandbox',
        ],
      });
    }

    this.browsers.set(profileId, browser);

    // Get existing context or create new one
    const contexts = browser.contexts();
    let context: BrowserContext;

    if (contexts.length > 0 && profile.cdp_endpoint) {
      // Use existing context from connected browser
      context = contexts[0];
    } else {
      // Create new context
      context = await browser.newContext({
        viewport: {
          width: profile.viewport_width || 1280,
          height: profile.viewport_height || 720,
        },
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      });
    }

    this.contexts.set(profileId, context);

    // Get existing pages or create new one
    const pages = context.pages();
    let page: Page;
    let pageId: string;

    if (pages.length > 0 && profile.cdp_endpoint) {
      // Use existing page from connected browser
      page = pages[0];
      pageId = crypto.randomUUID();
      this.pages.set(pageId, page);
    } else {
      // Create new page
      page = await context.newPage();
      pageId = crypto.randomUUID();
      this.pages.set(pageId, page);
    }

    // Save session to database
    const sessionId = crypto.randomUUID();
    const currentUrl = page.url();
    const currentTitle = await page.title().catch(() => 'Existing Page');

    db.prepare(
      `
      INSERT INTO browser_sessions (id, profile_id, page_id, url, title, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run(sessionId, profileId, pageId, currentUrl, currentTitle, Date.now(), Date.now());

    return sessionId;
  }

  /**
   * Navigate to a URL
   */
  async navigate(sessionId: string, url: string): Promise<void> {
    const page = await this.getPageBySession(sessionId);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // Update session
    const db = getDatabase();
    db.prepare(
      `
      UPDATE browser_sessions SET url = ?, title = ?, updated_at = ? WHERE id = ?
    `
    ).run(url, await page.title(), Date.now(), sessionId);
  }

  /**
   * Get a snapshot of the current page
   */
  async snapshot(sessionId: string, format: SnapshotFormat = 'ai'): Promise<unknown> {
    const page = await this.getPageBySession(sessionId);

    switch (format) {
      case 'ai': {
        // Get page content for AI
        const content = await page.content();
        const url = page.url();
        const title = await page.title();
        return { content, url, title };
      }

      case 'aria': {
        // Get ARIA tree via evaluate
        return await page.evaluate(() => {
          const getAriaTree = (
            element: Element
          ): { role: string; name: string; children?: unknown[] } => {
            const node: { role: string; name: string; children?: unknown[] } = {
              role: element.getAttribute('role') || element.tagName.toLowerCase(),
              name:
                element.getAttribute('aria-label') ||
                (element as HTMLElement).innerText?.slice(0, 100) ||
                '',
            };
            const children = Array.from(element.children).map(getAriaTree);
            if (children.length > 0) node.children = children;
            return node;
          };
          return getAriaTree(document.body);
        });
      }

      case 'html': {
        // Full HTML content
        return await page.content();
      }

      case 'text': {
        // Visible text only
        return await page.innerText('body');
      }

      default:
        throw new Error(`Unknown snapshot format: ${format}`);
    }
  }

  /**
   * Click an element
   */
  async click(sessionId: string, selector: string): Promise<void> {
    const page = await this.getPageBySession(sessionId);
    await page.click(selector, { timeout: 10000 });
  }

  /**
   * Type text into an element
   */
  async type(sessionId: string, selector: string, text: string): Promise<void> {
    const page = await this.getPageBySession(sessionId);
    await page.fill(selector, text);
  }

  /**
   * Evaluate JavaScript in the page
   */
  async evaluate(sessionId: string, fn: string): Promise<unknown> {
    const page = await this.getPageBySession(sessionId);
    return await page.evaluate(fn);
  }

  /**
   * Take a screenshot
   */
  async screenshot(sessionId: string, fullPage = false): Promise<Buffer> {
    const page = await this.getPageBySession(sessionId);
    return await page.screenshot({ fullPage });
  }

  /**
   * Close a specific session (page)
   */
  async closeSession(sessionId: string): Promise<void> {
    const db = getDatabase();
    const session = db.prepare('SELECT * FROM browser_sessions WHERE id = ?').get(sessionId) as
      | {
          page_id: string;
        }
      | undefined;

    if (!session) return;

    const page = this.pages.get(session.page_id);
    if (page) {
      await page.close();
      this.pages.delete(session.page_id);
    }

    db.prepare('DELETE FROM browser_sessions WHERE id = ?').run(sessionId);
  }

  /**
   * Close a browser profile and all its sessions
   */
  async closeProfile(profileId: string): Promise<void> {
    const context = this.contexts.get(profileId);
    if (context) {
      await context.close();
      this.contexts.delete(profileId);
    }

    const browser = this.browsers.get(profileId);
    if (browser) {
      await browser.close();
      this.browsers.delete(profileId);
    }

    // Close all related sessions
    const db = getDatabase();
    const sessions = db
      .prepare('SELECT id FROM browser_sessions WHERE profile_id = ?')
      .all(profileId) as Array<{ id: string }>;

    for (const session of sessions) {
      await this.closeSession(session.id);
    }
  }

  /**
   * Get page by session ID
   */
  private async getPageBySession(sessionId: string): Promise<Page> {
    const db = getDatabase();
    const session = db.prepare('SELECT * FROM browser_sessions WHERE id = ?').get(sessionId) as
      | {
          page_id: string;
        }
      | undefined;

    if (!session) {
      throw new Error('Session not found');
    }

    const page = this.pages.get(session.page_id);
    if (!page) {
      throw new Error('Page not found');
    }

    return page;
  }

  /**
   * Get active session count
   */
  getActiveSessionCount(): number {
    return this.pages.size;
  }

  /**
   * Get active browser count
   */
  getActiveBrowserCount(): number {
    return this.browsers.size;
  }
}

/**
 * Global browser service instance
 */
export const browserService = new BrowserService();
