import React, { useState, useEffect } from 'react';
import {
  X,
  Link,
  Upload,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Play,
  Tv,
  ListPlus,
  Layers,
  Sparkles,
  Trash2,
  ExternalLink,
  Clock,
  Radio,
  FileText,
  ShieldCheck,
  ChevronRight,
  Database
} from 'lucide-react';
import { api, getCachedChannels } from '../services/api';
import { Channel } from '../types';
import { ChannelMismatchSummary } from '../utils/channelMismatchDetector';
import { parseM3uText, convertParsedToChannels } from '../utils/m3uParser';

interface ImportChannelsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onChannelsUpdated: (channels: Channel[]) => void;
  currentUser?: { name?: string; email?: string; role?: string };
}

interface QuickPreset {
  label: string;
  description: string;
  url: string;
  tag: string;
}

const PRESET_LISTS: QuickPreset[] = [
  {
    label: 'IPTV-Org Brasil (Canais Públicos)',
    description: 'Transmissões abertas oficiais, educativas e governamentais do Brasil',
    url: 'https://iptv-org.github.io/iptv/countries/br.m3u',
    tag: 'Legal & Oficial'
  },
  {
    label: 'Free-TV Brazil Channels',
    description: 'Rede de emissoras regionais e canais comunitários livres',
    url: 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_brazil.m3u8',
    tag: 'Abertos BR'
  }
];

