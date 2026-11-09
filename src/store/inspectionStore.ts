import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { ParsedPunchItem } from '../services/gemini';

const STORAGE_KEY = 'WALKPUNCH_INSPECTION_STORE_V2';
const LEGACY_STORAGE_KEY = 'WALKPUNCH_ACTIVE_INSPECTION_V1';

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

export interface InspectionProject {
  id: string;
  propertyName: string;
  inspectorName: string;
  updatedAt: string;
  defects: CapturedDefect[];
}

interface InspectionState {
  activeProjectId: string;
  propertyName: string;
  inspectorName: string;
  defects: CapturedDefect[];
  savedProjects: InspectionProject[];
  isHydrated: boolean;
}

let state: InspectionState = {
  activeProjectId: Date.now().toString(),
  propertyName: 'Unit 402 - Pre-Closing Walk',
  inspectorName: 'Jae Shin',
  defects: [],
  savedProjects: [],
  isHydrated: false,
};

const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

function formatDateStamp(): string {
  return new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function persistState() {
  try {
    const payload = JSON.stringify({
      activeProjectId: state.activeProjectId,
      propertyName: state.propertyName,
      inspectorName: state.inspectorName,
      defects: state.defects,
      savedProjects: state.savedProjects,
    });
    await AsyncStorage.setItem(STORAGE_KEY, payload);
  } catch (error) {
    console.warn('[WalkPunch Storage] Failed to save inspection state:', error);
  }
}

function sanitizeDefectsOnLoad(defects: any[]): CapturedDefect[] {
  if (!Array.isArray(defects)) return [];
  return defects.map((item: CapturedDefect) =>
    item.status === 'analyzing'
      ? {
          ...item,
          status: 'error',
          errorMessage: 'App closed during analysis. Tap Retry AI.',
        }
      : item
  );
}

async function hydrateFromDisk() {
  try {
    const rawV2 = await AsyncStorage.getItem(STORAGE_KEY);
    if (rawV2) {
      const parsed = JSON.parse(rawV2);
      state = {
        activeProjectId: parsed.activeProjectId || Date.now().toString(),
        propertyName: parsed.propertyName ?? state.propertyName,
        inspectorName: parsed.inspectorName ?? state.inspectorName,
        defects: sanitizeDefectsOnLoad(parsed.defects),
        savedProjects: Array.isArray(parsed.savedProjects) ? parsed.savedProjects : [],
        isHydrated: true,
      };
    } else {
      // Migrate V1 data if present so existing 1111 Ace Lane inspection is preserved
      const rawV1 = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
      if (rawV1) {
        const parsedV1 = JSON.parse(rawV1);
        state = {
          activeProjectId: Date.now().toString(),
          propertyName: parsedV1.propertyName ?? state.propertyName,
          inspectorName: parsedV1.inspectorName ?? state.inspectorName,
          defects: sanitizeDefectsOnLoad(parsedV1.defects),
          savedProjects: [],
          isHydrated: true,
        };
        await persistState();
      } else {
        state = { ...state, isHydrated: true };
      }
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

  archiveAndStartNew: (newPropertyName: string) => {
    let updatedArchives = [...state.savedProjects];

    if (state.defects.length > 0) {
      const currentSnapshot: InspectionProject = {
        id: state.activeProjectId,
        propertyName: state.propertyName,
        inspectorName: state.inspectorName,
        updatedAt: formatDateStamp(),
        defects: state.defects,
      };
      updatedArchives = [
        currentSnapshot,
        ...updatedArchives.filter((p) => p.id !== state.activeProjectId),
      ];
    }

    state = {
      ...state,
      activeProjectId: Date.now().toString(),
      propertyName: newPropertyName.trim() || 'New Property Inspection',
      defects: [],
      savedProjects: updatedArchives,
    };
    emitChange();
    persistState();
  },

  loadArchivedProject: (projectId: string) => {
    const target = state.savedProjects.find((p) => p.id === projectId);
    if (!target) return;

    let updatedArchives = state.savedProjects.filter((p) => p.id !== projectId);

    // Save current active project into archive if it has defects
    if (state.defects.length > 0) {
      const currentSnapshot: InspectionProject = {
        id: state.activeProjectId,
        propertyName: state.propertyName,
        inspectorName: state.inspectorName,
        updatedAt: formatDateStamp(),
        defects: state.defects,
      };
      updatedArchives = [
        currentSnapshot,
        ...updatedArchives.filter((p) => p.id !== state.activeProjectId),
      ];
    }

    state = {
      ...state,
      activeProjectId: target.id,
      propertyName: target.propertyName,
      inspectorName: target.inspectorName,
      defects: target.defects,
      savedProjects: updatedArchives,
    };
    emitChange();
    persistState();
  },

  deleteArchivedProject: (projectId: string) => {
    state = {
      ...state,
      savedProjects: state.savedProjects.filter((p) => p.id !== projectId),
    };
    emitChange();
    persistState();
  },

  clearAll: async () => {
    state = {
      ...state,
      activeProjectId: Date.now().toString(),
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
    activeProjectId: snapshot.activeProjectId,
    propertyName: snapshot.propertyName,
    inspectorName: snapshot.inspectorName,
    defects: snapshot.defects,
    savedProjects: snapshot.savedProjects,
    isHydrated: snapshot.isHydrated,
    setPropertyName: inspectionStore.setPropertyName,
    setInspectorName: inspectionStore.setInspectorName,
    addDefect: inspectionStore.addDefect,
    updateDefect: inspectionStore.updateDefect,
    updateDefectAiData: inspectionStore.updateDefectAiData,
    deleteDefect: inspectionStore.deleteDefect,
    archiveAndStartNew: inspectionStore.archiveAndStartNew,
    loadArchivedProject: inspectionStore.loadArchivedProject,
    deleteArchivedProject: inspectionStore.deleteArchivedProject,
    clearAll: inspectionStore.clearAll,
  };
}