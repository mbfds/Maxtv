import { Channel, PixTransaction, Subscriber, AdminMetrics, SystemSettings, ChannelHealthResult, ChannelHealthSummary, ChannelUpdateHistoryEntry, ChannelsConfigFile, ChannelsConfigResponse, RepoLinksInfo, UnifyGradeStats, M3uImportLogEntry, M3uAutoUpdateSource, M3uAutoUpdateConfig, UrlSaveErrorEntry, DatabaseStats, AuditLogEntry, RealtimeDashboardData, ChannelEpgSchedule, EpgEnrichResponse, FuzzyDuplicateCandidate, FuzzyScanResult } from '../types';
import { ChannelMismatchSummary, ChannelUrlMismatch, analyzeChannelsMismatches, detectChannelUrlMismatch } from '../utils/channelMismatchDetector';
import { getPrefetchedChannels, getPrefetchedVod } from './prefetchService';
import { DEFAULT_CHANNELS_GRID, verifyAndParseChannelsGridResponse, ChannelsGridResult } from './gridIntegrity';

export { DEFAULT_CHANNELS_GRID, verifyAndParseChannelsGridResponse, analyzeChannelsMismatches, detectChannelUrlMismatch };
export type { ChannelsGridResult, ChannelMismatchSummary, ChannelUrlMismatch };

const ONE_HOUR_MS = 60 * 60 * 1000; // 1 hour TTL
const CHANNELS_CACHE_KEY = 'maxtv_cache_channels';
const VOD_CACHE_KEY = 'maxtv_cache_vod_catalog';

export const getCachedChannels = (): Channel[] | null => {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(CHANNELS_CACHE_KEY) || localStorage.getItem('maxtv_channels_cache');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.data?.channels) && parsed.data.channels.length > 0) {
      return parsed.data.channels;
    }
    if (parsed && Array.isArray(parsed.channels) && parsed.channels.length > 0) {
      return parsed.channels;
    }
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch {}
  return null;
};

export const getCachedVodCatalog = (): any[] | null => {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(VOD_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.data?.items) && parsed.data.items.length > 0) {
      return parsed.data.items;
    }
  } catch {}
  return null;
};

export const getAdminToken = (): string => {
  try {
    return (
      (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('maxtv_admin_token')) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('maxtv_admin_token')) ||
      ''
    );
  } catch {
    return '';
  }
};

export const setAdminToken = (token: string): void => {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('maxtv_admin_token', token);
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('maxtv_admin_token', token);
    }
  } catch {}
};

export const clearAdminToken = (): void => {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('maxtv_admin_token');
      sessionStorage.removeItem('maxtv_admin_verified');
      sessionStorage.removeItem('maxtv_admin_user');
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('maxtv_admin_token');
      localStorage.removeItem('maxtv_admin_verified');
      localStorage.removeItem('maxtv_admin_user');
    }
  } catch {}
};

export const getAdminHeaders = (extraHeaders: Record<string, string> = {}): Record<string, string> => {
  const token = getAdminToken();
  const headers: Record<string, string> = { ...extraHeaders };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['x-admin-token'] = token;
  }
  return headers;
};

export async function adminFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers = getAdminHeaders((init?.headers as Record<string, string>) || {});
  const res = await fetch(url, {
    ...init,
    headers
  });

  if (res.status === 401 || res.status === 403) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('maxtv_admin_unauthorized', {
        detail: { status: res.status, url }
      }));
    }
  }

  return res;
}

/**
 * Universal safe JSON parser for fetch Responses.
 * Prevents "Failed to execute 'json' on 'Response': Unexpected end of JSON input"
 * by safely inspecting body text, checking status codes, and handling empty/HTML/truncated responses.
 */
export async function safeJsonResponse<T = any>(res: Response, fallbackErrorMsg?: string): Promise<T> {
  let text = '';
  try {
    text = await res.text();
  } catch {
    if (res.ok) {
      return { success: true } as unknown as T;
    }
    throw new Error(fallbackErrorMsg || `Erro de conexão HTTP ${res.status}`);
  }

  const trimmed = text.trim();
  if (!trimmed) {
    if (res.ok) {
      return { success: true } as unknown as T;
    }
    throw new Error(fallbackErrorMsg || `Servidor retornou status ${res.status} sem conteúdo. A operação pode estar sendo processada em segundo plano.`);
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    if (trimmed.startsWith('<') || trimmed.includes('<html') || trimmed.includes('<body')) {
      const match = trimmed.match(/<title>(.*?)<\/title>/i) || trimmed.match(/<h1>(.*?)<\/h1>/i);
      const title = match ? match[1].replace(/<[^>]+>/g, '').trim() : '';
      if (title) {
        throw new Error(fallbackErrorMsg ? `${fallbackErrorMsg} (${title})` : `Erro do servidor (${res.status}): ${title}`);
      }
    }
    const cleanSnippet = trimmed.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
    throw new Error(fallbackErrorMsg || (cleanSnippet ? `Erro do servidor (${res.status}): ${cleanSnippet}` : 'Falha ao processar resposta do servidor.'));
  }
}

