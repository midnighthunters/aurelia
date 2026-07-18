/**
 * MVP contact resolution: user-editable relationships map (name → contact).
 * "text my wife" → look up "wife" → phone/email string.
 * No full contacts-list fuzzy matching in Phase 1.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {CONFIG} from '../config';

export type RelationshipsMap = Record<string, string>;

export async function loadRelationships(): Promise<RelationshipsMap> {
  const raw = await AsyncStorage.getItem(CONFIG.storageKeys.relationships);
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as RelationshipsMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveRelationships(map: RelationshipsMap): Promise<void> {
  // Normalize keys to lowercase for stable lookup
  const normalized: RelationshipsMap = {};
  for (const [k, v] of Object.entries(map)) {
    const key = k.trim().toLowerCase();
    const val = (v || '').trim();
    if (key && val) {
      normalized[key] = val;
    }
  }
  await AsyncStorage.setItem(CONFIG.storageKeys.relationships, JSON.stringify(normalized));
}

export async function setRelationship(alias: string, contact: string): Promise<RelationshipsMap> {
  const map = await loadRelationships();
  map[alias.trim().toLowerCase()] = contact.trim();
  await saveRelationships(map);
  return map;
}

export async function removeRelationship(alias: string): Promise<RelationshipsMap> {
  const map = await loadRelationships();
  delete map[alias.trim().toLowerCase()];
  await saveRelationships(map);
  return map;
}

/**
 * Resolve recipient: if it looks like a phone/email, use as-is;
 * otherwise look up in relationships map.
 */
export function resolveRecipient(
  recipient: string,
  relationships: RelationshipsMap,
): {resolved: string | null; alias: string} {
  const raw = (recipient || '').trim();
  const alias = raw.toLowerCase();
  if (!raw) {
    return {resolved: null, alias};
  }
  // E.164-ish or local phone
  if (/^\+?\d[\d\s\-()]{6,}$/.test(raw)) {
    return {resolved: raw.replace(/[\s\-()]/g, ''), alias};
  }
  // Email
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
    return {resolved: raw, alias};
  }
  const hit = relationships[alias];
  return {resolved: hit || null, alias};
}
