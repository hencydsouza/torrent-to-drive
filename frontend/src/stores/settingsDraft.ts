import { create } from 'zustand';
import type { SettingsDraft } from '../lib/settingsFields';

interface SettingsEditsState {
  edits: Partial<SettingsDraft>;
  setField: <K extends keyof SettingsDraft>(k: K, v: SettingsDraft[K]) => void;
  clear: () => void;
}

// Unsaved settings edits survive leaving the Settings tab.
export const useSettingsEdits = create<SettingsEditsState>()((set) => ({
  edits: {},
  setField: (k, v) => set((s) => ({ edits: { ...s.edits, [k]: v } })),
  clear: () => set({ edits: {} }),
}));
