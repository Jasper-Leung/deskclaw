import { create } from 'zustand';

interface AppState {
  // UI state
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;

  // Current route
  currentRoute: string;
  setCurrentRoute: (route: string) => void;

  // Current model
  currentModel: string | null;
  setCurrentModel: (modelId: string | null) => void;

  // Theme
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
}

export const useAppStore = create<AppState>((set) => ({
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  sidebarCollapsed: false,
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  toggleSidebarCollapsed: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  currentRoute: '/chat',
  setCurrentRoute: (route) => set({ currentRoute: route }),
  currentModel: null,
  setCurrentModel: (modelId) => set({ currentModel: modelId }),
  theme: 'dark',
  setTheme: (theme) => set({ theme }),
}));
