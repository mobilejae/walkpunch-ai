import { useEffect, useState } from 'react';
import { ParsedPunchItem } from '../services/gemini';

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
  defects: CapturedDefect[];
}

let state: InspectionState = {
  propertyName: 'Unit 402 - Pre-Closing Walk',
  defects: [],
};

const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

export const inspectionStore = {
  getState: () => state,

  setPropertyName: (name: string) => {
    state = { ...state, propertyName: name };
    emitChange();
  },

  addDefect: (defect: CapturedDefect) => {
    state = { ...state, defects: [defect, ...state.defects] };
    emitChange();
  },

  updateDefect: (id: string, updates: Partial<CapturedDefect>) => {
    state = {
      ...state,
      defects: state.defects.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      ),
    };
    emitChange();
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
  },

  deleteDefect: (id: string) => {
    state = {
      ...state,
      defects: state.defects.filter((item) => item.id !== id),
    };
    emitChange();
  },

  clearAll: () => {
    state = { ...state, defects: [] };
    emitChange();
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
    defects: snapshot.defects,
    setPropertyName: inspectionStore.setPropertyName,
    addDefect: inspectionStore.addDefect,
    updateDefect: inspectionStore.updateDefect,
    updateDefectAiData: inspectionStore.updateDefectAiData,
    deleteDefect: inspectionStore.deleteDefect,
    clearAll: inspectionStore.clearAll,
  };
}