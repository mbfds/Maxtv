import { Channel, PixTransaction, Subscriber, AdminMetrics, SystemSettings } from '../types';

export const api = {
  // Channels
  async getChannels(): Promise<{ channels: Channel[]; count: number }> {
    try {
      const res = await fetch('/api/channels');
      if (!res.ok) throw new Error('Falha ao carregar canais');
      return await res.json();
    } catch (err) {
      console.warn('API getChannels error, using local fallback:', err);
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

  async deleteChannel(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/admin/channels/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Falha ao remover canal');
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

  async getVodCatalog(): Promise<{ success: boolean; count: number; items: any[] }> {
    try {
      const res = await fetch('/api/vod');
      if (!res.ok) throw new Error('Falha ao obter catálogo VOD');
      return await res.json();
    } catch (err) {
      console.warn('API getVodCatalog error:', err);
      return { success: false, count: 0, items: [] };
    }
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
};
