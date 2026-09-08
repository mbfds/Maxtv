import React, { useState, useEffect } from 'react';
import {
  Layers,
  Sparkles,
  Link,
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Server,
  Zap,
  Radio,
  Tv,
  ExternalLink,
  Search,
  Filter,
  Check,
  Copy,
  ChevronDown,
  ChevronUp,
  Activity,
  Play,
  ShieldCheck,
  FileCode,
  Clock,
  History,
  Sliders,
  Plus,
  Trash2,
  Percent,
  BarChart3,
  Calendar,
  X,
  Eye,
  Info
} from 'lucide-react';
import { api } from '../services/api';
import { Channel, UnifyGradeStats, M3uImportLogEntry, M3uAutoUpdateConfig, M3uAutoUpdateSource, SimilarityMatchLog } from '../types';

interface M3uUnifierManagerProps {
  currentUser?: { name?: string; email?: string };
  onRefreshChannels?: () => Promise<void> | void;
  onPreviewChannel?: (channel: Channel) => void;
}

export const M3uUnifierManager: React.FC<M3uUnifierManagerProps> = ({
  currentUser,
  onRefreshChannels,
  onPreviewChannel
}) => {
  // Stats
  const [stats, setStats] = useState<UnifyGradeStats | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Tabs within unifier: 'url' | 'file' | 'browse' | 'autoupdate' | 'logs'
  const [subTab, setSubTab] = useState<'url' | 'file' | 'browse' | 'autoupdate' | 'logs'>('url');

  // URL import form
  const [m3uUrl, setM3uUrl] = useState<string>('');
  const [sourceLabel, setSourceLabel] = useState<string>('');
  const [unifyWithExisting, setUnifyWithExisting] = useState<boolean>(true);

  // File / Text import form
  const [rawM3uContent, setRawM3uContent] = useState<string>('');
  const [uploadedFileName, setUploadedFileName] = useState<string>('');

  // Auto-Update Configuration State
  const [autoUpdateConfig, setAutoUpdateConfig] = useState<M3uAutoUpdateConfig | null>(null);
  const [isSavingAutoUpdate, setIsSavingAutoUpdate] = useState<boolean>(false);
  const [isRunningAutoUpdate, setIsRunningAutoUpdate] = useState<boolean>(false);
  const [newSourceUrl, setNewSourceUrl] = useState<string>('');
  const [newSourceName, setNewSourceName] = useState<string>('');

  // Import Logs State
  const [importLogs, setImportLogs] = useState<M3uImportLogEntry[]>([]);
  const [selectedLogForDetails, setSelectedLogForDetails] = useState<M3uImportLogEntry | null>(null);
  const [isClearingLogs, setIsClearingLogs] = useState<boolean>(false);

  // Search & Filters for Browse view
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [multiSourceOnly, setMultiSourceOnly] = useState<boolean>(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [expandedChannelId, setExpandedChannelId] = useState<string | null>(null);

  // Notification / Result Banner
  const [resultMessage, setResultMessage] = useState<{
    type: 'success' | 'error' | 'info';
    title: string;
    details: string;
    stats?: {
      channelsCount?: number;
      importedCount?: number;
      mergedChannelsCount?: number;
      newChannelsCount?: number;
      totalSourcesCount?: number;
    };
  } | null>(null);

  // Load Unification stats, channels, auto-update config and import logs
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [statsRes, channelsRes, autoConfigRes, logsRes] = await Promise.all([
        api.getUnifyStats().catch(() => null),
        api.getChannels().catch(() => null),
        api.getM3uAutoUpdateConfig().catch(() => null),
        api.getM3uImportLogs().catch(() => null)
      ]);

      if (statsRes && statsRes.success) {
        setStats(statsRes);
      }
      if (channelsRes && channelsRes.channels) {
        setChannels(channelsRes.channels);
      }
      if (autoConfigRes && autoConfigRes.success) {
        setAutoUpdateConfig(autoConfigRes.config);
      }
      if (logsRes && logsRes.success) {
        setImportLogs(logsRes.logs || []);
      }
    } catch (err: any) {
      console.error('Erro ao carregar dados de unificação:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Save Auto-Update Settings (Interval hours, enabled flag)
  const handleSaveAutoUpdateConfig = async (newInterval?: number, newEnabled?: boolean) => {
    if (!autoUpdateConfig) return;
    setIsSavingAutoUpdate(true);
    try {
      const payload: Partial<M3uAutoUpdateConfig> = {
        intervalHours: newInterval !== undefined ? newInterval : autoUpdateConfig.intervalHours,
        enabled: newEnabled !== undefined ? newEnabled : autoUpdateConfig.enabled,
        sources: autoUpdateConfig.sources
      };
      const res = await api.saveM3uAutoUpdateConfig(payload);
      if (res.success && res.config) {
        setAutoUpdateConfig(res.config);
        setResultMessage({
          type: 'success',
          title: 'Configuração Salva!',
          details: res.message
        });
      }
    } catch (err: any) {
      setResultMessage({
        type: 'error',
        title: 'Erro ao Salvar Configuração',
        details: err.message || 'Falha ao salvar parâmetros de auto-atualização'
      });
    } finally {
      setIsSavingAutoUpdate(false);
    }
  };

  // Run Auto-Update Cycle Now
  const handleRunAutoUpdateNow = async () => {
    setIsRunningAutoUpdate(true);
    setResultMessage(null);
    try {
      const res = await api.runM3uAutoUpdateNow(currentUser?.name || 'Administrador');
      setResultMessage({
        type: 'success',
        title: 'Ciclo de Atualização Concluído!',
        details: res.message,
        stats: res.stats ? {
          channelsCount: res.stats.finalGradeCount,
          importedCount: res.stats.totalFound,
          mergedChannelsCount: res.stats.duplicatesConsolidated,
          newChannelsCount: res.stats.newChannelsAdded
        } : undefined
      });
      await loadData();
      if (onRefreshChannels) await onRefreshChannels();
    } catch (err: any) {
      setResultMessage({
        type: 'error',
        title: 'Erro na Auto-Atualização',
        details: err.message || 'Não foi possível atualizar as fontes no momento.'
      });
    } finally {
      setIsRunningAutoUpdate(false);
    }
  };

  // Add a new M3U source to periodic monitoring
  const handleAddSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSourceUrl.trim()) return;

    setIsSavingAutoUpdate(true);
    try {
      const res = await api.saveM3uSource({
        name: newSourceName.trim(),
        url: newSourceUrl.trim()
      });
      if (res.success) {
        if (res.config) {
          setAutoUpdateConfig(res.config);
        } else if (res.sources && autoUpdateConfig) {
          setAutoUpdateConfig({ ...autoUpdateConfig, sources: res.sources });
        }
        setNewSourceUrl('');
        setNewSourceName('');
        setResultMessage({
          type: 'success',
          title: 'Fonte M3U8 Salva com Sucesso!',
          details: res.message || 'URL registrada e salva permanentemente no disco para monitoramento.'
        });
        await loadData();
      }
    } catch (err: any) {
      setResultMessage({
        type: 'error',
        title: 'Erro ao Salvar Fonte M3U8',
        details: err.message || 'Falha ao salvar fonte'
      });
    } finally {
      setIsSavingAutoUpdate(false);
    }
  };

  // Toggle enable/disable source
  const handleToggleSource = async (id: string) => {
    if (!autoUpdateConfig) return;
    const updatedSources = autoUpdateConfig.sources.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s);
    setAutoUpdateConfig({ ...autoUpdateConfig, sources: updatedSources });
    try {
      await api.saveM3uAutoUpdateConfig({ sources: updatedSources });
    } catch (err: any) {
      console.error('Falha ao alternar fonte:', err);
    }
  };

  // Delete source from monitoring
  const handleDeleteSource = async (id: string) => {
    if (!autoUpdateConfig) return;
    const updatedSources = autoUpdateConfig.sources.filter(s => s.id !== id);
    setAutoUpdateConfig({ ...autoUpdateConfig, sources: updatedSources });
    try {
      await api.saveM3uAutoUpdateConfig({ sources: updatedSources });
    } catch (err: any) {
      console.error('Falha ao remover fonte:', err);
    }
  };

  // Clear Import History Logs
  const handleClearLogs = async () => {
    if (!window.confirm('Tem certeza que deseja limpar todo o histórico de logs de importação?')) {
      return;
    }
    setIsClearingLogs(true);
    try {
      const res = await api.clearM3uImportLogs();
      if (res.success) {
        setImportLogs([]);
        setSelectedLogForDetails(null);
        setResultMessage({
          type: 'info',
          title: 'Logs Limpos',
          details: res.message
        });
      }
    } catch (err: any) {
      setResultMessage({
        type: 'error',
        title: 'Erro ao Limpar Logs',
        details: err.message
      });
    } finally {
      setIsClearingLogs(false);
    }
  };

  // Quick preset URLs
  const presetLists = [
    {
      name: 'Ramys - CanaisBR03.m3u8 (Oficial ~988 canais)',
      url: 'https://raw.githubusercontent.com/Ramys/Iptv-Brasil-2026/master/CanaisBR03.m3u8',
      label: 'Ramys Oficial BR03'
    },
    {
      name: 'Ramys - CanaisBR01.m3u8 (Backup 1)',
      url: 'https://raw.githubusercontent.com/Ramys/Iptv-Brasil-2026/master/CanaisBR01.m3u8',
      label: 'Ramys Backup BR01'
    },
    {
      name: 'Ramys - CanaisBR02.m3u8 (Backup 2)',
      url: 'https://raw.githubusercontent.com/Ramys/Iptv-Brasil-2026/master/CanaisBR02.m3u8',
      label: 'Ramys Backup BR02'
    },
    {
      name: 'Ramys - CanaisEuropa.m3u8 (Internacionais)',
      url: 'https://raw.githubusercontent.com/Ramys/Iptv-Brasil-2026/master/CanaisEuropa.m3u8',
      label: 'Ramys Europa / Mundo'
    }
  ];

  // 1-Click Unify All Known Sources Now
  const handleUnifyAllNow = async () => {
    setIsProcessing(true);
    setResultMessage(null);
    try {
      const res = await api.unifyChannelsNow(currentUser?.name || 'Administrador');
      setResultMessage({
        type: 'success',
        title: 'Grade Unificada com Sucesso!',
        details: res.message,
        stats: {
          channelsCount: res.channelsCount,
          mergedChannelsCount: res.mergedChannelsCount,
          newChannelsCount: res.newChannelsCount,
          totalSourcesCount: res.totalSourcesCount
        }
      });
      await loadData();
      if (onRefreshChannels) await onRefreshChannels();
    } catch (err: any) {
      setResultMessage({
        type: 'error',
        title: 'Falha na Unificação',
        details: err.message || 'Ocorreu um erro ao processar a unificação dos canais.'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Import URL Handler
  const handleImportUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!m3uUrl.trim()) return;

    setIsProcessing(true);
    setResultMessage(null);
    try {
      const res = await api.importM3uUrl({
        url: m3uUrl.trim(),
        sourceLabel: sourceLabel.trim() || undefined,
        unifyWithExisting,
        author: currentUser?.name || 'Administrador'
      });

      setResultMessage({
        type: 'success',
        title: 'M3U8 Importado e Unificado!',
        details: res.message,
        stats: {
          channelsCount: res.channelsCount,
          importedCount: res.importedCount,
          mergedChannelsCount: res.mergedChannelsCount,
          newChannelsCount: res.newChannelsCount,
          totalSourcesCount: res.totalSourcesCount
        }
      });

      setM3uUrl('');
      setSourceLabel('');
      await loadData();
      if (onRefreshChannels) await onRefreshChannels();
    } catch (err: any) {
      setResultMessage({
        type: 'error',
        title: 'Erro ao Importar URL',
        details: err.message || 'Verifique se o link está acessível publicamente.'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // File Upload Handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      if (content) {
        setRawM3uContent(content);
      }
    };
    reader.readAsText(file);
  };

  // Process File/Raw Text Handler
  const handleImportContent = async () => {
    if (!rawM3uContent.trim()) return;

    setIsProcessing(true);
    setResultMessage(null);
    try {
      const res = await api.importM3uContent({
        content: rawM3uContent,
        fileName: uploadedFileName || 'M3U8 Personalizado',
        unifyWithExisting,
        author: currentUser?.name || 'Administrador'
      });

      setResultMessage({
        type: 'success',
        title: 'Conteúdo M3U8 Unificado!',
        details: res.message,
        stats: {
          channelsCount: res.channelsCount,
          importedCount: res.importedCount,
          mergedChannelsCount: res.mergedChannelsCount,
          newChannelsCount: res.newChannelsCount,
          totalSourcesCount: res.totalSourcesCount
        }
      });

      setRawM3uContent('');
      setUploadedFileName('');
      await loadData();
      if (onRefreshChannels) await onRefreshChannels();
    } catch (err: any) {
      setResultMessage({
        type: 'error',
        title: 'Erro ao Importar Arquivo',
        details: err.message || 'Verifique se a sintaxe M3U8 é válida.'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Filtered Channels for browsing
  const filteredChannels = channels.filter(c => {
    if (multiSourceOnly && (!c.sources || c.sources.length < 2)) return false;
    if (selectedCategory !== 'Todos' && c.category !== selectedCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = c.name.toLowerCase().includes(q);
      const matchCat = c.category?.toLowerCase().includes(q);
      const matchSources = c.sources?.some(s => s.name?.toLowerCase().includes(q) || s.url?.toLowerCase().includes(q));
      return matchName || matchCat || matchSources;
    }
    return true;
  });

  const uniqueCategories = Array.from(new Set(channels.map(c => c.category).filter(Boolean)));

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Banner: Unification Engine */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-teal-950/40 border border-teal-500/20 rounded-2xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-teal-500/10 text-teal-300 border border-teal-500/20">
                <Layers className="w-3.5 h-3.5" />
                Motor de Unificação Multi-Fontes
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <ShieldCheck className="w-3.5 h-3.5" />
                Contingência Automática (Opção 2)
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                <Radio className="w-3.5 h-3.5" />
                Visível para Todos os Usuários
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Grade Unificada de Canais M3U8
            </h2>

            <p className="text-slate-400 text-sm sm:text-base max-w-3xl leading-relaxed">
              Consolide múltiplas listas M3U8 em uma única grade oficial. Quando o mesmo canal aparecer em fontes diferentes (ex: Globo, Premiere, SporTV, ESPN), o sistema não duplicará a grade: <strong className="text-teal-300">ele adicionará automaticamente a nova fonte como Opção 2, Opção 3 (backup)</strong> dentro do mesmo canal.
            </p>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-3">
            <button
              onClick={handleUnifyAllNow}
              disabled={isProcessing}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-teal-500 via-emerald-500 to-teal-600 hover:from-teal-400 hover:to-emerald-500 text-slate-950 shadow-lg shadow-teal-900/40 transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Unificando Grade...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Unificar Grade Agora
                </>
              )}
            </button>

            <button
              onClick={loadData}
              disabled={isLoading}
              title="Recarregar dados"
              className="p-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Live Grade Stats KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8 pt-6 border-t border-slate-800/80">
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Canais Únicos</span>
              <Tv className="w-3.5 h-3.5 text-teal-400" />
            </div>
            <div className="text-2xl font-black text-white">
              {stats ? stats.totalChannels.toLocaleString('pt-BR') : channels.length.toLocaleString('pt-BR')}
            </div>
            <p className="text-[11px] text-teal-400/80 mt-1">Grade Oficial Ativa</p>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Streams / Fontes</span>
              <Server className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-2xl font-black text-emerald-400">
              {stats ? stats.totalSources.toLocaleString('pt-BR') : '-'}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Total de opções ativas</p>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Com Opção 2 (Backup)</span>
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <div className="text-2xl font-black text-indigo-300">
              {stats ? stats.multiSourceChannels.toLocaleString('pt-BR') : '-'}
            </div>
            <p className="text-[11px] text-indigo-400/80 mt-1">Multi-Servidores</p>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Média por Canal</span>
              <Zap className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-2xl font-black text-amber-300">
              {stats ? `${stats.avgSourcesPerChannel}x` : '1.0x'}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Fontes / Canal</p>
          </div>
        </div>
      </div>

      {/* Result Notification Banner */}
      {resultMessage && (
        <div className={`p-5 rounded-2xl border flex items-start gap-4 transition-all ${
          resultMessage.type === 'success'
            ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
            : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
        }`}>
          {resultMessage.type === 'success' ? (
            <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
          )}

          <div className="space-y-2 flex-1">
            <h4 className="font-bold text-white text-base">{resultMessage.title}</h4>
            <p className="text-sm opacity-90 leading-relaxed">{resultMessage.details}</p>

            {resultMessage.stats && (
              <div className="flex flex-wrap items-center gap-3 pt-2 text-xs font-semibold">
                {resultMessage.stats.channelsCount !== undefined && (
                  <span className="px-2.5 py-1 rounded-lg bg-black/40 border border-white/10 text-white">
                    Total na Grade: {resultMessage.stats.channelsCount} canais
                  </span>
                )}
                {resultMessage.stats.mergedChannelsCount !== undefined && (
                  <span className="px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    + {resultMessage.stats.mergedChannelsCount} adicionados como Opção 2
                  </span>
                )}
                {resultMessage.stats.newChannelsCount !== undefined && (
                  <span className="px-2.5 py-1 rounded-lg bg-teal-500/20 text-teal-300 border border-teal-500/30">
                    + {resultMessage.stats.newChannelsCount} novos canais inseridos
                  </span>
                )}
                {resultMessage.stats.totalSourcesCount !== undefined && (
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {resultMessage.stats.totalSourcesCount} servidores totais
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Subtabs Selector */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setSubTab('url')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            subTab === 'url'
              ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Link className="w-4 h-4" />
          <span>Colar Links M3U8</span>
        </button>

        <button
          onClick={() => setSubTab('file')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            subTab === 'file'
              ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Upload className="w-4 h-4" />
          <span>Arquivo M3U / Texto</span>
        </button>

        <button
          onClick={() => setSubTab('autoupdate')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            subTab === 'autoupdate'
              ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Auto-Atualização</span>
          {autoUpdateConfig && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
              autoUpdateConfig.enabled ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'
            }`}>
              {autoUpdateConfig.enabled ? `${autoUpdateConfig.intervalHours}h` : 'Pausado'}
            </span>
          )}
        </button>

        <button
          onClick={() => setSubTab('logs')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            subTab === 'logs'
              ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Logs & Transparência</span>
          {importLogs.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
              {importLogs.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setSubTab('browse')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            subTab === 'browse'
              ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Tv className="w-4 h-4" />
          <span>Explorar Grade ({channels.length})</span>
        </button>
      </div>

      {/* SUBTAB 1: PASTE M3U8 URLS */}
      {subTab === 'url' && (
        <div className="space-y-6">
          <form onSubmit={handleImportUrl} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Link className="w-4 h-4 text-teal-400" />
                Inserir Link de Lista M3U8 para Unificar
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Cole abaixo a URL pública da lista M3U8 (GitHub raw, Pastebin, CDN ou servidor próprio). O sistema fará o download, analisará todos os canais e unificará com a grade existente adicionando opções de contingência.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  URL da Lista M3U / M3U8 *
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://raw.githubusercontent.com/.../lista.m3u8"
                  value={m3uUrl}
                  onChange={(e) => setM3uUrl(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Nome / Rótulo da Fonte (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Servidor Backup SP, Fonte Alternativa 2026"
                    value={sourceLabel}
                    onChange={(e) => setSourceLabel(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div className="flex items-center h-full pt-4 sm:pt-6">
                  <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={unifyWithExisting}
                      onChange={(e) => setUnifyWithExisting(e.target.checked)}
                      className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-teal-600 focus:ring-teal-500"
                    />
                    <span>Unificar com a grade atual (Adicionar canais repetidos como <strong>Opção 2</strong>)</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-800">
              <div className="text-xs text-slate-400">
                A grade resultante será salva imediatamente em <code className="text-teal-300">channels-config.json</code> e atualizada para todos.
              </div>

              <button
                type="submit"
                disabled={!m3uUrl.trim() || isProcessing}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-500 text-white shadow-lg shadow-teal-900/30 transition-all active:scale-95 disabled:opacity-40"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Processando & Unificando...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    Importar e Unificar Agora
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Presets List */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Listas Oficiais Rápidas (1 Clique para carregar URL)
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {presetLists.map((preset, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-teal-500/30 transition-all flex flex-col justify-between gap-3"
                >
                  <div>
                    <span className="font-semibold text-xs text-white block">{preset.name}</span>
                    <span className="font-mono text-[11px] text-slate-400 block truncate mt-1">
                      {preset.url}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/60">
                    <button
                      type="button"
                      onClick={() => {
                        setM3uUrl(preset.url);
                        setSourceLabel(preset.label);
                      }}
                      className="text-xs text-teal-400 hover:text-teal-300 font-semibold"
                    >
                      Usar Esta URL
                    </button>

                    <a
                      href={preset.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-slate-500 hover:text-slate-300 inline-flex items-center gap-1"
                    >
                      Abrir <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 2: FILE UPLOAD / RAW TEXT */}
      {subTab === 'file' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Upload className="w-4 h-4 text-teal-400" />
              Upload de Arquivo M3U/M3U8 ou Colar Conteúdo
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Envie um arquivo .m3u8 do seu computador ou cole as linhas #EXTM3U diretamente na caixa de texto.
            </p>
          </div>

          <div className="space-y-4">
            {/* File drop zone */}
            <div className="border-2 border-dashed border-slate-700 hover:border-teal-500/50 rounded-2xl p-6 text-center transition-all bg-slate-950/40">
              <Upload className="w-8 h-8 text-slate-500 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-200">
                {uploadedFileName ? (
                  <span className="text-teal-400 font-mono">{uploadedFileName}</span>
                ) : (
                  'Clique para selecionar um arquivo .m3u ou .m3u8'
                )}
              </p>
              <p className="text-xs text-slate-500 mt-1">Tamanho máximo recomendado: 10MB</p>
              <input
                type="file"
                accept=".m3u,.m3u8,text/plain"
                onChange={handleFileUpload}
                className="mt-3 block w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-teal-600 file:text-white hover:file:bg-teal-500 cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                <span>Ou Cole o Conteúdo M3U / M3U8 Bruto:</span>
                {rawM3uContent && (
                  <span className="text-[11px] font-mono text-teal-400">
                    ~{rawM3uContent.split('\n').length} linhas
                  </span>
                )}
              </label>
              <textarea
                rows={8}
                value={rawM3uContent}
                onChange={(e) => setRawM3uContent(e.target.value)}
                placeholder="#EXTM3U&#10;#EXTINF:-1 tvg-name=&quot;GLOBO SP HD&quot; group-title=&quot;Abertos&quot;,GLOBO SP HD&#10;http://exemplo.com/live/globo.m3u8"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
              />
            </div>

            <div className="flex items-center">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={unifyWithExisting}
                  onChange={(e) => setUnifyWithExisting(e.target.checked)}
                  className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-teal-600 focus:ring-teal-500"
                />
                <span>Unificar com a grade atual (detectar duplicatas e adicionar como Opção 2)</span>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={() => {
                setRawM3uContent('');
                setUploadedFileName('');
              }}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
            >
              Limpar
            </button>

            <button
              type="button"
              onClick={handleImportContent}
              disabled={!rawM3uContent.trim() || isProcessing}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-500 text-white shadow-lg shadow-teal-900/30 transition-all active:scale-95 disabled:opacity-40"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Processar e Unificar Arquivo
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* SUBTAB 3: BROWSE CURRENT UNIFIED GRADE */}
      {subTab === 'browse' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Buscar canal unificado, categoria ou URL..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="Todos">Todas as Categorias ({channels.length})</option>
                {uniqueCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setMultiSourceOnly(!multiSourceOnly)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                  multiSourceOnly
                    ? 'bg-teal-500/20 text-teal-300 border-teal-500/40 shadow-sm'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Apenas com Opção 2+</span>
              </button>
            </div>
          </div>

          {/* Channels List */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden divide-y divide-slate-800/70">
            <div className="p-3 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400 font-semibold">
              <span>Exibindo {filteredChannels.length} de {channels.length} canais unificados</span>
              <span>Fontes / Opções de Contingência</span>
            </div>

            {filteredChannels.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                Nenhum canal encontrado com os filtros selecionados.
              </div>
            ) : (
              filteredChannels.slice(0, 100).map((ch) => {
                const isExpanded = expandedChannelId === ch.id;
                const sources = ch.sources || [];
                const hasMultiSources = sources.length > 1;

                return (
                  <div key={ch.id} className="p-3.5 hover:bg-slate-800/40 transition-colors">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={ch.logo || 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=100'}
                          alt={ch.name}
                          className="w-9 h-9 rounded-lg object-contain bg-slate-950 border border-slate-800 shrink-0"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=100';
                          }}
                        />

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-white truncate">{ch.name}</span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-300">
                              {ch.category}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5 font-mono truncate">
                            <span className={`inline-flex items-center gap-1 font-bold ${
                              hasMultiSources ? 'text-teal-400' : 'text-slate-400'
                            }`}>
                              <Layers className="w-3 h-3" />
                              {sources.length} {sources.length === 1 ? 'Opção de Stream' : 'Opções (Contingência)'}
                            </span>
                            <span>•</span>
                            <span className="text-slate-500 truncate max-w-[200px] sm:max-w-md">
                              {ch.streamUrl}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {onPreviewChannel && (
                          <button
                            type="button"
                            onClick={() => onPreviewChannel(ch)}
                            className="p-2 rounded-lg bg-teal-600/20 hover:bg-teal-600/40 text-teal-300 transition-colors"
                            title="Testar Player"
                          >
                            <Play className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setExpandedChannelId(isExpanded ? null : ch.id)}
                          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                          title="Ver opções de servidores"
                        >
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* Expanded details: Sources breakdown */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-slate-800/80 pl-12 space-y-2">
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                          Servidores Mapeados para este Canal:
                        </span>

                        <div className="space-y-1.5">
                          {sources.map((src, sIdx) => (
                            <div
                              key={sIdx}
                              className="p-2 rounded-lg bg-slate-950/70 border border-slate-800 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                            >
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  sIdx === 0
                                    ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                                    : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                }`}>
                                  {sIdx === 0 ? 'Opção 1 (Principal)' : `Opção ${sIdx + 1} (Backup)`}
                                </span>
                                <span className="font-semibold text-slate-200">{src.name}</span>
                                {src.quality && (
                                  <span className="text-[10px] text-slate-400 font-mono">[{src.quality}]</span>
                                )}
                              </div>

                              <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 truncate max-w-sm">
                                <span className="truncate">{src.url}</span>
                                <button
                                  type="button"
                                  onClick={() => navigator.clipboard.writeText(src.url)}
                                  className="text-slate-500 hover:text-slate-300"
                                  title="Copiar link do stream"
                                >
                                  <Copy className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {filteredChannels.length > 100 && (
              <div className="p-3 text-center text-xs text-slate-400 bg-slate-950/60">
                Mostrando os primeiros 100 canais. Use a busca acima para filtrar canais específicos entre os {filteredChannels.length} disponíveis.
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBTAB 4: AUTO-UPDATE SCHEDULER */}
      {subTab === 'autoupdate' && (
        <div className="space-y-6">
          {/* Main Card: Interval and Scheduler Controls */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Clock className="w-5 h-5 text-teal-400" />
                  <span>Agendador de Auto-Atualização Periódica de Sinais</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                  Configure o intervalo de tempo para que o servidor busque atualizações automaticamente a partir de todas as fontes M3U8 cadastradas, garantindo que canais inativos sejam revividos e novos sinais sejam unificados sem intervenção manual.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRunAutoUpdateNow}
                  disabled={isRunningAutoUpdate}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-500 text-white shadow-lg shadow-teal-600/30 transition-all disabled:opacity-50"
                >
                  {isRunningAutoUpdate ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Buscando Atualizações...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4" />
                      <span>Sincronizar Fontes Agora</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Status & Next Run Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4">
                <div className="text-xs text-slate-400 flex items-center justify-between mb-1">
                  <span>Status do Agendador</span>
                  <Activity className="w-3.5 h-3.5 text-teal-400" />
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    autoUpdateConfig?.enabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                  }`} />
                  <span className="text-base font-bold text-white">
                    {autoUpdateConfig?.enabled ? 'Ativo & Monitorando' : 'Pausado'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  {autoUpdateConfig?.enabled ? `A cada ${autoUpdateConfig.intervalHours} horas` : 'Atualizações automáticas desativadas'}
                </p>
              </div>

              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4">
                <div className="text-xs text-slate-400 flex items-center justify-between mb-1">
                  <span>Intervalo Configurado</span>
                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                </div>
                <div className="text-xl font-black text-indigo-300">
                  {autoUpdateConfig ? `${autoUpdateConfig.intervalHours}h` : '24h'}
                </div>
                <p className="text-[11px] text-indigo-400/80 mt-1">Renovação periódica</p>
              </div>

              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4">
                <div className="text-xs text-slate-400 flex items-center justify-between mb-1">
                  <span>Próxima Execução</span>
                  <Calendar className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <div className="text-xs font-semibold text-slate-200 truncate">
                  {autoUpdateConfig?.nextRunAt
                    ? new Date(autoUpdateConfig.nextRunAt).toLocaleString('pt-BR')
                    : 'Aguardando agendamento'}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Disparo automático</p>
              </div>

              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4">
                <div className="text-xs text-slate-400 flex items-center justify-between mb-1">
                  <span>Último Status</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="text-xs font-semibold text-emerald-300 truncate">
                  {autoUpdateConfig?.lastRunAt
                    ? new Date(autoUpdateConfig.lastRunAt).toLocaleTimeString('pt-BR')
                    : 'Nenhum ciclo recente'}
                </div>
                <p className="text-[11px] text-slate-400 truncate mt-1">
                  {autoUpdateConfig?.lastMessage || 'Grade pronta'}
                </p>
              </div>
            </div>

            {/* Configure Interval Selector */}
            <div className="p-5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Sliders className="w-3.5 h-3.5 text-teal-400" />
                    <span>Definir Frequência do Ciclo de Auto-Atualização:</span>
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Selecione um dos intervalos pré-definidos ou digite o número exato de horas desejado.
                  </p>
                </div>

                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoUpdateConfig?.enabled ?? true}
                    onChange={(e) => handleSaveAutoUpdateConfig(undefined, e.target.checked)}
                    className="w-4 h-4 rounded text-teal-500 bg-slate-900 border-slate-700 focus:ring-teal-500"
                  />
                  <span className="text-xs font-bold text-white">Habilitar Busca Automática</span>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {[
                  { label: 'A cada 6 horas', hours: 6 },
                  { label: 'A cada 12 horas', hours: 12 },
                  { label: 'A cada 24 horas (Padrão)', hours: 24, recommended: true },
                  { label: 'A cada 48 horas (2 dias)', hours: 48 },
                  { label: 'A cada 72 horas (3 dias)', hours: 72 }
                ].map((item) => {
                  const isSelected = autoUpdateConfig?.intervalHours === item.hours;
                  return (
                    <button
                      key={item.hours}
                      type="button"
                      onClick={() => handleSaveAutoUpdateConfig(item.hours)}
                      disabled={isSavingAutoUpdate}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20'
                          : 'bg-slate-900 text-slate-300 hover:bg-slate-850 border border-slate-800'
                      }`}
                    >
                      {item.label}
                      {item.recommended && (
                        <span className={`text-[9px] px-1.5 py-0.2 rounded font-extrabold ${
                          isSelected ? 'bg-black/30 text-slate-950' : 'bg-teal-500/20 text-teal-300'
                        }`}>
                          Recomendado
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Registered M3U8 Sources for Monitoring */}
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Server className="w-4 h-4 text-teal-400" />
                    <span>Fontes M3U8 Cadastradas para Monitoramento ({autoUpdateConfig?.sources.length || 0})</span>
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    O robô de auto-atualização baixará cada um desses links no intervalo definido, consolidando canais similares em contingências alternativas.
                  </p>
                </div>
              </div>

              <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60">
                {autoUpdateConfig?.sources && autoUpdateConfig.sources.length > 0 ? (
                  autoUpdateConfig.sources.map((src, idx) => (
                    <div key={src.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-900/50 transition-colors">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-teal-500/10 text-teal-300 text-[10px] font-bold flex items-center justify-center border border-teal-500/20">
                            {idx + 1}
                          </span>
                          <span className="text-xs font-bold text-white">{src.name}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            src.enabled
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-slate-800 text-slate-400'
                          }`}>
                            {src.enabled ? 'Ativa' : 'Inativa'}
                          </span>
                        </div>
                        <p className="text-[11px] font-mono text-slate-400 break-all pl-7">
                          {src.url}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 pl-7 sm:pl-0">
                        <button
                          type="button"
                          onClick={() => handleToggleSource(src.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            src.enabled
                              ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                              : 'bg-teal-600/30 text-teal-300 border border-teal-500/30 hover:bg-teal-600/50'
                          }`}
                        >
                          {src.enabled ? 'Desativar' : 'Ativar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSource(src.id)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/50 text-slate-400 hover:text-rose-400 transition-colors"
                          title="Remover fonte do monitoramento"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-6 text-center text-xs text-slate-400">
                    Nenhuma fonte cadastrada. Adicione uma URL abaixo para iniciar o monitoramento.
                  </div>
                )}
              </div>

              {/* Add New Source Form */}
              <form onSubmit={handleAddSource} className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-3">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-teal-400" />
                  <span>Cadastrar Nova Fonte M3U8 para Auto-Atualização:</span>
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-1">
                    <input
                      type="text"
                      placeholder="Nome amigável (ex: Ramys BR03 Oficial)"
                      value={newSourceName}
                      onChange={(e) => setNewSourceName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  <div className="sm:col-span-2 flex gap-2">
                    <input
                      type="url"
                      required
                      placeholder="https://raw.githubusercontent.com/.../lista.m3u8"
                      value={newSourceUrl}
                      onChange={(e) => setNewSourceUrl(e.target.value)}
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
                    />
                    <button
                      type="submit"
                      disabled={isSavingAutoUpdate || !newSourceUrl.trim()}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-500 text-white transition-all disabled:opacity-50 shrink-0"
                    >
                      Adicionar
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 5: IMPORT LOGS & TRANSPARENCY */}
      {subTab === 'logs' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <History className="w-5 h-5 text-teal-400" />
                  <span>Log de Importações & Transparência na Gestão de Sinais</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                  Acompanhe exatamente quantos canais foram encontrados por link M3U8, quantos foram removidos da duplicação direta através da consolidação inteligente em opções alternativas de sinal (Opção 2+), e o estado de saúde da grade unificada.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={loadData}
                  disabled={isLoading}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>Atualizar Logs</span>
                </button>

                {importLogs.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearLogs}
                    disabled={isClearingLogs}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-rose-900/50 text-slate-400 hover:text-rose-300 text-xs font-bold transition-all flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Limpar Histórico</span>
                  </button>
                )}
              </div>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                <div className="text-[11px] text-slate-400 mb-1">Total de Importações</div>
                <div className="text-xl font-bold text-white">{importLogs.length}</div>
                <p className="text-[10px] text-slate-500">Histórico mantido</p>
              </div>

              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                <div className="text-[11px] text-slate-400 mb-1">Canais Processados</div>
                <div className="text-xl font-bold text-teal-300">
                  {importLogs.reduce((acc, curr) => acc + (curr.totalFound || 0), 0).toLocaleString('pt-BR')}
                </div>
                <p className="text-[10px] text-teal-400/80">Encontrados em listas</p>
              </div>

              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                <div className="text-[11px] text-slate-400 mb-1">Consolidados (Opção 2+)</div>
                <div className="text-xl font-bold text-indigo-300">
                  {importLogs.reduce((acc, curr) => acc + (curr.duplicatesConsolidated || 0), 0).toLocaleString('pt-BR')}
                </div>
                <p className="text-[10px] text-indigo-400/80">Removidos da duplicidade</p>
              </div>

              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                <div className="text-[11px] text-slate-400 mb-1">Grade Final Atual</div>
                <div className="text-xl font-bold text-emerald-300">
                  {channels.length.toLocaleString('pt-BR')}
                </div>
                <p className="text-[10px] text-emerald-400/80">Canais consolidados</p>
              </div>
            </div>

            {/* Logs Table */}
            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60">
              {importLogs.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 space-y-2">
                  <History className="w-8 h-8 text-slate-600 mx-auto" />
                  <p>Nenhum log de importação registrado ainda.</p>
                  <p className="text-slate-500">
                    Ao importar listas M3U8 ou executar a auto-atualização, os detalhes completos de canais encontrados vs. removidos aparecerão aqui.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 border-b border-slate-800 text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
                      <tr>
                        <th className="p-3">Data / Hora</th>
                        <th className="p-3">Fonte / Link M3U8</th>
                        <th className="p-3 text-center">Canais Encontrados</th>
                        <th className="p-3 text-center">Consolidados (Opção 2+)</th>
                        <th className="p-3 text-center">Novos Adicionados</th>
                        <th className="p-3 text-center">Grade Final</th>
                        <th className="p-3 text-center">Status</th>
                        <th className="p-3 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {importLogs.map((log) => {
                        const hasMatches = log.similarityMatches && log.similarityMatches.length > 0;
                        return (
                          <tr key={log.id} className="hover:bg-slate-900/50 transition-colors">
                            <td className="p-3 text-slate-300 font-mono whitespace-nowrap">
                              {new Date(log.timestamp).toLocaleString('pt-BR', {
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit'
                              })}
                            </td>

                            <td className="p-3">
                              <div className="font-bold text-white">{log.sourceName}</div>
                              {log.sourceUrl && (
                                <div className="text-[10px] font-mono text-slate-500 truncate max-w-xs" title={log.sourceUrl}>
                                  {log.sourceUrl}
                                </div>
                              )}
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                Autor: <span className="text-slate-300">{log.author}</span>
                                {log.durationMs && <span className="ml-2">({(log.durationMs / 1000).toFixed(1)}s)</span>}
                              </div>
                            </td>

                            <td className="p-3 text-center font-bold text-teal-300">
                              <span className="px-2 py-0.5 rounded-full bg-teal-500/10 border border-teal-500/20">
                                {log.totalFound.toLocaleString('pt-BR')}
                              </span>
                            </td>

                            <td className="p-3 text-center font-bold text-indigo-300">
                              <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20" title="Canais similares convertidos em opções alternativas de stream">
                                {log.duplicatesConsolidated.toLocaleString('pt-BR')}
                              </span>
                            </td>

                            <td className="p-3 text-center font-bold text-emerald-300">
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                                +{log.newChannelsAdded.toLocaleString('pt-BR')}
                              </span>
                            </td>

                            <td className="p-3 text-center font-bold text-white font-mono">
                              {log.finalGradeCount.toLocaleString('pt-BR')}
                            </td>

                            <td className="p-3 text-center whitespace-nowrap">
                              {log.status === 'success' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Sucesso
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
                                  <AlertCircle className="w-3 h-3" />
                                  Erro
                                </span>
                              )}
                            </td>

                            <td className="p-3 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => setSelectedLogForDetails(log)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-teal-300 border border-slate-700 transition-all"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>{hasMatches ? 'Similaridades' : 'Detalhes'}</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DETALHES DE SIMILARIDADE E TRANSPARÊNCIA */}
      {selectedLogForDetails && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-500/10 text-teal-400 flex items-center justify-center border border-teal-500/20">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Transparência de Unificação & Similaridades</h3>
                  <p className="text-xs text-slate-400 font-mono">{selectedLogForDetails.sourceName}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedLogForDetails(null)}
                className="p-2 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-center">
                <div className="text-[10px] text-slate-400">Total Encontrados</div>
                <div className="text-lg font-bold text-teal-300">
                  {selectedLogForDetails.totalFound}
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-center">
                <div className="text-[10px] text-slate-400">Consolidados (Opção 2+)</div>
                <div className="text-lg font-bold text-indigo-300">
                  {selectedLogForDetails.duplicatesConsolidated}
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-center">
                <div className="text-[10px] text-slate-400">Novos na Grade</div>
                <div className="text-lg font-bold text-emerald-300">
                  +{selectedLogForDetails.newChannelsAdded}
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-center">
                <div className="text-[10px] text-slate-400">Grade Final</div>
                <div className="text-lg font-bold text-white">
                  {selectedLogForDetails.finalGradeCount}
                </div>
              </div>
            </div>

            {/* Summary Details Text */}
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 text-xs text-slate-300 leading-relaxed">
              {selectedLogForDetails.details}
            </div>

            {/* Similarity Matches List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              <span className="text-xs font-bold text-white flex items-center justify-between">
                <span>Canais Similares Identificados e Consolidados:</span>
                <span className="text-slate-400 font-normal">
                  {selectedLogForDetails.similarityMatches?.length || 0} correspondências
                </span>
              </span>

              {selectedLogForDetails.similarityMatches && selectedLogForDetails.similarityMatches.length > 0 ? (
                <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden bg-slate-950/50">
                  {selectedLogForDetails.similarityMatches.map((match, mIdx) => (
                    <div key={mIdx} className="p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">{match.unifiedName}</span>
                          <span className="text-[10px] px-2 py-0.2 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold">
                            {match.assignedOptionLabel || 'Opção 2'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Detectado de: <span className="text-slate-200 font-mono">{match.incomingName}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 rounded bg-teal-500/10 text-teal-300 text-[11px] font-mono border border-teal-500/20">
                          {Math.round(match.similarityScore * 100)}% similar
                        </span>
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-xs text-slate-500 border border-slate-800/60 rounded-xl">
                  Nenhuma duplicata similar detectada nesta importação específica (todos os canais eram inéditos ou idênticos).
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-2 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedLogForDetails(null)}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
