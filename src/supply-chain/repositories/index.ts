/**
 * Composition root for persistence. The rest of the app imports `dataStore`
 * from here and never knows which engine backs it. To move to a server API,
 * implement DataStore elsewhere and change this single assignment.
 */
import { IndexedDbDataStore } from './indexeddb';
import type { DataStore } from './types';

export const dataStore: DataStore = new IndexedDbDataStore();

export type { DataStore } from './types';
