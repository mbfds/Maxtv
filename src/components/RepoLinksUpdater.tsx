import React, { useState, useEffect } from 'react';
import { 
  GitBranch, 
  ExternalLink, 
  RefreshCw, 
  CheckCircle, 
  AlertCircle, 
  Tv, 
  Film, 
  Server, 
  Copy, 
  Check, 
  Zap, 
  Radio, 
  Activity, 
  Globe, 
  Sparkles,
  Layers,
  Clock,
  ArrowRight
} from 'lucide-react';
import { api } from '../services/api';
import { RepoLinksInfo, RepoFileMeta } from '../types';

interface RepoLinksUpdaterProps {
  currentUser?: { name?: string; email?: string };
  onRefreshChannels?: () => void;
  onNavigateToHistory?: () => void;
}

export const RepoLinksUpdater: React.FC<RepoLinksUpdaterProps> = ({
  currentUser,
  onRefreshChannels,
  onNavigateToHistory
}) => {
  const [repoInfo, setRepoInfo] = useState<RepoLinksInfo | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeSyncFile, setActiveSyncFile] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<{
    success: boolean;
    message: string;
    details?: string;
    timestamp: string;
  } | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  
  // Custom URL inputs
  const [customUrl, setCustomUrl] = useState<string>('');
  const [customType, setCustomType] = useState<'channels' | 'vod'>('channels');

  // Server health tests
  const [testingHost, setTestingHost] = useState<string | null>(null);
  const [hostResults, setHostResults] = useState<Record<string, {
    online: boolean;
    latencyMs: number;
    status?: number;
    message?: string;
  }>>({});

  const loadRepoData = async () => {
    setIsLoading(true);
    try {
      const data = await api.getRepoLinksInfo();
      setRepoInfo(data);
    } catch (err: any) {
      console.error('Erro ao carregar dados do repositório:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRepoData();
  }, []);

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2500);
  };

  const handleSyncFile = async (fileName: string, isCustom = false) => {
    setActiveSyncFile(fileName);
    setSyncStatus(null);
    try {
      const payload = isCustom
        ? { file: 'custom', customUrl, author: currentUser?.name || 'Administrador' }
        : { file: fileName, author: currentUser?.name || 'Administrador' };

      const res = await api.syncRepoLinks(payload);

      setSyncStatus({
        success: true,
        message: res.message,
        details: res.durationMs ? `Concluído em ${(res.durationMs / 1000).toFixed(2)}s` : undefined,
        timestamp: new Date().toLocaleTimeString('pt-BR')
      });

      if (isCustom) setCustomUrl('');
      
      // Recarregar dados e atualizar app
      await loadRepoData();
      if (onRefreshChannels) onRefreshChannels();
    } catch (err: any) {
      setSyncStatus({
        success: false,
        message: `Falha na sincronização: ${err.message || err}`,
        timestamp: new Date().toLocaleTimeString('pt-BR')
      });
    } finally {
      setActiveSyncFile(null);
    }
  };

  const handleTestHost = async (host: string) => {
    setTestingHost(host);
    try {
      const res = await api.testRepoHost(host);
      setHostResults(prev => ({
        ...prev,
        [host]: {
          online: res.online,
          latencyMs: res.latencyMs,
          status: res.status,
          message: res.message || res.error
        }
      }));
    } catch (err: any) {
      setHostResults(prev => ({
        ...prev,
        [host]: {
          online: false,
          latencyMs: 9999,
          message: err.message || 'Erro de rede'
        }
      }));
    } finally {
      setTestingHost(null);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Banner & Context */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <GitBranch className="w-3.5 h-3.5" />
                GitHub Oficial 2026
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Globe className="w-3.5 h-3.5" />
                Proxy Anti-Bloqueio Ativo
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Atualização de Links IPTV Brasil 2026
            </h2>
            <p className="text-slate-400 text-sm sm:text-base max-w-3xl leading-relaxed">
              Módulo integrado de atualização direta a partir do repositório oficial{' '}
              <a 
                href="https://github.com/Ramys/Iptv-Brasil-2026" 
                target="_blank" 
                rel="noreferrer"
                className="text-emerald-400 hover:text-emerald-300 font-medium underline inline-flex items-center gap-1"
              >
                Ramys/Iptv-Brasil-2026
                <ExternalLink className="w-3 h-3" />
              </a>
              . Baixe listas completas de canais de TV ao vivo em HD/FHD/4K e o catálogo de Filmes e Séries atualizados.
            </p>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-3">
            <button
              onClick={() => handleSyncFile('all')}
              disabled={activeSyncFile !== null}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-900/30 transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
            >
              {activeSyncFile === 'all' ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Sincronizando Tudo...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-emerald-200" />
                  Sincronizar Grade & VOD (1 Clique)
                </>
              )}
            </button>

            <button
              onClick={loadRepoData}
              disabled={isLoading}
              className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
              title="Recarregar dados do GitHub"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Current Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-800/80">
          <div className="bg-slate-950/40 rounded-xl p-3.5 border border-slate-800/60">
            <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
              <Tv className="w-3.5 h-3.5 text-emerald-400" />
              Canais Carregados
            </div>
            <div className="text-xl font-bold text-white mt-1">
              {repoInfo?.currentStats.ramysChannels ?? 0}
            </div>
          </div>

          <div className="bg-slate-950/40 rounded-xl p-3.5 border border-slate-800/60">
            <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
              <Film className="w-3.5 h-3.5 text-purple-400" />
              Filmes & Séries (VOD)
            </div>
            <div className="text-xl font-bold text-white mt-1">
              {repoInfo?.currentStats.ramysVod ?? 0}
            </div>
          </div>

          <div className="bg-slate-950/40 rounded-xl p-3.5 border border-slate-800/60">
            <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-blue-400" />
              Servidor Principal
            </div>
            <div className="text-sm font-semibold text-slate-200 mt-1 truncate">
              tjtor8411.com:80
            </div>
          </div>

          <div className="bg-slate-950/40 rounded-xl p-3.5 border border-slate-800/60">
            <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              Última Verificação
            </div>
            <div className="text-sm font-semibold text-slate-200 mt-1">
              {repoInfo?.currentStats.lastRamysFetch 
                ? new Date(repoInfo.currentStats.lastRamysFetch).toLocaleTimeString('pt-BR') 
                : 'Hoje'}
            </div>
          </div>
        </div>
      </div>

      {/* Sync Status Banner */}
      {syncStatus && (
        <div className={`p-4 rounded-xl border flex items-start gap-3 transition-all ${
          syncStatus.success 
            ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-200' 
            : 'bg-red-950/40 border-red-800/60 text-red-200'
        }`}>
          {syncStatus.success ? (
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 text-sm">
            <div className="font-semibold text-white">
              {syncStatus.success ? 'Sincronização Concluída!' : 'Erro na Sincronização'}
            </div>
            <div className="mt-0.5">{syncStatus.message}</div>
            {syncStatus.details && (
              <div className="text-xs text-slate-400 mt-1 font-mono">{syncStatus.details}</div>
            )}
          </div>
          {onNavigateToHistory && (
            <button
              onClick={onNavigateToHistory}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-200 border border-slate-700/60 inline-flex items-center gap-1 shrink-0"
            >
              Ver Histórico
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* Main Files Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-400" />
            Arquivos de Canais e Filmes no Repositório
          </h3>
          <span className="text-xs text-slate-400">
            {repoInfo?.files.length || 0} arquivos disponíveis
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {repoInfo?.files.map((file: RepoFileMeta) => {
            const isVod = file.type === 'vod';
            const isSyncing = activeSyncFile === file.name;
            const hostInfo = hostResults[file.primaryServer];
            const isTestingThisHost = testingHost === file.primaryServer;

            return (
              <div 
                key={file.name}
                className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-xl p-5 transition-all shadow-md flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`p-2.5 rounded-xl ${
                        isVod ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      }`}>
                        {isVod ? <Film className="w-5 h-5" /> : <Tv className="w-5 h-5" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-white text-base">
                            {file.name}
                          </h4>
                          {file.name === 'CanaisBR03.m3u8' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              Recomendada
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                          <span>{isVod ? 'Catálogo VOD' : 'Grade de TV'}</span>
                          <span>•</span>
                          <span>~{file.approxItems.toLocaleString('pt-BR')} itens</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleCopyUrl(file.url)}
                      className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                      title="Copiar URL raw do GitHub"
                    >
                      {copiedUrl === file.url ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
                    {file.description}
                  </p>

                  {/* Primary server badge & latency test */}
                  <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/70 text-xs">
                    <div className="flex items-center gap-2 text-slate-400">
                      <Server className="w-3.5 h-3.5 text-blue-400" />
                      <span>Servidor:</span>
                      <span className="font-mono text-slate-200">{file.primaryServer}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {hostInfo && (
                        <span className={`inline-flex items-center gap-1 font-mono text-[11px] ${
                          hostInfo.online ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${hostInfo.online ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                          {hostInfo.latencyMs}ms
                        </span>
                      )}
                      <button
                        onClick={() => handleTestHost(file.primaryServer)}
                        disabled={isTestingThisHost}
                        className="text-[11px] font-medium text-slate-300 hover:text-white underline inline-flex items-center gap-1"
                      >
                        {isTestingThisHost ? 'Testando...' : 'Testar Ping'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-800/80 flex items-center justify-between gap-3">
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-slate-400 hover:text-slate-200 inline-flex items-center gap-1 truncate"
                  >
                    Ver no GitHub
                    <ExternalLink className="w-3 h-3" />
                  </a>

                  <button
                    onClick={() => handleSyncFile(file.name)}
                    disabled={activeSyncFile !== null}
                    className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                      isVod
                        ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-900/30'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30'
                    } disabled:opacity-50 active:scale-95`}
                  >
                    {isSyncing ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Baixando Lista...
                      </>
                    ) : (
                      <>
                        <Zap className="w-3.5 h-3.5" />
                        Sincronizar Esta Lista
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Custom Link / Fork Sync Section */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Radio className="w-5 h-5 text-blue-400" />
            Sincronizar Link M3U/M3U8 Personalizado ou Espelho
          </h3>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Deseja utilizar um fork próprio do repositório ou outra URL M3U8 de sua escolha? Cole o endereço direto abaixo.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-8">
            <input
              type="url"
              placeholder="https://raw.githubusercontent.com/.../lista.m3u8"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="sm:col-span-2">
            <select
              value={customType}
              onChange={(e) => setCustomType(e.target.value as 'channels' | 'vod')}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="channels">Canais de TV</option>
              <option value="vod">Filmes/Séries</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <button
              onClick={() => handleSyncFile(customType === 'vod' ? 'Filmes-Series.m3u8' : 'custom', true)}
              disabled={!customUrl.trim() || activeSyncFile !== null}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 transition-all active:scale-95"
            >
              {activeSyncFile === 'custom' ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                'Importar Link'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
