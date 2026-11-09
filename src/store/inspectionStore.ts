import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { ParsedPunchItem } from '../services/gemini';

const STORAGE_KEY = 'WALKPUNCH_ACTIVE_INSPECTION_V1';

export interface CapturedDefect {
  id: string;
  photoUri: string;
  audioUri: string | null;
  timestamp: string;
  status: 'analyzing' | 'ready' | 'error';
  aiData?: ParsedPunchItem;
  errorMessage?: string;
  expanded?: boolean;
}

interface InspectionState {
  propertyName: string;
  inspectorName: string;
  defects: CapturedDefect[];
  isHydrated: boolean;
}

let state: InspectionState = {
  propertyName: 'Unit 402 - Pre-Closing Walk',
  inspectorName: 'Jae Shin',
  defects: [],
  isHydrated: false,
};

const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

async function persistState() {
  try {
    const payload = JSON.stringify({
      propertyName: state.propertyName,
      inspectorName: state.inspectorName,
      defects: state.defects,
    });
    await AsyncStorage.setItem(STORAGE_KEY, payload);
  } catch (error) {
    console.warn('[WalkPunch Storage] Failed to save inspection state:', error);
  }
}

async function hydrateFromDisk() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const recoveredDefects: CapturedDefect[] = Array.isArray(parsed.defects)
        ? parsed.defects.map((item: CapturedDefect) =>
            item.status === 'analyzing'
              ? {
                  ...item,
                  status: 'error',
                  errorMessage: 'App closed during analysis. Tap Retry AI.',
                }
              : item
          )
        : [];

      state = {
        propertyName: parsed.propertyName ?? state.propertyName,
        inspectorName: parsed.inspectorName ?? state.inspectorName,
        defects: recoveredDefects,
        isHydrated: true,
      };
    } else {
      state = { ...state, isHydrated: true };
    }
  } catch (error) {
    console.warn('[WalkPunch Storage] Failed to hydrate state:', error);
    state = { ...state, isHydrated: true };
  }
  emitChange();
}

hydrateFromDisk();

export const inspectionStore = {
  getState: () => state,

  setPropertyName: (name: string) => {
    state = { ...state, propertyName: name };
    emitChange();
    persistState();
  },

  setInspectorName: (name: string) => {
    state = { ...state, inspectorName: name };
    emitChange();
    persistState();
  },

  addDefect: (defect: CapturedDefect) => {
    state = { ...state, defects: [defect, ...state.defects] };
    emitChange();
    persistState();
  },

  updateDefect: (id: string, updates: Partial<CapturedDefect>) => {
    state = {
      ...state,
      defects: state.defects.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      ),
    };
    emitChange();
    persistState();
  },

  updateDefectAiData: (id: string, aiUpdates: Partial<ParsedPunchItem>) => {
    state = {
      ...state,
      defects: state.defects.map((item) =>
        item.id === id && item.aiData
          ? { ...item, aiData: { ...item.aiData, ...aiUpdates } }
          : item
      ),
    };
    emitChange();
    persistState();
  },

  deleteDefect: (id: string) => {
    state = {
      ...state,
      defects: state.defects.filter((item) => item.id !== id),
    };
    emitChange();
    persistState();
  },

  clearAll: async () => {
    state = {
      ...state,
      propertyName: 'New Property Inspection',
      defects: [],
    };
    emitChange();
    await persistState();
  },
};

export function useInspectionStore() {
  const [snapshot, setSnapshot] = useState<InspectionState>(state);

  useEffect(() => {
    const handleUpdate = () => setSnapshot(state);
    listeners.add(handleUpdate);
    return () => {
      listeners.delete(handleUpdate);
    };
  }, []);

  return {
    propertyName: snapshot.propertyName,
    inspectorName: snapshot.inspectorName,
    defects: snapshot.defects,
    isHydrated: snapshot.isHydrated,
    setPropertyName: inspectionStore.setPropertyName,
    setInspectorName: inspectionStore.setInspectorName,
    addDefect: inspectionStore.addDefect,
    updateDefect: inspectionStore.updateDefect,
    updateDefectAiData: inspectionStore.updateDefectAiData,
    deleteDefect: inspectionStore.deleteDefect,
    clearAll: inspectionStore.clearAll,
  };
}