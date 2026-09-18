import React, { useState, useEffect } from 'react';
import { 
  History, CheckCircle2, AlertCircle, RefreshCw, Trash2, 
  Search, Filter, Clock, Tv, FileCode, ArrowUpRight, 
  Sparkles, ShieldCheck, User, Calendar, GitBranch
} from 'lucide-react';
import { api } from '../services/api';
import { ChannelUpdateHistoryEntry } from '../types';

interface ChannelUpdateHistoryProps {
  onOpenConfigEditor?: () => void;
  onOpenRepoSync?: () => void;
  onTriggerSync?: () => void;
  refreshTrigger?: number;
}

export const ChannelUpdateHistory: React.FC<ChannelUpdateHistoryProps> = ({
  onOpenConfigEditor,
  onOpenRepoSync,
  onTriggerSync,
  refreshTrigger
}) => {
  const [history, setHistory] = useState<ChannelUpdateHistoryEntry[]>([]);
  const [lastUpdate, setLastUpdate] = useState<ChannelUpdateHistoryEntry | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isClearing, setIsClearing] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('all');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      const res = await api.getChannelUpdateHistory();
      if (res.success) {
        setHistory(res.history || []);
        setLastUpdate(res.lastUpdate || (res.history && res.history[0]) || null);
      }
    } catch {
      // Ignored
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [refreshTrigger]);

  const handleClearHistory = async () => {
    if (!confirm('Deseja realmente limpar/arquivar o histórico de atualizações da grade de canais?')) {
      return;
    }
    setIsClearing(true);
    try {
      const res = await api.clearChannelUpdateHistory();
      if (res.success) {
        setHistory(res.history || []);
        setLastUpdate(res.lastUpdate || null);
        setFeedback({ type: 'success', message: 'Histórico resetado com sucesso.' });
        setTimeout(() => setFeedback(null), 3000);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao limpar histórico' });
    } finally {
      setIsClearing(false);
    }
  };

  const filteredHistory = history.filter(item => {
    if (filterType !== 'all') {
      if (filterType === 'json' && item.type !== 'json_edit') return false;
      if (filterType === 'sync' && item.type !== 'm3u_import' && item.type !== 'unify_grade') return false;
      if (filterType === 'manual' && !item.type.startsWith('manual')) return false;
    }
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      item.actionName.toLowerCase().includes(term) ||
      item.details.toLowerCase().includes(term) ||
      item.author.toLowerCase().includes(term) ||
      item.dateFormatted.toLowerCase().includes(term)
    );
  });

  const successfulCount = history.filter(h => h.success).length;
  const successRate = history.length > 0 ? Math.round((successfulCount / history.length) * 100) : 100;

  const getTypeBadge = (type: ChannelUpdateHistoryEntry['type']) => {
    switch (type) {
      case 'json_edit':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-500/30">
            <FileCode className="w-2.5 h-2.5" />
            Edição JSON
          </span>
        );
      case 'm3u_sync' as any:
      case 'sync_ramys' as any:
      case 'sync_saimo' as any:
      case 'm3u_import':
      case 'unify_grade':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-500/30">
            <RefreshCw className="w-2.5 h-2.5" />
            Sincronização M3U Local
          </span>
        );
      case 'manual_add':
      case 'manual_edit':
      case 'manual_delete':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-500/30">
            <Tv className="w-2.5 h-2.5" />
            Ação Manual
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-white/10">
            <Clock className="w-2.5 h-2.5" />
            Sistema
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Última Atualização Feita pelo Administrador */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 border border-white/10 p-6 shadow-xl">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Status da Grade
              </span>
              <span className="text-xs text-slate-400">Auditoria e Monitoramento em Tempo Real</span>
            </div>
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <History className="w-6 h-6 text-indigo-400" />
              Última Atualização da Grade de Canais
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-xl">
              Registro oficial da última modificação executada na grade de transmissão pelo administrador ou rotina do sistema.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={fetchHistory}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Atualizar Histórico</span>
            </button>

            {onOpenRepoSync && (
              <button
                type="button"
                onClick={onOpenRepoSync}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Gerenciar Links M3U</span>
              </button>
            )}

            {onOpenConfigEditor && (
              <button
                type="button"
                onClick={onOpenConfigEditor}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 transition-all"
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>Editar Configuração JSON</span>
              </button>
            )}
          </div>
        </div>

        {/* Highlight Card: Detalhes da Última Atualização */}
        {lastUpdate ? (
          <div className="mt-6 p-5 rounded-xl bg-slate-950/80 border border-white/10 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Data e Hora
              </span>
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Calendar className="w-4 h-4 text-indigo-400" />
                <span>{lastUpdate.dateFormatted}</span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">
                {new Date(lastUpdate.timestamp).toLocaleTimeString('pt-BR')} (Horário de Brasília)
              </span>
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Resultado / Sucesso
              </span>
              <div>
                {lastUpdate.success ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/40">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    Sucesso
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-950 text-rose-300 border border-rose-500/40">
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                    Falha na Operação
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 truncate mt-0.5">
                {lastUpdate.actionName}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Canais na Grade
              </span>
              <div className="text-lg font-black text-white flex items-center gap-2">
                <Tv className="w-4 h-4 text-cyan-400" />
                <span>{lastUpdate.channelsCount}</span>
                <span className="text-xs font-normal text-slate-400">ativos</span>
              </div>
              <span className="text-[10px] text-slate-500">
                Grade validada e operacional
              </span>
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Responsável
              </span>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                <User className="w-3.5 h-3.5 text-purple-400" />
                <span className="truncate">{lastUpdate.author}</span>
              </div>
              <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">
                {lastUpdate.details}
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-6 p-4 rounded-xl bg-slate-950/60 border border-white/5 text-center text-xs text-slate-400">
            Nenhuma atualização registrada até o momento.
          </div>
        )}
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-slate-900 border border-white/10">
          <span className="text-[11px] text-slate-400">Total de Operações</span>
          <div className="text-xl font-black text-white mt-1">{history.length}</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900 border border-white/10">
          <span className="text-[11px] text-slate-400">Taxa de Sucesso</span>
          <div className="text-xl font-black text-emerald-400 mt-1">{successRate}%</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900 border border-white/10">
          <span className="text-[11px] text-slate-400">Edições de JSON</span>
          <div className="text-xl font-black text-indigo-400 mt-1">
            {history.filter(h => h.type === 'json_edit').length}
          </div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900 border border-white/10">
          <span className="text-[11px] text-slate-400">Sincronizações M3U</span>
          <div className="text-xl font-black text-cyan-400 mt-1">
            {history.filter(h => h.type === ('m3u_sync' as any) || h.type === 'm3u_import' || h.type === 'unify_grade' || (h.type as any) === 'sync_ramys' || (h.type as any) === 'sync_saimo').length}
          </div>
        </div>
      </div>

      {feedback && (
        <div className={`p-3.5 rounded-xl text-xs flex items-center justify-between border ${
          feedback.type === 'success' 
            ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200' 
            : 'bg-rose-950/60 border-rose-500/40 text-rose-200'
        }`}>
          <span>{feedback.message}</span>
          <button type="button" onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar no histórico..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900 text-xs text-white placeholder-slate-500 rounded-xl pl-9 pr-4 py-2 border border-white/10 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-white/10">
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filterType === 'all' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setFilterType('json')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filterType === 'json' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              JSON
            </button>
            <button
              type="button"
              onClick={() => setFilterType('sync')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filterType === 'sync' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Sincronização
            </button>
            <button
              type="button"
              onClick={() => setFilterType('manual')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filterType === 'manual' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Manual
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={handleClearHistory}
          disabled={isClearing || history.length <= 1}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 border border-rose-500/20 transition-colors disabled:opacity-40"
          title="Limpar e resetar histórico"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>{isClearing ? 'Limpando...' : 'Limpar Histórico'}</span>
        </button>
      </div>

      {/* History List */}
      <div className="space-y-3">
        {filteredHistory.length === 0 ? (
          <div className="text-center py-12 rounded-2xl border border-dashed border-white/10 bg-slate-900/30 text-slate-400">
            <History className="w-10 h-10 mx-auto text-slate-600 mb-2" />
            <p className="text-sm font-semibold text-slate-300">Nenhum registro encontrado</p>
            <p className="text-xs text-slate-500 mt-1">Tente ajustar o termo de busca ou o filtro de categoria.</p>
          </div>
        ) : (
          filteredHistory.map((item) => (
            <div
              key={item.id}
              className={`p-4 rounded-xl border transition-all ${
                item.success
                  ? 'bg-slate-900/90 border-white/10 hover:border-white/20'
                  : 'bg-rose-950/30 border-rose-500/40 hover:border-rose-500/60'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  {item.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <h3 className="text-xs font-bold text-white">{item.actionName}</h3>
                  {getTypeBadge(item.type)}
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span className="font-mono text-[11px] bg-slate-950 px-2 py-0.5 rounded border border-white/5">
                    {item.dateFormatted}
                  </span>
                  <span className="text-[11px] text-slate-300 font-semibold">
                    {item.channelsCount} canais
                  </span>
                  <span className="text-[11px] text-slate-500">
                    por {item.author}
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-300 mt-2 pl-6.5">
                {item.details}
              </p>

              {item.errorMessage && (
                <div className="mt-2 pl-6.5 text-[11px] font-mono text-rose-300 bg-rose-950/60 p-2 rounded-lg border border-rose-800/40">
                  Erro: {item.errorMessage}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
