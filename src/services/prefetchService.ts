/**
 * MAXTV Startup Pre-fetching Engine
 * 
 * Initiates eager background pre-fetching of Channels and VOD Catalog metadata
 * at the earliest possible stage in the application lifecycle (on script evaluation),
 * minimizing visual latency and eliminating blank wait states for TV and Mobile users.
 * 
 * Also queues the top channel logos and VOD poster artwork for background
 * caching via the Web Cache API.
 */

import { Channel, VodItem } from '../types';
import { prefetchImagesBatch } from './imageCache';

const CHANNELS_CACHE_KEY = 'maxtv_cache_channels';
const VOD_CACHE_KEY = 'maxtv_cache_vod_catalog';

let channelsPromise: Promise<{ channels: Channel[]; count: number }> | null = null;
let vodPromise: Promise<{ success: boolean; count: number; items: VodItem[] }> | null = null;
let isStarted = false;
let isFinished = false;

/**
 * Triggered at script evaluation (in main.tsx or api.ts) to fire HTTP requests
 * in parallel with React hydration/mounting.
 */
export function initStartupPrefetch(): void {
  if (isStarted || typeof window === 'undefined') return;
  isStarted = true;

  // 1. Eagerly pre-fetch Channels metadata
  channelsPromise = fetch('/api/channels')
    .then(async (res) => {
      if (!res.ok) throw new Error('Status ' + res.status);
      const data = await res.json();
      if (data?.channels && Array.isArray(data.channels) && data.channels.length > 0) {
        // Update local storage cache
        try {
          localStorage.setItem(
            CHANNELS_CACHE_KEY,
            JSON.stringify({ data, timestamp: Date.now() })
          );
        } catch {}

        // Notify active components if any
        window.dispatchEvent(
          new CustomEvent('maxtv_channels_revalidated', { detail: data })
        );

        // Schedule image pre-fetching for top channels
        scheduleChannelLogosPrefetch(data.channels);
      }
      return data;
    })
    .catch((err) => {
      console.warn('[Prefetch] Channels prefetch failed, falling back:', err);
      return { channels: [], count: 0 };
    });

  // 2. Eagerly pre-fetch VOD catalog metadata
  vodPromise = fetch('/api/vod')
    .then(async (res) => {
      if (!res.ok) throw new Error('Status ' + res.status);
      const data = await res.json();
      if (data?.items && Array.isArray(data.items) && data.items.length > 0) {
        // Update local storage cache
        try {
          localStorage.setItem(
            VOD_CACHE_KEY,
            JSON.stringify({ data, timestamp: Date.now() })
          );
        } catch {}

        // Notify active components if any
        window.dispatchEvent(
          new CustomEvent('maxtv_vod_revalidated', { detail: data })
        );

        // Schedule image pre-fetching for top VOD posters
        scheduleVodPostersPrefetch(data.items);
      }
      isFinished = true;
      return data;
    })
    .catch((err) => {
      console.warn('[Prefetch] VOD prefetch failed, falling back:', err);
      isFinished = true;
      return { success: false, count: 0, items: [] };
    });
}

/**
 * Returns the in-flight or completed channels prefetch promise
 */
export function getPrefetchedChannels(): Promise<{ channels: Channel[]; count: number }> | null {
  if (!channelsPromise && !isStarted) {
    initStartupPrefetch();
  }
  return channelsPromise;
}

/**
 * Returns the in-flight or completed VOD prefetch promise
 */
export function getPrefetchedVod(): Promise<{ success: boolean; count: number; items: VodItem[] }> | null {
  if (!vodPromise && !isStarted) {
    initStartupPrefetch();
  }
  return vodPromise;
}

/**
 * Schedule pre-fetching of top channel logos into the Web Cache API.
 * Uses requestIdleCallback so it runs strictly when the TV/Mobile CPU is idle.
 */
function scheduleChannelLogosPrefetch(channels: Channel[]): void {
  const run = () => {
    // Select the first 40 channel logos + any VIP/Popular highlights
    const topLogos = channels
      .slice(0, 45)
      .map((c) => c.logo)
      .filter((logo): logo is string => Boolean(logo && logo.trim().length > 0));

    prefetchImagesBatch(topLogos, { maxConcurrency: 3 }).catch(() => {});
  };

  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    (window as any).requestIdleCallback(run, { timeout: 3000 });
  } else {
    setTimeout(run, 500);
  }
}

/**
 * Schedule pre-fetching of top VOD posters and banners into the Web Cache API.
 */
function scheduleVodPostersPrefetch(items: VodItem[]): void {
  const run = () => {
    // Select top 25 VOD posters and banners
    const topUrls: string[] = [];
    for (const v of items.slice(0, 30)) {
      if (v.posterUrl) topUrls.push(v.posterUrl);
      if (v.bannerUrl) topUrls.push(v.bannerUrl);
    }

    prefetchImagesBatch(topUrls, { maxConcurrency: 3 }).catch(() => {});
  };

  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    (window as any).requestIdleCallback(run, { timeout: 4500 });
  } else {
    setTimeout(run, 1200);
  }
}

/**
 * Manually trigger full pre-cache of all available channels and VOD artwork (for Admin Panel)
 */
export async function prefetchCatalogImagesNow(
  channels: Channel[],
  vods: VodItem[],
  onProgress?: (completed: number, total: number) => void
): Promise<{ total: number; completed: number }> {
  const urls = new Set<string>();

  for (const c of channels) {
    if (c.logo) urls.add(c.logo);
  }
  for (const v of vods) {
    if (v.posterUrl) urls.add(v.posterUrl);
    if (v.bannerUrl) urls.add(v.bannerUrl);
  }

  const allList = Array.from(urls);
  let doneCount = 0;

  await prefetchImagesBatch(allList, {
    maxConcurrency: 4,
    onProgress: (done, total) => {
      doneCount = done;
      if (onProgress) onProgress(done, total);
    }
  });

  return { total: allList.length, completed: doneCount };
}

// Auto-run on module load if in browser
if (typeof window !== 'undefined') {
  initStartupPrefetch();
}
