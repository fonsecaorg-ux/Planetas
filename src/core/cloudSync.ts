/// <reference types="vite/client" />
/**
 * Sincronização anônima de progresso com Firestore.
 *
 * Sem autenticação — cada dispositivo gera um ID único salvo no localStorage.
 * Requer variáveis de ambiente VITE_FIREBASE_* no .env local.
 * Se as variáveis estiverem ausentes o módulo opera em modo no-op silencioso.
 */
import type { ProgressStore } from '@/utils/storage';
import type { Firestore } from 'firebase/firestore';

const ANON_ID_KEY = 'solar-explorer:anon-id';
const DEBOUNCE_MS = 1500;

function getOrCreateAnonId(): string {
  try {
    let id = localStorage.getItem(ANON_ID_KEY);
    if (!id) {
      id = `anon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem(ANON_ID_KEY, id);
    }
    return id;
  } catch {
    return `anon_${Math.random().toString(36).slice(2, 10)}`;
  }
}

function hasFirebaseConfig(): boolean {
  return !!(
    import.meta.env.VITE_FIREBASE_API_KEY &&
    import.meta.env.VITE_FIREBASE_PROJECT_ID
  );
}

export class CloudSync {
  private store: ProgressStore;
  private anonId: string;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private db: Firestore | null = null;
  onStatusChange?: (status: 'idle' | 'syncing' | 'done' | 'error') => void;

  constructor(store: ProgressStore) {
    this.store = store;
    this.anonId = getOrCreateAnonId();
    if (!hasFirebaseConfig()) return;
    this.init();
  }

  private async init() {
    try {
      // Importações dinâmicas para tree-shaking máximo quando Firebase não é usado
      const { initializeApp } = await import('firebase/app');
      const { getFirestore, doc, getDoc } = await import('firebase/firestore');

      const app = initializeApp({
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: import.meta.env.VITE_FIREBASE_APP_ID,
      });
      this.db = getFirestore(app);

      // Boot: se localStorage vazio mas ID existe, carrega do Firestore
      const local = this.store.exportJSON();
      const parsed = JSON.parse(local) as { visited?: string[]; completedMissions?: object };
      const isEmpty =
        (parsed.visited?.length ?? 0) === 0 &&
        Object.keys(parsed.completedMissions ?? {}).length === 0;

      if (isEmpty) {
        const snap = await getDoc(doc(this.db, 'progress', this.anonId));
        if (snap.exists()) {
          const data = snap.data() as { json?: string };
          if (data?.json) this.store.importJSON(data.json);
        }
      }

      // Registra callback de debounce no store
      this.store.onSave = () => this.scheduleSync();
    } catch (err) {
      console.warn('[cloudSync] Firebase init falhou:', err);
    }
  }

  scheduleSync() {
    if (!this.db) return;
    this.onStatusChange?.('syncing');
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.doSync(), DEBOUNCE_MS);
  }

  private async doSync() {
    if (!this.db) return;
    try {
      const { doc, setDoc } = await import('firebase/firestore');
      await setDoc(doc(this.db, 'progress', this.anonId), {
        json: this.store.exportJSON(),
        updatedAt: Date.now(),
      });
      this.onStatusChange?.('done');
      setTimeout(() => this.onStatusChange?.('idle'), 3000);
    } catch (err) {
      console.warn('[cloudSync] Sync falhou:', err);
      this.onStatusChange?.('error');
      setTimeout(() => this.onStatusChange?.('idle'), 5000);
    }
  }

  getAnonId(): string { return this.anonId; }

  async submitLeaderboard(name: string, score: number): Promise<void> {
    if (!this.db) return;
    try {
      const { doc, setDoc } = await import('firebase/firestore');
      await setDoc(doc(this.db, 'leaderboard', this.anonId), {
        name: name.trim() || 'Explorador',
        score,
        updatedAt: Date.now(),
      });
    } catch (err) {
      console.warn('[cloudSync] Leaderboard submit falhou:', err);
    }
  }

  async getLeaderboard(): Promise<Array<{ id: string; name: string; score: number; updatedAt: number }>> {
    if (!this.db) return [];
    try {
      const { collection, getDocs, query, orderBy, limit } = await import('firebase/firestore');
      const q = query(collection(this.db, 'leaderboard'), orderBy('score', 'desc'), limit(10));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    } catch (err) {
      console.warn('[cloudSync] Leaderboard fetch falhou:', err);
      return [];
    }
  }
}
