/**
 * Zustand Store Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from './store';

describe('App Store', () => {
  beforeEach(() => {
    // Reset store state before each test
    useAppStore.setState({
      sidebarOpen: true,
      sidebarCollapsed: false,
      currentRoute: '/chat',
      currentModel: null,
      theme: 'dark',
    });
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = useAppStore.getState();
      expect(state.sidebarOpen).toBe(true);
      expect(state.sidebarCollapsed).toBe(false);
      expect(state.currentRoute).toBe('/chat');
      expect(state.currentModel).toBe(null);
      expect(state.theme).toBe('dark');
    });
  });

  describe('sidebar state', () => {
    it('should set sidebar open state', () => {
      const { setSidebarOpen } = useAppStore.getState();

      setSidebarOpen(false);
      expect(useAppStore.getState().sidebarOpen).toBe(false);

      setSidebarOpen(true);
      expect(useAppStore.getState().sidebarOpen).toBe(true);
    });

    it('should set sidebar collapsed state', () => {
      const { setSidebarCollapsed } = useAppStore.getState();

      setSidebarCollapsed(true);
      expect(useAppStore.getState().sidebarCollapsed).toBe(true);

      setSidebarCollapsed(false);
      expect(useAppStore.getState().sidebarCollapsed).toBe(false);
    });

    it('should toggle sidebar collapsed state', () => {
      const { toggleSidebarCollapsed } = useAppStore.getState();

      expect(useAppStore.getState().sidebarCollapsed).toBe(false);

      toggleSidebarCollapsed();
      expect(useAppStore.getState().sidebarCollapsed).toBe(true);

      toggleSidebarCollapsed();
      expect(useAppStore.getState().sidebarCollapsed).toBe(false);
    });
  });

  describe('current route', () => {
    it('should set current route', () => {
      const { setCurrentRoute } = useAppStore.getState();

      setCurrentRoute('/dashboard');
      expect(useAppStore.getState().currentRoute).toBe('/dashboard');

      setCurrentRoute('/workflows');
      expect(useAppStore.getState().currentRoute).toBe('/workflows');
    });
  });

  describe('current model', () => {
    it('should set current model', () => {
      const { setCurrentModel } = useAppStore.getState();

      setCurrentModel('model-123');
      expect(useAppStore.getState().currentModel).toBe('model-123');

      setCurrentModel(null);
      expect(useAppStore.getState().currentModel).toBe(null);
    });
  });

  describe('theme', () => {
    it('should set theme', () => {
      const { setTheme } = useAppStore.getState();

      setTheme('light');
      expect(useAppStore.getState().theme).toBe('light');

      setTheme('dark');
      expect(useAppStore.getState().theme).toBe('dark');
    });
  });
});
