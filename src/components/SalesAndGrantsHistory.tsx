import React, { useState, useMemo } from 'react';
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
  ChevronRight
} from 'lucide-react';
import { VipGrant, PixTransaction } from '../types';

interface SalesAndGrantsHistoryProps {
  grantsHistory: VipGrant[];
  transactions: PixTransaction[];
  onApproveTransaction: (id: string) => void;
  onOpenGrantModal: () => void;
  onRefreshData?: () => void;
}

type UnifiedEntryType = 'sale' | 'grant';

interface UnifiedEntry {
  id: string;
  type: UnifiedEntryType;
  timestamp: string;
  dateObj: Date;
  subscriberName: string;
  subscriberEmail: string;
  title: string;
  details: string;
  amountOrPeriod: string;
  status: 'approved' | 'pending' | 'active';
  responsibleOrGateway: string;
  originalData: VipGrant | PixTransaction;
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

  // Unificação dos registros em uma linha do tempo única
  const unifiedEntries = useMemo(() => {
    const list: UnifiedEntry[] = [];

    // Mapear Transações PIX
    transactions.forEach(tx => {
      const date = new Date(tx.createdAt);
      list.push({
        id: tx.id,
        type: 'sale',
        timestamp: tx.createdAt,
        dateObj: date,
        subscriberName: tx.subscriberName || 'Cliente Anônimo',
        subscriberEmail: tx.subscriberEmail || '—',
        title: `Venda PIX: ${tx.planName || 'Plano'}`,
        details: `Cobrança gerada via Mercado Pago PIX (${tx.id})`,
        amountOrPeriod: `R$ ${tx.amount.toFixed(2).replace('.', ',')}`,
        status: tx.status === 'approved' ? 'approved' : 'pending',
        responsibleOrGateway: 'Mercado Pago PIX',
        originalData: tx
      });
    });

    // Mapear Liberações de Acesso
    grantsHistory.forEach(grant => {
      const date = new Date(grant.grantedAt);
      list.push({
        id: grant.id,
        type: 'grant',
        timestamp: grant.grantedAt,
        dateObj: date,
        subscriberName: grant.subscriberName || 'Assinante',
        subscriberEmail: grant.subscriberEmail || '—',
        title: `Liberação VIP: +${grant.monthsGranted} mês(es)`,
        details: grant.reason ? `Motivo: ${grant.reason}` : 'Concessão direta do administrador',
        amountOrPeriod: `+${grant.monthsGranted} Mês (${grant.daysGranted}d)`,
        status: 'active',
        responsibleOrGateway: grant.grantedBy || 'Administrador',
        originalData: grant
      });
    });

    // Ordenar cronologicamente: mais recentes primeiro
    return list.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());
  }, [transactions, grantsHistory]);

  // Cálculos de KPIs comerciais
  const metrics = useMemo(() => {
    const approvedSales = transactions.filter(t => t.status === 'approved');
    const pendingSales = transactions.filter(t => t.status === 'pending');
    const totalSalesRevenue = approvedSales.reduce((acc, t) => acc + t.amount, 0);
    const pendingSalesRevenue = pendingSales.reduce((acc, t) => acc + t.amount, 0);

    return {
      totalApprovedSales: approvedSales.length,
      totalRevenue: totalSalesRevenue,
      pendingCount: pendingSales.length,
      pendingRevenue: pendingSalesRevenue,
      totalGrants: grantsHistory.length,
      totalEntries: transactions.length + grantsHistory.length
    };
  }, [transactions, grantsHistory]);

  // Filtro por texto e tipo
  const filteredEntries = useMemo(() => {
    return unifiedEntries.filter(entry => {
      // Filtro de tipo
      if (filterType === 'sales' && entry.type !== 'sale') return false;
      if (filterType === 'grants' && entry.type !== 'grant') return false;
      if (filterType === 'pending' && entry.status !== 'pending') return false;

      // Filtro de busca textual
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        entry.subscriberName.toLowerCase().includes(q) ||
        entry.subscriberEmail.toLowerCase().includes(q) ||
        entry.title.toLowerCase().includes(q) ||
        entry.details.toLowerCase().includes(q) ||
        entry.id.toLowerCase().includes(q) ||
        entry.responsibleOrGateway.toLowerCase().includes(q)
      );
    });
  }, [unifiedEntries, filterType, searchQuery]);

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

      {/* Barra de Filtros & Busca */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Segmented Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-slate-950 border border-white/5">
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filterType === 'all'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Todos ({metrics.totalEntries})
          </button>

          <button
            type="button"
            onClick={() => setFilterType('sales')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filterType === 'sales'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Vendas PIX ({transactions.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterType('grants')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filterType === 'grants'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Gift className="w-3.5 h-3.5" />
            <span>Liberações VIP ({grantsHistory.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterType('pending')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filterType === 'pending'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Pendentes ({metrics.pendingCount})</span>
          </button>
        </div>

        {/* Input de Busca */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 absolute left-3.5 top-3 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar por cliente, e-mail, plano ou ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Tabela Unificada de Registros */}
      <div className="overflow-x-auto rounded-3xl border border-white/10 bg-slate-900 shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] font-semibold border-b border-white/10">
            <tr>
              <th className="p-4">Tipo & Registro</th>
              <th className="p-4">Assinante / Cliente</th>
              <th className="p-4">Detalhes / Plano</th>
              <th className="p-4">Valor / Período</th>
              <th className="p-4">Data & Horário</th>
              <th className="p-4">Status</th>
              <th className="p-4 text-right">Ação / Responsável</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredEntries.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-12 text-center text-slate-500 space-y-2">
                  <History className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-sm font-semibold text-slate-400">Nenhum registro localizado</p>
                  <p className="text-xs text-slate-500">Tente ajustar seus termos de pesquisa ou filtros selecionados.</p>
                </td>
              </tr>
            ) : (
              filteredEntries.map(entry => {
                const isSale = entry.type === 'sale';
                return (
                  <tr key={`${entry.type}-${entry.id}`} className="hover:bg-white/5 transition-colors">
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
                        {entry.dateObj.toLocaleDateString('pt-BR')}
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {entry.dateObj.toLocaleTimeString('pt-BR')}
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
                          className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition-all inline-flex items-center gap-1"
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
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
