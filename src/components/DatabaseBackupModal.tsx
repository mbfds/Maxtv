import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Database,
  Download,
  Upload,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  HardDrive,
  Tv,
  Users,
  Clock,
  ArrowRight,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import { api } from '../services/api';
import { Channel } from '../types';

interface DatabaseBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDatabaseRestored?: (channelsCount: number) => void;
}

export const DatabaseBackupModal: React.FC<DatabaseBackupModalProps> = ({
  isOpen,
  onClose,
  onDatabaseRestored
}) => {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [stats, setStats] = useState<any>(null);
  const [isLoadingStats, setIsLoadingStats] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [importResult, setImportResult] = useState<{ channelsCount: number; fileSizeBytes?: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadStats = async () => {
    setIsLoadingStats(true);
    try {
      const res = await api.getDatabaseStats();
      if (res && res.stats) {
        setStats(res.stats);
      }
    } catch (err: any) {
      console.warn('[DB STATS] Erro ao carregar estatísticas:', err);
    } finally {
      setIsLoadingStats(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadStats();
      setFeedback(null);
      setImportResult(null);
      setSelectedFile(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const dm = 2;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const handleExport = async (filename: string) => {
    setIsExporting(true);
    setFeedback(null);
    try {
      const blob = await api.downloadDatabaseBackup(filename);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setFeedback({
        type: 'success',
        message: `Arquivo ${filename} exportado com sucesso com flush WAL completo!`
      });
    } catch (err: any) {
      console.error('[DB EXPORT ERROR]:', err);
      // Fallback via URL direta
      try {
        const directUrl = api.getDatabaseBackupDownloadUrl(filename);
        window.open(directUrl, '_blank');
        setFeedback({
          type: 'info',
          message: 'Download direto iniciado em nova aba.'
        });
      } catch (e: any) {
        setFeedback({
          type: 'error',
          message: `Falha ao exportar banco de dados: ${err.message}`
        });
      }
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setFeedback(null);
      setImportResult(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
      setFeedback(null);
      setImportResult(null);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleConfirmImport = async () => {
    if (!selectedFile) {
      setFeedback({ type: 'error', message: 'Por favor, selecione um arquivo .db antes de continuar.' });
      return;
    }

    setIsImporting(true);
    setFeedback(null);

    try {
      const res = await api.importDatabase(selectedFile);
      setImportResult({
        channelsCount: res.channelsCount,
        fileSizeBytes: res.fileSizeBytes || selectedFile.size
      });
      setFeedback({
        type: 'success',
        message: `Banco de dados restaurado com sucesso! ${res.channelsCount} canais foram sincronizados e o cache foi invalidado.`
      });

      // Recarrega as estatísticas locais
      await loadStats();

      // Notifica o componente pai para atualizar a grade
      if (onDatabaseRestored) {
        onDatabaseRestored(res.channelsCount);
      }

      // Dispara evento global para forçar reload das views de canais
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('maxtv_database_imported', { detail: res }));
      }
    } catch (err: any) {
      console.error('[DB IMPORT ERROR]:', err);
      setFeedback({
        type: 'error',
        message: err.message || 'Erro ao importar arquivo do banco de dados.'
      });
    } finally {
      setIsImporting(false);
    }
  };

  const dateTag = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-slate-900 border border-indigo-500/40 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Migração do Banco de Dados SQLite</span>
                <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 text-[10px] font-mono border border-indigo-500/30">
                  data/maxtv.db
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Exporte e importe o banco de dados completo entre os ambientes de produção e desenvolvimento
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Database Status Banner */}
        <div className="px-6 py-3 bg-slate-950/80 border-b border-white/5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4 text-slate-300">
            <span className="flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-indigo-400" />
              <span>Tamanho: <strong className="text-white">{formatBytes(stats?.dbSizeBytes)}</strong></span>
            </span>
            <span className="flex items-center gap-1.5">
              <Tv className="w-3.5 h-3.5 text-teal-400" />
              <span>Canais: <strong className="text-white">{stats?.counts?.channels || 0}</strong></span>
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-emerald-400" />
              <span>Usuários: <strong className="text-white">{stats?.counts?.users || 0}</strong></span>
            </span>
          </div>

          <button
            type="button"
            onClick={loadStats}
            disabled={isLoadingStats}
            className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-white transition-colors"
            title="Atualizar estatísticas do banco"
          >
            <RefreshCw className={`w-3 h-3 ${isLoadingStats ? 'animate-spin text-indigo-400' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-white/10 bg-slate-900/60 px-6">
          <button
            type="button"
            onClick={() => { setActiveTab('export'); setFeedback(null); }}
            className={`flex items-center gap-2 py-3 px-4 border-b-2 text-xs font-bold transition-all ${
              activeTab === 'export'
                ? 'border-indigo-500 text-white bg-indigo-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Download className="w-4 h-4 text-indigo-400" />
            <span>1. Exportar DB (Pegar lá)</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('import'); setFeedback(null); }}
            className={`flex items-center gap-2 py-3 px-4 border-b-2 text-xs font-bold transition-all ${
              activeTab === 'import'
                ? 'border-emerald-500 text-white bg-emerald-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="w-4 h-4 text-emerald-400" />
            <span>2. Importar DB (Trazer aqui)</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {feedback && (
            <div
              className={`p-4 rounded-2xl flex items-start gap-3 text-xs leading-relaxed border ${
                feedback.type === 'success'
                  ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
                  : feedback.type === 'error'
                  ? 'bg-rose-950/50 border-rose-500/40 text-rose-200'
                  : 'bg-indigo-950/50 border-indigo-500/40 text-indigo-200'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : feedback.type === 'error' ? (
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              ) : (
                <Sparkles className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">{feedback.message}</div>
            </div>
          )}

          {activeTab === 'export' ? (
            <div className="space-y-5">
              <div className="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-500/30 space-y-2">
                <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-indigo-400" />
                  <span>Como funciona a Exportação:</span>
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  O sistema realiza automaticamente o <strong>flush seguro do WAL (wal_checkpoint FULL)</strong>, consolidando todas as transmissões, canais e assinaturas diretamente dentro do arquivo <code>maxtv.db</code>.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Opção 1: Nome padrão maxtv.db */}
                <div className="p-5 rounded-2xl bg-slate-950/60 border border-white/10 hover:border-indigo-500/50 transition-all flex flex-col justify-between space-y-4">
                  <div>
                    <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center mb-3">
                      <Download className="w-4 h-4" />
                    </div>
                    <h4 className="text-sm font-bold text-white mb-1">Exportar como maxtv.db</h4>
                    <p className="text-xs text-slate-400">
                      Nome direto do banco. Ideal para baixar e em seguida trazer para a área de desenvolvimento.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleExport('maxtv.db')}
                    disabled={isExporting}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {isExporting ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    <span>Baixar "maxtv.db"</span>
                  </button>
                </div>

                {/* Opção 2: Backup Datado */}
                <div className="p-5 rounded-2xl bg-slate-950/60 border border-white/10 hover:border-teal-500/50 transition-all flex flex-col justify-between space-y-4">
                  <div>
                    <div className="w-9 h-9 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center mb-3">
                      <Clock className="w-4 h-4" />
                    </div>
                    <h4 className="text-sm font-bold text-white mb-1">Backup com Data/Hora</h4>
                    <p className="text-xs text-slate-400">
                      Nome com timestamp para arquivar histórico seguro do estado atual da grade e banco.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleExport(`maxtv-backup-${dateTag}.db`)}
                    disabled={isExporting}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-lg shadow-teal-600/30 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {isExporting ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    <span>Baixar com Data</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/30 space-y-2">
                <h4 className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>Atenção antes de importar:</span>
                </h4>
                <p className="text-xs text-amber-200/90 leading-relaxed">
                  O arquivo que você enviar substituirá o <code>data/maxtv.db</code> deste ambiente. Todos os canais, transmissões cadastradas e registros serão sincronizados instantaneamente.
                </p>
              </div>

              {/* Drag & Drop Zone */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all ${
                  selectedFile
                    ? 'border-emerald-500/60 bg-emerald-950/20'
                    : 'border-white/20 bg-slate-950/50 hover:border-emerald-500/40 hover:bg-slate-950/80'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".db,.sqlite,.sqlite3,application/x-sqlite3,application/octet-stream"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {selectedFile ? (
                  <div className="space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/40">
                      <FileCheck className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">{selectedFile.name}</h4>
                      <p className="text-xs text-emerald-400 font-mono mt-0.5">
                        {formatBytes(selectedFile.size)} • Pronto para importar
                      </p>
                    </div>
                    <span className="inline-block text-[11px] text-slate-400 underline hover:text-white">
                      Clique para escolher outro arquivo
                    </span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto border border-indigo-500/30">
                      <Upload className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">
                        Arraste o arquivo <span className="text-emerald-400">maxtv.db</span> aqui
                      </h4>
                      <p className="text-xs text-slate-400 mt-1">
                        ou clique para selecionar do seu computador (.db, .sqlite, .sqlite3)
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Botão de confirmação de importação */}
              {selectedFile && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleConfirmImport}
                    disabled={isImporting}
                    className="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-xl shadow-emerald-600/30 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {isImporting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Substituindo banco e recarregando canais...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        <span>Confirmar e Substituir Banco de Dados Agora</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Resultado pós-importação com botão de recarregar */}
              {importResult && (
                <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-emerald-300 font-bold flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>{importResult.channelsCount} canais carregados no banco!</span>
                    </span>
                    <span className="text-slate-400 text-[11px]">
                      {formatBytes(importResult.fileSizeBytes)}
                    </span>
                  </div>
                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    A grade foi atualizada no banco e no arquivo de configuração do sistema.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      window.location.reload();
                    }}
                    className="w-full py-2 px-3 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/40 text-emerald-200 border border-emerald-500/40 font-bold transition-all text-center flex items-center justify-center gap-2"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Recarregar Página para Ver os Novos Canais</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
          <span>MAXTV SQLite Engine • Portabilidade Total de Dados</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
