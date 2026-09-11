import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, Users, Tv, Server, Cpu, HardDrive, 
  RefreshCw, Clock, ArrowUpRight, Zap, Shield, 
  Crown, Radio, CheckCircle2, AlertCircle, Database,
  TrendingUp, Wifi, Eye, BarChart3
} from 'lucide-react';
import { RealtimeDashboardData } from '../types';
import { api } from '../services/api';

interface RealtimeMetricsDashboardProps {
  onNavigateTab?: (tab: string) => void;
}

export const RealtimeMetricsDashboard: React.FC<RealtimeMetricsDashboardProps> = ({ onNavigateTab }) => {
  const [data, setData] = useState<RealtimeDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefreshSec, setAutoRefreshSec] = useState<number>(10);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const timerRef = useRef<any>(null);

  const fetchMetrics = async (isBackground = false) => {
    if (!isBackground) setIsLoading(true);
    setError(null);
    try {
      const res = await api.getRealtimeMetrics();
      if (res.success && res.data) {
        setData(res.data);
        setLastUpdated(new Date());
      } else {
        setError('Não foi possível obter os dados de métricas em tempo real.');
      }
    } catch (err: any) {
      setError(err.message || 'Erro de conexão com o servidor.');
    } finally {
      if (!isBackground) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoRefreshSec > 0) {
      timerRef.current = setInterval(() => {
        fetchMetrics(true);
      }, autoRefreshSec * 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoRefreshSec]);

  const formatSeconds = (sec: number) => {
    if (!sec || sec < 60) return `${sec || 0}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m < 60) return `${m}m ${s}s`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}h ${rm}m`;
  };

  const perf = data?.performance;
  const activeUsers = data?.activeUsers;
  const topChannels = data?.topChannels || [];
  const recentAudits = data?.recentAudits || [];

  return (
    <div className="space-y-6" id="realtime-metrics-dashboard">
      {/* Top Banner: Status & Auto-refresh */}
      <div className="bg-slate-900/90 p-5 rounded-2xl border border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
              <Activity className="w-6 h-6" />
            </div>
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white">Painel de Monitoramento em Tempo Real</h2>
              <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Ao Vivo
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Uso proativo do sistema: audiência ao vivo, status do Node.js e integridade da base SQLite 3.
            </p>
          </div>
        </div>

        {/* Auto Refresh & Action Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-white/10 text-xs">
            <span className="text-slate-400 font-medium">Auto-atualizar:</span>
            <select
              value={autoRefreshSec}
              onChange={(e) => setAutoRefreshSec(Number(e.target.value))}
              className="bg-transparent text-emerald-400 font-bold focus:outline-none cursor-pointer"
            >
              <option value={5} className="bg-slate-900 text-white">A cada 5s</option>
              <option value={10} className="bg-slate-900 text-white">A cada 10s</option>
              <option value={30} className="bg-slate-900 text-white">A cada 30s</option>
              <option value={0} className="bg-slate-900 text-white">Pausado</option>
            </select>
          </div>

          <div className="text-[11px] text-slate-400 font-mono hidden sm:block">
            Última sync: {lastUpdated.toLocaleTimeString('pt-BR')}
          </div>

          <button
            type="button"
            onClick={() => fetchMetrics(false)}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Atualizar Agora</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/20 border border-rose-500/40 rounded-2xl flex items-center gap-3 text-rose-300 text-xs">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 4 Primary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Usuários Conectados Ao Vivo */}
        <div className="bg-gradient-to-br from-slate-900/90 to-indigo-950/40 p-5 rounded-2xl border border-indigo-500/20 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Usuários Conectados</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">
              {activeUsers ? activeUsers.totalActiveNow : 0}
            </span>
            <span className="text-xs font-semibold text-emerald-400 flex items-center">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping mr-1" />
              Ao Vivo
            </span>
          </div>
          <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1 text-purple-300">
              <Crown className="w-3.5 h-3.5 text-amber-400" />
              <span>VIPs: <strong>{activeUsers?.vipCount || 0}</strong></span>
            </div>
            <div className="text-slate-400">
              <span>Visitantes: <strong>{activeUsers?.guestCount || 0}</strong></span>
            </div>
          </div>
        </div>

        {/* Card 2: Consumo de Memória & Node.js */}
        <div className="bg-gradient-to-br from-slate-900/90 to-teal-950/40 p-5 rounded-2xl border border-teal-500/20 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Memória do Servidor</span>
            <div className="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center">
              <Cpu className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">
              {perf?.memory.heapUsedMb || 0}
            </span>
            <span className="text-xs text-slate-400 font-mono">
              / {perf?.memory.heapTotalMb || 0} MB ({perf?.memory.heapPercentage || 0}%)
            </span>
          </div>
          {/* Visual Memory Bar */}
          <div className="mt-3">
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-500 rounded-full ${
                  (perf?.memory.heapPercentage || 0) > 85 
                    ? 'bg-rose-500' 
                    : (perf?.memory.heapPercentage || 0) > 65 
                      ? 'bg-amber-500' 
                      : 'bg-teal-400'
                }`}
                style={{ width: `${Math.min(100, Math.max(5, perf?.memory.heapPercentage || 0))}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1.5">
              <span>RSS: {perf?.memory.rssMb || 0} MB</span>
              <span>Uptime: {perf?.uptimeFormatted || '0s'}</span>
            </div>
          </div>
        </div>

        {/* Card 3: Integridade SQLite 3 */}
        <div className="bg-gradient-to-br from-slate-900/90 to-amber-950/40 p-5 rounded-2xl border border-amber-500/20 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Banco de Dados SQLite</span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Database className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">
              {perf?.sqlite.dbSizeFormatted || '0 KB'}
            </span>
            <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> WAL Ativo
            </span>
          </div>
          <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between text-xs text-slate-400">
            <span>Canais: <strong className="text-slate-200">{perf?.sqlite.totalChannels || 0}</strong></span>
            <span>Assinantes: <strong className="text-slate-200">{perf?.sqlite.totalSubscribers || 0}</strong></span>
            <span>Sessões: <strong className="text-slate-200">{perf?.sqlite.totalSessions || 0}</strong></span>
          </div>
        </div>

        {/* Card 4: Rede & Requisições */}
        <div className="bg-gradient-to-br from-slate-900/90 to-cyan-950/40 p-5 rounded-2xl border border-cyan-500/20 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Requisições & Tráfego</span>
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
              <Wifi className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">
              {perf?.network.totalRequestsHandled.toLocaleString() || '1'}
            </span>
            <span className="text-xs text-slate-400">reqs</span>
          </div>
          <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between text-xs text-slate-400">
            <span>Node: <strong className="text-slate-200">{perf?.nodeVersion || 'v20'}</strong></span>
            <span>CPU: <strong className="text-slate-200">{((perf?.cpu.userTimeMs || 0) / 1000).toFixed(1)}s</strong></span>
          </div>
        </div>
      </div>

      {/* Grid: 2 Columns - Top Channels & Active Live Sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Top Channels */}
        <div className="bg-slate-900/80 rounded-2xl border border-white/10 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Tv className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-bold text-white">Canais Mais Assistidos</h3>
              </div>
              <span className="text-[11px] text-slate-400 font-medium">Audiência em Tempo Real</span>
            </div>

            {topChannels.length === 0 ? (
              <div className="py-10 text-center text-slate-500 text-xs">
                Nenhum canal com reprodução registrada no momento.
              </div>
            ) : (
              <div className="space-y-2.5">
                {topChannels.slice(0, 7).map((channel, idx) => (
                  <div 
                    key={channel.mediaId}
                    className="p-3 bg-slate-950/60 rounded-xl border border-white/5 flex items-center justify-between gap-3 hover:border-indigo-500/30 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-6 h-6 rounded-lg bg-indigo-600/20 text-indigo-300 flex items-center justify-center font-bold text-xs shrink-0">
                        #{idx + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white truncate">{channel.name}</span>
                          {channel.isVipOnly && (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              VIP
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 block">{channel.category}</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="flex items-center gap-1.5 justify-end">
                        <Users className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-xs font-black text-emerald-300">
                          {channel.activeViewers} {channel.activeViewers === 1 ? 'ao vivo' : 'ao vivo'}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 block">
                        Tempo: {formatSeconds(channel.totalWatchSeconds)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-white/5 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Sessões consolidadas via heartbeats regulares</span>
            {onNavigateTab && (
              <button 
                type="button"
                onClick={() => onNavigateTab('channels')}
                className="text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
              >
                <span>Ver Grade Completa</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Right: Active Live Sessions List */}
        <div className="bg-slate-900/80 rounded-2xl border border-white/10 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-emerald-400 animate-pulse" />
                <h3 className="text-sm font-bold text-white">Sessões Ativas (Últimos 60s)</h3>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                {activeUsers?.sessions.length || 0} conectadas
              </span>
            </div>

            {(!activeUsers || activeUsers.sessions.length === 0) ? (
              <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                <Users className="w-8 h-8 text-slate-600" />
                <span>Nenhuma sessão ativa com heartbeat recebido no último minuto.</span>
                <span className="text-[11px] text-slate-500">Quando um espectador abre o player ou navega, ele aparece aqui instantaneamente.</span>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                {activeUsers.sessions.map((s) => (
                  <div 
                    key={s.sessionId}
                    className="p-3 bg-slate-950/60 rounded-xl border border-white/5 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs shrink-0 ${
                        s.isVip ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {s.isVip ? <Crown className="w-4 h-4 text-amber-400" /> : <Users className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white truncate">
                            {s.mediaName || 'Navegando no App'}
                          </span>
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                            {s.sessionId.slice(-6)}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 block">
                          {s.isVip ? 'Cliente VIP Ativo' : 'Visitante'} • {s.mediaType === 'vod' ? 'Filme/Série' : 'Canal de TV'}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs font-bold text-slate-200 block">
                        {formatSeconds(s.totalWatchSeconds)}
                      </span>
                      <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1 justify-end">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                        Online
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-white/5 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Sessões verificadas com tolerância de 60 segundos</span>
            <span className="text-slate-500 font-mono">Heartbeat: /api/session/heartbeat</span>
          </div>
        </div>
      </div>

      {/* Quick Audit Logs Preview Section */}
      {recentAudits.length > 0 && (
        <div className="bg-slate-900/70 p-5 rounded-2xl border border-white/10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-indigo-400" />
              <h3 className="text-xs font-bold text-white">Últimas Ações Administrativas Críticas</h3>
            </div>
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('audit-logs')}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
              >
                <span>Ver Todos os Logs de Auditoria</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {recentAudits.map(log => (
              <div key={log.id} className="p-3 bg-slate-950/50 rounded-xl border border-white/5">
                <div className="flex items-center justify-between text-[10px] mb-1">
                  <span className="font-bold text-indigo-300">{log.actionName}</span>
                  <span className="text-slate-500">{new Date(log.timestamp).toLocaleTimeString('pt-BR')}</span>
                </div>
                <p className="text-xs text-slate-300 truncate" title={log.description}>
                  {log.description}
                </p>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Por: {log.adminName}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
