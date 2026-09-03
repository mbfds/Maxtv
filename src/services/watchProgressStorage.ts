import { VodItem, WatchProgress } from '../types';

const STORAGE_PREFIX = 'maxtv_progress_';
export const PROGRESS_UPDATED_EVENT = 'maxtv_progress_updated';

function getStorageKey(userIdOrEmail?: string): string {
  if (userIdOrEmail) {
    return `${STORAGE_PREFIX}${userIdOrEmail.toLowerCase().trim()}`;
  }
  return `${STORAGE_PREFIX}local`;
}

export const watchProgressStorage = {
  getProgressList(userIdOrEmail?: string): WatchProgress[] {
    try {
      const key = getStorageKey(userIdOrEmail);
      const data = localStorage.getItem(key);
      if (data) {
        const parsed: WatchProgress[] = JSON.parse(data);
        if (Array.isArray(parsed)) {
          // Sort by lastWatchedAt descending
          return parsed.sort((a, b) => new Date(b.lastWatchedAt).getTime() - new Date(a.lastWatchedAt).getTime());
        }
      }
      if (userIdOrEmail) {
        const localData = localStorage.getItem(`${STORAGE_PREFIX}local`);
        if (localData) {
          const parsed = JSON.parse(localData);
          if (Array.isArray(parsed) && parsed.length > 0) {
            localStorage.setItem(key, localData);
            return parsed;
          }
        }
      }
    } catch (e) {
      console.warn('Failed to read watch progress from localStorage:', e);
    }
    return [];
  },

  getItemProgress(id: string, userIdOrEmail?: string): WatchProgress | null {
    const list = this.getProgressList(userIdOrEmail);
    return list.find(item => item.id === id) || null;
  },

  saveProgress(
    item: VodItem,
    currentTime: number,
    duration: number,
    userIdOrEmail?: string,
    authToken?: string,
    extra?: { episodeTitle?: string; episodeNumber?: number; seasonNumber?: number }
  ): void {
    // Ignore invalid values or very start (< 5 seconds)
    if (!item || !item.id || currentTime < 5 || isNaN(currentTime)) {
      return;
    }

    const safeDuration = duration > 0 ? duration : (currentTime + 60);
    const percent = Math.min(100, Math.round((currentTime / safeDuration) * 100));

    // If watched >= 95%, we can remove or mark as finished
    const list = this.getProgressList(userIdOrEmail);

    if (percent >= 95) {
      // Completed, remove from continue watching list
      this.removeProgress(item.id, userIdOrEmail, authToken);
      return;
    }

    const progressEntry: WatchProgress = {
      id: item.id,
      title: item.title,
      type: item.type,
      posterUrl: item.posterUrl,
      bannerUrl: item.bannerUrl,
      currentTime: Math.floor(currentTime),
      duration: Math.floor(safeDuration),
      percent,
      lastWatchedAt: new Date().toISOString(),
      streamUrl: item.streamUrl,
      year: item.year,
      rating: item.rating,
      genre: item.genre,
      episodeTitle: extra?.episodeTitle,
      episodeNumber: extra?.episodeNumber,
      seasonNumber: extra?.seasonNumber
    };

    // Upsert into list
    const filtered = list.filter(p => p.id !== item.id);
    const updated = [progressEntry, ...filtered].slice(0, 30); // keep up to 30 items

    try {
      localStorage.setItem(getStorageKey(userIdOrEmail), JSON.stringify(updated));
      if (!userIdOrEmail) {
        localStorage.setItem(`${STORAGE_PREFIX}local`, JSON.stringify(updated));
      }
    } catch (e) {
      console.warn('Failed to save watch progress to localStorage:', e);
    }

    // Server sync
    if (userIdOrEmail) {
      fetch('/api/user/progress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({ progress: progressEntry, email: userIdOrEmail })
      }).catch(err => console.warn('Could not sync watch progress to server:', err));
    }

    window.dispatchEvent(new CustomEvent(PROGRESS_UPDATED_EVENT, { detail: updated }));
  },

  removeProgress(
    id: string,
    userIdOrEmail?: string,
    authToken?: string
  ): WatchProgress[] {
    const list = this.getProgressList(userIdOrEmail);
    const updated = list.filter(p => p.id !== id);

    try {
      localStorage.setItem(getStorageKey(userIdOrEmail), JSON.stringify(updated));
      if (!userIdOrEmail) {
        localStorage.setItem(`${STORAGE_PREFIX}local`, JSON.stringify(updated));
      }
    } catch (e) {
      console.warn('Failed to remove watch progress from localStorage:', e);
    }

    if (userIdOrEmail) {
      fetch(`/api/user/progress/${encodeURIComponent(id)}?email=${encodeURIComponent(userIdOrEmail)}`, {
        method: 'DELETE',
        headers: {
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        }
      }).catch(err => console.warn('Could not sync progress removal to server:', err));
    }

    window.dispatchEvent(new CustomEvent(PROGRESS_UPDATED_EVENT, { detail: updated }));
    return updated;
  },

  clearAll(userIdOrEmail?: string): void {
    try {
      localStorage.removeItem(getStorageKey(userIdOrEmail));
      if (!userIdOrEmail) {
        localStorage.removeItem(`${STORAGE_PREFIX}local`);
      }
    } catch (e) {
      console.warn('Failed to clear watch progress:', e);
    }
    window.dispatchEvent(new CustomEvent(PROGRESS_UPDATED_EVENT, { detail: [] }));
  },

  async syncWithServer(userIdOrEmail?: string, authToken?: string): Promise<WatchProgress[]> {
    if (!userIdOrEmail) return this.getProgressList();

    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(`/api/user/progress?email=${encodeURIComponent(userIdOrEmail)}`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.progress)) {
          const local = this.getProgressList(userIdOrEmail);
          const map = new Map<string, WatchProgress>();
          local.forEach(p => map.set(p.id, p));
          data.progress.forEach((p: WatchProgress) => {
            const existing = map.get(p.id);
            if (!existing || new Date(p.lastWatchedAt) > new Date(existing.lastWatchedAt)) {
              map.set(p.id, p);
            }
          });
          const merged = Array.from(map.values()).sort(
            (a, b) => new Date(b.lastWatchedAt).getTime() - new Date(a.lastWatchedAt).getTime()
          );
          localStorage.setItem(getStorageKey(userIdOrEmail), JSON.stringify(merged));
          window.dispatchEvent(new CustomEvent(PROGRESS_UPDATED_EVENT, { detail: merged }));
          return merged;
        }
      }
    } catch (err) {
      console.warn('Watch progress server sync error:', err);
    }
    return this.getProgressList(userIdOrEmail);
  }
};
