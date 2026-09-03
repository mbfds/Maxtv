import { Channel, VodItem, FavoriteItem } from '../types';

const STORAGE_PREFIX = 'maxtv_favorites_';
export const FAVORITES_UPDATED_EVENT = 'maxtv_favorites_updated';

function getStorageKey(userIdOrEmail?: string): string {
  if (userIdOrEmail) {
    return `${STORAGE_PREFIX}${userIdOrEmail.toLowerCase().trim()}`;
  }
  return `${STORAGE_PREFIX}local`;
}

export const favoritesStorage = {
  getFavorites(userIdOrEmail?: string): FavoriteItem[] {
    try {
      const key = getStorageKey(userIdOrEmail);
      const data = localStorage.getItem(key);
      if (data) {
        return JSON.parse(data);
      }
      // If user is logged in, also check local fallback if empty
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
      console.warn('Failed to read favorites from localStorage:', e);
    }
    return [];
  },

  isFavorite(id: string, userIdOrEmail?: string): boolean {
    const list = this.getFavorites(userIdOrEmail);
    return list.some(item => item.id === id);
  },

  addFavorite(
    item: Channel | VodItem, 
    type: 'channel' | 'vod', 
    userIdOrEmail?: string,
    authToken?: string
  ): FavoriteItem[] {
    const list = this.getFavorites(userIdOrEmail);
    if (list.some(f => f.id === item.id)) {
      return list;
    }

    const isChannel = type === 'channel';
    const ch = isChannel ? (item as Channel) : null;
    const vod = !isChannel ? (item as VodItem) : null;

    const newFav: FavoriteItem = {
      id: item.id,
      type,
      addedAt: new Date().toISOString(),
      name: ch?.name || vod?.title,
      title: vod?.title || ch?.name,
      logo: ch?.logo,
      posterUrl: vod?.posterUrl,
      bannerUrl: vod?.bannerUrl,
      category: ch?.category,
      year: vod?.year,
      rating: vod?.rating,
      duration: vod?.duration,
      genre: vod?.genre,
      synopsis: vod?.synopsis,
      isVipOnly: item.isVipOnly,
      streamUrl: vod?.streamUrl || ch?.sources?.[0]?.url
    };

    const updated = [newFav, ...list];
    try {
      localStorage.setItem(getStorageKey(userIdOrEmail), JSON.stringify(updated));
      // Also save to generic local if guest
      if (!userIdOrEmail) {
        localStorage.setItem(`${STORAGE_PREFIX}local`, JSON.stringify(updated));
      }
    } catch (e) {
      console.warn('Failed to save favorites to localStorage:', e);
    }

    // Sync with server if user is logged in
    if (userIdOrEmail) {
      fetch('/api/user/favorites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({ item: newFav, email: userIdOrEmail })
      }).catch(err => console.warn('Could not sync favorite to server:', err));
    }

    window.dispatchEvent(new CustomEvent(FAVORITES_UPDATED_EVENT, { detail: updated }));
    return updated;
  },

  removeFavorite(
    id: string, 
    userIdOrEmail?: string,
    authToken?: string
  ): FavoriteItem[] {
    const list = this.getFavorites(userIdOrEmail);
    const updated = list.filter(f => f.id !== id);

    try {
      localStorage.setItem(getStorageKey(userIdOrEmail), JSON.stringify(updated));
      if (!userIdOrEmail) {
        localStorage.setItem(`${STORAGE_PREFIX}local`, JSON.stringify(updated));
      }
    } catch (e) {
      console.warn('Failed to remove favorite from localStorage:', e);
    }

    // Sync with server
    if (userIdOrEmail) {
      fetch(`/api/user/favorites/${encodeURIComponent(id)}?email=${encodeURIComponent(userIdOrEmail)}`, {
        method: 'DELETE',
        headers: {
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        }
      }).catch(err => console.warn('Could not sync favorite deletion to server:', err));
    }

    window.dispatchEvent(new CustomEvent(FAVORITES_UPDATED_EVENT, { detail: updated }));
    return updated;
  },

  toggleFavorite(
    item: Channel | VodItem, 
    type: 'channel' | 'vod', 
    userIdOrEmail?: string,
    authToken?: string
  ): { isFav: boolean; favorites: FavoriteItem[] } {
    const exists = this.isFavorite(item.id, userIdOrEmail);
    if (exists) {
      const list = this.removeFavorite(item.id, userIdOrEmail, authToken);
      return { isFav: false, favorites: list };
    } else {
      const list = this.addFavorite(item, type, userIdOrEmail, authToken);
      return { isFav: true, favorites: list };
    }
  },

  async syncWithServer(userIdOrEmail?: string, authToken?: string): Promise<FavoriteItem[]> {
    if (!userIdOrEmail) return this.getFavorites();

    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(`/api/user/favorites?email=${encodeURIComponent(userIdOrEmail)}`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.favorites)) {
          // Merge server with local
          const local = this.getFavorites(userIdOrEmail);
          const map = new Map<string, FavoriteItem>();
          // local items first
          local.forEach(f => map.set(f.id, f));
          // server items overwriting
          data.favorites.forEach((f: FavoriteItem) => map.set(f.id, f));
          const merged = Array.from(map.values());
          localStorage.setItem(getStorageKey(userIdOrEmail), JSON.stringify(merged));
          window.dispatchEvent(new CustomEvent(FAVORITES_UPDATED_EVENT, { detail: merged }));
          return merged;
        }
      }
    } catch (err) {
      console.warn('Favorites server sync error:', err);
    }
    return this.getFavorites(userIdOrEmail);
  }
};
