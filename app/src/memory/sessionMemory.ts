/**
 * Short-term session memory (MVP).
 * Lives on device; cleared when earbuds disconnect.
 * Long-term / cross-session memory is Phase 2+.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {CONFIG} from '../config';
import type {HistoryTurn} from '../api/client';

const MAX_TURNS = 40;

function randomId(): string {
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function getOrCreateSessionId(): Promise<string> {
  const existing = await AsyncStorage.getItem(CONFIG.storageKeys.sessionId);
  if (existing) {
    return existing;
  }
  const id = randomId();
  await AsyncStorage.setItem(CONFIG.storageKeys.sessionId, id);
  return id;
}

export async function getHistory(): Promise<HistoryTurn[]> {
  const raw = await AsyncStorage.getItem(CONFIG.storageKeys.sessionHistory);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as HistoryTurn[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function appendTurn(role: 'user' | 'assistant', content: string): Promise<HistoryTurn[]> {
  if (!content) {
    return getHistory();
  }
  const history = await getHistory();
  history.push({role, content});
  const trimmed = history.slice(-MAX_TURNS);
  await AsyncStorage.setItem(CONFIG.storageKeys.sessionHistory, JSON.stringify(trimmed));
  return trimmed;
}

/** Clear local session on earbud disconnect (masterplan MVP policy). */
export async function clearSessionMemory(): Promise<string> {
  await AsyncStorage.multiRemove([
    CONFIG.storageKeys.sessionId,
    CONFIG.storageKeys.sessionHistory,
  ]);
  const id = randomId();
  await AsyncStorage.setItem(CONFIG.storageKeys.sessionId, id);
  return id;
}
