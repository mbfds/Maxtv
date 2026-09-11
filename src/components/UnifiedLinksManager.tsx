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
  X
} from 'lucide-react';
import { api } from '../services/api';
import { M3uAutoUpdateSource, M3uAutoUpdateConfig } from '../types';
import { M3uUnifierManager } from './M3uUnifierManager';

interface UnifiedLinksManagerProps {
  currentUser?: { name?: string; email?: string };
  onRefreshChannels?: () => void;
  onNavigateToHistory?: () => void;
  defaultSubTab?: 'saved-links' | 'unifier';
}

export const UnifiedLinksManager: React.FC<UnifiedLinksManagerProps> = ({
  currentUser,
  onRefreshChannels,
  onNavigateToHistory,
  defaultSubTab = 'saved-links'
}) => {
  const [subTab, setSubTab] = useState<'saved-links' | 'unifier'>(defaultSubTab);
  const [sources, setSources] = useState<M3uAutoUpdateSource[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Formulário de Novo Link
  const [newLinkName, setNewLinkName] = useState<string>('');
  const [newLinkUrl, setNewLinkUrl] = useState<string>('');
  const [newLinkType, setNewLinkType] = useState<'channels' | 'vod'>('channels');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{
    valid: boolean;
    error?: string;
    channelsCount?: number;
    latencyMs?: number;
  } | null>(null);

  // Ações em links existentes
  const [activeSyncingId, setActiveSyncingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResultsMap, setTestResultsMap] = useState<Record<string, { online: boolean; latencyMs: number; channels?: number }>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Estado para Edição de Link Existente
  const [editingSource, setEditingSource] = useState<M3uAutoUpdateSource | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editUrl, setEditUrl] = useState<string>('');
  const [editType, setEditType] = useState<'channels' | 'vod'>('channels');
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

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
    setFeedback({ type: 'info', text: `Atualizando "${editName.trim()}"...` });

    try {
      const res = await api.updateM3uSource(editingSource.id, {
        name: editName.trim(),
        url: editUrl.trim(),
        type: editType
      });

      if (res && res.sources) {
        setSources(res.sources);
      } else {
        await loadSources();
      }

      setFeedback({
        type: 'success',
        text: `Link "${editName.trim()}" atualizado com sucesso com registro de horário de modificação!`
      });
      setEditingSource(null);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Falha ao atualizar link' });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const loadSources = async () => {
    setIsLoading(true);
    try {
      const res = await api.getM3uSources();
      if (res && res.sources) {
        setSources(res.sources);
      }
    } catch (err: any) {
      console.warn('Falha ao carregar fontes M3U:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSources();
  }, []);

  const handleTestNewLink = async () => {
    if (!newLinkUrl.trim()) {
      setFeedback({ type: 'error', text: 'Informe a URL do link antes de testar.' });
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await api.validateM3uUrl(newLinkUrl.trim());
      setTestResult({
        valid: res.valid,
        error: res.error,
        channelsCount: res.channelsCount,
        latencyMs: res.latencyMs
      });
      if (res.valid) {
        setFeedback({
          type: 'success',
          text: `Link testado com sucesso! Encontrados ${res.channelsCount || 0} canais em ${res.latencyMs || 0}ms.`
        });
      } else {
        setFeedback({
          type: 'error',
          text: `Falha ao testar link: ${res.error || 'URL inacessível ou formato inválido'}`
        });
      }
    } catch (err: any) {
      setTestResult({ valid: false, error: err.message });
      setFeedback({ type: 'error', text: `Erro de rede: ${err.message}` });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveNewLink = async (andSync: boolean = false) => {
    if (!newLinkName.trim()) {
      setFeedback({ type: 'error', text: 'Por favor, informe um nome descritivo para o link.' });
      return;
    }
    if (!newLinkUrl.trim() || !newLinkUrl.trim().startsWith('http')) {
      setFeedback({ type: 'error', text: 'Por favor, informe uma URL válida iniciando com http:// ou https://' });
      return;
    }

    setIsSaving(true);
    setFeedback({ type: 'info', text: 'Salvando link no sistema SQLite...' });

    try {
      const authorName = currentUser?.name || currentUser?.email || 'Administrador';
      const saveRes = await api.saveM3uSource({
        name: newLinkName.trim(),
        url: newLinkUrl.trim(),
        type: newLinkType,
        enabled: true,
        skipValidation: false,
        author: authorName
      });

      setFeedback({
        type: 'success',
        text: `Link "${newLinkName.trim()}" salvo com sucesso com registro de horário!`
      });

      // Limpar formulário
      setNewLinkName('');
      setNewLinkUrl('');
      setTestResult(null);

      // Recarregar fontes
      if (saveRes.sources) {
        setSources(saveRes.sources);
      } else {
        await loadSources();
      }

      // Se solicitado, já sincronizar a grade com este link
      if (andSync) {
        setFeedback({ type: 'info', text: `Sincronizando grade com "${newLinkName.trim()}"...` });
        await api.syncRepoLinks({
          file: 'custom',
          customUrl: newLinkUrl.trim(),
          name: newLinkName.trim(),
          author: authorName
        });
        setFeedback({
          type: 'success',
          text: `Link "${newLinkName.trim()}" salvo e grade de canais atualizada com sucesso!`
        });
        if (onRefreshChannels) onRefreshChannels();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Falha ao salvar link' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleSource = async (src: M3uAutoUpdateSource) => {
    try {
      const updated = sources.map(s => s.id === src.id ? { ...s, enabled: !s.enabled } : s);
      setSources(updated);
      await api.saveM3uAutoUpdateConfig({ sources: updated });
      setFeedback({
        type: 'success',
        text: `Fonte "${src.name}" ${!src.enabled ? 'ativada' : 'desativada'} com sucesso!`
      });
    } catch (err: any) {
      setFeedback({ type: 'error', text: 'Falha ao alterar estado da fonte.' });
      loadSources();
    }
  };

  const handleDeleteSource = async (id: string, name: string) => {
    if (!window.confirm(`Tem certeza que deseja remover o link "${name}" dos links salvos?`)) {
      return;
    }
    try {
      const res = await api.deleteM3uSource(id);
      if (res && res.sources) {
        setSources(res.sources);
      } else {
        setSources(prev => prev.filter(s => s.id !== id));
      }
      setFeedback({ type: 'success', text: `Link "${name}" removido com sucesso.` });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Falha ao excluir link.' });
    }
  };

  const handleSyncSourceNow = async (src: M3uAutoUpdateSource) => {
    setActiveSyncingId(src.id);
    setFeedback({ type: 'info', text: `Sincronizando grade com "${src.name}"...` });
    try {
      const author = currentUser?.name || currentUser?.email || 'Administrador';
      await api.syncRepoLinks({
        file: src.type === 'vod' ? 'Filmes-Series.m3u8' : 'custom',
        customUrl: src.url,
        name: src.name,
        author
      });
      setFeedback({
        type: 'success',
        text: `Grade atualizada com sucesso utilizando o link "${src.name}"!`
      });
      if (onRefreshChannels) onRefreshChannels();
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
    } catch (err) {
      setTestResultsMap(prev => ({
        ...prev,
        [src.id]: { online: false, latencyMs: 0 }
      }));
    } finally {
      setTestingId(null);
    }
  };

  const handleCopy = (id: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredSources = useMemo(() => {
    if (!searchQuery.trim()) return sources;
    const q = searchQuery.toLowerCase();
    return sources.filter(s => 
      s.name.toLowerCase().includes(q) || 
      s.url.toLowerCase().includes(q) ||
      (s.dateFormatted && s.dateFormatted.toLowerCase().includes(q))
    );
  }, [sources, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Header Unificado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-teal-400" />
            <span>Unificar & Atualizar Links M3U</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Gerenciamento central de links salvos com nomes, registros de data/horário e grade unificada
          </p>
        </div>

        {/* Sub-navegação com Segmented Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-950/80 border border-white/10 shrink-0">
          <button
            type="button"
            onClick={() => setSubTab('saved-links')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              subTab === 'saved-links'
                ? 'bg-teal-600 text-white shadow-md shadow-teal-600/30'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <LinkIcon className="w-3.5 h-3.5" />
            <span>Links Salvos ({sources.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('unifier')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              subTab === 'unifier'
                ? 'bg-teal-600 text-white shadow-md shadow-teal-600/30'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Unificador M3U8</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('repo-sync')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              subTab === 'repo-sync'
                ? 'bg-teal-600 text-white shadow-md shadow-teal-600/30'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <GitBranch className="w-3.5 h-3.5 text-emerald-400" />
            <span>Repositório GitHub</span>
          </button>
        </div>
      </div>

      {/* Feedback Alert */}
      {feedback && (
        <div className={`p-4 rounded-2xl border flex items-center justify-between gap-3 text-xs font-medium transition-all ${
          feedback.type === 'success' 
            ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
            : feedback.type === 'error'
            ? 'bg-rose-950/50 border-rose-500/40 text-rose-300'
            : 'bg-indigo-950/50 border-indigo-500/40 text-indigo-300'
        }`}>
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : feedback.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            ) : (
              <RefreshCw className="w-4 h-4 shrink-0 animate-spin text-indigo-400" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-white text-xs px-2 py-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* CONTEÚDO DA SUB-ABA 1: GERENCIAR LINKS SALVOS */}
      {subTab === 'saved-links' && (
        <div className="space-y-6">
          {/* Card: Formulário para Adicionar / Salvar Novo Link */}
          <div className="p-6 rounded-3xl bg-slate-900 border border-teal-500/30 shadow-xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-4">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Plus className="w-4 h-4 text-teal-400" />
                  <span>Cadastrar & Salvar Novo Link M3U</span>
                </h4>
                <p className="text-xs text-slate-400">
                  O nome digitado será gravado e exibido para você junto com o horário exato de inserção.
                </p>
              </div>
              <span className="px-3 py-1 rounded-full bg-teal-500/10 text-teal-300 border border-teal-500/20 text-[11px] font-bold self-start sm:self-auto">
                Persistência no SQLite 3
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Campo: Nome do Link */}
              <div className="md:col-span-5 space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <span>Nome Identificador do Link</span>
                  <span className="text-rose-400 font-bold">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: Minha Grade Premiere 2026, Backup TV Brasil..."
                  value={newLinkName}
                  onChange={(e) => setNewLinkName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium"
                />
              </div>

              {/* Campo: URL do Link */}
              <div className="md:col-span-5 space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <span>URL Direta M3U / M3U8</span>
                  <span className="text-rose-400 font-bold">*</span>
                </label>
                <div className="relative">
                  <input
                    type="url"
                    placeholder="https://.../lista.m3u8"
                    value={newLinkUrl}
                    onChange={(e) => setNewLinkUrl(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-3.5 pr-20 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const text = await navigator.clipboard.readText();
                        if (text) setNewLinkUrl(text.trim());
                      } catch {}
                    }}
                    className="absolute right-2 top-2 px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 font-semibold"
                    title="Colar da área de transferência"
                  >
                    Colar
                  </button>
                </div>
              </div>

              {/* Campo: Tipo */}
              <div className="md:col-span-2 space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Tipo</label>
                <select
                  value={newLinkType}
                  onChange={(e) => setNewLinkType(e.target.value as 'channels' | 'vod')}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium"
                >
                  <option value="channels">Canais de TV</option>
                  <option value="vod">Filmes/Séries</option>
                </select>
              </div>
            </div>

            {/* Test Results Banner */}
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
                      ? `Link válido e ativo! ${testResult.channelsCount || 0} canais detectados (latência: ${testResult.latencyMs || 0}ms).`
                      : `Incompatível ou offline: ${testResult.error || 'A URL não respondeu com formato M3U válido.'}`}
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
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all disabled:opacity-40"
              >
                {isTesting ? <RefreshCw className="w-4 h-4 animate-spin text-teal-400" /> : <Activity className="w-4 h-4 text-teal-400" />}
                <span>Testar Conexão / Ping</span>
              </button>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleSaveNewLink(false)}
                  disabled={isSaving || !newLinkName.trim() || !newLinkUrl.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-teal-900/60 border border-teal-500/30 text-teal-300 text-xs font-bold transition-all disabled:opacity-40"
                >
                  <Database className="w-4 h-4" />
                  <span>Salvar Link no Sistema</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSaveNewLink(true)}
                  disabled={isSaving || !newLinkName.trim() || !newLinkUrl.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white text-xs font-bold shadow-lg shadow-teal-600/30 transition-all disabled:opacity-40"
                >
                  {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  <span>Salvar e Sincronizar Agora</span>
                </button>
              </div>
            </div>
          </div>

          {/* Tabela de Links Salvos do Administrador */}
          <div className="p-6 rounded-3xl bg-slate-900 border border-white/10 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Database className="w-4 h-4 text-indigo-400" />
                  <span>Links Salvos & Histórico de Registros</span>
                </h4>
                <p className="text-xs text-slate-400">
                  Lista de todas as fontes M3U cadastradas pelo administrador com data e horário
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
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all"
                  title="Atualizar lista"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {filteredSources.length === 0 ? (
              <div className="p-12 text-center rounded-2xl bg-slate-950/50 border border-white/5 space-y-2">
                <LinkIcon className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-sm font-semibold text-slate-400">Nenhum link salvo encontrado</p>
                <p className="text-xs text-slate-500">Utilize o formulário acima para cadastrar novos links M3U8.</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {filteredSources.map((src, idx) => {
                  const testStatus = testResultsMap[src.id];
                  return (
                    <div 
                      key={src.id || idx}
                      className="py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-white/[0.02] px-2 rounded-2xl transition-colors"
                    >
                      <div className="space-y-1.5 flex-1 min-w-0">
                        {/* Linha do Nome e Tags */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-teal-500/10 text-teal-300 text-xs font-bold flex items-center justify-center border border-teal-500/20 shrink-0">
                            {idx + 1}
                          </span>
                          
                          {/* NOME QUE O ADMIN COLOCOU EM DESTAQUE */}
                          <h5 className="text-sm font-bold text-white truncate max-w-md">
                            {src.name || 'Link sem nome'}
                          </h5>

                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            src.type === 'vod' 
                              ? 'bg-purple-950 text-purple-300 border border-purple-500/30' 
                              : 'bg-teal-950 text-teal-300 border border-teal-500/30'
                          }`}>
                            {src.type === 'vod' ? 'Filmes / Séries' : 'TV Ao Vivo'}
                          </span>

                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            src.enabled
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/30'
                              : 'bg-slate-800 text-slate-400'
                          }`}>
                            {src.enabled ? 'Ativo' : 'Inativo'}
                          </span>

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

                        {/* URL com botão de copiar */}
                        <div className="flex items-center gap-2 text-xs font-mono text-slate-400 pl-8">
                          <span className="truncate max-w-xl text-[11px] select-all">{src.url}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(src.id, src.url)}
                            className="text-slate-500 hover:text-slate-300 p-1 rounded"
                            title="Copiar link"
                          >
                            {copiedId === src.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>

                        {/* REGISTRO DOS HORÁRIOS: CRIAÇÃO E EDIÇÃO */}
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 pl-8 pt-0.5">
                          <span className="flex items-center gap-1 text-teal-400 font-medium">
                            <Clock className="w-3 h-3 text-teal-400 shrink-0" />
                            <span>
                              Criado em:{' '}
                              {src.dateFormatted 
                                ? src.dateFormatted 
                                : src.createdAt 
                                ? new Date(src.createdAt).toLocaleString('pt-BR')
                                : 'Registro de sistema'}
                            </span>
                          </span>

                          {(src.updatedDateFormatted || (src.updatedAt && src.updatedAt !== src.createdAt)) && (
                            <span className="flex items-center gap-1 text-amber-300 font-medium bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-500/20">
                              <Calendar className="w-3 h-3 text-amber-400 shrink-0" />
                              <span>
                                Editado em:{' '}
                                {src.updatedDateFormatted || (src.updatedAt ? new Date(src.updatedAt).toLocaleString('pt-BR') : '')}
                              </span>
                            </span>
                          )}

                          {src.author && (
                            <span className="text-slate-500">
                              por <strong className="text-slate-400">{src.author}</strong>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Botões de Ações do Link */}
                      <div className="flex flex-wrap items-center gap-2 shrink-0 pl-8 lg:pl-0">
                        {/* Botão de Editar */}
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(src)}
                          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-teal-300 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                          title="Editar nome, URL ou tipo do link"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-teal-400" />
                          <span>Editar</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleSource(src)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            src.enabled
                              ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                              : 'bg-emerald-600 text-white hover:bg-emerald-500'
                          }`}
                        >
                          {src.enabled ? 'Desativar' : 'Ativar'}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleTestExistingSource(src)}
                          disabled={testingId === src.id}
                          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          {testingId === src.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5 text-teal-400" />}
                          <span>Testar</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSyncSourceNow(src)}
                          disabled={activeSyncingId === src.id}
                          className="px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                        >
                          {activeSyncingId === src.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                          <span>Sincronizar</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteSource(src.id, src.name)}
                          className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950/80 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                          title="Remover link"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* MODAL DE EDIÇÃO DE LINK */}
          {editingSource && (
            <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
              <div className="w-full max-w-lg bg-slate-900 border border-teal-500/40 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5 relative overflow-hidden">
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-teal-500/20 text-teal-400">
                      <Edit3 className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-white">Editar Link M3U</h4>
                      <p className="text-xs text-slate-400">Atualize o nome, URL ou categoria da fonte</p>
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
                      <span>Nome do Link</span>
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

                  {/* Tipo */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300">Tipo de Conteúdo</label>
                    <select
                      value={editType}
                      onChange={(e) => setEditType(e.target.value as 'channels' | 'vod')}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium"
                    >
                      <option value="channels">Canais de TV Ao Vivo</option>
                      <option value="vod">Filmes / Séries (VOD)</option>
                    </select>
                  </div>

                  {/* Histórico do item */}
                  <div className="p-3 rounded-2xl bg-slate-950/70 border border-white/5 space-y-1.5 text-[11px] text-slate-400">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Criado originalmente:</span>
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

      {/* CONTEÚDO DA SUB-ABA 2: UNIFICADOR M3U8 */}
      {subTab === 'unifier' && (
        <M3uUnifierManager
          currentUser={currentUser}
          onRefreshChannels={onRefreshChannels}
          onNavigateToHistory={onNavigateToHistory}
        />
      )}

      {/* CONTEÚDO DA SUB-ABA 3: REPOSITÓRIO GITHUB */}
      {subTab === 'repo-sync' && (
        <RepoLinksUpdater
          currentUser={currentUser}
          onRefreshChannels={onRefreshChannels}
          onNavigateToHistory={onNavigateToHistory}
        />
      )}
    </div>
  );
};
