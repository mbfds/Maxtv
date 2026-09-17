import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Tv,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Plus,
  Trash2,
  Clock,
  Radio,
  FileCode2,
  Layers,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  Zap,
  Info,
  Sliders,
  Play
} from 'lucide-react';
import { api } from '../services/api';

export interface XmltvValidationResponse {
  valid: boolean;
  url: string;
  channelsCount: number;
  programmesCount: number;
  timeRange?: {
    earliestStartIso?: string;
    latestStopIso?: string;
    formattedRange?: string;
    durationHours?: number;
  };
  sampleChannels?: Array<{ id: string; name: string; icon?: string }>;
  sampleProgrammes?: Array<{
    channelId: string;
    title: string;
    start: string;
    stop: string;
    desc?: string;
    category?: string;
  }>;
  fileSizeBytes?: number;
  fileSizeFormatted?: string;
  isGzip?: boolean;
  latencyMs?: number;
  statusCode?: number;
  statusText?: string;
  error?: string;
  errorType?: string;
}

export interface EpgSourceItem {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  priority?: number;
  channelsCount?: number;
  programmesCount?: number;
  lastValidatedAt?: string;
  lastStatus?: 'valid' | 'invalid' | 'unknown';
  lastError?: string;
  timeRange?: string;
  sampleChannels?: string[];
  createdAt?: string;
  updatedAt?: string;
}

interface XmltvValidatorManagerProps {
  currentUser?: { name?: string; email?: string };
  onRefreshChannels?: () => void;
}