export const api = {
  // Channels with localStorage cache & 1-hour background revalidation
  async getChannels(options: { forceRefresh?: boolean } = {}): Promise<{ channels: Channel[]; count: number }> {
    const now = Date.now();
    let cachedEntry: { data: { channels: Channel[]; count: number }; timestamp: number } | null = null;

    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(CHANNELS_CACHE_KEY);
        if (raw) {
          cachedEntry = JSON.parse(raw);
        }
      }
    } catch {}

    const isCacheValid = cachedEntry && Array.isArray(cachedEntry.data?.channels) && cachedEntry.data.channels.length > 0;
    const isCacheFresh = isCacheValid && (now - cachedEntry!.timestamp < ONE_HOUR_MS);

    // If cache is fresh and not forced, return immediately
    if (isCacheFresh && !options.forceRefresh) {
      return cachedEntry!.data;
    }

    // Background revalidator helper
    const revalidateInBackground = () => {
      fetch('/api/channels')
        .then(async res => {
          return await verifyAndParseChannelsGridResponse(res);
        })
        .then(freshData => {
          if (freshData?.channels && Array.isArray(freshData.channels) && freshData.channels.length > 0) {
            try {
              localStorage.setItem(CHANNELS_CACHE_KEY, JSON.stringify({
                data: freshData,
                timestamp: Date.now()
              }));
            } catch {}
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('maxtv_channels_revalidated', { detail: freshData }));
            }
          }
        })
        .catch(() => {});
    };

    // If we have cached channels (even if older than 1 hour), return them instantly to avoid UI delay and revalidate in background!
    if (isCacheValid && !options.forceRefresh) {
      revalidateInBackground();
      return cachedEntry!.data;
    }

    // Check if startup eager prefetch is already in-flight/ready
    if (!options.forceRefresh) {
      const prefetchPromise = getPrefetchedChannels();
      if (prefetchPromise) {
        try {
          const prefetched = await prefetchPromise;
          if (prefetched?.channels && Array.isArray(prefetched.channels) && prefetched.channels.length > 0) {
            return prefetched;
          }
        } catch {}
      }
    }

    // No cache or forceRefresh requested: fetch synchronously with integrity verification before .json()
    try {
      const res = await fetch('/api/channels');
      const freshData = await verifyAndParseChannelsGridResponse(res);
      if (freshData?.channels && Array.isArray(freshData.channels) && freshData.channels.length > 0) {
        try {
          localStorage.setItem(CHANNELS_CACHE_KEY, JSON.stringify({
            data: freshData,
            timestamp: Date.now()
          }));
        } catch {}
      }
      return freshData;
    } catch {
      if (isCacheValid) return cachedEntry!.data;
      return DEFAULT_CHANNELS_GRID;
    }
  },

  // Pix Mercado Pago
  async createPixPayment(payload: {
    planId: string;
    planName: string;
    price: number;
    userEmail: string;
    userName: string;
    cpf: string;
  }): Promise<{ success: boolean; transaction: PixTransaction }> {
    const res = await fetch('/api/pix/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Erro ao gerar Pix' }));
      throw new Error(err.error || 'Erro ao gerar Pix');
    }
    return await res.json();
  },

  async checkPixStatus(id: string): Promise<{ success: boolean; status: string; transaction: PixTransaction }> {
    const res = await fetch(`/api/pix/status/${id}`);
    if (!res.ok) throw new Error('Erro ao verificar status do Pix');
    return await res.json();
  },

  async simulatePixPayment(transactionId: string): Promise<{ success: boolean; transaction: PixTransaction; subscriber: Subscriber }> {
    const res = await fetch('/api/pix/simulate-pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionId }),
    });
    if (!res.ok) throw new Error('Erro ao simular aprovação do Pix');
    return await res.json();
  },

  async getUserSubscription(token?: string, email?: string): Promise<{ success: boolean; subscriber: Subscriber | null; transactions: PixTransaction[] }> {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const url = email ? `/api/user/subscription?email=${encodeURIComponent(email)}` : '/api/user/subscription';
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Erro ao carregar dados da assinatura' }));
      throw new Error(err.error || 'Erro ao carregar assinatura');
    }
    return await res.json();
  },

  // Admin
  async getAdminMetrics(): Promise<{ success: boolean; metrics: AdminMetrics }> {
    const res = await adminFetch('/api/admin/metrics');
    if (!res.ok) throw new Error('Falha ao obter métricas');
    return await res.json();
  },

  async getSubscribers(): Promise<{ success: boolean; subscribers: Subscriber[] }> {
    const res = await adminFetch('/api/admin/subscribers');
    if (!res.ok) throw new Error('Falha ao listar assinantes');
    return await res.json();
  },

  async addSubscriber(data: Partial<Subscriber> & { days?: number }): Promise<{ success: boolean; subscriber: Subscriber }> {
    const res = await adminFetch('/api/admin/subscribers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Falha ao cadastrar assinante');
    return await res.json();
  },

  async updateSubscriber(id: string, data: { status?: string; addDays?: number; planName?: string }): Promise<{ success: boolean; subscriber: Subscriber }> {
    const res = await adminFetch(`/api/admin/subscribers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Falha ao atualizar assinante');
    return await res.json();
  },

  async deleteSubscriber(id: string): Promise<{ success: boolean }> {
    const res = await adminFetch(`/api/admin/subscribers/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Falha ao excluir assinante');
    return await res.json();
  },

  async grantMonths(data: {
    subscriberId?: string;
    email?: string;
    name?: string;
    cpf?: string;
    months?: number;
    days?: number;
    reason?: string;
    planName?: string;
  }): Promise<{ success: boolean; message: string; subscriber: Subscriber; grant: any }> {
    const res = await adminFetch('/api/admin/subscribers/grant-months', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Falha ao liberar mês para usuário');
    return await res.json();
  },

  async quickAddMonth(subscriberId: string): Promise<{ success: boolean; message: string; subscriber: Subscriber; grant: any }> {
    const res = await adminFetch(`/api/admin/subscribers/${subscriberId}/quick-add-month`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Falha ao liberar +1 mês');
    return await res.json();
  },

  async getGrantsHistory(): Promise<{ success: boolean; count: number; grants: any[] }> {
    const res = await adminFetch('/api/admin/grants');
    if (!res.ok) throw new Error('Falha ao obter histórico de concessões');
    return await res.json();
  },

  async getTransactions(): Promise<{ success: boolean; transactions: PixTransaction[] }> {
    const res = await adminFetch('/api/admin/transactions');
    if (!res.ok) throw new Error('Falha ao listar transações');
    return await res.json();
  },

  async approveTransaction(id: string): Promise<{ success: boolean; transaction: PixTransaction }> {
    const res = await adminFetch(`/api/admin/transactions/${id}/approve`, { method: 'POST' });
    if (!res.ok) throw new Error('Falha ao aprovar transação');
    return await res.json();
  },

  async addCustomChannel(data: { name: string; category: string; logo: string; streamUrl: string; referer?: string; isVipOnly?: boolean }): Promise<{ success: boolean; channel: Channel }> {
    const res = await adminFetch('/api/admin/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Falha ao adicionar canal');
    return await res.json();
  },

  async updateChannel(id: string, data: { name?: string; category?: string; logo?: string; streamUrl?: string; referer?: string; isVipOnly?: boolean }): Promise<{ success: boolean; channel: Channel; message?: string }> {
    const res = await adminFetch(`/api/admin/channels/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Falha ao atualizar canal');
    return await res.json();
  },

  async deleteChannel(id: string): Promise<{ success: boolean }> {
    const res = await adminFetch(`/api/admin/channels/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Falha ao remover canal');
    return await res.json();
  },

  // --- Channel Problem Reports API ---
  async getChannelReports(): Promise<{ success: boolean; total: number; reports: any[] }> {
    try {
      const res = await fetch('/api/channels/reports');
      if (!res.ok) throw new Error('Falha ao obter relatórios');
      return await res.json();
    } catch {
      return { success: false, total: 0, reports: [] };
    }
  },

  async reportChannelProblem(payload: {
    channelId: string;
    channelName: string;
    sourceUrl?: string;
    reason?: string;
    userEmail?: string;
    latencyMs?: number;
    status?: string;
  }): Promise<{ success: boolean; message: string; report?: any }> {
    const res = await fetch('/api/channels/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Falha ao reportar erro do canal');
    return await res.json();
  },

  async deleteChannelReport(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`/api/channels/reports/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Falha ao excluir relatório');
    return await res.json();
  },

  async clearChannelReports(): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/channels/reports/clear', { method: 'POST' });
    if (!res.ok) throw new Error('Falha ao limpar relatórios');
    return await res.json();
  },

  async syncLocalM3uChannels(author?: string): Promise<{ success: boolean; channelsCount: number; message: string; lastUpdate?: any }> {
    const res = await adminFetch('/api/admin/channels/sync-local-m3u', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author })
    });
    const data = await safeJsonResponse(res, 'Falha ao sincronizar listas M3U locais');
    if (!res.ok || !data.success) {
      throw new Error(data.message || data.error || 'Falha ao sincronizar listas M3U locais');
    }
    return data;
  },

  async syncRamysChannels(): Promise<{ success: boolean; channelsCount: number; vodCount: number; message: string }> {
    const res = await this.syncLocalM3uChannels();
    return { success: res.success, channelsCount: res.channelsCount, vodCount: 0, message: res.message };
  },

  async syncSaimoChannels(): Promise<{ success: boolean; count: number; message: string }> {
    const res = await this.syncLocalM3uChannels();
    return { success: res.success, count: res.channelsCount, message: res.message };
  },

  // Channels Configuration File (JSON Editor & Validation)
  async getChannelsConfig(): Promise<ChannelsConfigResponse> {
    try {
      const res = await adminFetch('/api/admin/channels/config');
      if (!res.ok) throw new Error('Falha ao carregar arquivo de configuração de canais');
      return await safeJsonResponse(res, 'Falha ao carregar arquivo de configuração de canais');
    } catch (err: any) {
      return { success: false, error: err.message || 'Falha ao conectar com o servidor' };
    }
  },

  async validateChannelsConfig(payload: { rawJson?: string; config?: any }): Promise<{
    valid: boolean;
    error?: string;
    errorType?: string;
    count?: number;
    warnings?: string[];
    errors?: string[];
  }> {
    const res = await adminFetch('/api/admin/channels/config/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await safeJsonResponse(res, 'Falha ao validar arquivo de configuração de canais');
  },

  async saveChannelsConfig(payload: { rawJson?: string; config?: any; author?: string }): Promise<{
    success: boolean;
    message: string;
    channelsCount?: number;
    lastUpdate?: ChannelUpdateHistoryEntry;
    error?: string;
    config?: ChannelsConfigFile;
    rawJson?: string;
  }> {
    const res = await adminFetch('/api/admin/channels/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await safeJsonResponse(res, 'Falha ao salvar arquivo de configuração de canais');
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Falha ao salvar arquivo de configuração de canais');
    }
    return data;
  },

  // Channels Update History
  async getChannelUpdateHistory(): Promise<{
    success: boolean;
    lastUpdate: ChannelUpdateHistoryEntry | null;
    history: ChannelUpdateHistoryEntry[];
    total: number;
  }> {
    try {
      const res = await adminFetch('/api/admin/channels/history');
      if (!res.ok) throw new Error('Falha ao obter histórico de atualizações');
      return await res.json();
    } catch {
      return { success: false, lastUpdate: null, history: [], total: 0 };
    }
  },

  async clearChannelUpdateHistory(): Promise<{
    success: boolean;
    message: string;
    history: ChannelUpdateHistoryEntry[];
    lastUpdate?: ChannelUpdateHistoryEntry;
  }> {
    const res = await adminFetch('/api/admin/channels/history/clear', { method: 'POST' });
    if (!res.ok) throw new Error('Falha ao limpar histórico');
    return await res.json();
  },

  async syncLocalM3u(payload?: { author?: string }): Promise<{
    success: boolean;
    channelsCount: number;
    message: string;
    sourcesCount?: number;
    sourcesUsed?: string[];
    lastUpdate?: any;
  }> {
    return this.syncLocalM3uChannels(payload?.author);
  },

  async syncVodM3U(options?: { m3uUrl?: string; source?: 'local_db' | 'custom' | string } | string): Promise<{ success: boolean; count: number; moviesCount?: number; seriesCount?: number; message?: string; error?: string; items?: any[] }> {
    const payload = typeof options === 'string' ? { m3uUrl: options } : options || {};
    const res = await adminFetch('/api/admin/vod/sync-m3u', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await safeJsonResponse(res, 'Falha ao sincronizar catálogo VOD M3U/M3U8');
    if (!res.ok || !data?.success) {
      throw new Error(data?.error || data?.message || 'Falha ao sincronizar catálogo VOD M3U/M3U8');
    }
    if (data?.success) {
      this.clearVodCache();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('maxtv_vod_revalidated', { detail: data }));
      }
    }
    return data;
  },

  clearVodCache(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(VOD_CACHE_KEY);
      }
    } catch {}
  },

  async getVodCatalog(options: { forceRefresh?: boolean } = {}): Promise<{ success: boolean; count: number; items: any[] }> {
    const now = Date.now();
    let cachedEntry: { data: { success: boolean; count: number; items: any[] }; timestamp: number } | null = null;

    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(VOD_CACHE_KEY);
        if (raw) {
          cachedEntry = JSON.parse(raw);
        }
      }
    } catch {}

    const isCacheValid = cachedEntry && Array.isArray(cachedEntry.data?.items) && cachedEntry.data.items.length > 0;
    const isCacheFresh = isCacheValid && (now - cachedEntry!.timestamp < ONE_HOUR_MS);

    if (isCacheFresh && !options.forceRefresh) {
      return cachedEntry!.data;
    }

    const revalidateInBackground = () => {
      fetch('/api/vod')
        .then(res => {
          if (!res.ok) throw new Error('Status ' + res.status);
          return res.json();
        })
        .then(freshData => {
          if (freshData?.items && Array.isArray(freshData.items) && freshData.items.length > 0) {
            try {
              localStorage.setItem(VOD_CACHE_KEY, JSON.stringify({
                data: freshData,
                timestamp: Date.now()
              }));
            } catch {}
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('maxtv_vod_revalidated', { detail: freshData }));
            }
          }
        })
        .catch(() => {});
    };

    if (isCacheValid && !options.forceRefresh) {
      revalidateInBackground();
      return cachedEntry!.data;
    }

    // Check if startup eager prefetch is already in-flight/ready
    if (!options.forceRefresh) {
      const prefetchPromise = getPrefetchedVod();
      if (prefetchPromise) {
        try {
          const prefetched = await prefetchPromise;
          if (prefetched?.items && Array.isArray(prefetched.items) && prefetched.items.length > 0) {
            return prefetched;
          }
        } catch {}
      }
    }

    try {
      const res = await fetch('/api/vod');
      if (!res.ok) throw new Error('Falha ao obter catálogo VOD');
      const freshData = await res.json();
      if (freshData?.items && Array.isArray(freshData.items) && freshData.items.length > 0) {
        try {
          localStorage.setItem(VOD_CACHE_KEY, JSON.stringify({
            data: freshData,
            timestamp: Date.now()
          }));
        } catch {}
      }
      return freshData;
    } catch {
      if (isCacheValid) return cachedEntry!.data;
      return { success: false, count: 0, items: [] };
    }
  },

  // Repository Links & M3U8 Unification (IPTV Brasil 2026)
  async getRepoLinksInfo(): Promise<{ success: boolean } & RepoLinksInfo> {
    const res = await adminFetch('/api/admin/repo-links/info');
    if (!res.ok) throw new Error('Falha ao obter dados do repositório IPTV Brasil 2026');
    return await res.json();
  },

  async getUnifyStats(): Promise<{ success: boolean } & UnifyGradeStats> {
    const res = await adminFetch('/api/admin/channels/unify-stats');
    if (!res.ok) throw new Error('Falha ao obter estatísticas da grade unificada');
    return await res.json();
  },

  async removeChannelSource(data: {
    channelId: string;
    sourceIndex?: number;
    sourceUrl?: string;
    author?: string;
  }): Promise<{
    success: boolean;
    message: string;
    channel: any;
    remainingSourcesCount: number;
  }> {
    const res = await adminFetch('/api/admin/channels/remove-source', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || result.message || 'Falha ao remover servidor do canal');
    }
    return result;
  },

  clearChannelsCache(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(CHANNELS_CACHE_KEY);
      }
    } catch {}
  },

  async unifyChannelsNow(author?: string, fuzzyThreshold?: number): Promise<{
    success: boolean;
    message: string;
    channelsCount: number;
    mergedChannelsCount: number;
    newChannelsCount: number;
    totalSourcesCount: number;
    channels?: Channel[];
    durationMs?: number;
    similarityMatches?: any[];
  }> {
    const res = await adminFetch('/api/admin/channels/unify-now', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author, fuzzyThreshold })
    });
    const data = await safeJsonResponse(res, 'Falha ao unificar grade de canais');
    if (!res.ok || !data.success) {
      throw new Error(data.error || data.message || 'Falha ao unificar grade de canais');
    }

    // Invalida cache local para carregar os novos canais unificados
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(CHANNELS_CACHE_KEY);
      }
    } catch {}

    if (data.channels && Array.isArray(data.channels) && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('maxtv_channels_revalidated', {
        detail: { channels: data.channels, count: data.channels.length }
      }));
    } else if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('maxtv_channels_revalidated', {
        detail: { count: data.channelsCount }
      }));
    }

    return data;
  },

  // Escaneia a grade por canais duplicados usando algoritmo de fuzzy matching
  async scanFuzzyDuplicates(options?: { threshold?: number; category?: string }): Promise<FuzzyScanResult> {
    const res = await adminFetch('/api/admin/channels/fuzzy-scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options || {})
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Falha ao escanear canais duplicados');
    }
    return data;
  },

  // Consolida canais duplicados em um único ID de canal, unificando streams
  async mergeFuzzyDuplicates(
    merges: Array<{ primaryChannelId: string; duplicateChannelIds: string[] }>,
    author?: string
  ): Promise<{
    success: boolean;
    message: string;
    totalDuplicatesRemoved: number;
    totalMergedStreams: number;
    remainingChannelsCount: number;
    channels?: Channel[];
  }> {
    const res = await adminFetch('/api/admin/channels/fuzzy-merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merges, author })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Falha ao consolidar canais duplicados');
    }

    // Limpa cache
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(CHANNELS_CACHE_KEY);
      }
    } catch {}

    if (data.channels && Array.isArray(data.channels) && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('maxtv_channels_revalidated', {
        detail: { channels: data.channels, count: data.channels.length }
      }));
    }

    return data;
  },

  // Telemetria de Stream e Ranking de Links
  async recordStreamTelemetry(payload: {
    url: string;
    success: boolean;
    latencyMs?: number;
    playSeconds?: number;
    error?: string;
    channelId?: string;
    channelName?: string;
  }): Promise<{ success: boolean; telemetry?: any }> {
    try {
      const res = await fetch('/api/channels/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return await res.json();
    } catch {
      return { success: false };
    }
  },

  async getStreamRanking(limit = 100): Promise<{ success: boolean; count: number; streams: any[] }> {
    const res = await adminFetch(`/api/admin/streams/ranking?limit=${limit}`);
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Falha ao carregar ranking de streams');
    }
    return data;
  },

  async importM3uUrl(payload: {
    url: string;
    unifyWithExisting?: boolean;
    author?: string;
    sourceLabel?: string;
    excludeMismatchIds?: string[];
    skipHighSeverityMismatches?: boolean;
  }): Promise<{
    success: boolean;
    message: string;
    channelsCount: number;
    importedCount: number;
    mergedChannelsCount: number;
    newChannelsCount: number;
    totalSourcesCount: number;
    durationMs?: number;
    mismatchesSummary?: ChannelMismatchSummary;
  }> {
    const res = await adminFetch('/api/admin/channels/import-m3u-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await safeJsonResponse(res, 'Falha ao importar URL M3U8');
    if (!res.ok || !data.success) {
      throw new Error(data.error || data.message || 'Falha ao importar URL M3U8');
    }
    return data;
  },

  async importM3uContent(payload: {
    content: string;
    fileName?: string;
    unifyWithExisting?: boolean;
    author?: string;
    excludeMismatchIds?: string[];
    skipHighSeverityMismatches?: boolean;
  }): Promise<{
    success: boolean;
    message: string;
    channelsCount: number;
    importedCount: number;
    mergedChannelsCount: number;
    newChannelsCount: number;
    totalSourcesCount: number;
    durationMs?: number;
    mismatchesSummary?: ChannelMismatchSummary;
  }> {
    const res = await adminFetch('/api/admin/channels/import-m3u-content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await safeJsonResponse(res, 'Falha ao importar conteúdo M3U8');
    if (!res.ok || !data.success) {
      throw new Error(data.error || data.message || 'Falha ao importar conteúdo M3U8');
    }
    return data;
  },

  async syncRepoLinks(payload: { file: string; customUrl?: string; author?: string; name?: string }): Promise<{
    success: boolean;
    message: string;
    channelsCount?: number;
    vodCount?: number;
    file?: string;
    durationMs?: number;
    lastUpdate?: ChannelUpdateHistoryEntry;
  }> {
    const res = await adminFetch('/api/admin/repo-links/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await safeJsonResponse(res, 'Falha ao sincronizar links do repositório');
    if (!res.ok || !data.success) {
      throw new Error(data.error || data.message || 'Falha ao sincronizar links do repositório');
    }
    return data;
  },

  async testRepoHost(host: string): Promise<{
    success: boolean;
    host: string;
    online: boolean;
    status?: number;
    latencyMs: number;
    message?: string;
    error?: string;
  }> {
    const res = await adminFetch('/api/admin/repo-links/test-host', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host })
    });
    return await safeJsonResponse(res);
  },

  // M3U Import Logs & Transparency
  async getM3uImportLogs(): Promise<{ success: boolean; logs: M3uImportLogEntry[]; count: number }> {
    const res = await adminFetch('/api/admin/channels/import-logs');
    if (!res.ok) throw new Error('Falha ao obter logs de importação');
    return await safeJsonResponse(res, 'Falha ao obter logs de importação');
  },

  async clearM3uImportLogs(): Promise<{ success: boolean; message: string }> {
    const res = await adminFetch('/api/admin/channels/import-logs', { method: 'DELETE' });
    if (!res.ok) throw new Error('Falha ao limpar histórico de importações');
    return await safeJsonResponse(res, 'Falha ao limpar histórico de importações');
  },

  // M3U Auto-Update Scheduler
  async getM3uAutoUpdateConfig(): Promise<{ success: boolean; config: M3uAutoUpdateConfig }> {
    const res = await adminFetch('/api/admin/channels/auto-update-config');
    if (!res.ok) throw new Error('Falha ao obter configurações de auto-atualização');
    return await safeJsonResponse(res, 'Falha ao obter configurações de auto-atualização');
  },

  async saveM3uAutoUpdateConfig(payload: Partial<M3uAutoUpdateConfig>): Promise<{ success: boolean; config: M3uAutoUpdateConfig; message: string }> {
    const res = await adminFetch('/api/admin/channels/auto-update-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await safeJsonResponse(res, 'Falha ao salvar configurações de auto-atualização');
    if (!res.ok || !data.success) {
      throw new Error(data.error || data.message || 'Falha ao salvar configurações de auto-atualização');
    }
    return data;
  },

  async saveM3uSource(payload: { id?: string; name?: string; url: string; enabled?: boolean; skipValidation?: boolean; type?: 'channels' | 'vod' | 'all'; author?: string }): Promise<{
    success: boolean;
    source: any;
    sources: any[];
    config?: M3uAutoUpdateConfig;
    message: string;
    validationFailed?: boolean;
    validation?: any;
    log?: any;
  }> {
    const res = await adminFetch('/api/admin/channels/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await safeJsonResponse(res, 'Falha ao salvar fonte M3U');
    if (!res.ok || !data.success) {
      const err = new Error(data.error || data.message || 'Falha ao salvar fonte M3U');
      (err as any).data = data;
      throw err;
    }
    return data;
  },

  async updateM3uSource(id: string, payload: { name?: string; url?: string; enabled?: boolean; type?: 'channels' | 'vod' }): Promise<{
    success: boolean;
    source: M3uAutoUpdateSource;
    sources: M3uAutoUpdateSource[];
    message: string;
  }> {
    const res = await adminFetch(`/api/admin/channels/sources/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await safeJsonResponse(res, 'Falha ao atualizar fonte M3U');
    if (!res.ok || !data.success) {
      throw new Error(data.error || data.message || 'Falha ao atualizar fonte M3U');
    }
    return data;
  },

  async deleteM3uSource(id: string): Promise<{ success: boolean; message: string; sources: M3uAutoUpdateSource[] }> {
    const res = await adminFetch(`/api/admin/channels/sources/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Falha ao remover fonte');
    return await safeJsonResponse(res, 'Falha ao remover fonte');
  },

  async getM3uSources(): Promise<{ success: boolean; sources: M3uAutoUpdateSource[]; total: number }> {
    const res = await adminFetch('/api/admin/channels/sources');
    if (!res.ok) throw new Error('Falha ao obter lista de fontes M3U');
    return await safeJsonResponse(res, 'Falha ao obter lista de fontes M3U');
  },

  // SQLite Database Backup, Export & Import
  async downloadDatabaseBackup(filename?: string): Promise<Blob> {
    const query = filename ? `?filename=${encodeURIComponent(filename)}` : '';
    const res = await adminFetch(`/api/admin/database/backup${query}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Falha ao baixar cópia do banco SQLite' }));
      throw new Error(err.error || 'Falha ao baixar cópia do banco SQLite');
    }
    return await res.blob();
  },

  getDatabaseBackupDownloadUrl(filename?: string): string {
    const token = getAdminToken();
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    if (filename) params.set('filename', filename);
    const queryString = params.toString();
    return `/api/admin/database/backup${queryString ? `?${queryString}` : ''}`;
  },

  getDatabaseExportDownloadUrl(filename = 'maxtv.db'): string {
    const token = getAdminToken();
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    if (filename) params.set('filename', filename);
    const queryString = params.toString();
    return `/api/admin/database/export${queryString ? `?${queryString}` : ''}`;
  },

  async importDatabase(
    file: File | Blob,
    onProgress?: (percent: number, message: string) => void
  ): Promise<{ success: boolean; message: string; channelsCount: number; fileSizeBytes?: number; stats?: any }> {
    const totalBytes = file.size;

    // Se o arquivo for maior que 6MB, usa diretamente upload particionado para evitar HTTP 413
    const shouldUseChunks = totalBytes > 6 * 1024 * 1024;

    if (shouldUseChunks) {
      return await this.importDatabaseChunked(file, onProgress);
    }

    // Para arquivos menores (<6MB), tenta upload direto com fallback automático
    try {
      if (onProgress) onProgress(30, 'Enviando arquivo do banco de dados...');
      const headers = getAdminHeaders({
        'Content-Type': 'application/x-sqlite3'
      });
      const res = await fetch('/api/admin/database/import', {
        method: 'POST',
        headers,
        body: file
      });
      const data = await res.json().catch(() => null);
      if (res.status === 413 || (!res.ok && res.status >= 400 && res.status < 500 && data?.code === 'PAYLOAD_TOO_LARGE')) {
        // Fallback automático para particionamento se o proxy rejeitar com 413
        console.warn('[DB IMPORT] Upload direto recebeu HTTP 413. Ativando particionamento automático...');
        return await this.importDatabaseChunked(file, onProgress);
      }
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Falha ao importar banco de dados (HTTP ${res.status})`);
      }
      if (onProgress) onProgress(100, 'Banco de dados restaurado com sucesso!');
      return data;
    } catch (err: any) {
      if (err?.message?.includes('413') || err?.message?.toLowerCase().includes('payload') || err?.message?.toLowerCase().includes('too large')) {
        console.warn('[DB IMPORT] Erro de limite HTTP 413 detectado, ativando particionamento automático:', err);
        return await this.importDatabaseChunked(file, onProgress);
      }
      throw err;
    }
  },

  async importDatabaseChunked(
    file: File | Blob,
    onProgress?: (percent: number, message: string) => void
  ): Promise<{ success: boolean; message: string; channelsCount: number; fileSizeBytes?: number; stats?: any }> {
    const CHUNK_SIZE = 3 * 1024 * 1024; // 3MB por fatia para máxima confiabilidade
    const totalBytes = file.size;
    const totalChunks = Math.max(1, Math.ceil(totalBytes / CHUNK_SIZE));
    const uploadId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fileName = (file as File).name || 'maxtv.db';

    if (onProgress) {
      onProgress(5, `Iniciando upload particionado em ${totalChunks} partes (${(totalBytes / (1024 * 1024)).toFixed(1)} MB)...`);
    }

    let lastResponse: any = null;

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, totalBytes);
      const chunkBlob = file.slice(start, end);

      const percent = Math.min(95, Math.round(((chunkIndex) / totalChunks) * 100));
      if (onProgress) {
        onProgress(
          percent,
          `Enviando parte ${chunkIndex + 1} de ${totalChunks} (${(end / (1024 * 1024)).toFixed(1)} MB / ${(totalBytes / (1024 * 1024)).toFixed(1)} MB)...`
        );
      }

      // Converte fatia para base64
      const chunkDataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.includes(',') ? result.split(',')[1] : result;
          resolve(base64);
        };
        reader.onerror = () => reject(new Error(`Falha ao ler parte ${chunkIndex + 1} do arquivo.`));
        reader.readAsDataURL(chunkBlob);
      });

      const headers = getAdminHeaders({
        'Content-Type': 'application/json'
      });

      const res = await fetch('/api/admin/database/import-chunk', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          uploadId,
          chunkIndex,
          totalChunks,
          fileName,
          fileSizeBytes: totalBytes,
          chunkDataBase64
        })
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Falha ao enviar parte ${chunkIndex + 1} de ${totalChunks} (HTTP ${res.status})`);
      }

      lastResponse = data;
    }

    if (onProgress) {
      onProgress(100, 'Banco de dados restaurado e canais sincronizados!');
    }

    return lastResponse || {
      success: true,
      message: 'Banco de dados importado com sucesso!',
      channelsCount: 0
    };
  },

  async getDatabaseStats(): Promise<{ success: boolean; stats: DatabaseStats }> {
    const res = await adminFetch('/api/admin/database/stats');
    if (!res.ok) throw new Error('Falha ao obter estatísticas do banco de dados');
    return await res.json();
  },

  async testDatabaseWrite(): Promise<{ success: boolean; message: string; latencyMs: number; stats: DatabaseStats }> {
    const res = await adminFetch('/api/admin/database/test-write', { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Falha no teste de escrita' }));
      throw new Error(err.error || 'Falha no teste de escrita');
    }
    return await res.json();
  },

  // Logs de Erros em Requisições de URLs e Persistência SQLite
  async getUrlErrorLogs(limit: number = 100): Promise<{ success: boolean; count: number; logs: UrlSaveErrorEntry[] }> {
    const res = await adminFetch(`/api/admin/logs/url-errors?limit=${limit}`);
    if (!res.ok) throw new Error('Falha ao carregar logs de erros de URLs');
    return await res.json();
  },

  async clearUrlErrorLogs(): Promise<{ success: boolean; message: string }> {
    const res = await adminFetch('/api/admin/logs/url-errors', { method: 'DELETE' });
    if (!res.ok) throw new Error('Falha ao limpar logs de erros de URLs');
    return await res.json();
  },

  // Validação Live de URL M3U no Servidor
  async validateM3uUrl(url: string): Promise<{
    success: boolean;
    valid: boolean;
    error?: string;
    errorType?: string;
    statusCode?: number;
    latencyMs?: number;
    channelsCount?: number;
    contentType?: string;
    sampleChannels?: string[];
    details?: any;
    mismatchesSummary?: ChannelMismatchSummary;
  }> {
    const res = await adminFetch('/api/admin/channels/validate-m3u-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    return await safeJsonResponse(res, 'Falha ao validar URL M3U');
  },

  // Diagnóstico de Inconsistências de Grade e URLs M3U (Detecção de Troca de Grade)
  async checkChannelsMismatches(channelsList?: Channel[]): Promise<ChannelMismatchSummary> {
    if (channelsList && channelsList.length > 0) {
      return analyzeChannelsMismatches(channelsList.map(c => ({ ...c, streamUrl: c.sources[0]?.url || '' })));
    }
    try {
      const res = await adminFetch('/api/admin/channels/check-mismatches', { method: 'GET' });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.summary) {
          return json.summary;
        }
      }
    } catch {}

    // Fallback: Analisa canais em cache local
    const cached = getCachedChannels() || [];
    return analyzeChannelsMismatches(cached.map(c => ({ ...c, streamUrl: c.sources[0]?.url || '' })));
  },

  // Validação Live de URL XMLTV (EPG) no Servidor
  async validateXmltvUrl(url: string): Promise<{
    success: boolean;
    valid: boolean;
    error?: string;
    errorType?: string;
    statusCode?: number;
    latencyMs?: number;
    channelsCount?: number;
    programmesCount?: number;
    timeRange?: {
      earliestStartIso?: string;
      latestStopIso?: string;
      formattedRange?: string;
      durationHours?: number;
    };
    sampleChannels?: Array<{ id: string; name: string; icon?: string }>;
    sampleProgrammes?: Array<{ channelId: string; title: string; start: string; stop: string; desc?: string; category?: string }>;
    fileSizeBytes?: number;
    fileSizeFormatted?: string;
    isGzip?: boolean;
    contentType?: string;
  }> {
    const res = await adminFetch('/api/admin/epg/validate-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    return await safeJsonResponse(res, 'Falha ao validar URL XMLTV');
  },

  async getEpgSources(): Promise<{ success: boolean; sources: any[]; total: number }> {
    const res = await adminFetch('/api/admin/epg/sources');
    return await res.json();
  },

  async saveEpgSource(source: { id?: string; name: string; url: string; enabled?: boolean; priority?: number }): Promise<any> {
    const res = await adminFetch('/api/admin/epg/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(source)
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Falha ao salvar fonte EPG');
    }
    return data;
  },

  async updateEpgSource(id: string, updates: any): Promise<any> {
    const res = await adminFetch(`/api/admin/epg/sources/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Falha ao atualizar fonte EPG');
    }
    return data;
  },

  async deleteEpgSource(id: string): Promise<any> {
    const res = await adminFetch(`/api/admin/epg/sources/${id}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Falha ao excluir fonte EPG');
    }
    return data;
  },

  async syncEpgProgrammes(): Promise<{ success: boolean; message: string; updatedChannelsCount: number; totalChannels: number }> {
    const res = await adminFetch('/api/admin/epg/sync', {
      method: 'POST'
    });
    const data = await safeJsonResponse(res, 'Falha ao sincronizar programação EPG');
    if (!res.ok || !data.success) {
      throw new Error(data.error || data.message || 'Falha ao sincronizar programação EPG');
    }
    return data;
  },

  async runM3uAutoUpdateNow(author?: string): Promise<{ success: boolean; message: string; stats?: any }> {
    const res = await adminFetch('/api/admin/channels/run-auto-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author })
    });
    const data = await safeJsonResponse(res, 'Falha ao executar ciclo de atualização');
    if (!res.ok || !data?.success) {
      throw new Error(data?.error || data?.message || 'Falha ao executar ciclo de atualização');
    }
    return data;
  },

  async getSettings(): Promise<{ success: boolean; settings: SystemSettings }> {
    const res = await adminFetch('/api/admin/settings');
    if (!res.ok) throw new Error('Falha ao carregar configurações');
    return await res.json();
  },

  async updateSettings(settings: Partial<SystemSettings>): Promise<{ success: boolean; settings: SystemSettings }> {
    const res = await adminFetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (!res.ok) throw new Error('Falha ao salvar configurações');
    return await res.json();
  },

  // --- Channel Health Check API ---
  async getChannelHealthStatus(): Promise<{ success: boolean; summary: ChannelHealthSummary; results: ChannelHealthResult[] }> {
    try {
      const res = await adminFetch('/api/admin/channels/health-status');
      if (!res.ok) throw new Error('Falha ao obter status de saúde dos canais');
      return await res.json();
    } catch {
      return {
        success: false,
        summary: { total: 0, tested: 0, online: 0, offline: 0, unstable: 0, untested: 0 },
        results: []
      };
    }
  },

  async checkSingleStream(payload: {
    url: string;
    referer?: string;
    channelId?: string;
    channelName?: string;
    category?: string;
  }): Promise<{ success: boolean; result: ChannelHealthResult; summary?: ChannelHealthSummary }> {
    const res = await adminFetch('/api/admin/channels/check-single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Falha ao verificar stream do canal');
    return await res.json();
  },

  async checkChannelHealth(
    channelId: string, 
    sourceIndex?: number, 
    extraData?: { url?: string; referer?: string; channelName?: string; category?: string; sources?: any[] }
  ): Promise<{ success: boolean; result: ChannelHealthResult; summary?: ChannelHealthSummary }> {
    const res = await adminFetch(`/api/admin/channels/check-channel/${channelId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceIndex: sourceIndex ?? 0,
        ...extraData
      })
    });
    if (!res.ok) throw new Error('Falha ao verificar canal');
    return await res.json();
  },

  async checkBatchChannels(payload: {
    channelIds?: string[];
    channels?: any[];
    limit?: number;
    offset?: number;
    category?: string;
  }): Promise<{ success: boolean; testedCount: number; results: ChannelHealthResult[]; summary: ChannelHealthSummary }> {
    const res = await adminFetch('/api/admin/channels/check-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Falha ao verificar lote de canais');
    return await res.json();
  },

  async toggleChannelActive(channelId: string): Promise<{ success: boolean; channelId: string; isActive: boolean; message: string }> {
    const res = await adminFetch(`/api/admin/channels/${channelId}/toggle-active`, {
      method: 'PATCH'
    });
    if (!res.ok) throw new Error('Falha ao alternar status do canal');
    return await res.json();
  },

  async disableOfflineChannels(): Promise<{ success: boolean; disabledCount: number; message: string }> {
    const res = await adminFetch('/api/admin/channels/disable-offline', {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Falha ao desativar canais offline');
    return await res.json();
  },

  async enableAllChannels(): Promise<{ success: boolean; totalEnabled: number; message: string }> {
    const res = await adminFetch('/api/admin/channels/enable-all', {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Falha ao reativar todos os canais');
    return await res.json();
  },

  // Authentication
  async register(data: { name: string; email: string; password: string; cpf?: string }): Promise<{ success: boolean; user: any; token: string; message?: string }> {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Erro no cadastro' }));
      throw new Error(err.error || 'Erro ao realizar cadastro');
    }
    return await res.json();
  },

  async login(data: { email: string; password: string }): Promise<{ success: boolean; user: any; token: string; message?: string }> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Erro no login' }));
      throw new Error(err.error || 'Erro ao realizar login');
    }
    return await res.json();
  },

  async adminVerify(data: { email: string; password: string }): Promise<{ success: boolean; user: any; token: string; expiresAt?: number; message?: string }> {
    const res = await fetch('/api/auth/admin-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (!res.ok || !result.success) {
      clearAdminToken();
      throw new Error(result.error || result.message || 'Falha na autenticação de administrador');
    }
    if (result.token) {
      setAdminToken(result.token);
    }
    return result;
  },

  // Robust Admin Session Verification
  async verifyAdminSession(token?: string): Promise<{ success: boolean; valid: boolean; user?: any; expiresAt?: number; error?: string }> {
    try {
      const activeToken = token || getAdminToken();
      if (!activeToken) {
        return { success: false, valid: false, error: 'Nenhum token de administrador encontrado.' };
      }
      const res = await fetch('/api/auth/verify-admin-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeToken}`,
          'x-admin-token': activeToken
        },
        body: JSON.stringify({ token: activeToken })
      });
      const data = await res.json();
      if (res.ok && data.valid && data.user?.role === 'admin') {
        if (data.token) {
          setAdminToken(data.token);
        }
        return { success: true, valid: true, user: data.user, expiresAt: data.expiresAt };
      }
      clearAdminToken();
      return { success: false, valid: false, error: data.error || 'Sessão de administrador inválida ou não autorizada.' };
    } catch (err: any) {
      return { success: false, valid: false, error: err.message || 'Erro de conexão ao verificar sessão.' };
    }
  },

  // Admin Logout
  async adminLogout(token?: string): Promise<void> {
    try {
      const activeToken = token || getAdminToken();
      if (activeToken) {
        await fetch('/api/auth/admin-logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${activeToken}`,
            'x-admin-token': activeToken
          },
          body: JSON.stringify({ token: activeToken })
        });
      }
    } catch {}
    clearAdminToken();
  },

  async getMe(token?: string, email?: string): Promise<{ success: boolean; user: any }> {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const url = email ? `/api/auth/me?email=${encodeURIComponent(email)}` : '/api/auth/me';
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error('Sessão expirada ou não autenticado');
    return await res.json();
  },

  async logout(): Promise<{ success: boolean }> {
    const res = await fetch('/api/auth/logout', { method: 'POST' });
    return await res.json();
  },

  async sessionHeartbeat(payload: {
    sessionId: string;
    mediaId: string;
    mediaType: 'channel' | 'vod';
    isVip: boolean;
    deltaSeconds: number;
    userEmail?: string;
    resetCycle?: boolean;
  }): Promise<{
    success: boolean;
    totalWatchSeconds: number;
    isLimitExceeded: boolean;
    remainingSeconds?: number;
  }> {
    const res = await fetch('/api/session/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Falha no heartbeat de sessão');
    return await res.json();
  },

  async getAuditLogs(limit = 100, type?: string, search?: string): Promise<{ success: boolean; count: number; logs: AuditLogEntry[] }> {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (type && type !== 'ALL') params.set('type', type);
    if (search) params.set('search', search);
    const token = getAdminToken();
    const res = await fetch(`/api/admin/audit-logs?${params.toString()}`, {
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    });
    if (!res.ok) throw new Error('Falha ao obter logs de auditoria');
    return await res.json();
  },

  async clearAuditLogs(adminEmail?: string, adminName?: string): Promise<{ success: boolean; message: string }> {
    const token = getAdminToken();
    const res = await fetch('/api/admin/audit-logs', {
      method: 'DELETE',
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(adminEmail ? { 'x-admin-email': adminEmail } : {}),
        ...(adminName ? { 'x-admin-name': adminName } : {})
      }
    });
    if (!res.ok) throw new Error('Falha ao limpar logs de auditoria');
    return await res.json();
  },

  async getRealtimeMetrics(): Promise<{ success: boolean; data: RealtimeDashboardData }> {
    const token = getAdminToken();
    const res = await fetch('/api/admin/realtime-metrics', {
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    });
    if (!res.ok) throw new Error('Falha ao obter métricas em tempo real');
    return await res.json();
  },

  // EPG - Electronic Program Guide com Gemini AI
  async getEpgSchedule(params?: {
    channelId?: string;
    category?: string;
    date?: string;
  }): Promise<{
    success: boolean;
    schedules: ChannelEpgSchedule[];
    timestamp: string;
    totalChannels: number;
    currentTimeFormatted: string;
  }> {
    const query = new URLSearchParams();
    if (params?.channelId) query.set('channelId', params.channelId);
    if (params?.category && params.category !== 'Todos') query.set('category', params.category);
    if (params?.date) query.set('date', params.date);

    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetch(`/api/epg/schedule${qs}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Falha ao carregar guia EPG' }));
      throw new Error(err.error || 'Falha ao carregar grade EPG');
    }
    return await res.json();
  },

  async enrichEpgProgramWithGemini(payload: {
    programTitle: string;
    channelName?: string;
    category?: string;
    currentDescription?: string;
  }): Promise<EpgEnrichResponse> {
    const res = await fetch('/api/epg/enrich', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Falha na resposta do Gemini para EPG' }));
      throw new Error(err.error || 'Falha ao gerar sinopse com IA');
    }
    return await res.json();
  }
};