export const ImportChannelsModal: React.FC<ImportChannelsModalProps> = ({
  isOpen,
  onClose,
  onChannelsUpdated,
  currentUser
}) => {
  const [activeTab, setActiveTab] = useState<'url' | 'file' | 'sources'>('url');
  
  // URL Tab state
  const [m3uUrl, setM3uUrl] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [unifyWithExisting, setUnifyWithExisting] = useState(true);
  const [enableAutoUpdate, setEnableAutoUpdate] = useState(true);
  const [skipHighSeverityMismatches, setSkipHighSeverityMismatches] = useState(false);
  
  // Validation state
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    tested: boolean;
    valid: boolean;
    channelsCount?: number;
    latencyMs?: number;
    sampleChannels?: string[];
    error?: string;
    mismatchesSummary?: ChannelMismatchSummary;
  } | null>(null);

  // File / Text tab state
  const [m3uText, setM3uText] = useState('');
  const [fileName, setFileName] = useState('');

  // Sources tab state
  const [sources, setSources] = useState<any[]>([]);
  const [isLoadingSources, setIsLoadingSources] = useState(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);

  // Execution / Result state
  const [isProcessing, setIsProcessing] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    message: string;
    channelsCount: number;
    importedCount?: number;
    mergedChannelsCount?: number;
    newChannelsCount?: number;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setImportResult(null);
      setErrorMessage(null);
      if (activeTab === 'sources') {
        loadSources();
      }
    }
  }, [isOpen, activeTab]);

  const loadSources = async () => {
    setIsLoadingSources(true);
    try {
      const res = await api.getM3uSources();
      if (res && res.sources) {
        setSources(res.sources);
      }
    } catch {
      // Ignore if offline or failed
    } finally {
      setIsLoadingSources(false);
    }
  };

  if (!isOpen) return null;

  // Handle URL Validation
  const handleValidateUrl = async (urlToTest?: string) => {
    const targetUrl = (urlToTest || m3uUrl).trim();
    if (!targetUrl || !targetUrl.startsWith('http')) {
      setErrorMessage('Por favor, informe uma URL válida iniciando com http:// ou https://');
      return;
    }

    setErrorMessage(null);
    setIsValidating(true);
    setValidationResult(null);

    try {
      const res = await api.validateM3uUrl(targetUrl);
      setValidationResult({
        tested: true,
        valid: res.valid,
        channelsCount: res.channelsCount,
        latencyMs: res.latencyMs,
        sampleChannels: res.sampleChannels,
        error: res.error,
        mismatchesSummary: res.mismatchesSummary
      });

      if (!sourceName) {
        try {
          const parsed = new URL(targetUrl);
          const cleanHost = parsed.hostname.replace('www.', '');
          setSourceName(`Lista ${cleanHost}`);
        } catch {}
      }
    } catch (err: any) {
      setValidationResult({
        tested: true,
        valid: false,
        error: err.message || 'Falha ao conectar com a URL informada'
      });
    } finally {
      setIsValidating(false);
    }
  };

  // Import via URL
  const handleImportUrl = async () => {
    const cleanUrl = m3uUrl.trim();
    if (!cleanUrl || !cleanUrl.startsWith('http')) {
      setErrorMessage('Informe um link válido antes de importar.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setImportResult(null);

    try {
      const author = currentUser?.name || 'Usuário';
      const label = sourceName.trim() || undefined;

      const res = await api.importM3uUrl({
        url: cleanUrl,
        unifyWithExisting,
        author,
        sourceLabel: label,
        skipHighSeverityMismatches
      });

      // Reload channels from server to update global app state immediately
      const fresh = await api.getChannels({ forceRefresh: true });
      if (fresh?.channels && fresh.channels.length > 0) {
        onChannelsUpdated(fresh.channels);
      }

      setImportResult({
        success: true,
        message: res.message || 'Canais importados com sucesso!',
        channelsCount: res.channelsCount || fresh.channels.length,
        importedCount: res.importedCount,
        mergedChannelsCount: res.mergedChannelsCount,
        newChannelsCount: res.newChannelsCount
      });
    } catch (err: any) {
      // Fallback: Attempt client-side download/parse if server had a network restriction
      try {
        const resp = await fetch(cleanUrl);
        if (resp.ok) {
          const text = await resp.text();
          const parsedItems = parseM3uText(text);
          if (parsedItems.length > 0) {
            const clientChannels = convertParsedToChannels(parsedItems);
            // Combine with cached
            const existing = getCachedChannels() || [];
            const merged = unifyWithExisting ? [...existing, ...clientChannels] : clientChannels;
            const cachePayload = JSON.stringify({ data: { channels: merged, count: merged.length }, timestamp: Date.now() });
            localStorage.setItem('maxtv_cache_channels', cachePayload);
            localStorage.setItem('maxtv_channels_cache', cachePayload);
            window.dispatchEvent(new CustomEvent('maxtv_channels_revalidated', { detail: { channels: merged } }));
            onChannelsUpdated(merged);

            setImportResult({
              success: true,
              message: `${clientChannels.length} canais importados e gerados diretamente no navegador com sucesso!`,
              channelsCount: merged.length,
              importedCount: clientChannels.length,
              newChannelsCount: clientChannels.length
            });
            return;
          }
        }
      } catch {}

      setErrorMessage(err.message || 'Erro ao importar lista M3U. Verifique a URL ou o formato do arquivo.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Import via Text / File
  const handleImportText = async () => {
    if (!m3uText.trim()) {
      setErrorMessage('Cole o conteúdo M3U ou carregue um arquivo.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setImportResult(null);

    try {
      const author = currentUser?.name || 'Usuário';
      const res = await api.importM3uContent({
        content: m3uText,
        fileName: fileName || 'lista-importada.m3u',
        unifyWithExisting,
        author
      });

      const fresh = await api.getChannels({ forceRefresh: true });
      if (fresh?.channels && fresh.channels.length > 0) {
        onChannelsUpdated(fresh.channels);
      }

      setImportResult({
        success: true,
        message: res.message || 'Canais processados e adicionados com sucesso!',
        channelsCount: res.channelsCount || fresh.channels.length,
        importedCount: res.importedCount,
        mergedChannelsCount: res.mergedChannelsCount,
        newChannelsCount: res.newChannelsCount
      });
    } catch (err: any) {
      // Fallback: parse directly on client
      const parsedItems = parseM3uText(m3uText);
      if (parsedItems.length > 0) {
        const clientChannels = convertParsedToChannels(parsedItems);
        const existing = getCachedChannels() || [];
        const merged = unifyWithExisting ? [...existing, ...clientChannels] : clientChannels;
        const cachePayload = JSON.stringify({ data: { channels: merged, count: merged.length }, timestamp: Date.now() });
        localStorage.setItem('maxtv_cache_channels', cachePayload);
        localStorage.setItem('maxtv_channels_cache', cachePayload);
        window.dispatchEvent(new CustomEvent('maxtv_channels_revalidated', { detail: { channels: merged } }));
        onChannelsUpdated(merged);

        setImportResult({
          success: true,
          message: `${clientChannels.length} canais criados com sucesso a partir do texto M3U!`,
          channelsCount: merged.length,
          importedCount: clientChannels.length,
          newChannelsCount: clientChannels.length
        });
      } else {
        setErrorMessage(err.message || 'Não foram encontrados canais válidos (#EXTINF) no texto.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setM3uText(content);
      }
    };
    reader.readAsText(file);
  };

  // Handle Sync All
  const handleSyncAllSources = async () => {
    setIsSyncingAll(true);
    setErrorMessage(null);
    try {
      const res = await api.runM3uAutoUpdateNow(currentUser?.name || 'Manual');
      if (res.success) {
        const fresh = await api.getChannels({ forceRefresh: true });
        if (fresh?.channels && fresh.channels.length > 0) {
          onChannelsUpdated(fresh.channels);
        }
        await loadSources();
        setImportResult({
          success: true,
          message: res.message || 'Sincronização de todas as listas concluída!',
          channelsCount: fresh.channels.length
        });
      } else {
        setErrorMessage(res.message || 'Falha na sincronização.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao sincronizar listas.');
    } finally {
      setIsSyncingAll(false);
    }
  };

  // Delete source
  const handleDeleteSource = async (id: string) => {
    try {
      await api.deleteM3uSource(id);
      await loadSources();
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao remover lista.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-white/10 rounded-2xl shadow-2xl shadow-indigo-950/40 overflow-hidden my-8">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <ListPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                Adicionar & Automatizar Canais
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-indigo-600/20 text-indigo-300 border border-indigo-500/30">
                  M3U / IPTV
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Importe listas via link remoto, arquivo ou texto com consolidação automática de servidores.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-white/5 bg-slate-950/40 px-6 pt-2 gap-2">
          <button
            type="button"
            onClick={() => { setActiveTab('url'); setImportResult(null); setErrorMessage(null); }}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all border-b-2 cursor-pointer ${
              activeTab === 'url'
                ? 'border-indigo-500 text-indigo-400 bg-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Link className="w-4 h-4" />
            <span>Link Remoto (URL)</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('file'); setImportResult(null); setErrorMessage(null); }}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all border-b-2 cursor-pointer ${
              activeTab === 'file'
                ? 'border-indigo-500 text-indigo-400 bg-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>Arquivo / Texto M3U</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('sources'); setImportResult(null); setErrorMessage(null); loadSources(); }}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all border-b-2 cursor-pointer ${
              activeTab === 'sources'
                ? 'border-indigo-500 text-indigo-400 bg-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Fontes Salvas & Sincronização</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          
          {/* Error Message */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-2.5 text-red-300 text-xs">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">Não foi possível completar a ação</p>
                <p className="opacity-90 mt-0.5">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Success Message */}
          {importResult && importResult.success && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <h4 className="text-sm font-bold text-emerald-200">Importação e Grade Concluídas!</h4>
              </div>
              <p className="text-xs text-emerald-300/90 leading-relaxed">
                {importResult.message}
              </p>
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-emerald-500/20 text-center">
                <div className="bg-emerald-950/40 p-2 rounded-lg border border-emerald-500/20">
                  <span className="block text-[10px] text-emerald-400 font-medium">Total na Grade</span>
                  <span className="text-base font-bold text-white">{importResult.channelsCount}</span>
                </div>
                {importResult.newChannelsCount !== undefined && (
                  <div className="bg-emerald-950/40 p-2 rounded-lg border border-emerald-500/20">
                    <span className="block text-[10px] text-emerald-400 font-medium">Novos Adicionados</span>
                    <span className="text-base font-bold text-emerald-300">+{importResult.newChannelsCount}</span>
                  </div>
                )}
                {importResult.mergedChannelsCount !== undefined && (
                  <div className="bg-emerald-950/40 p-2 rounded-lg border border-emerald-500/20">
                    <span className="block text-[10px] text-emerald-400 font-medium">Redundâncias (Opção 2+)</span>
                    <span className="text-base font-bold text-indigo-300">+{importResult.mergedChannelsCount}</span>
                  </div>
                )}
              </div>
              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer"
                >
                  Ver Canais na Grade
                </button>
              </div>
            </div>
          )}

          {/* TAB 1: URL IMPORT */}
          {activeTab === 'url' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Link Remoto da Lista M3U / M3U8 <span className="text-red-400">*</span>
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Link className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="url"
                      placeholder="https://exemplo.com/lista.m3u ou .m3u8"
                      value={m3uUrl}
                      onChange={(e) => {
                        setM3uUrl(e.target.value);
                        setValidationResult(null);
                      }}
                      className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleValidateUrl()}
                    disabled={isValidating || !m3uUrl.trim()}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-semibold border border-white/10 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    {isValidating ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                    ) : (
                      <Radio className="w-3.5 h-3.5 text-indigo-400" />
                    )}
                    <span>Testar Link</span>
                  </button>
                </div>
              </div>

              {/* Validation Result Box */}
              {validationResult && (
                <div className={`p-3 rounded-xl border text-xs transition-all ${
                  validationResult.valid 
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold flex items-center gap-1.5">
                      {validationResult.valid ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          Link Válido e Acessível!
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-4 h-4 text-amber-400" />
                          Aviso de Validação
                        </>
                      )}
                    </span>
                    {validationResult.latencyMs && (
                      <span className="text-[10px] text-slate-400">
                        Latência: {validationResult.latencyMs}ms
                      </span>
                    )}
                  </div>
                  {validationResult.channelsCount !== undefined && (
                    <p className="mt-1 text-slate-300">
                      Foram detectados <strong className="text-white">{validationResult.channelsCount} canais</strong> neste link.
                    </p>
                  )}
                  {validationResult.sampleChannels && validationResult.sampleChannels.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-white/5 flex flex-wrap gap-1.5">
                      <span className="text-[10px] text-slate-400 mr-1">Exemplos:</span>
                      {validationResult.sampleChannels.slice(0, 4).map((ch, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded bg-slate-900 text-slate-200 text-[10px] border border-white/5">
                          {ch}
                        </span>
                      ))}
                    </div>
                  )}
                  {validationResult.mismatchesSummary && validationResult.mismatchesSummary.mismatchesCount > 0 && (
                    <div className="mt-3 bg-red-950/20 border border-red-500/20 p-3 rounded-lg">
                      <p className="text-red-300 font-semibold text-[11px] mb-2">
                        {validationResult.mismatchesSummary.mismatchesCount} inconsistências detectadas:
                      </p>
                      <div className="max-h-32 overflow-y-auto space-y-1">
                        {validationResult.mismatchesSummary.mismatches.map((m, i) => (
                          <div key={i} className="text-[10px] text-red-200">
                            <span className="font-bold">{m.channelName}:</span> {m.reason}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {validationResult.error && (
                    <p className="mt-1 text-red-300 font-mono text-[11px]">{validationResult.error}</p>
                  )}
                </div>
              )}

              {/* Optional Name Label */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Nome Identificador da Lista (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Minha Lista IPTV, Canais Abertos BR..."
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-all"
                />
              </div>

              {/* Quick Presets */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Listas Recomendadas (1-Clique para Testar)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {PRESET_LISTS.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setM3uUrl(preset.url);
                        setSourceName(preset.label);
                        handleValidateUrl(preset.url);
                      }}
                      className="flex flex-col text-left p-2.5 rounded-xl bg-slate-950/60 hover:bg-indigo-950/30 border border-white/5 hover:border-indigo-500/30 transition-all cursor-pointer group"
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-xs font-bold text-white group-hover:text-indigo-300 transition-colors">
                          {preset.label}
                        </span>
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          {preset.tag}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 line-clamp-1">
                        {preset.description}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Options Checkboxes */}
              <div className="space-y-2.5 pt-2 border-t border-white/5">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={unifyWithExisting}
                    onChange={(e) => setUnifyWithExisting(e.target.checked)}
                    className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-950 border-white/20"
                  />
                  <div>
                    <span className="block text-xs font-semibold text-slate-200">
                      Unificar e Mesclar com canais existentes (Recomendado)
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      Preserva os canais atuais. Canais com mesmo nome ganham links de contingência automáticos (Servidor 1, Servidor 2).
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableAutoUpdate}
                    onChange={(e) => setEnableAutoUpdate(e.target.checked)}
                    className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-950 border-white/20"
                  />
                  <div>
                    <span className="block text-xs font-semibold text-slate-200">
                      Salvar na Lista de Fontes para Auto-Sincronização Periódica
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      O servidor manterá este link atualizado automaticamente em segundo plano.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skipHighSeverityMismatches}
                    onChange={(e) => setSkipHighSeverityMismatches(e.target.checked)}
                    className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-950 border-white/20"
                  />
                  <div>
                    <span className="block text-xs font-semibold text-slate-200">
                      Ignorar automaticamente canais com erro grave
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      Não importará canais que apresentem conflitos críticos de emissora ou troca de grade.
                    </span>
                  </div>
                </label>
              </div>

              {/* Action Button */}
              <button
                type="button"
                onClick={handleImportUrl}
                disabled={isProcessing || !m3uUrl.trim()}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Baixando, Processando e Gerando Grade...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-indigo-200" />
                    <span>Importar Canais e Atualizar Grade</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* TAB 2: FILE OR TEXT IMPORT */}
          {activeTab === 'file' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Carregar Arquivo .M3U / .M3U8 do Computador
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept=".m3u,.m3u8,.txt"
                    onChange={handleFileUpload}
                    className="block w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-600/20 file:text-indigo-300 hover:file:bg-indigo-600/30 file:cursor-pointer cursor-pointer border border-white/10 rounded-xl bg-slate-950"
                  />
                </div>
              </div>

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-white/5"></div>
                <span className="flex-shrink mx-3 text-[10px] text-slate-500 uppercase tracking-widest font-bold">Ou cole o texto M3U</span>
                <div className="flex-grow border-t border-white/5"></div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Conteúdo M3U (Texto com #EXTINF)
                </label>
                <textarea
                  rows={6}
                  placeholder="#EXTM3U&#10;#EXTINF:-1 tvg-logo=&quot;...&quot; group-title=&quot;Abertos&quot;,Canal Exemplo&#10;https://servidor.com/live/stream.m3u8"
                  value={m3uText}
                  onChange={(e) => setM3uText(e.target.value)}
                  className="w-full p-3 bg-slate-950 border border-white/10 rounded-xl text-xs text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-all resize-none"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Linhas digitadas: {m3uText ? m3uText.split('\n').length : 0}
                </span>
              </div>

              <div className="pt-2 border-t border-white/5">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={unifyWithExisting}
                    onChange={(e) => setUnifyWithExisting(e.target.checked)}
                    className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-950 border-white/20"
                  />
                  <div>
                    <span className="block text-xs font-semibold text-slate-200">
                      Mesclar com a grade existente
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      Não apaga os canais já cadastrados na plataforma.
                    </span>
                  </div>
                </label>
              </div>

              <button
                type="button"
                onClick={handleImportText}
                disabled={isProcessing || !m3uText.trim()}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Processando e Adicionando Canais...</span>
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4 text-indigo-200" />
                    <span>Importar Canais do Texto / Arquivo</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* TAB 3: SAVED SOURCES & AUTO SYNC */}
          {activeTab === 'sources' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-white">Fontes de M3U Cadastradas no Sistema</h3>
                  <p className="text-[11px] text-slate-400">
                    O servidor realiza varredura periódica para manter os links dos canais sempre frescos.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSyncAllSources}
                  disabled={isSyncingAll}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingAll ? 'animate-spin' : ''}`} />
                  <span>Sincronizar Todas</span>
                </button>
              </div>

              {isLoadingSources ? (
                <div className="p-8 text-center">
                  <RefreshCw className="w-6 h-6 animate-spin text-indigo-400 mx-auto mb-2" />
                  <span className="text-xs text-slate-400">Carregando fontes salvas...</span>
                </div>
              ) : sources.length === 0 ? (
                <div className="p-8 text-center rounded-xl bg-slate-950/40 border border-white/5">
                  <Database className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-xs text-slate-300 font-semibold">Nenhuma fonte M3U remota salva ainda</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Adicione um link na aba &quot;Link Remoto (URL)&quot; para ativar a auto-atualização contínua.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {sources.map((src) => (
                    <div
                      key={src.id}
                      className="p-3 rounded-xl bg-slate-950 border border-white/5 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-400" />
                          <h4 className="text-xs font-bold text-white truncate">{src.name}</h4>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-600/20 text-indigo-300 border border-indigo-500/20">
                            Ativo
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                          {src.url}
                        </p>
                        {src.lastRunAt && (
                          <span className="text-[9px] text-slate-500 block mt-1">
                            Última checagem: {new Date(src.lastRunAt).toLocaleString('pt-BR')}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleDeleteSource(src.id)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-white/5 transition-colors cursor-pointer"
                          title="Remover Fonte"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer info */}
        <div className="px-6 py-3 border-t border-white/5 bg-slate-950/60 flex items-center justify-between text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
            Canais unificados com detecção de redundância e streaming direto
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
