import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  History, 
  CreditCard, 
  Gift, 
  Search, 
  Filter, 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  ArrowUpRight, 
  Calendar, 
  User, 
  DollarSign, 
  Check, 
  Sparkles, 
  ChevronRight,
  X,
  RefreshCw,
  SlidersHorizontal,
  Mail,
  Cpu
} from 'lucide-react';
import { TableVirtuoso } from 'react-virtuoso';
import { VipGrant, PixTransaction } from '../types';
import { WorkerUnifiedEntry, WorkerHistoryMetrics, WorkerHistoryOutput } from '../workers/historyWorker';

interface SalesAndGrantsHistoryProps {
  grantsHistory: VipGrant[];
  transactions: PixTransaction[];
  onApproveTransaction: (id: string) => void;
  onOpenGrantModal: () => void;
  onRefreshData?: () => void;
}

export const SalesAndGrantsHistory: React.FC<SalesAndGrantsHistoryProps> = ({
  grantsHistory,
  transactions,
  onApproveTransaction,
  onOpenGrantModal,
  onRefreshData
}) => {
  const [filterType, setFilterType] = useState<'all' | 'sales' | 'grants' | 'pending'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [datePreset, setDatePreset] = useState<'all' | 'today' | '7days' | '30days'>('all');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Worker ref
  const workerRef = useRef<Worker | null>(null);

  // Estado dos dados calculados via Web Worker
  const [workerData, setWorkerData] = useState<WorkerHistoryOutput>({
    unifiedEntries: [],
    filteredEntries: [],
    metrics: {
      totalApprovedSales: 0,
      totalRevenue: 0,
      pendingCount: 0,
      pendingRevenue: 0,
      totalGrants: 0,
      totalEntries: 0
    }
  });

  // Inicialização do Web Worker
  useEffect(() => {
    if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
      try {
        const worker = new Worker(new URL('../workers/historyWorker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (event: MessageEvent<WorkerHistoryOutput>) => {
          setWorkerData(event.data);
          setIsProcessing(false);
        };
        workerRef.current = worker;

        return () => {
          worker.terminate();
        };
      } catch (err) {
        console.warn('Web Worker não pôde ser iniciado diretamente, usando fallback síncrono', err);
      }
    }
  }, []);

  // Sincronização via Worker ou fallback síncrono
  useEffect(() => {
    setIsProcessing(true);
    if (workerRef.current) {
      workerRef.current.postMessage({
        transactions,
        grantsHistory,
        filterType,
        searchQuery,
        selectedDate,
        datePreset
      });
    } else {
      // Fallback síncrono caso Worker falhe ou esteja desabilitado no ambiente
      const list: WorkerUnifiedEntry[] = [];
      (transactions || []).forEach(tx => {
        const d = new Date(tx.createdAt || Date.now());
        const timeMs = d.getTime();
        list.push({
          id: tx.id || `tx-${timeMs}`,
          type: 'sale',
          timestamp: tx.createdAt || d.toISOString(),
          timestampMs: timeMs,
          subscriberName: tx.subscriberName || 'Cliente Anônimo',
          subscriberEmail: tx.subscriberEmail || '—',
          title: `Venda PIX: ${tx.planName || 'Plano VIP'}`,
          details: `Cobrança gerada via Mercado Pago PIX (${tx.id || 'N/A'})`,
          amountOrPeriod: `R$ ${(typeof tx.amount === 'number' ? tx.amount : 0).toFixed(2).replace('.', ',')}`,
          status: tx.status === 'approved' ? 'approved' : 'pending',
          responsibleOrGateway: 'Mercado Pago PIX',
          originalData: tx,
          dateFormattedPtBr: d.toLocaleDateString('pt-BR'),
          timeFormattedPtBr: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          dateIsoDateOnly: d.toISOString().slice(0, 10)
        });
      });

      (grantsHistory || []).forEach(grant => {
        const d = new Date(grant.grantedAt || Date.now());
        const timeMs = d.getTime();
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
          dateFormattedPtBr: d.toLocaleDateString('pt-BR'),
          timeFormattedPtBr: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          dateIsoDateOnly: d.toISOString().slice(0, 10)
        });
      });

      list.sort((a, b) => b.timestampMs - a.timestampMs);

      const approvedSales = (transactions || []).filter(t => t.status === 'approved');
      const pendingSales = (transactions || []).filter(t => t.status === 'pending');
      const totalSalesRevenue = approvedSales.reduce((acc, t) => acc + (t.amount || 0), 0);
      const pendingSalesRevenue = pendingSales.reduce((acc, t) => acc + (t.amount || 0), 0);

      const metrics: WorkerHistoryMetrics = {
        totalApprovedSales: approvedSales.length,
        totalRevenue: totalSalesRevenue,
        pendingCount: pendingSales.length,
        pendingRevenue: pendingSalesRevenue,
        totalGrants: (grantsHistory || []).length,
        totalEntries: (transactions || []).length + (grantsHistory || []).length
      };

      const now = Date.now();
      const todayIso = new Date().toISOString().slice(0, 10);
      const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
      const q = (searchQuery || '').toLowerCase().trim();

      const filtered = list.filter(entry => {
        if (filterType === 'sales' && entry.type !== 'sale') return false;
        if (filterType === 'grants' && entry.type !== 'grant') return false;
        if (filterType === 'pending' && entry.status !== 'pending') return false;
        if (selectedDate && entry.dateIsoDateOnly !== selectedDate) return false;
        if (datePreset === 'today' && entry.dateIsoDateOnly !== todayIso) return false;
        if (datePreset === '7days' && entry.timestampMs < sevenDaysAgo) return false;
        if (datePreset === '30days' && entry.timestampMs < thirtyDaysAgo) return false;
        if (!q) return true;
        return (
          entry.subscriberEmail.toLowerCase().includes(q) ||
          entry.subscriberName.toLowerCase().includes(q) ||
          entry.dateFormattedPtBr.includes(q) ||
          entry.timeFormattedPtBr.includes(q) ||
          entry.id.toLowerCase().includes(q) ||
          entry.title.toLowerCase().includes(q) ||
          entry.details.toLowerCase().includes(q)
        );
      });

      setWorkerData({
        unifiedEntries: list,
        filteredEntries: filtered,
        metrics
      });
      setIsProcessing(false);
    }
  }, [transactions, grantsHistory, filterType, searchQuery, selectedDate, datePreset]);

  const { filteredEntries, metrics } = workerData;

  const hasActiveFilters = filterType !== 'all' || searchQuery.trim() !== '' || selectedDate !== '' || datePreset !== 'all';

  const handleResetFilters = () => {
    setFilterType('all');
    setSearchQuery('');
    setSelectedDate('');
    setDatePreset('all');
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-400" />
            <span>Histórico Completo (Liberações & Vendas)</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Registro unificado de vendas PIX aprovadas, pendências e concessões manuais de acesso VIP
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenGrantModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 transition-all self-start sm:self-auto"
        >
          <Gift className="w-4 h-4" />
          <span>Liberar Novo Mês / VIP</span>
        </button>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Vendas PIX */}
        <div className="p-5 rounded-3xl bg-slate-900 border border-white/10 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Vendas PIX Aprovadas</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white">
            R$ {metrics.totalRevenue.toFixed(2).replace('.', ',')}
          </div>
          <p className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5" />
            <span>{metrics.totalApprovedSales} transações confirmadas</span>
          </p>
        </div>

        {/* Card 2: PIX Pendentes */}
        <div className={`p-5 rounded-3xl border space-y-2 transition-all ${
          metrics.pendingCount > 0 
            ? 'bg-amber-950/20 border-amber-500/30' 
            : 'bg-slate-900 border-white/10'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">PIX Aguardando Aprovação</span>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
              metrics.pendingCount > 0 ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-400'
            }`}>
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white">
            {metrics.pendingCount}
          </div>
          <p className="text-[11px] text-amber-400 font-medium">
            {metrics.pendingCount > 0 
              ? `R$ ${metrics.pendingRevenue.toFixed(2).replace('.', ',')} a conferir` 
              : 'Nenhum pagamento pendente'}
          </p>
        </div>

        {/* Card 3: Liberações Manuais VIP */}
        <div className="p-5 rounded-3xl bg-slate-900 border border-white/10 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Liberações VIP Manuais</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Gift className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white">
            {metrics.totalGrants}
          </div>
          <p className="text-[11px] text-indigo-400 font-medium">
            Concessões diretas do admin
          </p>
        </div>

        {/* Card 4: Total de Movimentações */}
        <div className="p-5 rounded-3xl bg-slate-900 border border-white/10 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Total de Registros</span>
            <div className="w-8 h-8 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center">
              <History className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white">
            {metrics.totalEntries}
          </div>
          <p className="text-[11px] text-teal-400 font-medium">
            Auditoria comercial completa
          </p>
        </div>
      </div>

      {/* Barra de Filtros & Busca Unificada */}
      <div className="p-4 rounded-3xl bg-slate-900 border border-white/10 space-y-3.5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Segmented Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-2xl bg-slate-950 border border-white/5 shrink-0">
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                filterType === 'all'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Todos ({metrics.totalEntries})
            </button>

            <button
              type="button"
              onClick={() => setFilterType('sales')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                filterType === 'sales'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Vendas PIX ({transactions.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setFilterType('grants')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                filterType === 'grants'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Gift className="w-3.5 h-3.5" />
              <span>Liberações VIP ({grantsHistory.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setFilterType('pending')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                filterType === 'pending'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Pendentes ({metrics.pendingCount})</span>
            </button>
          </div>

          {/* Inputs de Busca por Email / Texto e Seletor de Data */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 max-w-2xl">
            {/* Input de Busca Textual (Email, Nome, ID, etc.) */}
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-3.5 top-3 text-slate-500" />
              <input
                type="text"
                placeholder="Buscar por e-mail ou data (ex: cebolao1302@gmail.com ou 11/09/2026)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300 p-0.5"
                  title="Limpar busca"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filtro por Data Específica (Date Picker) */}
            <div className="relative shrink-0 flex items-center">
              <div className="relative">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    setSelectedDate(e.target.value);
                    if (e.target.value) setDatePreset('all');
                  }}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  title="Filtrar por data específica"
                />
                {selectedDate && (
                  <button
                    type="button"
                    onClick={() => setSelectedDate('')}
                    className="absolute -right-2 -top-2 w-5 h-5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center border border-white/10"
                    title="Remover filtro de data"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Linha Secundária: Presets de Data Rápidos & Contador / Reset */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/5 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500 mr-1 flex items-center gap-1">
              <Calendar className="w-3 h-3 text-slate-400" />
              <span>Período:</span>
            </span>

            <button
              type="button"
              onClick={() => { setDatePreset('all'); setSelectedDate(''); }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                datePreset === 'all' && !selectedDate
                  ? 'bg-white/15 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              Todas as datas
            </button>

            <button
              type="button"
              onClick={() => { setDatePreset('today'); setSelectedDate(''); }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                datePreset === 'today'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              Hoje
            </button>

            <button
              type="button"
              onClick={() => { setDatePreset('7days'); setSelectedDate(''); }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                datePreset === '7days'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              Últimos 7 dias
            </button>

            <button
              type="button"
              onClick={() => { setDatePreset('30days'); setSelectedDate(''); }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                datePreset === '30days'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              Últimos 30 dias
            </button>
          </div>

          <div className="flex items-center gap-3">
            {isProcessing && (
              <span className="inline-flex items-center gap-1 text-[11px] text-teal-400 font-medium animate-pulse">
                <Cpu className="w-3.5 h-3.5 animate-spin" />
                <span>Processando Worker...</span>
              </span>
            )}

            <span className="text-[11px] text-slate-400 font-medium">
              Mostrando <strong className="text-white">{filteredEntries.length}</strong> de {metrics.totalEntries} registros
            </span>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 font-bold px-2 py-0.5 rounded-md hover:bg-amber-950/30 transition-colors cursor-pointer"
              >
                <X className="w-3 h-3" />
                <span>Limpar filtros</span>
              </button>
            )}

            {onRefreshData && (
              <button
                type="button"
                onClick={onRefreshData}
                className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                title="Recarregar registros"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabela Virtualizada de Registros (React Virtuoso com zero lag de DOM) */}
      <div className="rounded-3xl border border-white/10 bg-slate-900 shadow-sm overflow-hidden">
        {filteredEntries.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-2">
            <History className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-sm font-semibold text-slate-400">Nenhum registro localizado</p>
            <p className="text-xs text-slate-500">Tente ajustar seus termos de pesquisa ou filtros selecionados.</p>
          </div>
        ) : (
          <TableVirtuoso
            style={{ height: '620px', width: '100%' }}
            data={filteredEntries}
            fixedHeaderContent={() => (
              <tr className="bg-slate-950 text-slate-400 uppercase text-[10px] font-semibold border-b border-white/10 select-none shadow-md">
                <th className="p-4 bg-slate-950 w-44">Tipo & Registro</th>
                <th className="p-4 bg-slate-950">Assinante / Cliente</th>
                <th className="p-4 bg-slate-950">Detalhes / Plano</th>
                <th className="p-4 bg-slate-950">Valor / Período</th>
                <th className="p-4 bg-slate-950">Data & Horário</th>
                <th className="p-4 bg-slate-950">Status</th>
                <th className="p-4 bg-slate-950 text-right">Ação / Responsável</th>
              </tr>
            )}
            itemContent={(_index, entry) => {
              const isSale = entry.type === 'sale';
              return (
                <>
                  {/* Tipo & Badge */}
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <span className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
                        isSale 
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                          : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                      }`}>
                        {isSale ? <CreditCard className="w-3.5 h-3.5" /> : <Gift className="w-3.5 h-3.5" />}
                      </span>
                      <div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isSale 
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/30' 
                            : 'bg-purple-950 text-purple-300 border border-purple-500/30'
                        }`}>
                          {isSale ? 'Venda PIX' : 'Liberação VIP'}
                        </span>
                        <span className="block text-[10px] font-mono text-slate-500 mt-0.5">
                          {entry.id.slice(0, 16)}
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* Assinante */}
                  <td className="p-4">
                    <span className="font-semibold text-white block">{entry.subscriberName}</span>
                    <span className="text-slate-400 text-[11px] font-mono">{entry.subscriberEmail}</span>
                  </td>

                  {/* Detalhes / Plano */}
                  <td className="p-4">
                    <span className="text-slate-200 font-medium block">{entry.title}</span>
                    <span className="text-slate-400 text-[11px]">{entry.details}</span>
                  </td>

                  {/* Valor / Período */}
                  <td className="p-4">
                    <span className={`text-sm font-bold ${isSale ? 'text-emerald-400' : 'text-purple-400'}`}>
                      {entry.amountOrPeriod}
                    </span>
                  </td>

                  {/* Data & Horário */}
                  <td className="p-4 text-slate-400 whitespace-nowrap">
                    <span className="block text-slate-300">
                      {entry.dateFormattedPtBr}
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {entry.timeFormattedPtBr}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="p-4">
                    {entry.status === 'approved' && (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 w-fit">
                        <CheckCircle className="w-3 h-3 text-emerald-400" />
                        <span>Aprovado</span>
                      </span>
                    )}
                    {entry.status === 'pending' && (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-500/30 flex items-center gap-1 w-fit animate-pulse">
                        <Clock className="w-3 h-3 text-amber-400" />
                        <span>Pendente</span>
                      </span>
                    )}
                    {entry.status === 'active' && (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-500/30 flex items-center gap-1 w-fit">
                        <Sparkles className="w-3 h-3 text-purple-400" />
                        <span>VIP Concedido</span>
                      </span>
                    )}
                  </td>

                  {/* Ação ou Responsável */}
                  <td className="p-4 text-right">
                    {isSale && entry.status === 'pending' ? (
                      <button
                        type="button"
                        onClick={() => onApproveTransaction(entry.id)}
                        className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition-all inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Aprovar PIX</span>
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-400 font-medium px-2 py-1 rounded-lg bg-white/5 border border-white/5">
                        {entry.responsibleOrGateway}
                      </span>
                    )}
                  </td>
                </>
              );
            }}
            components={{
              Table: (props) => <table {...props} className="w-full text-left text-xs border-collapse" />,
              TableRow: (props) => <tr {...props} className="hover:bg-white/5 transition-colors border-b border-white/5" />
            }}
          />
        )}
      </div>
    </div>
  );
};
