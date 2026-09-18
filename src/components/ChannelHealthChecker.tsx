import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Activity, Play, Pause, RefreshCw, CheckCircle2, AlertTriangle, 
  XCircle, Search, Filter, Volume2, VolumeX, Eye, EyeOff, 
  Sparkles, ExternalLink, Zap, Shield, ArrowUpDown, 
  Check, X, SlidersHorizontal, Info, Clock, Wifi, WifiOff,
  Radio, Film, Tv
} from 'lucide-react';
import { Channel, ChannelHealthResult, ChannelHealthSummary } from '../types';
import { api } from '../services/api';

interface ChannelHealthCheckerProps {
  channels: Channel[];
  onPreviewChannel: (channel: Channel) => void;
  onRefreshChannels?: () => Promise<void>;
}

type HealthFilter = 'all' | 'online' | 'unstable' | 'offline' | 'untested';

export const ChannelHealthChecker: React.FC<ChannelHealthCheckerProps> = ({
  channels,
  onPreviewChannel,
  onRefreshChannels
}) => {
  const [healthMap, setHealthMap] = useState<Map<string, ChannelHealthResult>>(new Map());
  const [summary, setSummary] = useState<ChannelHealthSummary>({
    total: channels.length,
    tested: 0,
    online: 0,
    offline: 0,
    unstable: 0,
    untested: channels.length,
  });

  // Testing state
  const [isBatchRunning, setIsBatchRunning] = useState<boolean>(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; percentage: number }>({
    current: 0,
    total: 0,
    percentage: 0
  });
  const abortBatchRef = useRef<boolean>(false);

  // Individual testing spinner tracker
  const [testingChannelIds, setTestingChannelIds] = useState<Set<string>>(new Set());

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [statusFilter, setStatusFilter] = useState<HealthFilter>('all');
  const [sortBy, setSortBy] = useState<'name' | 'latency' | 'status'>('status');
  const [displayLimit, setDisplayLimit] = useState<number>(100);

  // Mini-player state for immediate visual test
  const [inlinePreviewChannel, setInlinePreviewChannel] = useState<Channel | null>(null);
  const [inlineIsMuted, setInlineIsMuted] = useState<boolean>(true);
  const [inlinePlayerStatus, setInlinePlayerStatus] = useState<'loading' | 'playing' | 'error'>('loading');
  const [inlineErrorMessage, setInlineErrorMessage] = useState<string>('');
  const [inlineRetryCount, setInlineRetryCount] = useState<number>(0);
  const inlineTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inlineCanPlayFiredRef = useRef<boolean>(false);

  // Strict 10s timeout for inline preview video initialization
  useEffect(() => {
    if (!inlinePreviewChannel) return;
    setInlinePlayerStatus('loading');
    setInlineErrorMessage('');
    inlineCanPlayFiredRef.current = false;
    if (inlineTimeoutRef.current) clearTimeout(inlineTimeoutRef.current);

    inlineTimeoutRef.current = setTimeout(() => {
      if (!inlineCanPlayFiredRef.current) {
        setInlinePlayerStatus('error');
        setInlineErrorMessage('Conexão excedeu 10s: evento canplay não disparou.');
      }
    }, 10000);

    return () => {
      if (inlineTimeoutRef.current) clearTimeout(inlineTimeoutRef.current);
    };
  }, [inlinePreviewChannel, inlineRetryCount]);

  // Action toast/feedback
  const [feedback, setFeedback] = useState<string>('');

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(''), 4500);
  };

  // Load existing health check data from server on mount
  useEffect(() => {
    const fetchExistingHealth = async () => {
      try {
        const res = await api.getChannelHealthStatus();
        if (res.success && res.results) {
          const map = new Map<string, ChannelHealthResult>();
          res.results.forEach(item => {
            map.set(item.channelId, item);
          });
          setHealthMap(map);
          if (res.summary) {
            setSummary(res.summary);
          }
        }
      } catch {
        // Ignored in production
      }
    };
    fetchExistingHealth();
  }, []);

  // Compute categories list from channels
  const categories = useMemo(() => {
    const set = new Set<string>();
    channels.forEach(ch => {
      if (ch.category) set.add(ch.category);
    });
    return ['Todos', ...Array.from(set)];
  }, [channels]);

  // Compute live summary based on healthMap and channels
  useEffect(() => {
    let online = 0;
    let unstable = 0;
    let offline = 0;

    healthMap.forEach(item => {
      if (item.status === 'online') online++;
      else if (item.status === 'unstable') unstable++;
      else if (item.status === 'offline') offline++;
    });

    const tested = online + unstable + offline;
    const untested = Math.max(0, channels.length - tested);

    setSummary({
      total: channels.length,
      tested,
      online,
      unstable,
      offline,
      untested,
      lastChecked: new Date().toISOString()
    });
  }, [healthMap, channels.length]);

  // Filtered channels
  const filteredChannels = useMemo(() => {
    return channels.filter(ch => {
      // Search match
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch = !query || 
        ch.name.toLowerCase().includes(query) || 
        ch.category.toLowerCase().includes(query) ||
        ch.id.toLowerCase().includes(query);

      if (!matchesSearch) return false;

      // Category match
      if (selectedCategory !== 'Todos' && ch.category.toLowerCase() !== selectedCategory.toLowerCase()) {
        return false;
      }

      // Health status match
      const health = healthMap.get(ch.id);
      const currentStatus = health ? health.status : 'untested';

      if (statusFilter === 'all') return true;
      return currentStatus === statusFilter;
    }).sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === 'latency') {
        const latA = healthMap.get(a.id)?.latencyMs ?? 99999;
        const latB = healthMap.get(b.id)?.latencyMs ?? 99999;
        return latA - latB;
      }
      // Sort by status: offline first, then unstable, then online, then untested
      const order: Record<string, number> = { offline: 1, unstable: 2, online: 3, untested: 4 };
      const statusA = healthMap.get(a.id)?.status || 'untested';
      const statusB = healthMap.get(b.id)?.status || 'untested';
      return (order[statusA] || 5) - (order[statusB] || 5);
    });
  }, [channels, searchQuery, selectedCategory, statusFilter, sortBy, healthMap]);

  // Check single channel (supports Opção 1, Opção 2...)
  const handleTestChannel = async (channel: Channel, sourceIndex = 0) => {
    setTestingChannelIds(prev => new Set(prev).add(channel.id));
    const targetSource = channel.sources[sourceIndex] || channel.sources[0];
    try {
      const res = await api.checkChannelHealth(channel.id, sourceIndex, {
        url: targetSource?.url,
        referer: targetSource?.referer,
        channelName: channel.name,
        category: channel.category,
        sources: channel.sources
      });
      if (res.success && res.result) {
        setHealthMap(prev => new Map(prev).set(channel.id, res.result));
        const statusLabel = res.result.status === 'online' ? 'Online' : res.result.status === 'unstable' ? 'Instável' : 'Offline';
        const optLabel = sourceIndex > 0 ? ` (Opção ${sourceIndex + 1})` : '';
        showFeedback(`${channel.name}${optLabel}: Sinal ${statusLabel} (${res.result.latencyMs}ms)`);
      }
    } catch (err: any) {
      // If error, mark offline
      const fallbackResult: ChannelHealthResult = {
        channelId: channel.id,
        channelName: channel.name,
        category: channel.category,
        sourceIndex,
        url: targetSource?.url || '',
        status: 'offline',
        statusCode: 0,
        statusText: 'Erro ao testar',
        latencyMs: 0,
        lastChecked: new Date().toISOString(),
        error: err.message || 'Falha na requisição'
      };
      setHealthMap(prev => new Map(prev).set(channel.id, fallbackResult));
      showFeedback(`${channel.name}: Falha ao conectar sinal.`);
    } finally {
      setTestingChannelIds(prev => {
        const next = new Set(prev);
        next.delete(channel.id);
        return next;
      });
    }
  };

  // Run Batch Check (All or filtered)
  const handleStartBatchCheck = async (targetList: Channel[]) => {
    if (isBatchRunning) return;
    if (targetList.length === 0) {
      alert('Nenhum canal selecionado para verificação.');
      return;
    }

    setIsBatchRunning(true);
    abortBatchRef.current = false;
    const total = targetList.length;
    let completed = 0;

    setBatchProgress({ current: 0, total, percentage: 0 });

    // Process in chunks of 5 channels
    const chunkSize = 5;
    for (let i = 0; i < total; i += chunkSize) {
      if (abortBatchRef.current) {
        showFeedback('Verificação em lote interrompida pelo usuário.');
        break;
      }

      const chunk = targetList.slice(i, i + chunkSize);
      const chunkIds = chunk.map(c => c.id);

      try {
        const res = await api.checkBatchChannels({ channelIds: chunkIds, channels: chunk });
        if (res.success && res.results) {
          setHealthMap(prev => {
            const next = new Map(prev);
            res.results.forEach(r => next.set(r.channelId, r));
            return next;
          });
        }
      } catch {
        // Chunk error handled gracefully
      }

      completed += chunk.length;
      setBatchProgress({
        current: Math.min(completed, total),
        total,
        percentage: Math.round((Math.min(completed, total) / total) * 100)
      });
    }

    setIsBatchRunning(false);
    if (!abortBatchRef.current) {
      showFeedback(`Verificação concluída! ${completed} canais foram avaliados.`);
      if (onRefreshChannels) onRefreshChannels();
    }
  };

  const handleStopBatch = () => {
    abortBatchRef.current = true;
    setIsBatchRunning(false);
  };

  // Quick action: Test only offline channels
  const handleTestOnlyOffline = () => {
    const offlineList = channels.filter(ch => {
      const h = healthMap.get(ch.id);
      return h && h.status === 'offline';
    });
    if (offlineList.length === 0) {
      alert('Não há canais marcados como offline no momento.');
      return;
    }
    handleStartBatchCheck(offlineList);
  };

  // Quick action: Test top featured channels (e.g. Abertos & Esportes)
  const handleTestTopChannels = () => {
    const topList = channels.filter(ch => 
      ch.category === 'Abertos' || ch.category === 'Esportes' || ch.category === 'Filmes & Séries'
    ).slice(0, 30);
    handleStartBatchCheck(topList);
  };

  // Toggle active status
  const handleToggleChannelActive = async (channel: Channel) => {
    try {
      const res = await api.toggleChannelActive(channel.id);
      if (res.success) {
        channel.isActive = res.isActive;
        showFeedback(`Canal ${channel.name} ${res.isActive ? 'ativado' : 'desativado'} na grade.`);
        if (onRefreshChannels) onRefreshChannels();
      }
    } catch (err: any) {
      alert(err.message || 'Erro ao alterar status');
    }
  };

  // Disable all offline channels
  const handleDisableOfflineChannels = async () => {
    const offlineCount = summary.offline;
    if (offlineCount === 0) {
      alert('Nenhum canal offline identificado para desativar.');
      return;
    }

    if (!confirm(`Deseja ocultar ${offlineCount} canais offline da grade pública dos usuários?`)) {
      return;
    }

    try {
      const res = await api.disableOfflineChannels();
      if (res.success) {
        showFeedback(res.message);
        if (onRefreshChannels) onRefreshChannels();
      }
    } catch (err: any) {
      alert(err.message || 'Erro ao desativar canais');
    }
  };

  // Re-enable all channels
  const handleEnableAllChannels = async () => {
    if (!confirm('Deseja reativar todos os canais para ficarem visíveis na grade?')) return;
    try {
      const res = await api.enableAllChannels();
      if (res.success) {
        showFeedback(res.message);
        if (onRefreshChannels) onRefreshChannels();
      }
    } catch (err: any) {
      alert(err.message || 'Erro ao reativar canais');
    }
  };

  // Start Inline Preview
  const handleOpenInlinePreview = (channel: Channel) => {
    setInlinePreviewChannel(channel);
    setInlinePlayerStatus('loading');
  };

  const availabilityRate = summary.tested > 0 
    ? (((summary.online + summary.unstable) / summary.tested) * 100).toFixed(1)
    : '100.0';

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {feedback && (
        <div className="fixed bottom-6 right-6 z-50 bg-indigo-600 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-indigo-400/40 text-sm font-semibold animate-fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-300" />
          <span>{feedback}</span>
        </div>
      )}

      {/* TOP SUMMARY HEALTH METRICS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Channels */}
        <div className="bg-slate-900/90 border border-white/10 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Total da Grade</span>
            <Tv className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-white">{channels.length}</span>
            <p className="text-[11px] text-slate-400 mt-0.5">Canais cadastrados</p>
          </div>
        </div>

        {/* Online Channels */}
        <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-emerald-400 text-xs font-semibold">
            <span>Sinal Online</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-emerald-300">{summary.online}</span>
            <p className="text-[11px] text-emerald-400/80 mt-0.5">Sinal estável e veloz</p>
          </div>
        </div>

        {/* Unstable Channels */}
        <div className="bg-amber-950/40 border border-amber-500/30 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-amber-400 text-xs font-semibold">
            <span>Instáveis / Lentos</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-amber-300">{summary.unstable}</span>
            <p className="text-[11px] text-amber-400/80 mt-0.5">Latência &gt; 1800ms</p>
          </div>
        </div>

        {/* Offline Channels */}
        <div className="bg-rose-950/40 border border-rose-500/30 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-rose-400 text-xs font-semibold">
            <span>Fora do Ar</span>
            <XCircle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-rose-300">{summary.offline}</span>
            <p className="text-[11px] text-rose-400/80 mt-0.5">Erro HTTP / Timeout</p>
          </div>
        </div>

        {/* Untested */}
        <div className="bg-slate-900/90 border border-white/10 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Não Verificados</span>
            <Clock className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-slate-300">{summary.untested}</span>
            <p className="text-[11px] text-slate-400 mt-0.5">Aguardando teste</p>
          </div>
        </div>

        {/* Availability Rate */}
        <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-indigo-300 text-xs font-semibold">
            <span>Taxa Disponibilidade</span>
            <Zap className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-white">{availabilityRate}%</span>
            <p className="text-[11px] text-indigo-300 mt-0.5">Canais em operação</p>
          </div>
        </div>
      </div>

      {/* HEALTH PROPORTION BAR */}
      <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="font-semibold text-slate-200 flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-400" />
            Diagnóstico de Disponibilidade dos Streams
          </span>
          <span>{summary.tested} de {summary.total} canais avaliados</span>
        </div>

        <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
          {summary.online > 0 && (
            <div 
              style={{ width: `${(summary.online / summary.total) * 100}%` }}
              className="h-full bg-emerald-500 transition-all duration-500"
              title={`Online: ${summary.online}`}
            />
          )}
          {summary.unstable > 0 && (
            <div 
              style={{ width: `${(summary.unstable / summary.total) * 100}%` }}
              className="h-full bg-amber-500 transition-all duration-500"
              title={`Instável: ${summary.unstable}`}
            />
          )}
          {summary.offline > 0 && (
            <div 
              style={{ width: `${(summary.offline / summary.total) * 100}%` }}
              className="h-full bg-rose-500 transition-all duration-500"
              title={`Fora do ar: ${summary.offline}`}
            />
          )}
          {summary.untested > 0 && (
            <div 
              style={{ width: `${(summary.untested / summary.total) * 100}%` }}
              className="h-full bg-slate-700 transition-all duration-500"
              title={`Não testados: ${summary.untested}`}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] pt-1 text-slate-400">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Online ({summary.online})</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Instável ({summary.unstable})</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Fora do Ar ({summary.offline})</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-700" /> Não Testado ({summary.untested})</span>
          </div>
          {summary.lastChecked && (
            <span className="text-slate-400">
              Último diagnóstico: {new Date(summary.lastChecked).toLocaleTimeString('pt-BR')}
            </span>
          )}
        </div>
      </div>

      {/* BATCH PROGRESS BAR IF ACTIVE */}
      {isBatchRunning && (
        <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 border border-indigo-500/40 rounded-2xl p-4 shadow-xl flex flex-col gap-3 animate-pulse">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <RefreshCw className="w-5 h-5 text-indigo-400 animate-spin" />
              <div>
                <p className="text-sm font-bold text-white">Verificando canais em lote...</p>
                <p className="text-xs text-indigo-300">Testando sinal, latência e conectividade com o servidor</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-indigo-200 bg-indigo-900/60 px-3 py-1 rounded-full border border-indigo-500/30">
                {batchProgress.current} / {batchProgress.total} ({batchProgress.percentage}%)
              </span>
              <button
                type="button"
                onClick={handleStopBatch}
                className="px-3 py-1.5 bg-rose-600/80 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                Parar Teste
              </button>
            </div>
          </div>

          <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
            <div 
              style={{ width: `${batchProgress.percentage}%` }}
              className="h-full bg-indigo-500 transition-all duration-300"
            />
          </div>
        </div>
      )}

      {/* INLINE MINI-PLAYER FOR REALTIME AUDIO/VIDEO VERIFICATION */}
      {inlinePreviewChannel && (
        <div className="bg-slate-900 border-2 border-indigo-500/50 rounded-2xl p-4 shadow-2xl relative">
          <button
            type="button"
            onClick={() => setInlinePreviewChannel(null)}
            className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            title="Fechar Mini-Player"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex flex-col lg:flex-row items-center gap-5">
            {/* Video container */}
            <div className="w-full lg:w-96 aspect-video bg-black rounded-xl overflow-hidden relative shadow-lg border border-white/10 shrink-0">
              <video
                key={`${inlinePreviewChannel.id}-${inlineRetryCount}`}
                src={inlinePreviewChannel.sources[0]?.url ? `/api/proxy?url=${encodeURIComponent(inlinePreviewChannel.sources[0].url)}&referer=${encodeURIComponent(inlinePreviewChannel.sources[0].referer || '')}` : ''}
                autoPlay
                muted={inlineIsMuted}
                playsInline
                onCanPlay={() => {
                  inlineCanPlayFiredRef.current = true;
                  if (inlineTimeoutRef.current) clearTimeout(inlineTimeoutRef.current);
                  setInlinePlayerStatus('playing');
                }}
                onLoadedData={() => {
                  inlineCanPlayFiredRef.current = true;
                  if (inlineTimeoutRef.current) clearTimeout(inlineTimeoutRef.current);
                  setInlinePlayerStatus('playing');
                }}
                onError={() => {
                  if (inlineTimeoutRef.current) clearTimeout(inlineTimeoutRef.current);
                  setInlinePlayerStatus('error');
                  setInlineErrorMessage('Stream Offline ou Bloqueado');
                }}
                className="w-full h-full object-contain"
              />

              {inlinePlayerStatus === 'loading' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-2">
                  <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin" />
                  <span className="text-xs text-slate-300">Carregando sinal (limite 3,5s)...</span>
                </div>
              )}

              {inlinePlayerStatus === 'error' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-rose-950/95 text-rose-200 p-4 text-center gap-2">
                  <AlertTriangle className="w-6 h-6 text-rose-400" />
                  <span className="text-xs font-bold">{inlineErrorMessage || 'Stream Offline ou Bloqueado'}</span>
                  <span className="text-[10px] text-rose-300 max-w-xs">
                    O servidor não respondeu dentro do limite de 3,5 segundos ou a transmissão está inacessível.
                  </span>
                  <button
                    type="button"
                    onClick={() => setInlineRetryCount(c => c + 1)}
                    className="mt-1 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition-all cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Tentar Novamente</span>
                  </button>
                </div>
              )}

              <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setInlineIsMuted(!inlineIsMuted)}
                  className="p-1.5 rounded-md bg-black/60 hover:bg-black/90 text-white text-xs backdrop-blur-sm cursor-pointer"
                  title={inlineIsMuted ? 'Ativar Áudio' : 'Mutar Áudio'}
                >
                  {inlineIsMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
                </button>
              </div>
            </div>

            {/* Channel Details & Controls */}
            <div className="flex-1 space-y-3 w-full">
              <div className="flex items-center gap-3">
                {inlinePreviewChannel.logo ? (
                  <img 
                    src={inlinePreviewChannel.logo} 
                    alt={inlinePreviewChannel.name}
                    className="w-12 h-12 rounded-xl object-contain bg-slate-800 p-1 border border-white/10"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-indigo-400">
                    <Radio className="w-6 h-6" />
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-white">{inlinePreviewChannel.name}</h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      {inlinePreviewChannel.category}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 font-mono truncate max-w-md">
                    {inlinePreviewChannel.sources[0]?.url || 'Sem URL cadastrada'}
                  </p>
                </div>
              </div>

              {/* Status details */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-800/80 border border-white/5">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Status do Player</span>
                  <p className="font-semibold text-white mt-0.5 flex items-center gap-1.5">
                    {inlinePlayerStatus === 'playing' && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
                    {inlinePlayerStatus === 'playing' ? 'Transmitindo Ao Vivo' : inlinePlayerStatus === 'loading' ? 'Conectando...' : 'Sem Sinal'}
                  </p>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-800/80 border border-white/5">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Diagnóstico HTTP</span>
                  <p className="font-semibold text-white mt-0.5">
                    {healthMap.get(inlinePreviewChannel.id)?.statusCode || 200} {healthMap.get(inlinePreviewChannel.id)?.statusText || 'OK'}
                  </p>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-800/80 border border-white/5">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Latência</span>
                  <p className="font-semibold text-emerald-400 mt-0.5">
                    {healthMap.get(inlinePreviewChannel.id)?.latencyMs || '120'} ms
                  </p>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onPreviewChannel(inlinePreviewChannel)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/30 flex items-center gap-1.5 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Abrir no Player Completo</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleTestChannel(inlinePreviewChannel)}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Retestar Sinal</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleChannelActive(inlinePreviewChannel)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer border ${
                    inlinePreviewChannel.isActive
                      ? 'bg-rose-950/40 border-rose-500/30 text-rose-300 hover:bg-rose-900/50'
                      : 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300 hover:bg-emerald-900/50'
                  }`}
                >
                  {inlinePreviewChannel.isActive ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{inlinePreviewChannel.isActive ? 'Ocultar da Grade' : 'Tornar Visível'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ACTION BAR: BATCH BUTTONS & GLOBAL ACTIONS */}
      <div className="bg-slate-900 border border-white/10 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
        {/* Testing Triggers */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={isBatchRunning}
            onClick={() => handleStartBatchCheck(filteredChannels)}
            className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold rounded-xl text-xs shadow-lg shadow-indigo-600/30 flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Zap className="w-4 h-4 text-amber-300" />
            <span>Testar Canais Filtrados ({filteredChannels.length})</span>
          </button>

          <button
            type="button"
            disabled={isBatchRunning}
            onClick={() => handleStartBatchCheck(channels)}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 font-semibold rounded-xl text-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Activity className="w-4 h-4 text-indigo-400" />
            <span>Testar Grade Inteira ({channels.length})</span>
          </button>

          <button
            type="button"
            disabled={isBatchRunning || summary.offline === 0}
            onClick={handleTestOnlyOffline}
            className="px-3.5 py-2.5 bg-rose-950/40 hover:bg-rose-900/50 text-rose-200 border border-rose-500/30 font-semibold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
          >
            <RefreshCw className="w-3.5 h-3.5 text-rose-400" />
            <span>Retestar Apenas Offline ({summary.offline})</span>
          </button>

          <button
            type="button"
            disabled={isBatchRunning}
            onClick={handleTestTopChannels}
            className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 font-semibold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Testar Principais (Top 30)</span>
          </button>
        </div>

        {/* Maintenance / Safety Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDisableOfflineChannels}
            disabled={summary.offline === 0}
            className="px-3.5 py-2.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40 transition-colors"
            title="Oculta automaticamente todos os canais que deram offline da visualização dos usuários"
          >
            <EyeOff className="w-3.5 h-3.5 text-rose-400" />
            <span>Ocultar Todos Offline</span>
          </button>

          <button
            type="button"
            onClick={handleEnableAllChannels}
            className="px-3.5 py-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Eye className="w-3.5 h-3.5 text-emerald-400" />
            <span>Reativar Todos</span>
          </button>
        </div>
      </div>

      {/* SEARCH, CATEGORY & HEALTH FILTER TABS */}
      <div className="bg-slate-900/90 border border-white/10 rounded-2xl p-4 space-y-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Search bar */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar canal por nome ou categoria..."
              className="w-full bg-slate-800/80 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Sort By Dropdown */}
          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <ArrowUpDown className="w-3.5 h-3.5" />
              Ordenar por:
            </span>
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="bg-slate-800 border border-white/10 text-slate-200 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-indigo-500"
            >
              <option value="status">Prioridade de Status (Offline primeiro)</option>
              <option value="latency">Menor Latência (Mais Rápidos)</option>
              <option value="name">Nome Alfabético (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Status Pill Filters */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/5">
          <span className="text-xs font-semibold text-slate-400 mr-2 flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-indigo-400" />
            Filtro de Status:
          </span>

          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800 hover:text-white border border-white/5'
            }`}
          >
            Todos ({channels.length})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('online')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              statusFilter === 'online'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                : 'bg-emerald-950/20 text-emerald-400 hover:bg-emerald-950/50 border border-emerald-500/20'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Online ({summary.online})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('unstable')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              statusFilter === 'unstable'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                : 'bg-amber-950/20 text-amber-400 hover:bg-amber-950/50 border border-amber-500/20'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Instáveis ({summary.unstable})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('offline')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              statusFilter === 'offline'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                : 'bg-rose-950/20 text-rose-400 hover:bg-rose-950/50 border border-rose-500/20'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            Fora do Ar ({summary.offline})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('untested')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              statusFilter === 'untested'
                ? 'bg-slate-700 text-white shadow-md'
                : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800 border border-white/5'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-slate-500" />
            Não Testados ({summary.untested})
          </button>
        </div>

        {/* Category Filter Chips */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 overflow-x-auto pb-1">
          {categories.slice(0, 10).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-slate-700 text-white font-bold border border-white/20'
                  : 'bg-slate-800/40 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* CHANNELS HEALTH MONITOR TABLE */}
      <div className="bg-slate-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        <div className="p-4 bg-slate-900/90 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-3">
            <span className="font-bold text-slate-200">
              Grade de Monitoramento • Exibindo {Math.min(displayLimit, filteredChannels.length)} de {filteredChannels.length} canais
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-white/5">
              Total Geral: {channels.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">Mostrar:</span>
            {[100, 250, 500].map(limit => (
              <button
                key={limit}
                type="button"
                onClick={() => setDisplayLimit(limit)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  displayLimit === limit
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                {limit}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setDisplayLimit(filteredChannels.length)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                displayLimit >= filteredChannels.length
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'bg-slate-800 hover:bg-slate-700 text-teal-300 border border-teal-500/20'
              }`}
            >
              Ver Todos ({filteredChannels.length})
            </button>
          </div>
        </div>

        {filteredChannels.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <Activity className="w-10 h-10 text-slate-600 mx-auto" />
            <p className="text-sm font-semibold text-slate-300">Nenhum canal encontrado com os filtros selecionados.</p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('Todos');
                setStatusFilter('all');
              }}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
            >
              Limpar Todos os Filtros
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-800/60 text-slate-400 border-b border-white/5 uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-4">Canal</th>
                  <th className="py-3 px-3">Categoria</th>
                  <th className="py-3 px-3">Status do Sinal</th>
                  <th className="py-3 px-3">Latência</th>
                  <th className="py-3 px-3">Servidor / URL</th>
                  <th className="py-3 px-3">Visível na Grade</th>
                  <th className="py-3 px-4 text-right">Ações de Teste</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-200">
                {filteredChannels.slice(0, displayLimit).map((channel) => {
                  const health = healthMap.get(channel.id);
                  const isTesting = testingChannelIds.has(channel.id);
                  const status = health ? health.status : 'untested';

                  return (
                    <tr 
                      key={channel.id} 
                      className={`hover:bg-white/[0.03] transition-colors ${
                        status === 'offline' ? 'bg-rose-950/10' : ''
                      }`}
                    >
                      {/* Logo + Name */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {channel.logo ? (
                            <img
                              src={channel.logo}
                              alt={channel.name}
                              className="w-8 h-8 rounded-lg object-contain bg-slate-800 p-0.5 border border-white/10 shrink-0"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 shrink-0">
                              <Tv className="w-4 h-4" />
                            </div>
                          )}
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-bold text-white text-xs">{channel.name}</p>
                              {channel.sources.length > 1 && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                                  {channel.sources.length} Opções
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className="text-[10px] text-slate-400">ID: {channel.id}</span>
                              {channel.sources.length > 1 && (
                                <div className="flex items-center gap-1">
                                  {channel.sources.map((src, sIdx) => (
                                    <button
                                      key={sIdx}
                                      type="button"
                                      onClick={() => handleTestChannel(channel, sIdx)}
                                      className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-teal-900/60 text-slate-300 hover:text-teal-200 border border-white/5 cursor-pointer"
                                      title={`Testar ${src.quality || `Opção ${sIdx + 1}`}`}
                                    >
                                      {src.quality || `Opção ${sIdx + 1}`}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-800 text-slate-300 border border-white/5 whitespace-nowrap">
                          {channel.category}
                        </span>
                      </td>

                      {/* Health Status Badge */}
                      <td className="py-3 px-3">
                        {isTesting ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-500/40">
                            <RefreshCw className="w-3 h-3 animate-spin text-indigo-400" />
                            Testando...
                          </span>
                        ) : status === 'online' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-950/60 text-emerald-300 border border-emerald-500/40">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                            ONLINE
                          </span>
                        ) : status === 'unstable' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-950/60 text-amber-300 border border-amber-500/40">
                            <AlertTriangle className="w-3 h-3 text-amber-400" />
                            INSTÁVEL
                          </span>
                        ) : status === 'offline' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-950/60 text-rose-300 border border-rose-500/40">
                            <XCircle className="w-3 h-3 text-rose-400" />
                            FORA DO AR
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-white/10">
                            <Clock className="w-3 h-3" />
                            NÃO TESTADO
                          </span>
                        )}
                      </td>

                      {/* Latency */}
                      <td className="py-3 px-3">
                        {health?.latencyMs !== undefined && health.latencyMs > 0 ? (
                          <span className={`font-mono text-xs font-semibold ${
                            health.latencyMs < 500 
                              ? 'text-emerald-400' 
                              : health.latencyMs < 1500 
                              ? 'text-amber-400' 
                              : 'text-rose-400'
                          }`}>
                            {health.latencyMs} ms
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">--</span>
                        )}
                      </td>

                      {/* Server / Stream URL */}
                      <td className="py-3 px-3 max-w-[200px]">
                        <p className="font-mono text-[10px] text-slate-400 truncate" title={channel.sources[0]?.url || ''}>
                          {channel.sources[0]?.url || 'Sem URL'}
                        </p>
                        {health?.error && (
                          <p className="text-[10px] text-rose-400 font-medium truncate mt-0.5" title={health.error}>
                            Motivo: {health.error}
                          </p>
                        )}
                      </td>

                      {/* Active in Public Catalog Switch */}
                      <td className="py-3 px-3">
                        <button
                          type="button"
                          onClick={() => handleToggleChannelActive(channel)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-colors ${
                            channel.isActive
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
                              : 'bg-slate-800 text-slate-400 border border-white/5 hover:bg-slate-700'
                          }`}
                          title={channel.isActive ? 'Clique para desativar da grade pública' : 'Clique para ativar na grade pública'}
                        >
                          {channel.isActive ? <Eye className="w-3 h-3 text-emerald-400" /> : <EyeOff className="w-3 h-3" />}
                          <span>{channel.isActive ? 'Ativo' : 'Oculto'}</span>
                        </button>
                      </td>

                      {/* Action Buttons */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Test Signal Button */}
                          <button
                            type="button"
                            disabled={isTesting}
                            onClick={() => handleTestChannel(channel)}
                            className="p-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 transition-colors cursor-pointer disabled:opacity-50"
                            title="Testar Conectividade e Latência"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin text-indigo-400' : ''}`} />
                          </button>

                          {/* Quick Mini Player View */}
                          <button
                            type="button"
                            onClick={() => handleOpenInlinePreview(channel)}
                            className="p-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/30 transition-colors cursor-pointer"
                            title="Testar Vídeo e Áudio no Mini-Player"
                          >
                            <Play className="w-3.5 h-3.5" />
                          </button>

                          {/* Full player */}
                          <button
                            type="button"
                            onClick={() => onPreviewChannel(channel)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10 transition-colors cursor-pointer"
                            title="Abrir no Player Principal da Aplicação"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filteredChannels.length > displayLimit && (
              <div className="p-4 bg-slate-950/80 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
                <span>
                  Exibindo <strong>{Math.min(displayLimit, filteredChannels.length)}</strong> de <strong>{filteredChannels.length}</strong> canais.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDisplayLimit(prev => Math.min(prev + 100, filteredChannels.length))}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer shadow-md shadow-indigo-600/30"
                  >
                    Carregar Mais 100 Canais
                  </button>
                  <button
                    type="button"
                    onClick={() => setDisplayLimit(filteredChannels.length)}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-teal-300 font-semibold rounded-xl text-xs border border-teal-500/20 transition-colors cursor-pointer"
                  >
                    Exibir Todos ({filteredChannels.length})
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
