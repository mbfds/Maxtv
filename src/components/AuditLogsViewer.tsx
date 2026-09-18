import React, { useState, useEffect, useMemo } from 'react';
import { 
  Shield, Clock, Search, Filter, RefreshCw, Trash2, Download,
  CheckCircle2, AlertCircle, User, Link, DollarSign, Tv, 
  Settings, Server, ArrowUpDown, ChevronDown, ChevronRight, Eye
} from 'lucide-react';
import { AuditLogEntry } from '../types';
import { api } from '../services/api';

interface AuditLogsViewerProps {
  onRefreshTrigger?: () => void;
}

export const AuditLogsViewer: React.FC<AuditLogsViewerProps> = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const fetchLogs = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.getAuditLogs(200, selectedType, searchQuery);
      if (res.success) {
        setLogs(res.logs || []);
      } else {
        setError('Não foi possível carregar os registros de auditoria.');
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar logs.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [selectedType]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLogs();
  };

  const handleClearLogs = async () => {
    if (!confirm('Deseja realmente limpar todos os logs de auditoria? Esta ação será registrada no sistema.')) {
      return;
    }
    setIsClearing(true);
    try {
      const res = await api.clearAuditLogs();
      if (res.success) {
        setFeedback('Histórico de auditoria limpo com sucesso.');
        setTimeout(() => setFeedback(null), 4000);
        fetchLogs();
      }
    } catch (err: any) {
      alert(`Erro ao limpar logs: ${err.message}`);
    } finally {
      setIsClearing(false);
    }
  };

  const handleExportJson = () => {
    try {
      const jsonStr = JSON.stringify(logs, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert('Erro ao exportar logs: ' + err.message);
    }
  };

  // Stats
  const stats = useMemo(() => {
    const total = logs.length;
    const linksCount = logs.filter(l => l.actionType === 'LINKS').length;
    const paymentsCount = logs.filter(l => l.actionType === 'PAYMENTS').length;
    const usersCount = logs.filter(l => l.actionType === 'USERS').length;
    const channelsCount = logs.filter(l => l.actionType === 'CHANNELS').length;
    const settingsCount = logs.filter(l => l.actionType === 'SETTINGS' || l.actionType === 'SYSTEM').length;
    return { total, linksCount, paymentsCount, usersCount, channelsCount, settingsCount };
  }, [logs]);

  // Type badge styling
  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'LINKS':
        return {
          icon: <Link className="w-3.5 h-3.5" />,
          label: 'Links & M3U',
          bg: 'bg-teal-500/15 text-teal-300 border-teal-500/30'
        };
      case 'PAYMENTS':
        return {
          icon: <DollarSign className="w-3.5 h-3.5" />,
          label: 'Pagamento PIX',
          bg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
        };
      case 'USERS':
        return {
          icon: <User className="w-3.5 h-3.5" />,
          label: 'Usuários & VIP',
          bg: 'bg-purple-500/15 text-purple-300 border-purple-500/30'
        };
      case 'CHANNELS':
        return {
          icon: <Tv className="w-3.5 h-3.5" />,
          label: 'Grade de Canais',
          bg: 'bg-amber-500/15 text-amber-300 border-amber-500/30'
        };
      case 'SETTINGS':
        return {
          icon: <Settings className="w-3.5 h-3.5" />,
          label: 'Configurações',
          bg: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
        };
      case 'SYSTEM':
      default:
        return {
          icon: <Server className="w-3.5 h-3.5" />,
          label: 'Sistema',
          bg: 'bg-slate-500/15 text-slate-300 border-slate-500/30'
        };
    }
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-6" id="audit-logs-tab-content">
      {/* Toast Feedback */}
      {feedback && (
        <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl flex items-center gap-2 text-emerald-300 text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/80 p-5 rounded-2xl border border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              Logs de Auditoria Administrativa
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                SQLite Seguro
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Rastreamento de ações críticas com data/hora, detalhes técnicos e identificação do administrador responsável.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchLogs}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-white/10 transition-colors disabled:opacity-50"
            title="Atualizar registros de auditoria"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-400' : ''}`} />
            <span>Atualizar</span>
          </button>

          <button
            type="button"
            onClick={handleExportJson}
            disabled={logs.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-white/10 transition-colors disabled:opacity-50"
            title="Exportar registros como JSON"
          >
            <Download className="w-3.5 h-3.5 text-indigo-400" />
            <span>Exportar</span>
          </button>

          <button
            type="button"
            onClick={handleClearLogs}
            disabled={isClearing || logs.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 rounded-xl text-xs font-semibold border border-rose-500/30 transition-colors disabled:opacity-50"
            title="Limpar todos os logs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Limpar</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-slate-900/60 p-3.5 rounded-xl border border-white/5">
          <span className="text-[11px] text-slate-400 font-medium">Total Gravado</span>
          <p className="text-xl font-black text-white mt-1">{stats.total}</p>
        </div>
        <div className="bg-slate-900/60 p-3.5 rounded-xl border border-teal-500/20">
          <span className="text-[11px] text-teal-400 font-medium flex items-center gap-1">
            <Link className="w-3 h-3" /> Links M3U
          </span>
          <p className="text-xl font-black text-teal-300 mt-1">{stats.linksCount}</p>
        </div>
        <div className="bg-slate-900/60 p-3.5 rounded-xl border border-emerald-500/20">
          <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
            <DollarSign className="w-3 h-3" /> Pagamentos
          </span>
          <p className="text-xl font-black text-emerald-300 mt-1">{stats.paymentsCount}</p>
        </div>
        <div className="bg-slate-900/60 p-3.5 rounded-xl border border-purple-500/20">
          <span className="text-[11px] text-purple-400 font-medium flex items-center gap-1">
            <User className="w-3 h-3" /> Usuários
          </span>
          <p className="text-xl font-black text-purple-300 mt-1">{stats.usersCount}</p>
        </div>
        <div className="bg-slate-900/60 p-3.5 rounded-xl border border-amber-500/20">
          <span className="text-[11px] text-amber-400 font-medium flex items-center gap-1">
            <Tv className="w-3 h-3" /> Grade Canais
          </span>
          <p className="text-xl font-black text-amber-300 mt-1">{stats.channelsCount}</p>
        </div>
        <div className="bg-slate-900/60 p-3.5 rounded-xl border border-cyan-500/20">
          <span className="text-[11px] text-cyan-400 font-medium flex items-center gap-1">
            <Settings className="w-3 h-3" /> Configurações
          </span>
          <p className="text-xl font-black text-cyan-300 mt-1">{stats.settingsCount}</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900/60 p-4 rounded-2xl border border-white/10 flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Category Pills */}
        <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
          {[
            { id: 'ALL', label: 'Todos' },
            { id: 'LINKS', label: 'Links & M3U' },
            { id: 'PAYMENTS', label: 'Pagamentos' },
            { id: 'USERS', label: 'Usuários' },
            { id: 'CHANNELS', label: 'Canais' },
            { id: 'SETTINGS', label: 'Configurações' },
            { id: 'SYSTEM', label: 'Sistema' }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedType(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                selectedType === tab.id
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'bg-slate-800/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-white/5'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <form onSubmit={handleSearchSubmit} className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por ação, admin ou ID..."
            className="w-full bg-slate-950 border border-white/10 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => { setSearchQuery(''); fetchLogs(); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
            >
              ✕
            </button>
          )}
        </form>
      </div>

      {/* Logs Table / Cards */}
      <div className="bg-slate-900/70 rounded-2xl border border-white/10 overflow-hidden">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
            <span className="text-xs">Carregando logs de auditoria...</span>
          </div>
        ) : error ? (
          <div className="py-16 text-center text-rose-400 flex flex-col items-center gap-2">
            <AlertCircle className="w-6 h-6" />
            <span className="text-xs">{error}</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center text-slate-400 flex flex-col items-center gap-3">
            <Shield className="w-8 h-8 text-slate-600" />
            <p className="text-sm font-semibold text-slate-300">Nenhum registro de auditoria encontrado</p>
            <p className="text-xs text-slate-500 max-w-md">
              Ações críticas como criação/edição de fontes M3U, aprovação de pagamentos PIX, concessão de VIP e configurações do sistema aparecerão aqui automaticamente.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {logs.map((log) => {
              const badge = getTypeBadge(log.actionType);
              const isExpanded = expandedLogId === log.id;
              const hasDetails = log.details && Object.keys(log.details).length > 0;

              return (
                <div 
                  key={log.id} 
                  className="p-4 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    {/* Left: Category Badge & Description */}
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`shrink-0 px-2.5 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 ${badge.bg}`}>
                        {badge.icon}
                        <span>{badge.label}</span>
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold text-white">
                            {log.actionName}
                          </span>
                          {log.targetId && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-white/5">
                              ID: {log.targetId}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-300 mt-0.5 break-words">
                          {log.description}
                        </p>
                      </div>
                    </div>

                    {/* Right: Admin Identification & Timestamp */}
                    <div className="flex items-center gap-4 text-xs text-slate-400 shrink-0">
                      {/* Admin Info */}
                      <div className="flex items-center gap-2 bg-slate-950/60 px-2.5 py-1 rounded-lg border border-white/5">
                        <User className="w-3.5 h-3.5 text-indigo-400" />
                        <div className="text-right">
                          <span className="text-[11px] font-semibold text-slate-200 block">
                            {log.adminName || 'Administrador'}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono block">
                            {log.adminEmail || 'admin@sistema'}
                          </span>
                        </div>
                      </div>

                      {/* Timestamp */}
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span>{formatDate(log.timestamp)}</span>
                      </div>

                      {/* Expand Button for details */}
                      {hasDetails && (
                        <button
                          type="button"
                          onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                          className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                          title="Ver detalhes técnicos"
                        >
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded Technical Details */}
                  {isExpanded && hasDetails && (
                    <div className="mt-3 pt-3 border-t border-white/5 bg-slate-950/40 p-3 rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-semibold text-slate-400">Metadados e Payload da Ação:</span>
                        {(log as any).ipAddress && (
                          <span className="text-[10px] font-mono text-slate-500">IP: {(log as any).ipAddress}</span>
                        )}
                      </div>
                      <pre className="text-[11px] font-mono text-indigo-300 bg-slate-950 p-2.5 rounded-lg border border-white/5 overflow-x-auto">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
