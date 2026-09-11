// Web Worker dedicado ao processamento, unificação, filtragem e agregação de métricas
// do Histórico Completo de Vendas PIX e Liberações VIP do Painel Administrativo.
// Executado em thread secundária para evitar bloqueio da thread principal (UI).

export interface WorkerHistoryInput {
  transactions: any[];
  grantsHistory: any[];
  filterType: 'all' | 'sales' | 'grants' | 'pending';
  searchQuery: string;
  selectedDate: string;
  datePreset: 'all' | 'today' | '7days' | '30days';
}

export interface WorkerUnifiedEntry {
  id: string;
  type: 'sale' | 'grant';
  timestamp: string;
  timestampMs: number;
  subscriberName: string;
  subscriberEmail: string;
  title: string;
  details: string;
  amountOrPeriod: string;
  status: 'approved' | 'pending' | 'active';
  responsibleOrGateway: string;
  originalData: any;
  dateFormattedPtBr: string;
  timeFormattedPtBr: string;
  dateIsoDateOnly: string;
}

export interface WorkerHistoryMetrics {
  totalApprovedSales: number;
  totalRevenue: number;
  pendingCount: number;
  pendingRevenue: number;
  totalGrants: number;
  totalEntries: number;
}

export interface WorkerHistoryOutput {
  unifiedEntries: WorkerUnifiedEntry[];
  filteredEntries: WorkerUnifiedEntry[];
  metrics: WorkerHistoryMetrics;
}

self.onmessage = (event: MessageEvent<WorkerHistoryInput>) => {
  const { transactions, grantsHistory, filterType, searchQuery, selectedDate, datePreset } = event.data;

  // 1. Unificação dos registros
  const list: WorkerUnifiedEntry[] = [];

  // Mapear Transações PIX
  (transactions || []).forEach(tx => {
    const d = new Date(tx.createdAt || Date.now());
    const timeMs = d.getTime();
    const dateFormatted = d.toLocaleDateString('pt-BR');
    const timeFormatted = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const isoDateOnly = d.toISOString().slice(0, 10);

    const amountNum = typeof tx.amount === 'number' ? tx.amount : parseFloat(tx.amount || '0') || 0;

    list.push({
      id: tx.id || `tx-${timeMs}`,
      type: 'sale',
      timestamp: tx.createdAt || d.toISOString(),
      timestampMs: timeMs,
      subscriberName: tx.subscriberName || 'Cliente Anônimo',
      subscriberEmail: tx.subscriberEmail || '—',
      title: `Venda PIX: ${tx.planName || 'Plano VIP'}`,
      details: `Cobrança gerada via Mercado Pago PIX (${tx.id || 'N/A'})`,
      amountOrPeriod: `R$ ${amountNum.toFixed(2).replace('.', ',')}`,
      status: tx.status === 'approved' ? 'approved' : 'pending',
      responsibleOrGateway: 'Mercado Pago PIX',
      originalData: tx,
      dateFormattedPtBr: dateFormatted,
      timeFormattedPtBr: timeFormatted,
      dateIsoDateOnly: isoDateOnly
    });
  });

  // Mapear Liberações VIP
  (grantsHistory || []).forEach(grant => {
    const d = new Date(grant.grantedAt || Date.now());
    const timeMs = d.getTime();
    const dateFormatted = d.toLocaleDateString('pt-BR');
    const timeFormatted = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const isoDateOnly = d.toISOString().slice(0, 10);

    list.push({
      id: grant.id || `grant-${timeMs}`,
      type: 'grant',
      timestamp: grant.grantedAt || d.toISOString(),
      timestampMs: timeMs,
      subscriberName: grant.subscriberName || 'Assinante',
      subscriberEmail: grant.subscriberEmail || '—',
      title: `Liberação VIP: +${grant.monthsGranted || 1} mês(es)`,
      details: grant.reason ? `Motivo: ${grant.reason}` : 'Concessão direta do administrador',
      amountOrPeriod: `+${grant.monthsGranted || 1} Mês (${grant.daysGranted || 30}d)`,
      status: 'active',
      responsibleOrGateway: grant.grantedBy || 'Administrador',
      originalData: grant,
      dateFormattedPtBr: dateFormatted,
      timeFormattedPtBr: timeFormatted,
      dateIsoDateOnly: isoDateOnly
    });
  });

  // Ordenação cronológica (mais recentes primeiro)
  list.sort((a, b) => b.timestampMs - a.timestampMs);

  // 2. Cálculos de métricas e KPIs
  const approvedSales = (transactions || []).filter(t => t.status === 'approved');
  const pendingSales = (transactions || []).filter(t => t.status === 'pending');
  const totalSalesRevenue = approvedSales.reduce((acc, t) => acc + (typeof t.amount === 'number' ? t.amount : (parseFloat(t.amount) || 0)), 0);
  const pendingSalesRevenue = pendingSales.reduce((acc, t) => acc + (typeof t.amount === 'number' ? t.amount : (parseFloat(t.amount) || 0)), 0);

  const metrics: WorkerHistoryMetrics = {
    totalApprovedSales: approvedSales.length,
    totalRevenue: totalSalesRevenue,
    pendingCount: pendingSales.length,
    pendingRevenue: pendingSalesRevenue,
    totalGrants: (grantsHistory || []).length,
    totalEntries: (transactions || []).length + (grantsHistory || []).length
  };

  // 3. Filtragem de dados
  const now = Date.now();
  const todayIso = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const q = (searchQuery || '').toLowerCase().trim();

  const filtered = list.filter(entry => {
    // Filtro de tipo
    if (filterType === 'sales' && entry.type !== 'sale') return false;
    if (filterType === 'grants' && entry.type !== 'grant') return false;
    if (filterType === 'pending' && entry.status !== 'pending') return false;

    // Filtro de Data Específica (YYYY-MM-DD)
    if (selectedDate) {
      if (entry.dateIsoDateOnly !== selectedDate) {
        return false;
      }
    }

    // Filtro por Presets Rápidos
    if (datePreset === 'today') {
      if (entry.dateIsoDateOnly !== todayIso) return false;
    } else if (datePreset === '7days') {
      if (entry.timestampMs < sevenDaysAgo) return false;
    } else if (datePreset === '30days') {
      if (entry.timestampMs < thirtyDaysAgo) return false;
    }

    // Busca Textual
    if (!q) return true;

    return (
      entry.subscriberEmail.toLowerCase().includes(q) ||
      entry.subscriberName.toLowerCase().includes(q) ||
      entry.dateFormattedPtBr.includes(q) ||
      entry.timeFormattedPtBr.includes(q) ||
      entry.dateIsoDateOnly.includes(q) ||
      entry.id.toLowerCase().includes(q) ||
      entry.title.toLowerCase().includes(q) ||
      entry.details.toLowerCase().includes(q) ||
      entry.responsibleOrGateway.toLowerCase().includes(q) ||
      entry.amountOrPeriod.toLowerCase().includes(q)
    );
  });

  const output: WorkerHistoryOutput = {
    unifiedEntries: list,
    filteredEntries: filtered,
    metrics
  };

  self.postMessage(output);
};
