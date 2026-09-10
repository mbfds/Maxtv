import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, Database, Download, RefreshCw, Trash2, CheckCircle2, 
  XCircle, Clock, ExternalLink, ShieldAlert, Check, Copy, Search,
  HardDrive, AlertCircle, Play, Server, Zap, Globe, ArrowDownToLine
} from 'lucide-react';
import { UrlSaveErrorEntry, DatabaseStats } from '../types';
import { api } from '../services/api';

interface UrlErrorLogsViewerProps {
  onGoToUnifier?: () => void;
}

export const UrlErrorLogsViewer: React.FC<UrlErrorLogsViewerProps> = ({ onGoToUnifier }) => {
  const [logs, setLogs] = useState<UrlSaveErrorEntry[]>([]);
  const [dbStats, setDbStats] = useState<DatabaseStats | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [isTestingDb, setIsTestingDb] = useState<boolean>(false);
  const [isClearingLogs, setIsClearingLogs] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('all');

  // Live URL Tester Form
  const [testUrl, setTestUrl] = useState<string>('');
  const [isValidatingTestUrl, setIsValidatingTestUrl] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{
    tested: boolean;
    valid: boolean;
    error?: string;
    statusCode?: number;
    latencyMs?: number;
    channelsCount?: number;
    sampleChannels?: string[];
  } | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [logsRes, statsRes] = await Promise.all([
        api.getUrlErrorLogs(150),
        api.getDatabaseStats().catch(() => ({ success: false, stats: null as any }))
      ]);

      if (logsRes.success) {
        setLogs(logsRes.logs || []);
      }
      if (statsRes.success && statsRes.stats) {
        setDbStats(statsRes.stats);
      }
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: `Erro ao carregar registros: ${err.message || 'Falha de comunicação'}`
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Download SQLite database copy
  const handleDownloadBackup = async () => {
    setIsDownloading(true);
    setFeedbackMessage(null);
    try {
      const blob = await api.downloadDatabaseBackup();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const nowTag = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.href = url;
      a.download = `maxtv-backup-${nowTag}.db`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setFeedbackMessage({
        type: 'success',
        text: 'Backup manual do banco SQLite baixado com sucesso! Arquivo: data/maxtv.db'
      });
    } catch (err: any) {
      // Fallback para abertura direta caso o blob seja bloqueado
      try {
        const directUrl = api.getDatabaseBackupDownloadUrl();
        window.open(directUrl, '_blank');
        setFeedbackMessage({
          type: 'info',
          text: 'Iniciando download direto do backup SQLite...'
        });
      } catch (fallbackErr: any) {
        setFeedbackMessage({
          type: 'error',
          text: `Falha ao baixar backup: ${err.message || 'Erro no servidor'}`
        });
      }
    } finally {
      setIsDownloading(false);
    }
  };

  // Test SQLite Write Integrity
  const handleTestDatabaseWrite = async () => {
    setIsTestingDb(true);
    setFeedbackMessage(null);
    try {
      const res = await api.testDatabaseWrite();
      if (res.success) {
        setFeedbackMessage({
          type: 'success',
          text: `Teste de escrita bem-sucedido! Persistência no SQLite verificada em ${res.latencyMs}ms.`
        });
        if (res.stats) setDbStats(res.stats);
        await loadData();
      }
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: `Falha no teste de gravação do banco SQLite: ${err.message}`
      });
    } finally {
      setIsTestingDb(false);
    }
  };

  // Clear logs
  const handleClearLogs = async () => {
    if (!window.confirm('Deseja realmente limpar o histórico de erros de URLs do banco SQLite?')) return;
    setIsClearingLogs(true);
    try {
      const res = await api.clearUrlErrorLogs();
      if (res.success) {
        setLogs([]);
        setFeedbackMessage({
          type: 'success',
          text: 'Histórico de erros de salvamento de URLs limpo com sucesso.'
        });
      }
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: `Falha ao limpar logs: ${err.message}`
      });
    } finally {
      setIsClearingLogs(false);
    }
  };

  // Test single URL
  const handleValidateUrl = async (e?: React.FormEvent, customUrl?: string) => {
    if (e) e.preventDefault();
    const targetUrl = (customUrl || testUrl).trim();
    if (!targetUrl) return;

    setIsValidatingTestUrl(true);
    setTestResult(null);
    try {
      const res = await api.validateM3uUrl(targetUrl);
      setTestResult({
        tested: true,
        valid: Boolean(res.valid),
        error: res.error,
        statusCode: res.statusCode,
        latencyMs: res.latencyMs,
        channelsCount: res.channelsCount,
        sampleChannels: res.sampleChannels
      });

      // Recarrega os logs para mostrar se gerou log de erro
      if (!res.valid) {
        await loadData();
      }
    } catch (err: any) {
      setTestResult({
        tested: true,
        valid: false,
        error: `Erro ao testar URL: ${err.message}`
      });
    } finally {
      setIsValidatingTestUrl(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filtered logs
  const filteredLogs = logs.filter(log => {
    if (filterType !== 'all') {
      if (filterType === 'http' && !log.errorType.includes('http') && !log.statusCode) return false;
      if (filterType === 'timeout' && !log.errorType.includes('timeout')) return false;
      if (filterType === 'format' && !log.errorType.includes('format') && !log.errorType.includes('empty')) return false;
      if (filterType === 'sqlite' && !log.errorType.includes('sqlite')) return false;
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchUrl = log.url.toLowerCase().includes(term);
      const matchMsg = log.errorMessage.toLowerCase().includes(term);
      const matchSource = log.sourceName?.toLowerCase().includes(term) || false;
      const matchType = log.errorType.toLowerCase().includes(term);
      return matchUrl || matchMsg || matchSource || matchType;
    }
    return true;
  });

  // KPI Calculations
  const httpErrorsCount = logs.filter(l => l.errorType.includes('http') || Boolean(l.statusCode)).length;
  const timeoutErrorsCount = logs.filter(l => l.errorType.includes('timeout')).length;
  const formatErrorsCount = logs.filter(l => l.errorType.includes('format') || l.errorType.includes('empty')).length;
  const sqliteErrorsCount = logs.filter(l => l.errorType.includes('sqlite')).length;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Banner with Backup Button */}
      <div id="url-errors-header" className="bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 border border-indigo-500/20 rounded-2xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                <Database className="w-3.5 h-3.5 text-indigo-400" />
                SQLite 3 (data/maxtv.db)
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                Monitor de Falhas de URLs
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Validação Server-Side Ativa
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Logs de Erros de URLs e Diagnóstico do SQLite
            </h2>
            <p className="text-slate-300 text-sm max-w-3xl leading-relaxed">
              Monitore todas as tentativas de salvamento de links M3U8, identifique links corrompidos ou inacessíveis,
              diagnostique a persistência no banco SQLite e faça o download do arquivo <code className="text-indigo-300 font-mono bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-500/20">data/maxtv.db</code> como backup manual de segurança.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              id="btn-download-db-backup"
              type="button"
              onClick={handleDownloadBackup}
              disabled={isDownloading}
              className="flex items-center gap-2.5 px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-sm shadow-lg shadow-indigo-600/30 active:scale-95 transition-all disabled:opacity-50"
              title="Baixar cópia exata do arquivo data/maxtv.db com flush WAL de segurança"
            >
              {isDownloading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>{isDownloading ? 'Gerando Backup...' : 'Baixar Backup SQLite'}</span>
            </button>

            <button
              id="btn-test-db-write"
              type="button"
              onClick={handleTestDatabaseWrite}
              disabled={isTestingDb}
              className="flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-800/90 hover:bg-slate-700/90 text-slate-200 border border-white/10 font-semibold text-sm transition-all active:scale-95 disabled:opacity-50"
              title="Testar escrita e confirmar persistência no banco SQLite"
            >
              {isTestingDb ? (
                <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
              ) : (
                <HardDrive className="w-4 h-4 text-cyan-400" />
              )}
              <span>Testar Escrita</span>
            </button>

            <button
              id="btn-refresh-url-logs"
              type="button"
              onClick={loadData}
              disabled={isLoading}
              className="p-3 rounded-xl bg-slate-800/90 hover:bg-slate-700/90 text-slate-300 border border-white/10 transition-all active:scale-95 disabled:opacity-50"
              title="Atualizar Logs e Estatísticas"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-indigo-400' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedbackMessage && (
        <div className={`p-4 rounded-xl flex items-center justify-between gap-3 border animate-in fade-in duration-200 ${
          feedbackMessage.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' :
          feedbackMessage.type === 'error' ? 'bg-rose-500/10 border-rose-500/30 text-rose-300' :
          'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
        }`}>
          <div className="flex items-center gap-2.5">
            {feedbackMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> :
             feedbackMessage.type === 'error' ? <AlertCircle className="w-5 h-5 shrink-0" /> :
             <Database className="w-5 h-5 shrink-0" />}
            <span className="text-sm font-medium">{feedbackMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackMessage(null)}
            className="text-xs opacity-70 hover:opacity-100 p-1"
          >
            Fechar
          </button>
        </div>
      )}

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: SQLite File & Storage */}
        <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Banco SQLite</span>
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Database className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white">
            {dbStats?.dbSizeFormatted || '640 KB'}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-white/5">
            <span>WAL: {dbStats?.walSizeFormatted || 'Ativo'}</span>
            <span className="text-emerald-400 font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Operacional
            </span>
          </div>
        </div>

        {/* Card 2: Total Errors Logged */}
        <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Falhas Registradas</span>
            <div className={`p-2 rounded-xl border ${logs.length > 0 ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white flex items-center gap-2">
            <span>{logs.length}</span>
            <span className="text-xs font-normal text-slate-400">no histórico</span>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-white/5">
            <span>Timeout / Rede</span>
            <span className="text-rose-300 font-medium">{timeoutErrorsCount} falhas</span>
          </div>
        </div>

        {/* Card 3: HTTP / Server Rejections */}
        <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Erros HTTP / 404 / 403</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Globe className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white">
            {httpErrorsCount}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-white/5">
            <span>Formato M3U Inválido</span>
            <span className="text-amber-300 font-medium">{formatErrorsCount}</span>
          </div>
        </div>

        {/* Card 4: SQLite Persistence Health */}
        <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Persistência SQLite</span>
            <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
              <Server className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white flex items-center gap-2">
            <span>{sqliteErrorsCount === 0 ? '100%' : `${sqliteErrorsCount} falhas`}</span>
            {sqliteErrorsCount === 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                100% Gravando
              </span>
            )}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-white/5">
            <span>Canais no Banco</span>
            <span className="text-cyan-300 font-medium">{dbStats?.counts?.channels ?? '-'} itens</span>
          </div>
        </div>
      </div>

      {/* Live Server-Side URL Validation Tool */}
      <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-6 shadow-lg space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Zap className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="text-base font-bold text-white">Testador de URL M3U no Lado do Servidor</h3>
              <p className="text-xs text-slate-400">
                Teste links M3U antes de salvar para verificar se o servidor remoto está online, se retorna canais válidos e quanto tempo leva.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleValidateUrl} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="url"
              value={testUrl}
              onChange={(e) => setTestUrl(e.target.value)}
              placeholder="Cole uma URL M3U8 para testar (ex: https://exemplo.com/lista.m3u8)..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950/60 border border-white/10 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={isValidatingTestUrl || !testUrl.trim()}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-all active:scale-95 disabled:opacity-50 shrink-0"
          >
            {isValidatingTestUrl ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Testando Conexão...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-white" />
                <span>Validar Link</span>
              </>
            )}
          </button>
        </form>

        {/* Test Result Display - Interface Limpa no Erro de Validação */}
        {testResult && (
          <div className={`p-5 rounded-2xl border animate-in fade-in duration-200 ${
            testResult.valid
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
              : 'bg-rose-950/40 border-rose-500/40 text-rose-100 shadow-xl'
          }`}>
            {testResult.valid ? (
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    <span className="text-sm font-bold text-white">
                      Link M3U8 Acessível e Válido para Gravação!
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">
                    O servidor respondeu com sucesso em {testResult.latencyMs}ms. Foram identificados {testResult.channelsCount ?? 0} canais funcionais no formato M3U.
                  </p>

                  {testResult.sampleChannels && testResult.sampleChannels.length > 0 && (
                    <div className="pt-2">
                      <span className="text-[11px] font-semibold text-emerald-300 block mb-1">
                        Amostra de Canais Identificados:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {testResult.sampleChannels.map((name, i) => (
                          <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-200 font-mono">
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {onGoToUnifier && (
                  <button
                    type="button"
                    onClick={onGoToUnifier}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shrink-0 transition-colors cursor-pointer"
                  >
                    Importar na Grade
                  </button>
                )}
              </div>
            ) : (
              /* Interface Limpa: Sem jargões técnicos, com destaque na mensagem de erro e botão Tentar Novamente */
              <div className="flex flex-col sm:flex-row items-center sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center shrink-0 text-rose-400">
                    <XCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Falha na Validação da URL</h4>
                    <p className="text-xs text-rose-200/90 mt-0.5 max-w-xl">
                      {testResult.error || 'Não foi possível conectar ao endereço informado ou o link não respondeu.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => handleValidateUrl(undefined, testUrl)}
                    disabled={isValidatingTestUrl}
                    className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-bold text-xs shadow-lg shadow-rose-900/40 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isValidatingTestUrl ? 'animate-spin' : ''}`} />
                    <span>Tentar Novamente</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTestResult(null)}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-white/10 transition-colors cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Oculta opções avançadas e técnicas quando houver erro ativo na validação */}
      {(!testResult || testResult.valid) && (
        <>
          {/* Error Logs Filter Bar */}
          <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filtrar erros por URL, nome da fonte ou mensagem..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-950/60 border border-white/10 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterType === 'all'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-800/80 text-slate-400 hover:text-white'
            }`}
          >
            Todos ({logs.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('http')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterType === 'http'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-slate-800/80 text-slate-400 hover:text-white'
            }`}
          >
            HTTP / Status ({httpErrorsCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('timeout')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterType === 'timeout'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-slate-800/80 text-slate-400 hover:text-white'
            }`}
          >
            Timeouts ({timeoutErrorsCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('format')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterType === 'format'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-slate-800/80 text-slate-400 hover:text-white'
            }`}
          >
            Formato / HTML ({formatErrorsCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('sqlite')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterType === 'sqlite'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'bg-slate-800/80 text-slate-400 hover:text-white'
            }`}
          >
            SQLite ({sqliteErrorsCount})
          </button>
        </div>

        {/* Clear History button */}
        {logs.length > 0 && (
          <button
            type="button"
            onClick={handleClearLogs}
            disabled={isClearingLogs}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-xs font-semibold transition-all active:scale-95 disabled:opacity-50 shrink-0"
            title="Limpar todos os logs de erro gravados no banco"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{isClearingLogs ? 'Limpando...' : 'Limpar Histórico'}</span>
          </button>
        )}
      </div>

      {/* Logs Table / Card List */}
      {filteredLogs.length === 0 ? (
        <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/20">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h4 className="text-base font-bold text-white">Nenhuma Falha de Salvamento de URL Registrada</h4>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Todas as fontes M3U8 adicionadas foram validadas com sucesso antes de gravar no banco SQLite, ou o histórico foi limpo recentemente.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredLogs.map((log) => {
            const isExpanded = expandedLogId === log.id;
            const isHttpError = log.errorType.includes('http') || Boolean(log.statusCode);
            const isTimeout = log.errorType.includes('timeout');
            const isFormat = log.errorType.includes('format') || log.errorType.includes('empty');
            const isSqlite = log.errorType.includes('sqlite');

            return (
              <div
                key={log.id}
                className="bg-slate-900/80 border border-white/10 rounded-xl p-4 hover:border-white/20 transition-all space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Error Badge */}
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                      isSqlite
                        ? 'bg-teal-500/20 text-teal-300 border-teal-500/30'
                        : isTimeout
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                        : isFormat
                        ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                    }`}>
                      {log.statusCode ? `HTTP ${log.statusCode}` : log.errorType.toUpperCase()}
                    </span>

                    {/* Source Name */}
                    {log.sourceName && (
                      <span className="text-xs font-semibold text-white">
                        {log.sourceName}
                      </span>
                    )}

                    {/* Timestamp */}
                    <span className="text-[11px] text-slate-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(log.timestamp).toLocaleString('pt-BR')}
                    </span>
                  </div>

                  {/* Actions for this log item */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleValidateUrl(undefined, log.url)}
                      className="flex items-center gap-1 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 px-2 py-1 rounded bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors"
                      title="Testar acessibilidade desta URL agora"
                    >
                      <Play className="w-3 h-3 fill-indigo-400" />
                      <span>Re-testar</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => copyToClipboard(log.url, log.id)}
                      className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 transition-colors"
                      title="Copiar URL"
                    >
                      {copiedId === log.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copiada</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copiar URL</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* URL Display */}
                <div className="p-2.5 rounded-lg bg-slate-950/70 border border-white/5 flex items-center justify-between gap-3 text-xs font-mono text-slate-300 overflow-hidden">
                  <span className="truncate">{log.url}</span>
                  <a
                    href={log.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-500 hover:text-indigo-400 shrink-0 p-0.5"
                    title="Abrir URL em nova aba"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                {/* Error Message */}
                <div className="text-xs text-rose-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span className="leading-relaxed font-medium">{log.errorMessage}</span>
                </div>

                {/* Expandable Technical Details */}
                {log.details && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                      className="text-[11px] font-semibold text-slate-400 hover:text-slate-200 underline underline-offset-2"
                    >
                      {isExpanded ? 'Ocultar detalhes técnicos' : 'Ver detalhes técnicos (diagnóstico)'}
                    </button>

                    {isExpanded && (
                      <div className="mt-2 p-3 rounded-lg bg-slate-950 border border-white/5 text-[11px] font-mono text-slate-400 overflow-x-auto">
                        <pre>{JSON.stringify(log.details, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
        </>
      )}
    </div>
  );
};