export const XmltvValidatorManager: React.FC<XmltvValidatorManagerProps> = ({
  currentUser,
  onRefreshChannels
}) => {
  const [sources, setSources] = useState<EpgSourceItem[]>([]);
  const [isLoadingSources, setIsLoadingSources] = useState<boolean>(true);

  // Form states
  const [name, setName] = useState<string>('');
  const [url, setUrl] = useState<string>('');
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [validationResult, setValidationResult] = useState<XmltvValidationResponse | null>(null);
  const [testedUrl, setTestedUrl] = useState<string>('');

  // Per-source actions
  const [revalidatingId, setRevalidatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Feedback notifications
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    title: string;
    text: string;
  } | null>(null);

  // Active view tab inside EPG manager: 'validator' | 'sources' | 'help'
  const [activeTab, setActiveTab] = useState<'validator' | 'sources'>('validator');

  useEffect(() => {
    loadSources();
  }, []);

  const loadSources = async () => {
    setIsLoadingSources(true);
    try {
      const res = await api.getEpgSources();
      if (res.success && Array.isArray(res.sources)) {
        setSources(res.sources);
      }
    } catch (err: any) {
      console.error('Erro ao carregar fontes EPG:', err);
    } finally {
      setIsLoadingSources(false);
    }
  };

  const handleTestUrl = async () => {
    const cleanUrl = url.trim();
    if (!cleanUrl) {
      setFeedback({
        type: 'error',
        title: 'URL Ausente',
        text: 'Por favor, insira o link HTTP ou HTTPS do arquivo XMLTV (EPG) para testar.'
      });
      return;
    }

    setIsValidating(true);
    setValidationResult(null);
    setFeedback(null);

    try {
      const res = await api.validateXmltvUrl(cleanUrl);
      setValidationResult(res);
      setTestedUrl(cleanUrl);

      if (res.valid) {
        setFeedback({
          type: 'success',
          title: 'EPG Validado com Sucesso!',
          text: `Arquivo acessível e íntegro: ${res.channelsCount} canais e ${res.programmesCount} programas prontos para a grade.`
        });
      } else {
        setFeedback({
          type: 'error',
          title: 'Falha na Validação do XMLTV',
          text: res.error || 'O arquivo não possui estrutura XMLTV compatível com a grade de horários.'
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        title: 'Erro de Conexão',
        text: err.message || 'Falha ao se comunicar com o validador do servidor.'
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleSaveSource = async () => {
    const cleanName = name.trim();
    const cleanUrl = url.trim();

    if (!cleanName) {
      setFeedback({
        type: 'error',
        title: 'Nome Obrigatório',
        text: 'Preencha um nome de identificação para esta fonte de EPG (ex: "Guia TV Aberta").'
      });
      return;
    }

    if (!cleanUrl) {
      setFeedback({
        type: 'error',
        title: 'URL Obrigatória',
        text: 'Informe a URL do arquivo XMLTV (EPG).'
      });
      return;
    }

    // Se ainda não testou esta URL exata, ou o teste foi inválido, executa validação obrigatória
    if (testedUrl !== cleanUrl || !validationResult || !validationResult.valid) {
      setIsValidating(true);
      try {
        const valRes = await api.validateXmltvUrl(cleanUrl);
        setValidationResult(valRes);
        setTestedUrl(cleanUrl);
        setIsValidating(false);

        if (!valRes.valid) {
          setFeedback({
            type: 'error',
            title: 'Salvamento Bloqueado',
            text: `A validação obrigatória falhou: ${valRes.error}. Arquivos inacessíveis ou com XML inválido não podem ser gravados.`
          });
          return;
        }
      } catch (err: any) {
        setIsValidating(false);
        setFeedback({
          type: 'error',
          title: 'Erro no Teste Pré-Salvamento',
          text: `Não foi possível verificar a URL antes de salvar: ${err.message}`
        });
        return;
      }
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const res = await api.saveEpgSource({
        name: cleanName,
        url: cleanUrl,
        enabled: true,
        priority: 1
      });

      if (res.success) {
        setFeedback({
          type: 'success',
          title: 'Fonte EPG Salva no SQLite!',
          text: `"${cleanName}" foi validada e gravada com sucesso com ${res.source?.channelsCount || 0} canais.`
        });
        setName('');
        setUrl('');
        setValidationResult(null);
        setTestedUrl('');
        await loadSources();
        setActiveTab('sources');
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        title: 'Falha ao Salvar',
        text: err.message || 'Erro ao persistir a fonte de EPG no banco SQLite.'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevalidateSource = async (src: EpgSourceItem) => {
    setRevalidatingId(src.id);
    try {
      const res = await api.validateXmltvUrl(src.url);
      await api.updateEpgSource(src.id, {
        channelsCount: res.channelsCount,
        programmesCount: res.programmesCount,
        timeRange: res.timeRange?.formattedRange,
        sampleChannels: res.sampleChannels?.map(c => c.name),
        lastStatus: res.valid ? 'valid' : 'invalid',
        lastError: res.error || null,
        lastValidatedAt: new Date().toISOString()
      });
      await loadSources();
      setFeedback({
        type: res.valid ? 'success' : 'error',
        title: res.valid ? 'Fonte Re-validada com Sucesso' : 'Alerta: Fonte Apresenta Erro',
        text: res.valid
          ? `Link "${src.name}" verificado: ${res.programmesCount} programas ativos.`
          : `Erro detectado na fonte "${src.name}": ${res.error}`
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        title: 'Falha na Re-validação',
        text: err.message
      });
    } finally {
      setRevalidatingId(null);
    }
  };

  const handleToggleSource = async (src: EpgSourceItem) => {
    try {
      await api.updateEpgSource(src.id, { enabled: !src.enabled });
      await loadSources();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        title: 'Erro ao Alterar Status',
        text: err.message
      });
    }
  };

  const handleDeleteSource = async (src: EpgSourceItem) => {
    if (!window.confirm(`Deseja realmente remover a fonte EPG "${src.name}"?`)) return;
    setDeletingId(src.id);
    try {
      await api.deleteEpgSource(src.id);
      await loadSources();
      setFeedback({
        type: 'info',
        title: 'Fonte Removida',
        text: `A fonte EPG "${src.name}" foi excluída do banco SQLite.`
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        title: 'Erro ao Excluir',
        text: err.message
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleSyncEpgNow = async () => {
    setIsSyncing(true);
    setFeedback(null);
    try {
      const res = await api.syncEpgProgrammes();
      setFeedback({
        type: 'success',
        title: 'Sincronização Concluída!',
        text: res.message
      });
      if (onRefreshChannels) {
        onRefreshChannels();
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        title: 'Falha na Sincronização',
        text: err.message || 'Erro ao sincronizar programas XMLTV para os canais.'
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleFillSample = (sampleType: 'br' | 'test') => {
    if (sampleType === 'br') {
      setName('EPG Brasil IPTV-ORG');
      setUrl('https://iptv-org.github.io/epg/guides/br/mi.tv.epg.xml');
    } else {
      setName('EPG Global Demonstrativo');
      setUrl('https://iptv-org.github.io/epg/guides/us/tvguide.com.epg.xml');
    }
    setValidationResult(null);
    setTestedUrl('');
  };

  return (
    <div className="space-y-6">
      {/* HEADER PRINCIPAL */}
      <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-xl shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0 text-indigo-400 shadow-inner">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl font-bold text-white tracking-tight">
                  Validador de Links XMLTV (EPG)
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  Grade de Horários
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  SQLite Persistente
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-teal-500/10 text-teal-400 border border-teal-500/20 flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  Suporta até 250MB (.xml / .xml.gz)
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                Valida a acessibilidade HTTP, descompressão GZIP e a integridade da estrutura XML
                (tags <code className="text-indigo-300 font-mono">&lt;tv&gt;</code>,{' '}
                <code className="text-indigo-300 font-mono">&lt;channel&gt;</code> e{' '}
                <code className="text-indigo-300 font-mono">&lt;programme&gt;</code>) antes de permitir salvar no banco de dados.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSyncEpgNow}
              disabled={isSyncing || sources.filter(s => s.enabled).length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Sincronizando Grade...' : 'Sincronizar Grade Agora'}
            </button>
          </div>
        </div>

        {/* SUB-TABS */}
        <div className="flex items-center gap-2 mt-6 pt-5 border-t border-slate-800/80">
          <button
            type="button"
            onClick={() => setActiveTab('validator')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'validator'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Validar & Salvar Novo Link</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sources')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'sources'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Fontes Salvas no SQLite</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-white/10 text-white">
              {sources.length}
            </span>
          </button>
        </div>
      </div>

      {/* FEEDBACK BANNER */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-start justify-between gap-3 text-xs animate-in fade-in duration-200 ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
              : feedback.type === 'error'
              ? 'bg-rose-950/40 border-rose-500/30 text-rose-300'
              : 'bg-indigo-950/40 border-indigo-500/30 text-indigo-300'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {feedback.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />}
            {feedback.type === 'error' && <XCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />}
            {feedback.type === 'info' && <Info className="w-4 h-4 shrink-0 mt-0.5 text-indigo-400" />}
            <div>
              <p className="font-bold text-sm text-white mb-0.5">{feedback.title}</p>
              <p className="leading-relaxed">{feedback.text}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-white p-1"
          >
            &times;
          </button>
        </div>
      )}

      {/* VIEW: VALIDAR E SALVAR */}
      {activeTab === 'validator' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* FORMULÁRIO */}
          <div className="lg:col-span-6 space-y-5">
            <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <FileCode2 className="w-4 h-4 text-indigo-400" />
                  Cadastrar Link de Guia EPG (XMLTV)
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleFillSample('br')}
                    className="text-[10px] font-semibold text-indigo-400 hover:text-indigo-300 bg-indigo-950/40 hover:bg-indigo-900/40 px-2 py-1 rounded-lg border border-indigo-500/20 transition-all"
                  >
                    Exemplo Brasil (.xml)
                  </button>
                </div>
              </div>

              {/* Nome */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Nome da Fonte de Guia EPG <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: Guia Oficial Canais Brasil (XMLTV)"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                />
              </div>

              {/* URL */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  URL do Arquivo XMLTV (.xml ou .xml.gz) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="url"
                  placeholder="https://exemplo.com/epg.xml ou https://exemplo.com/epg.xml.gz"
                  value={url}
                  onChange={e => {
                    setUrl(e.target.value);
                    if (validationResult) {
                      setValidationResult(null);
                    }
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                />
                <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-slate-400" />
                  Arquivos compactados com gzip (<span className="font-mono text-slate-400">.gz</span>) são descompactados automaticamente em memória.
                </p>
              </div>

              {/* BOTÕES DE AÇÃO */}
              <div className="pt-2 flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={handleTestUrl}
                  disabled={isValidating || !url.trim()}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700/60 shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Zap className={`w-4 h-4 text-amber-400 ${isValidating ? 'animate-pulse' : ''}`} />
                  {isValidating ? 'Testando Conexão & XML...' : 'Testar Integridade do EPG'}
                </button>

                <button
                  type="button"
                  onClick={handleSaveSource}
                  disabled={isSaving || isValidating || !url.trim() || !name.trim()}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-bold transition-all shadow-lg cursor-pointer ${
                    validationResult?.valid
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isSaving ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  {isSaving ? 'Validando & Salvando...' : 'Salvar no Banco SQLite'}
                </button>
              </div>

              {/* AVISO DO GATE DE SEGURANÇA */}
              <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl flex items-start gap-2.5 text-[11px] text-slate-400">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <p>
                  <strong className="text-slate-200">Garantia de Qualidade:</strong> O sistema bloqueia links inacessíveis, retornos de páginas HTML de erro e XML sem as tags obrigatórias da grade de programação.
                </p>
              </div>
            </div>
          </div>

          {/* PAINEL DE DIAGNÓSTICO DO RESULTADO */}
          <div className="lg:col-span-6 space-y-5">
            <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-6 shadow-xl">
              <h3 className="text-sm font-bold text-white flex items-center justify-between mb-4">
                <span className="flex items-center gap-2">
                  <Tv className="w-4 h-4 text-indigo-400" />
                  Resultado do Diagnóstico de Estrutura
                </span>
                {validationResult && (
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase flex items-center gap-1.5 ${
                      validationResult.valid
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    }`}
                  >
                    {validationResult.valid ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        Aprovado para Grade
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3.5 h-3.5 text-rose-400" />
                        Rejeitado
                      </>
                    )}
                  </span>
                )}
              </h3>

              {!validationResult && !isValidating && (
                <div className="text-center py-12 px-4 border border-dashed border-slate-800 rounded-xl">
                  <div className="w-12 h-12 rounded-2xl bg-slate-800/50 flex items-center justify-center mx-auto mb-3 text-slate-500">
                    <Radio className="w-6 h-6" />
                  </div>
                  <h4 className="text-xs font-bold text-slate-300 mb-1">Nenhum teste executado</h4>
                  <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                    Insira a URL ao lado e clique em &quot;Testar Integridade do EPG&quot; para inspecionar canais, programas, tamanho e latência.
                  </p>
                </div>
              )}

              {isValidating && (
                <div className="text-center py-12 px-4 border border-indigo-500/20 bg-indigo-950/10 rounded-xl space-y-3">
                  <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin mx-auto" />
                  <div>
                    <h4 className="text-xs font-bold text-white mb-1">Analisando Arquivo XMLTV...</h4>
                    <p className="text-[11px] text-slate-400">
                      Baixando cabeçalhos, verificando integridade XML e contabilizando programas...
                    </p>
                  </div>
                </div>
              )}

              {validationResult && (
                <div className="space-y-4">
                  {/* ALERTA DE SUCESSO OU ERRO */}
                  {validationResult.valid ? (
                    <div className="p-3.5 bg-emerald-950/40 border border-emerald-500/30 rounded-xl flex items-start gap-3 text-xs text-emerald-200">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-emerald-100 mb-0.5">Estrutura XMLTV Válida e Pronta</p>
                        <p className="text-[11px] text-emerald-300/90 leading-relaxed">
                          O arquivo possui todos os elementos obrigatórios da especificação XMLTV e está pronto para abastecer a grade dos canais.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 bg-rose-950/40 border border-rose-500/30 rounded-xl flex items-start gap-3 text-xs text-rose-200">
                      <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-rose-100 mb-0.5">Motivo da Rejeição:</p>
                        <p className="text-[11px] text-rose-300/90 leading-relaxed">
                          {validationResult.error}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* CARDS DE MÉTRICAS */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-xl">
                      <p className="text-[10px] font-bold uppercase text-slate-500">Latência</p>
                      <p className="text-sm font-black text-white mt-0.5 flex items-center gap-1">
                        <Zap className="w-3 h-3 text-amber-400" />
                        {validationResult.latencyMs} ms
                      </p>
                    </div>

                    <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-xl">
                      <p className="text-[10px] font-bold uppercase text-slate-500">Tamanho</p>
                      <p className="text-sm font-black text-white mt-0.5">
                        {validationResult.fileSizeFormatted || '0 B'}
                      </p>
                    </div>

                    <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-xl">
                      <p className="text-[10px] font-bold uppercase text-slate-500">Canais EPG</p>
                      <p className="text-sm font-black text-indigo-400 mt-0.5">
                        {validationResult.channelsCount}
                      </p>
                    </div>

                    <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-xl">
                      <p className="text-[10px] font-bold uppercase text-slate-500">Programas</p>
                      <p className="text-sm font-black text-emerald-400 mt-0.5">
                        {validationResult.programmesCount}
                      </p>
                    </div>
                  </div>

                  {/* DETALHES DE COMPACTAÇÃO & FAIXA TEMPORAL */}
                  <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-3.5 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Formato de Armazenamento:</span>
                      <span className="font-semibold text-slate-200">
                        {validationResult.isGzip ? 'GZIP Compactado (.gz)' : 'XML Puro (UTF-8)'}
                      </span>
                    </div>

                    {validationResult.timeRange && (
                      <div className="flex items-center justify-between text-slate-400 border-t border-slate-800/60 pt-2">
                        <span>Faixa Temporal Coberta:</span>
                        <span className="font-semibold text-indigo-300">
                          {validationResult.timeRange.formattedRange}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* PREVIEW DE PROGRAMAS IDENTIFICADOS */}
                  {validationResult.sampleProgrammes && validationResult.sampleProgrammes.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-indigo-400" />
                        Amostra de Programações Detectadas:
                      </p>
                      <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                        {validationResult.sampleProgrammes.slice(0, 5).map((prog, idx) => (
                          <div
                            key={idx}
                            className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-2.5 text-xs flex items-start justify-between gap-2"
                          >
                            <div>
                              <p className="font-bold text-slate-200">{prog.title}</p>
                              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                                Canal: <span className="text-indigo-300">{prog.channelId}</span>
                              </p>
                            </div>
                            {prog.category && (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-500/20 shrink-0">
                                {prog.category}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VIEW: FONTES SALVAS NO SQLITE */}
      {activeTab === 'sources' && (
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" />
                Repositório de Fontes XMLTV no Banco SQLite
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Fontes ativas são consultadas automaticamente para alimentar o &quot;No Ar&quot; e &quot;A Seguir&quot; da grade de canais.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setActiveTab('validator')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Adicionar Nova Fonte
            </button>
          </div>

          {isLoadingSources ? (
            <div className="text-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-400 mx-auto mb-2" />
              <p className="text-xs text-slate-400">Carregando fontes salvas do SQLite...</p>
            </div>
          ) : sources.length === 0 ? (
            <div className="text-center py-12 px-4 border border-dashed border-slate-800 rounded-xl">
              <Calendar className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <h4 className="text-xs font-bold text-slate-300 mb-1">Nenhuma fonte EPG cadastrada</h4>
              <p className="text-[11px] text-slate-500 max-w-sm mx-auto mb-4">
                Cadastre um link de XMLTV validado para fornecer a grade de horários completa aos seus canais.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('validator')}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white shadow-md hover:bg-indigo-500 transition-all"
              >
                Cadastrar Primeira Fonte
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {sources.map(src => (
                <div
                  key={src.id}
                  className="bg-slate-950/70 border border-slate-800/80 hover:border-slate-700/80 rounded-xl p-4 transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h4 className="text-xs font-bold text-white truncate">{src.name}</h4>

                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase flex items-center gap-1 ${
                            src.lastStatus === 'valid'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {src.lastStatus === 'valid' ? (
                            <>
                              <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                              Válido
                            </>
                          ) : (
                            <>
                              <XCircle className="w-2.5 h-2.5 text-rose-400" />
                              Erro
                            </>
                          )}
                        </span>

                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase ${
                            src.enabled
                              ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {src.enabled ? 'Ativo na Sincronização' : 'Inativo'}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-400 font-mono truncate max-w-xl">
                        {src.url}
                      </p>

                      <div className="flex items-center gap-4 text-[11px] text-slate-400 flex-wrap pt-1">
                        <span className="flex items-center gap-1">
                          <Tv className="w-3 h-3 text-slate-500" />
                          <strong className="text-slate-200">{src.channelsCount || 0}</strong> canais
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-500" />
                          <strong className="text-slate-200">{src.programmesCount || 0}</strong> programas
                        </span>
                        {src.timeRange && (
                          <span className="flex items-center gap-1 text-slate-400">
                            <Clock className="w-3 h-3 text-slate-500" />
                            {src.timeRange}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Ações */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleRevalidateSource(src)}
                        disabled={revalidatingId === src.id}
                        title="Testar e Re-validar Link"
                        className="p-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-all disabled:opacity-50 cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${revalidatingId === src.id ? 'animate-spin' : ''}`} />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleSource(src)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                          src.enabled
                            ? 'bg-indigo-950 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-900/40'
                            : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {src.enabled ? 'Desativar' : 'Ativar'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteSource(src)}
                        disabled={deletingId === src.id}
                        title="Excluir Fonte EPG"
                        className="p-2 rounded-xl text-xs font-semibold bg-rose-950/30 hover:bg-rose-900/50 text-rose-400 border border-rose-500/20 transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
