import React, { useState, useEffect, useMemo } from 'react';
import { 
  Layers, 
  GitBranch, 
  Plus, 
  Link as LinkIcon, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  RefreshCw, 
  Trash2, 
  Copy, 
  Check, 
  ExternalLink, 
  Tv, 
  Film, 
  Activity, 
  Database,
  Search,
  Zap,
  Globe,
  Radio,
  Sliders,
  Sparkles,
  Edit3,
  Calendar,
  X,
  PlayCircle,
  HelpCircle,
  SlidersHorizontal,
  FolderUp,
  FileText
} from 'lucide-react';
import { api } from '../services/api';
import { M3uAutoUpdateSource, M3uAutoUpdateConfig } from '../types';
import { M3uUnifierManager } from './M3uUnifierManager';
import { XmltvValidatorManager } from './XmltvValidatorManager';

export type UnifiedSubTab = 'hub' | 'fuzzy' | 'file' | 'autoupdate' | 'logs' | 'epg-validator';

interface UnifiedLinksManagerProps {
  currentUser?: { name?: string; email?: string };
  onRefreshChannels?: () => void;
  onNavigateToHistory?: () => void;
  defaultSubTab?: string;
}

export const UnifiedLinksManager: React.FC<UnifiedLinksManagerProps> = ({
  currentUser,
  onRefreshChannels,
  onNavigateToHistory,
  defaultSubTab = 'hub'
}) => {
  // Normalizar aba inicial
  const resolveInitialTab = (tab: string): UnifiedSubTab => {
    if (tab === 'fuzzy' || tab === 'unifier') return 'fuzzy';
    if (tab === 'file') return 'file';
    if (tab === 'autoupdate') return 'autoupdate';
    if (tab === 'logs') return 'logs';
    if (tab === 'epg-validator') return 'epg-validator';
    return 'hub';
  };

  const [subTab, setSubTab] = useState<UnifiedSubTab>(resolveInitialTab(defaultSubTab));
  const [sources, setSources] = useState<M3uAutoUpdateSource[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Formulário Único e Oficial para Adicionar Link IPTV
  const [newLinkName, setNewLinkName] = useState<string>('');
  const [newLinkUrl, setNewLinkUrl] = useState<string>('');
  const [newLinkType, setNewLinkType] = useState<'channels' | 'vod' | 'all'>('channels');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{
    valid: boolean;
    error?: string;
    channelsCount?: number;
    latencyMs?: number;
  } | null>(null);

  // Controles de Unificação e Grade
  const [isUnifyingChannels, setIsUnifyingChannels] = useState<boolean>(false);
  const [fuzzyThreshold, setFuzzyThreshold] = useState<number>(0.78);
  const [isSyncingVod, setIsSyncingVod] = useState<boolean>(false);

  // Ações em links existentes
  const [activeSyncingId, setActiveSyncingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResultsMap, setTestResultsMap] = useState<Record<string, { online: boolean; latencyMs: number; channels?: number }>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showHowItWorks, setShowHowItWorks] = useState<boolean>(true);

  // Estado para Edição de Link Existente
  const [editingSource, setEditingSource] = useState<M3uAutoUpdateSource | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editUrl, setEditUrl] = useState<string>('');
  const [editType, setEditType] = useState<'channels' | 'vod' | 'all'>('channels');
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

  // Carregar fontes do SQLite
  const loadSources = async () => {
    setIsLoading(true);
    try {
      const res = await api.getM3uAutoUpdateConfig();
      if (res && res.config && Array.isArray(res.config.sources)) {
        setSources(res.config.sources);
      }
    } catch (err: any) {
      console.error('[UnifiedLinksManager] Erro ao carregar fontes:', err);
      setFeedback({
        type: 'error',
        text: 'Não foi possível carregar as fontes salvas no banco de dados local.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSources();
  }, []);

  // Testar conexão / latência da URL antes de salvar
  const handleTestNewLink = async () => {
    const cleanUrl = newLinkUrl.trim();
    if (!cleanUrl) {
      setFeedback({ type: 'error', text: 'Por favor, informe uma URL M3U/M3U8 para testar.' });
      return;
    }
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      setFeedback({ type: 'error', text: 'A URL deve iniciar com http:// ou https://' });
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    setFeedback({ type: 'info', text: 'Testando conectividade, latência e conteúdo da URL...' });

    try {
      const result = await api.validateM3uUrl(cleanUrl);
      setTestResult(result);
      if (result.valid) {
        setFeedback({
          type: 'success',
          text: `Link aprovado com sucesso! ${result.channelsCount ?? 0} canais identificados (${result.latencyMs ?? 0}ms).`
        });
      } else {
        setFeedback({
          type: 'error',
          text: `Falha na validação: ${result.error || 'Não foi possível ler o arquivo M3U'}`
        });
      }
    } catch (err: any) {
      setTestResult({ valid: false, error: err.message });
      setFeedback({ type: 'error', text: `Erro de conexão: ${err.message}` });
    } finally {
      setIsTesting(false);
    }
  };

  // Salvar Novo Link no SQLite e opcionalmente Sincronizar Tudo
  const handleSaveNewLink = async (andSync: boolean = true) => {
    const cleanName = newLinkName.trim();
    const cleanUrl = newLinkUrl.trim();

    if (!cleanName) {
      setFeedback({ type: 'error', text: 'Por favor, dê um nome descritivo para a lista.' });
      return;
    }
    if (!cleanUrl || (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://'))) {
      setFeedback({ type: 'error', text: 'Por favor, informe uma URL válida iniciando com http:// ou https://' });
      return;
    }

    setIsSaving(true);
    try {
      // Auto-validação transparente se o usuário ainda não testou
      let currentTest = testResult;
      if (!currentTest || !currentTest.valid) {
        setFeedback({ type: 'info', text: 'Verificando acessibilidade da URL antes de salvar...' });
        const resVal = await api.validateM3uUrl(cleanUrl);
        currentTest = resVal;
        setTestResult(resVal);
        if (!resVal.valid) {
          setFeedback({
            type: 'error',
            text: `Não foi possível acessar a lista M3U: ${resVal.error || 'Verifique se o link está online e correto.'}`
          });
          setIsSaving(false);
          return;
        }
      }

      setFeedback({ type: 'info', text: 'Gravando lista no banco permanente SQLite...' });
      const authorName = currentUser?.name || currentUser?.email || 'Administrador';

      const saveRes = await api.saveM3uSource({
        name: cleanName,
        url: cleanUrl,
        type: newLinkType,
        enabled: true,
        skipValidation: false,
        author: authorName
      });

      if (saveRes.sources) {
        setSources(saveRes.sources);
      } else {
        await loadSources();
      }

      // Se optou por sincronizar imediatamente
      if (andSync) {
        setFeedback({ type: 'info', text: 'Sincronizando grade e aplicando unificação...' });
        let summary = `Lista "${cleanName}" cadastrada com sucesso!`;

        if (newLinkType === 'vod') {
          const vodRes = await api.syncVodM3U({ m3uUrl: cleanUrl });
          summary += ` Catálogo de filmes e séries atualizado (${vodRes.count || 0} títulos).`;
        } else if (newLinkType === 'all') {
          const chanRes = await api.unifyChannelsNow(authorName, fuzzyThreshold);
          const vodRes = await api.syncVodM3U({ m3uUrl: cleanUrl });
          summary += ` Canais unificados (${chanRes.channelsCount || 0}) e catálogo VOD atualizado (${vodRes.count || 0} títulos).`;
          if (onRefreshChannels) onRefreshChannels();
        } else {
          const chanRes = await api.unifyChannelsNow(authorName, fuzzyThreshold);
          summary += ` Grade de canais unificada com sucesso (${chanRes.channelsCount || 0} canais consolidados).`;
          if (onRefreshChannels) onRefreshChannels();
        }

        setFeedback({ type: 'success', text: summary });
      } else {
        setFeedback({
          type: 'success',
          text: `Lista "${cleanName}" gravada com sucesso no SQLite!`
        });
      }

      // Resetar formulário
      setNewLinkName('');
      setNewLinkUrl('');
      setTestResult(null);
    } catch (err: any) {
      console.error('[UnifiedLinksManager] Erro ao salvar link:', err);
      setFeedback({ type: 'error', text: err.message || 'Falha ao gravar link' });
    } finally {
      setIsSaving(false);
    }
  };

  // Disparar Unificação Geral de Canais com Fuzzy Matching
  const handleUnifyChannels = async () => {
    setIsUnifyingChannels(true);
    setFeedback({
      type: 'info',
      text: `Executando unificação inteligente de canais com Fuzzy Matching (${Math.round(fuzzyThreshold * 100)}% de similaridade)...`
    });

    try {
      const author = currentUser?.name || currentUser?.email || 'Administrador';
      const res = await api.unifyChannelsNow(author, fuzzyThreshold);
      setFeedback({
        type: 'success',
        text: `Unificação concluída! ${res.channelsCount} canais consolidados (${res.mergedChannelsCount} mesclados por similaridade com servidores de contingência).`
      });
      if (onRefreshChannels) onRefreshChannels();
    } catch (err: any) {
      setFeedback({ type: 'error', text: `Erro na unificação: ${err.message}` });
    } finally {
      setIsUnifyingChannels(false);
    }
  };

  // Disparar Sincronização Geral do Catálogo de Filmes e Séries (VOD)
  const handleSyncVod = async () => {
    setIsSyncingVod(true);
    setFeedback({
      type: 'info',
      text: 'Extraindo catálogo de filmes e séries das listas salvas no SQLite...'
    });

    try {
      const res = await api.syncVodM3U();
      setFeedback({
        type: 'success',
        text: `Catálogo de filmes e séries atualizado com sucesso! ${res.count || 0} títulos consolidados na grade.`
      });
    } catch (err: any) {
      setFeedback({ type: 'error', text: `Erro ao atualizar filmes e séries: ${err.message}` });
    } finally {
      setIsSyncingVod(false);
    }
  };

  // Ações de itens existentes
  const handleSyncSourceNow = async (src: M3uAutoUpdateSource) => {
    setActiveSyncingId(src.id);
    setFeedback({ type: 'info', text: `Sincronizando grade com "${src.name}"...` });
    try {
      const author = currentUser?.name || currentUser?.email || 'Administrador';
      if (src.type === 'vod') {
        const vodRes = await api.syncVodM3U({ m3uUrl: src.url });
        setFeedback({
          type: 'success',
          text: `Catálogo de filmes e séries atualizado com sucesso (${vodRes.count || 0} títulos extraídos)!`
        });
      } else if (src.type === 'all') {
        const chanRes = await api.unifyChannelsNow(author, fuzzyThreshold);
        const vodRes = await api.syncVodM3U({ m3uUrl: src.url });
        setFeedback({
          type: 'success',
          text: `Lista completa sincronizada! (${chanRes.channelsCount || 0} canais unificados, ${vodRes.count || 0} filmes/séries)!`
        });
        if (onRefreshChannels) onRefreshChannels();
      } else {
        const chanRes = await api.unifyChannelsNow(author, fuzzyThreshold);
        setFeedback({
          type: 'success',
          text: `Grade unificada com sucesso utilizando "${src.name}" (${chanRes.channelsCount || 0} canais)!`
        });
        if (onRefreshChannels) onRefreshChannels();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: `Falha na sincronização: ${err.message}` });
    } finally {
      setActiveSyncingId(null);
    }
  };

  const handleTestExistingSource = async (src: M3uAutoUpdateSource) => {
    setTestingId(src.id);
    try {
      const res = await api.validateM3uUrl(src.url);
      setTestResultsMap(prev => ({
        ...prev,
        [src.id]: {
          online: res.valid,
          latencyMs: res.latencyMs || 0,
          channels: res.channelsCount
        }
      }));
    } catch {
      setTestResultsMap(prev => ({
        ...prev,
        [src.id]: { online: false, latencyMs: 0 }
      }));
    } finally {
      setTestingId(null);
    }
  };

  const handleToggleSource = async (src: M3uAutoUpdateSource) => {
    try {
      const updatedSources = sources.map(s => 
        s.id === src.id ? { ...s, enabled: !s.enabled } : s
      );
      setSources(updatedSources);
      await api.saveM3uAutoUpdateConfig({ sources: updatedSources });
      setFeedback({
        type: 'info',
        text: `Fonte "${src.name}" ${!src.enabled ? 'ativada' : 'desativada'}.`
      });
    } catch (err: any) {
      setFeedback({ type: 'error', text: `Erro ao alterar status: ${err.message}` });
      loadSources();
    }
  };

  const handleDeleteSource = async (src: M3uAutoUpdateSource) => {
    if (!window.confirm(`Deseja realmente remover a fonte "${src.name}"?`)) return;
    try {
      const res = await api.deleteM3uSource(src.id);
      if (res.sources) {
        setSources(res.sources);
      } else {
        setSources(prev => prev.filter(s => s.id !== src.id));
      }
      setFeedback({ type: 'success', text: `Fonte "${src.name}" removida com sucesso.` });
    } catch (err: any) {
      setFeedback({ type: 'error', text: `Erro ao remover fonte: ${err.message}` });
    }
  };

  const handleOpenEdit = (src: M3uAutoUpdateSource) => {
    setEditingSource(src);
    setEditName(src.name || '');
    setEditUrl(src.url || '');
    setEditType(src.type || 'channels');
  };

  const handleSaveEdit = async () => {
    if (!editingSource) return;
    if (!editName.trim()) {
      setFeedback({ type: 'error', text: 'Por favor, informe um nome para o link.' });
      return;
    }
    if (!editUrl.trim() || !editUrl.trim().startsWith('http')) {
      setFeedback({ type: 'error', text: 'Por favor, informe uma URL válida iniciando com http:// ou https://' });
      return;
    }

    setIsSavingEdit(true);
    setFeedback({ type: 'info', text: `Validando conectividade e atualizando "${editName.trim()}"...` });

    try {
      const authorName = currentUser?.name || currentUser?.email || 'Administrador';
      const res = await api.saveM3uSource({
        id: editingSource.id,
        name: editName.trim(),
        url: editUrl.trim(),
        type: editType,
        enabled: editingSource.enabled,
        skipValidation: false,
        author: authorName
      });

      if (res.sources) {
        setSources(res.sources);
      } else {
        await loadSources();
      }

      setFeedback({
        type: 'success',
        text: `Link "${editName.trim()}" atualizado com sucesso no SQLite!`
      });
      setEditingSource(null);
    } catch (err: any) {
      setFeedback({ type: 'error', text: `Erro ao salvar edição: ${err.message}` });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filtragem de listas
  const filteredSources = useMemo(() => {
    return sources.filter(s => {
      const matchSearch = (s.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (s.url || '').toLowerCase().includes(searchQuery.toLowerCase());
      return matchSearch;
    });
  }, [sources, searchQuery]);

  // Contadores
  const channelSourcesCount = sources.filter(s => s.type !== 'vod').length;
  const vodSourcesCount = sources.filter(s => s.type === 'vod' || s.type === 'all').length;

  return (
    <div className="space-y-6">
      {/* Header Central com Badge Oficial */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-teal-500/20 text-teal-300 border border-teal-500/40">
              1 ÚNICA CENTRAL OFICIAL
            </span>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-white/5">
              SQLite 3 Permanente
            </span>
          </div>
          <h3 className="text-lg font-black text-white flex items-center gap-2.5">
            <Layers className="w-5 h-5 text-teal-400" />
            <span>Central de Links IPTV & Unificação de Grade</span>
          </h3>
          <p className="text-xs text-slate-400">
            Cadastre links M3U/M3U8 de forma centralizada, unifique canais duplicados por similaridade (Fuzzy Matching) e atualize o catálogo de filmes e séries.
          </p>
        </div>

        {/* Abas Integradas Superiores */}
        <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-2xl bg-slate-950 border border-white/10 shrink-0">
          <button
            type="button"
            onClick={() => setSubTab('hub')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              subTab === 'hub'
                ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/30'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Central de Links ({sources.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('fuzzy')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              subTab === 'fuzzy'
                ? 'bg-gradient-to-r from-teal-500 to-emerald-600 text-slate-950 font-black shadow-lg shadow-teal-500/30'
                : 'text-teal-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>Fuzzy Matching (Duplicados)</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('file')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              subTab === 'file'
                ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/30'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <FolderUp className="w-3.5 h-3.5" />
            <span>Arquivo M3U Local</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('autoupdate')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              subTab === 'autoupdate'
                ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/30'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Agendador</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('logs')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              subTab === 'logs'
                ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/30'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Logs</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('epg-validator')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              subTab === 'epg-validator'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'text-indigo-400 hover:text-white hover:bg-indigo-950/40'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>XMLTV (EPG)</span>
          </button>
        </div>
      </div>

      {/* Alerta de Notificação / Feedback */}
      {feedback && (
        <div className={`p-4 rounded-2xl border flex items-center justify-between gap-3 text-xs font-medium transition-all ${
          feedback.type === 'success' 
            ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300' 
            : feedback.type === 'error'
              ? 'bg-rose-950/50 border-rose-500/40 text-rose-300'
              : 'bg-teal-950/50 border-teal-500/40 text-teal-300'
        }`}>
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : feedback.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <Sparkles className="w-4 h-4 text-teal-400 shrink-0 animate-pulse" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* RENDERIZAÇÃO DA SUB-ABA PRINCIPAL (HUB ÚNICO) */}
      {subTab === 'hub' && (
        <div className="space-y-6">
          {/* Card Didático: "O Que Precisa Fazer para Unificar?" */}
          <div className="p-5 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-teal-950/30 border border-teal-500/20 shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-teal-400" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Guia Rápido: O que precisa fazer para unificar?
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setShowHowItWorks(!showHowItWorks)}
                className="text-xs text-teal-400 hover:underline cursor-pointer"
              >
                {showHowItWorks ? 'Ocultar Explicação' : 'Ver Explicação'}
              </button>
            </div>

            {showHowItWorks && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
                <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-white/5 space-y-1.5">
                  <div className="flex items-center gap-2 text-teal-400 font-bold">
                    <span className="w-5 h-5 rounded-full bg-teal-500/20 flex items-center justify-center text-[10px]">1</span>
                    <span>Cadastrar Links</span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Cole suas URLs M3U/M3U8 no formulário abaixo. Escolha se são <strong>Canais</strong>, <strong>Filmes/Séries</strong> ou <strong>Lista Completa</strong>.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-white/5 space-y-1.5">
                  <div className="flex items-center gap-2 text-amber-400 font-bold">
                    <span className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center text-[10px]">2</span>
                    <span>Fuzzy Matching</span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    O robô compara nomes parecidos (ex: <em>"Globo SP"</em> vs <em>"Globo São Paulo FHD"</em>) e junta tudo em um único canal com <strong>servidores de contingência</strong> (Opção 1, 2...).
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-white/5 space-y-1.5">
                  <div className="flex items-center gap-2 text-purple-400 font-bold">
                    <span className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center text-[10px]">3</span>
                    <span>Filmes Sempre Atualizados</span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Ao salvar ou clicar em <strong>"Atualizar Filmes"</strong>, o catálogo VOD é extraído diretamente das listas e o cache do app é limpo instantaneamente.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* O ÚNICO FORMULÁRIO OFICIAL PARA CADASTRAR LINK */}
          <div className="p-6 rounded-3xl bg-slate-900 border border-teal-500/30 shadow-2xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-4">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Plus className="w-4 h-4 text-teal-400" />
                  <span>Cadastrar Novo Link IPTV (M3U / M3U8)</span>
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Preencha os campos abaixo. Ao salvar, a lista é gravada com segurança no banco SQLite local.
                </p>
              </div>
              <span className="px-3 py-1 rounded-full bg-teal-500/10 text-teal-300 border border-teal-500/20 text-[11px] font-bold self-start sm:self-auto">
                {sources.length} listas cadastradas
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Campo 1: Nome da Lista */}
              <div className="md:col-span-4 space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <span>Nome Identificador da Lista</span>
                  <span className="text-rose-400 font-bold">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: Minha Lista IPTV, Grade VIP 2026..."
                  value={newLinkName}
                  onChange={(e) => setNewLinkName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium"
                />
              </div>

              {/* Campo 2: URL M3U / M3U8 */}
              <div className="md:col-span-5 space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <span>URL Direta M3U / M3U8</span>
                  <span className="text-rose-400 font-bold">*</span>
                </label>
                <div className="relative">
                  <input
                    type="url"
                    placeholder="https://servidor-iptv.com/lista.m3u8"
                    value={newLinkUrl}
                    onChange={(e) => {
                      setNewLinkUrl(e.target.value);
                      if (testResult) setTestResult(null);
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-3.5 pr-28 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
                  />
                  <div className="absolute right-1.5 top-1.5 flex items-center gap-1">
                    {newLinkUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          setNewLinkUrl('');
                          setTestResult(null);
                        }}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-400 hover:text-white"
                        title="Limpar"
                      >
                        Limpar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const text = await navigator.clipboard.readText();
                          if (text) {
                            setNewLinkUrl(text.trim());
                            setTestResult(null);
                          }
                        } catch {}
                      }}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 font-semibold"
                      title="Colar da área de transferência"
                    >
                      Colar
                    </button>
                  </div>
                </div>
              </div>

              {/* Campo 3: Tipo de Conteúdo */}
              <div className="md:col-span-3 space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Tipo de Conteúdo</label>
                <select
                  value={newLinkType}
                  onChange={(e) => setNewLinkType(e.target.value as 'channels' | 'vod' | 'all')}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium"
                >
                  <option value="channels">📺 Canais de TV Ao Vivo</option>
                  <option value="vod">🎬 Filmes & Séries (VOD)</option>
                  <option value="all">🚀 Lista Completa (Canais + Filmes)</option>
                </select>
              </div>
            </div>

            {/* Resultado do Teste de Conexão */}
            {testResult && (
              <div className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between gap-3 ${
                testResult.valid
                  ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
              }`}>
                <div className="flex items-center gap-2">
                  {testResult.valid ? <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
                  <span>
                    {testResult.valid
                      ? `Conexão bem sucedida! ${testResult.channelsCount || 0} canais identificados (latência: ${testResult.latencyMs || 0}ms). Pronto para salvar.`
                      : `Validação falhou: ${testResult.error || 'A URL não respondeu com formato M3U válido.'} Verifique o link.`}
                  </span>
                </div>
              </div>
            )}

            {/* Botões de Ação do Formulário */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={handleTestNewLink}
                disabled={isTesting || !newLinkUrl.trim()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all disabled:opacity-40 cursor-pointer"
              >
                {isTesting ? <RefreshCw className="w-4 h-4 animate-spin text-teal-400" /> : <Activity className="w-4 h-4 text-teal-400" />}
                <span>Testar Ping / Latência</span>
              </button>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleSaveNewLink(false)}
                  disabled={isSaving || isTesting || !newLinkName.trim() || !newLinkUrl.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-300 text-xs font-semibold transition-all disabled:opacity-40 cursor-pointer"
                  title="Salva a fonte no banco de dados SQLite sem disparar atualização de grade agora"
                >
                  <Database className="w-4 h-4" />
                  <span>Salvar no SQLite (Apenas Salvar)</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSaveNewLink(true)}
                  disabled={isSaving || isTesting || !newLinkName.trim() || !newLinkUrl.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-slate-950 text-xs font-black shadow-lg shadow-teal-500/20 transition-all disabled:opacity-40 cursor-pointer"
                  title="Salva no SQLite e sincroniza a grade automaticamente"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Salvando & Sincronizando...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>✨ Salvar & Sincronizar Tudo Agora</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* PAINEL DE AÇÕES RÁPIDAS DE UNIFICAÇÃO & GRADE */}
          <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-3">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>Ações Rápidas de Unificação & Grade</span>
                </h4>
                <p className="text-xs text-slate-400">
                  Execute a unificação inteligente de canais com tolerância configurável ou force a atualização do catálogo de filmes.
                </p>
              </div>

              {/* Seletor de Tolerância Fuzzy */}
              <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-2xl border border-white/10 self-start sm:self-auto">
                <span className="text-[11px] font-semibold text-slate-400 pl-2">Sensibilidade Fuzzy:</span>
                {[
                  { label: '72% Tolerante', val: 0.72 },
                  { label: '78% Padrão', val: 0.78 },
                  { label: '85% Rigoroso', val: 0.85 }
                ].map(opt => (
                  <button
                    key={opt.val}
                    type="button"
                    onClick={() => setFuzzyThreshold(opt.val)}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                      fuzzyThreshold === opt.val
                        ? 'bg-amber-500 text-slate-950 shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Botão Unificar Canais */}
              <button
                type="button"
                onClick={handleUnifyChannels}
                disabled={isUnifyingChannels || sources.length === 0}
                className="flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-teal-950/60 to-slate-950 border border-teal-500/30 hover:border-teal-500/60 transition-all text-left group cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-teal-500/20 text-teal-400 group-hover:scale-110 transition-transform">
                    {isUnifyingChannels ? <RefreshCw className="w-5 h-5 animate-spin" /> : <GitBranch className="w-5 h-5" />}
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-white">⚡ Unificar Canais com Fuzzy Matching</h5>
                    <p className="text-[11px] text-slate-400">
                      Mescla canais com nomes parecidos e cria servidores alternativos
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold text-teal-400 group-hover:translate-x-1 transition-transform">
                  {isUnifyingChannels ? 'Unificando...' : 'Executar →'}
                </span>
              </button>

              {/* Botão Atualizar Filmes e Séries */}
              <button
                type="button"
                onClick={handleSyncVod}
                disabled={isSyncingVod || sources.length === 0}
                className="flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-purple-950/60 to-slate-950 border border-purple-500/30 hover:border-purple-500/60 transition-all text-left group cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-400 group-hover:scale-110 transition-transform">
                    {isSyncingVod ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Film className="w-5 h-5" />}
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-white">🎬 Atualizar Filmes & Séries (VOD)</h5>
                    <p className="text-[11px] text-slate-400">
                      Atualiza o catálogo de filmes/séries e limpa o cache da grade
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold text-purple-400 group-hover:translate-x-1 transition-transform">
                  {isSyncingVod ? 'Atualizando...' : 'Atualizar →'}
                </span>
              </button>
            </div>
          </div>

          {/* TABELA DE LISTAS SALVAS NO BANCO SQLITE */}
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Database className="w-4 h-4 text-teal-400" />
                  <span>Listas Cadastradas no Banco Local ({sources.length})</span>
                </h4>
                <p className="text-xs text-slate-400">
                  Fontes persistidas no SQLite com data, horário, tipo e status de conectividade
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Filtrar por nome ou URL..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500 w-48 sm:w-64"
                  />
                </div>
                <button
                  type="button"
                  onClick={loadSources}
                  disabled={isLoading}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all cursor-pointer"
                  title="Recarregar fontes"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {filteredSources.length === 0 ? (
              <div className="p-12 text-center rounded-2xl bg-slate-950/50 border border-white/5 space-y-2">
                <LinkIcon className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-sm font-semibold text-slate-400">Nenhuma lista encontrada</p>
                <p className="text-xs text-slate-500">Utilize o formulário acima para cadastrar novos links M3U/M3U8.</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {filteredSources.map((src, idx) => {
                  const testStatus = testResultsMap[src.id];
                  const isSyncingThis = activeSyncingId === src.id;
                  const isTestingThis = testingId === src.id;

                  return (
                    <div 
                      key={src.id || idx}
                      className="py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-white/[0.02] px-3 rounded-2xl transition-colors"
                    >
                      <div className="space-y-1.5 flex-1 min-w-0">
                        {/* Linha do Nome e Badges */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-teal-500/10 text-teal-300 text-xs font-bold flex items-center justify-center border border-teal-500/20 shrink-0">
                            {idx + 1}
                          </span>
                          
                          <h5 className="text-sm font-bold text-white truncate max-w-md">
                            {src.name || 'Lista sem nome'}
                          </h5>

                          {/* Tipo de Conteúdo */}
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            src.type === 'vod' 
                              ? 'bg-purple-950 text-purple-300 border border-purple-500/30' 
                              : src.type === 'all'
                                ? 'bg-indigo-950 text-indigo-300 border border-indigo-500/30'
                                : 'bg-teal-950 text-teal-300 border border-teal-500/30'
                          }`}>
                            {src.type === 'vod' ? '🎬 Filmes/Séries' : src.type === 'all' ? '🚀 Completa (Canais + Filmes)' : '📺 Canais Ao Vivo'}
                          </span>

                          {/* Ativo / Inativo */}
                          <button
                            type="button"
                            onClick={() => handleToggleSource(src)}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition-all cursor-pointer ${
                              src.enabled
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-900/50'
                                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                            }`}
                            title="Clique para alternar Ativo / Inativo"
                          >
                            {src.enabled ? '● Ativa' : '○ Inativa'}
                          </button>

                          {/* Status de Teste */}
                          {testStatus && (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${
                              testStatus.online
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                                : 'bg-rose-950 text-rose-400 border border-rose-500/30'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${testStatus.online ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                              {testStatus.online ? `${testStatus.latencyMs}ms (${testStatus.channels || 0} canais)` : 'Offline'}
                            </span>
                          )}
                        </div>

                        {/* URL e Copiar */}
                        <div className="flex items-center gap-2 text-xs font-mono text-slate-400 pl-8">
                          <span className="truncate max-w-xl text-[11px] select-all">{src.url}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(src.id, src.url)}
                            className="text-slate-500 hover:text-slate-300 p-1 rounded cursor-pointer"
                            title="Copiar URL"
                          >
                            {copiedId === src.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>

                        {/* Data e Horário de Cadastro e Edição */}
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 pl-8 pt-0.5">
                          <span className="flex items-center gap-1 text-teal-400 font-medium">
                            <Clock className="w-3 h-3 text-teal-400 shrink-0" />
                            <span>
                              Cadastrada:{' '}
                              {src.dateFormatted || (src.createdAt ? new Date(src.createdAt).toLocaleString('pt-BR') : 'Horário registrado')}
                            </span>
                          </span>

                          {src.updatedDateFormatted && (
                            <span className="flex items-center gap-1 text-amber-400 font-medium">
                              <Edit3 className="w-3 h-3 text-amber-400 shrink-0" />
                              <span>Atualizada: {src.updatedDateFormatted}</span>
                            </span>
                          )}

                          {src.author && (
                            <span className="text-slate-500">
                              Por: <strong className="text-slate-400">{src.author}</strong>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Botões de Ação na Lista */}
                      <div className="flex items-center gap-2 pl-8 lg:pl-0 shrink-0">
                        {/* Sincronizar Agora */}
                        <button
                          type="button"
                          onClick={() => handleSyncSourceNow(src)}
                          disabled={isSyncingThis}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-600/20 hover:bg-teal-600/40 text-teal-300 text-xs font-semibold border border-teal-500/30 transition-all cursor-pointer disabled:opacity-50"
                          title="Sincronizar a grade do aplicativo usando esta fonte"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isSyncingThis ? 'animate-spin' : ''}`} />
                          <span>{isSyncingThis ? 'Sincronizando...' : 'Sincronizar'}</span>
                        </button>

                        {/* Testar Conectividade */}
                        <button
                          type="button"
                          onClick={() => handleTestExistingSource(src)}
                          disabled={isTestingThis}
                          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer disabled:opacity-50"
                          title="Testar ping e conectividade"
                        >
                          <Activity className={`w-3.5 h-3.5 ${isTestingThis ? 'animate-spin text-teal-400' : ''}`} />
                        </button>

                        {/* Editar */}
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(src)}
                          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                          title="Editar nome, URL ou tipo"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        {/* Excluir */}
                        <button
                          type="button"
                          onClick={() => handleDeleteSource(src)}
                          className="p-2 rounded-xl bg-slate-800 hover:bg-rose-900/50 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                          title="Excluir lista do SQLite"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* MODAL DE EDIÇÃO DE LINK EXISTENTE */}
          {editingSource && (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="w-full max-w-md bg-slate-900 border border-white/10 rounded-3xl p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-teal-500/20 text-teal-400">
                      <Edit3 className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">Editar Lista M3U</h4>
                      <p className="text-[11px] text-slate-400">Altere o nome, URL ou o tipo da lista</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingSource(null)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Nome do Link */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                      <span>Nome da Lista</span>
                      <span className="text-rose-400 font-bold">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Ex: Minha Grade Premiere 2026..."
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium"
                    />
                  </div>

                  {/* URL do Link */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                      <span>URL M3U / M3U8</span>
                      <span className="text-rose-400 font-bold">*</span>
                    </label>
                    <input
                      type="url"
                      required
                      value={editUrl}
                      onChange={(e) => setEditUrl(e.target.value)}
                      placeholder="https://.../lista.m3u8"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
                    />
                  </div>

                  {/* Tipo de Conteúdo */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300">Tipo de Conteúdo</label>
                    <select
                      value={editType}
                      onChange={(e) => setEditType(e.target.value as 'channels' | 'vod' | 'all')}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium"
                    >
                      <option value="channels">📺 Canais de TV Ao Vivo</option>
                      <option value="vod">🎬 Filmes & Séries (VOD)</option>
                      <option value="all">🚀 Lista Completa (Canais + Filmes)</option>
                    </select>
                  </div>

                  {/* Histórico do Item */}
                  <div className="p-3 rounded-2xl bg-slate-950/70 border border-white/5 space-y-1.5 text-[11px] text-slate-400">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Cadastrado originalmente:</span>
                      <span className="font-mono text-slate-300">
                        {editingSource.dateFormatted || (editingSource.createdAt ? new Date(editingSource.createdAt).toLocaleString('pt-BR') : 'Desconhecido')}
                      </span>
                    </div>
                    {editingSource.updatedDateFormatted && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Última edição:</span>
                        <span className="font-mono text-amber-300">
                          {editingSource.updatedDateFormatted}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Botões do Modal */}
                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setEditingSource(null)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={isSavingEdit || !editName.trim() || !editUrl.trim()}
                    className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white text-xs font-bold shadow-lg shadow-teal-600/30 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    {isSavingEdit ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Salvando Edição...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Salvar Alterações</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* RENDERIZAÇÃO DA SUB-ABA: FUZZY MATCHING (DUPLICADOS) */}
      {subTab === 'fuzzy' && (
        <M3uUnifierManager
          currentUser={currentUser}
          onRefreshChannels={onRefreshChannels}
          onNavigateToHistory={onNavigateToHistory}
          initialSubTab="fuzzy"
          onNavigateToMainAddLink={() => setSubTab('hub')}
        />
      )}

      {/* RENDERIZAÇÃO DA SUB-ABA: ARQUIVO M3U LOCAL */}
      {subTab === 'file' && (
        <M3uUnifierManager
          currentUser={currentUser}
          onRefreshChannels={onRefreshChannels}
          onNavigateToHistory={onNavigateToHistory}
          initialSubTab="file"
          onNavigateToMainAddLink={() => setSubTab('hub')}
        />
      )}

      {/* RENDERIZAÇÃO DA SUB-ABA: AGENDADOR DE AUTO-ATUALIZAÇÃO */}
      {subTab === 'autoupdate' && (
        <M3uUnifierManager
          currentUser={currentUser}
          onRefreshChannels={onRefreshChannels}
          onNavigateToHistory={onNavigateToHistory}
          initialSubTab="autoupdate"
          onNavigateToMainAddLink={() => setSubTab('hub')}
        />
      )}

      {/* RENDERIZAÇÃO DA SUB-ABA: LOGS */}
      {subTab === 'logs' && (
        <M3uUnifierManager
          currentUser={currentUser}
          onRefreshChannels={onRefreshChannels}
          onNavigateToHistory={onNavigateToHistory}
          initialSubTab="logs"
          onNavigateToMainAddLink={() => setSubTab('hub')}
        />
      )}

      {/* RENDERIZAÇÃO DA SUB-ABA: VALIDADOR XMLTV (EPG) */}
      {subTab === 'epg-validator' && (
        <XmltvValidatorManager
          currentUser={currentUser}
          onRefreshChannels={onRefreshChannels}
        />
      )}
    </div>
  );
};
