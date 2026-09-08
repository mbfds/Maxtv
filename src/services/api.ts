import { Channel, PixTransaction, Subscriber, AdminMetrics, SystemSettings, ChannelHealthResult, ChannelHealthSummary, ChannelUpdateHistoryEntry, ChannelsConfigFile, ChannelsConfigResponse, RepoLinksInfo, UnifyGradeStats, M3uImportLogEntry, M3uAutoUpdateConfig } from '../types';

export const api = {
  // Channels
  async getChannels(): Promise<{ channels: Channel[]; count: number }> {
    try {
      const res = await fetch('/api/channels');
      if (!res.ok) throw new Error('Falha ao carregar canais');
      return await res.json();
    } catch {
      return { channels: [], count: 0 };
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

  // Admin
  async getAdminMetrics(): Promise<{ success: boolean; metrics: AdminMetrics }> {
    const res = await fetch('/api/admin/metrics');
    if (!res.ok) throw new Error('Falha ao obter métricas');
    return await res.json();
  },

  async getSubscribers(): Promise<{ success: boolean; subscribers: Subscriber[] }> {
    const res = await fetch('/api/admin/subscribers');
    if (!res.ok) throw new Error('Falha ao listar assinantes');
    return await res.json();
  },

  async addSubscriber(data: Partial<Subscriber> & { days?: number }): Promise<{ success: boolean; subscriber: Subscriber }> {
    const res = await fetch('/api/admin/subscribers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Falha ao cadastrar assinante');
    return await res.json();
  },

  async updateSubscriber(id: string, data: { status?: string; addDays?: number; planName?: string }): Promise<{ success: boolean; subscriber: Subscriber }> {
    const res = await fetch(`/api/admin/subscribers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Falha ao atualizar assinante');
    return await res.json();
  },

  async deleteSubscriber(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/admin/subscribers/${id}`, { method: 'DELETE' });
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
    const res = await fetch('/api/admin/subscribers/grant-months', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Falha ao liberar mês para usuário');
    return await res.json();
  },

  async quickAddMonth(subscriberId: string): Promise<{ success: boolean; message: string; subscriber: Subscriber; grant: any }> {
    const res = await fetch(`/api/admin/subscribers/${subscriberId}/quick-add-month`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Falha ao liberar +1 mês');
    return await res.json();
  },

  async getGrantsHistory(): Promise<{ success: boolean; count: number; grants: any[] }> {
    const res = await fetch('/api/admin/grants');
    if (!res.ok) throw new Error('Falha ao obter histórico de concessões');
    return await res.json();
  },

  async getTransactions(): Promise<{ success: boolean; transactions: PixTransaction[] }> {
    const res = await fetch('/api/admin/transactions');
    if (!res.ok) throw new Error('Falha ao listar transações');
    return await res.json();
  },

  async approveTransaction(id: string): Promise<{ success: boolean; transaction: PixTransaction }> {
    const res = await fetch(`/api/admin/transactions/${id}/approve`, { method: 'POST' });
    if (!res.ok) throw new Error('Falha ao aprovar transação');
    return await res.json();
  },

  async addCustomChannel(data: { name: string; category: string; logo: string; streamUrl: string; referer?: string; isVipOnly?: boolean }): Promise<{ success: boolean; channel: Channel }> {
    const res = await fetch('/api/admin/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Falha ao adicionar canal');
    return await res.json();
  },

  async updateChannel(id: string, data: { name?: string; category?: string; logo?: string; streamUrl?: string; referer?: string; isVipOnly?: boolean }): Promise<{ success: boolean; channel: Channel; message?: string }> {
    const res = await fetch(`/api/admin/channels/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Falha ao atualizar canal');
    return await res.json();
  },

  async deleteChannel(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/admin/channels/${id}`, { method: 'DELETE' });
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

  async syncRamysChannels(): Promise<{ success: boolean; channelsCount: number; vodCount: number; message: string }> {
    const res = await fetch('/api/admin/channels/sync-ramys', { method: 'POST' });
    if (!res.ok) throw new Error('Falha ao sincronizar com Ramys/Iptv-Brasil-2026');
    return await res.json();
  },

  async syncSaimoChannels(): Promise<{ success: boolean; count: number; message: string }> {
    const res = await fetch('/api/admin/channels/sync-saimo', { method: 'POST' });
    if (!res.ok) throw new Error('Falha ao sincronizar com Saimo-TV');
    return await res.json();
  },

  // Channels Configuration File (JSON Editor & Validation)
  async getChannelsConfig(): Promise<ChannelsConfigResponse> {
    try {
      const res = await fetch('/api/admin/channels/config');
      if (!res.ok) throw new Error('Falha ao carregar arquivo de configuração de canais');
      return await res.json();
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
    const res = await fetch('/api/admin/channels/config/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
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
    const res = await fetch('/api/admin/channels/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
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
      const res = await fetch('/api/admin/channels/history');
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
    const res = await fetch('/api/admin/channels/history/clear', { method: 'POST' });
    if (!res.ok) throw new Error('Falha ao limpar histórico');
    return await res.json();
  },

  async syncVodM3U(options?: { m3uUrl?: string; source?: 'both' | 'ramys' | 'saimo' } | string): Promise<{ success: boolean; count: number; moviesCount?: number; seriesCount?: number; message?: string; error?: string }> {
    const payload = typeof options === 'string' ? { m3uUrl: options } : options || {};
    const res = await fetch('/api/admin/vod/sync-m3u', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Falha ao sincronizar catálogo VOD M3U');
    return await res.json();
  },

  async getVodCatalog(): Promise<{ success: boolean; count: number; items: any[] }> {
    try {
      const res = await fetch('/api/vod');
      if (!res.ok) throw new Error('Falha ao obter catálogo VOD');
      return await res.json();
    } catch {
      return { success: false, count: 0, items: [] };
    }
  },

  // Repository Links & M3U8 Unification (IPTV Brasil 2026)
  async getRepoLinksInfo(): Promise<{ success: boolean } & RepoLinksInfo> {
    const res = await fetch('/api/admin/repo-links/info');
    if (!res.ok) throw new Error('Falha ao obter dados do repositório IPTV Brasil 2026');
    return await res.json();
  },

  async getUnifyStats(): Promise<{ success: boolean } & UnifyGradeStats> {
    const res = await fetch('/api/admin/channels/unify-stats');
    if (!res.ok) throw new Error('Falha ao obter estatísticas da grade unificada');
    return await res.json();
  },

  async unifyChannelsNow(author?: string): Promise<{
    success: boolean;
    message: string;
    channelsCount: number;
    mergedChannelsCount: number;
    newChannelsCount: number;
    totalSourcesCount: number;
    durationMs?: number;
  }> {
    const res = await fetch('/api/admin/channels/unify-now', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Falha ao unificar grade de canais');
    }
    return data;
  },

  async importM3uUrl(payload: {
    url: string;
    unifyWithExisting?: boolean;
    author?: string;
    sourceLabel?: string;
  }): Promise<{
    success: boolean;
    message: string;
    channelsCount: number;
    importedCount: number;
    mergedChannelsCount: number;
    newChannelsCount: number;
    totalSourcesCount: number;
    durationMs?: number;
  }> {
    const res = await fetch('/api/admin/channels/import-m3u-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Falha ao importar URL M3U8');
    }
    return data;
  },

  async importM3uContent(payload: {
    content: string;
    fileName?: string;
    unifyWithExisting?: boolean;
    author?: string;
  }): Promise<{
    success: boolean;
    message: string;
    channelsCount: number;
    importedCount: number;
    mergedChannelsCount: number;
    newChannelsCount: number;
    totalSourcesCount: number;
    durationMs?: number;
  }> {
    const res = await fetch('/api/admin/channels/import-m3u-content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Falha ao importar conteúdo M3U8');
    }
    return data;
  },

  async syncRepoLinks(payload: { file: string; customUrl?: string; author?: string }): Promise<{
    success: boolean;
    message: string;
    channelsCount?: number;
    vodCount?: number;
    file?: string;
    durationMs?: number;
    lastUpdate?: ChannelUpdateHistoryEntry;
  }> {
    const res = await fetch('/api/admin/repo-links/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Falha ao sincronizar links do repositório');
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
    const res = await fetch('/api/admin/repo-links/test-host', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host })
    });
    return await res.json();
  },

  // M3U Import Logs & Transparency
  async getM3uImportLogs(): Promise<{ success: boolean; logs: M3uImportLogEntry[]; count: number }> {
    const res = await fetch('/api/admin/channels/import-logs');
    if (!res.ok) throw new Error('Falha ao obter logs de importação');
    return await res.json();
  },

  async clearM3uImportLogs(): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/admin/channels/import-logs', { method: 'DELETE' });
    if (!res.ok) throw new Error('Falha ao limpar histórico de importações');
    return await res.json();
  },

  // M3U Auto-Update Scheduler
  async getM3uAutoUpdateConfig(): Promise<{ success: boolean; config: M3uAutoUpdateConfig }> {
    const res = await fetch('/api/admin/channels/auto-update-config');
    if (!res.ok) throw new Error('Falha ao obter configurações de auto-atualização');
    return await res.json();
  },

  async saveM3uAutoUpdateConfig(payload: Partial<M3uAutoUpdateConfig>): Promise<{ success: boolean; config: M3uAutoUpdateConfig; message: string }> {
    const res = await fetch('/api/admin/channels/auto-update-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Falha ao salvar configurações de auto-atualização');
    }
    return data;
  },

  async runM3uAutoUpdateNow(author?: string): Promise<{ success: boolean; message: string; stats?: any }> {
    const res = await fetch('/api/admin/channels/run-auto-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Falha ao executar ciclo de atualização');
    }
    return data;
  },

  async getSettings(): Promise<{ success: boolean; settings: SystemSettings }> {
    const res = await fetch('/api/admin/settings');
    if (!res.ok) throw new Error('Falha ao carregar configurações');
    return await res.json();
  },

  async updateSettings(settings: Partial<SystemSettings>): Promise<{ success: boolean; settings: SystemSettings }> {
    const res = await fetch('/api/admin/settings', {
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
      const res = await fetch('/api/admin/channels/health-status');
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
    const res = await fetch('/api/admin/channels/check-single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Falha ao verificar stream do canal');
    return await res.json();
  },

  async checkChannelHealth(channelId: string, sourceIndex?: number): Promise<{ success: boolean; result: ChannelHealthResult; summary?: ChannelHealthSummary }> {
    const res = await fetch(`/api/admin/channels/check-channel/${channelId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceIndex: sourceIndex ?? 0 })
    });
    if (!res.ok) throw new Error('Falha ao verificar canal');
    return await res.json();
  },

  async checkBatchChannels(payload: {
    channelIds?: string[];
    limit?: number;
    offset?: number;
    category?: string;
  }): Promise<{ success: boolean; testedCount: number; results: ChannelHealthResult[]; summary: ChannelHealthSummary }> {
    const res = await fetch('/api/admin/channels/check-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Falha ao verificar lote de canais');
    return await res.json();
  },

  async toggleChannelActive(channelId: string): Promise<{ success: boolean; channelId: string; isActive: boolean; message: string }> {
    const res = await fetch(`/api/admin/channels/${channelId}/toggle-active`, {
      method: 'PATCH'
    });
    if (!res.ok) throw new Error('Falha ao alternar status do canal');
    return await res.json();
  },

  async disableOfflineChannels(): Promise<{ success: boolean; disabledCount: number; message: string }> {
    const res = await fetch('/api/admin/channels/disable-offline', {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Falha ao desativar canais offline');
    return await res.json();
  },

  async enableAllChannels(): Promise<{ success: boolean; totalEnabled: number; message: string }> {
    const res = await fetch('/api/admin/channels/enable-all', {
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
    adblockDetected?: boolean;
    resetCycle?: boolean;
  }): Promise<{
    success: boolean;
    totalWatchSeconds: number;
    isLimitExceeded: boolean;
    remainingSeconds?: number;
    adblockBlocked?: boolean;
  }> {
    const res = await fetch('/api/session/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Falha no heartbeat de sessão');
    return await res.json();
  },

  async checkAdShield(): Promise<boolean> {
    try {
      const res = await fetch('/api/ads/telemetry', {
        method: 'GET',
        cache: 'no-store'
      });
      return res.ok;
    } catch {
      return false; // Request was blocked by AdBlocker
    }
  },
};
