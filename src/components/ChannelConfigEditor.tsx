import React, { useState, useEffect, useRef } from 'react';
import { 
  FileCode, Check, AlertCircle, RefreshCw, Save, Download, 
  Upload, Copy, CheckCheck, Eye, Code, Tv, Sparkles, 
  Info, AlertTriangle, ArrowRight, ShieldCheck, Search
} from 'lucide-react';
import { api } from '../services/api';
import { Channel } from '../types';

interface ChannelConfigEditorProps {
  onSaveSuccess: (channelsCount: number, message: string) => void;
  onOpenHistory?: () => void;
  currentUserEmail?: string;
}

const SAMPLE_TEMPLATE = {
  version: "1.0",
  updatedAt: new Date().toISOString(),
  updatedBy: "Administrador",
  description: "Grade de Canais de TV Streaming Brasil 2026",
  channels: [
    {
      id: "globo-sp-hd",
      name: "TV Globo SP HD",
      category: "Abertos",
      logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/TV_Globo_2021.svg/320px-TV_Globo_2021.svg.png",
      sources: [
        {
          url: "https://cdn-sp2.satlabscloud.com.br/GLOBO_SP_HD/index.m3u8",
          referer: "https://reidoscanais.st/",
          quality: "1080p"
        }
      ],
      isActive: true,
      isVipOnly: false,
      epgNow: "Jornal Nacional",
      epgNext: "Novela das Nove"
    },
    {
      id: "sportv-hd",
      name: "SporTV HD",
      category: "Esportes",
      logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/SporTV_logo_2021.svg/320px-SporTV_logo_2021.svg.png",
      sources: [
        {
          url: "https://cdn-sp2.satlabscloud.com.br/SPORTV_HD/index.m3u8",
          quality: "1080p"
        }
      ],
      isActive: true,
      isVipOnly: true,
      epgNow: "Tá na Área",
      epgNext: "Brasileirão Série A - Ao Vivo"
    },
    {
      id: "cazetv",
      name: "CazéTV HD",
      category: "Esportes",
      logo: "https://yt3.googleusercontent.com/y_d_5aA0z5g_j7h-1=s900-c-k-c0x00ffffff-no-rj",
      sources: [
        {
          url: "https://cdn-sp2.satlabscloud.com.br/CAZE_TV_HD/index.m3u8",
          quality: "1080p"
        }
      ],
      isActive: true,
      isVipOnly: false,
      epgNow: "Transmissão Esportiva",
      epgNext: "Melhores Momentos da Rodada"
    }
  ]
};

export const ChannelConfigEditor: React.FC<ChannelConfigEditorProps> = ({
  onSaveSuccess,
  onOpenHistory,
  currentUserEmail
}) => {
  const [rawJson, setRawJson] = useState<string>('');
  const [initialJson, setInitialJson] = useState<string>('');
  const [isValid, setIsValid] = useState<boolean>(true);
  const [syntaxError, setSyntaxError] = useState<string | null>(null);
  const [errorPosition, setErrorPosition] = useState<{ line?: number; column?: number } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [parsedChannels, setParsedChannels] = useState<Channel[]>([]);
  
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isValidatingServer, setIsValidatingServer] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');
  const [previewFilter, setPreviewFilter] = useState<string>('');
  const [filePath, setFilePath] = useState<string>('public/data/channels-config.json');
  const [lastModified, setLastModified] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load configuration from server
  const loadConfig = async () => {
    setIsLoading(true);
    setFeedback(null);
    try {
      const res = await api.getChannelsConfig();
      if (res.success && res.rawJson) {
        setRawJson(res.rawJson);
        setInitialJson(res.rawJson);
        if (res.filePath) setFilePath(res.filePath);
        if (res.lastModified) setLastModified(res.lastModified);
        validateLocally(res.rawJson);
      } else if (res.error) {
        setFeedback({ type: 'error', text: res.error });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Erro ao carregar arquivo de configuração' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  // Validate JSON text in real-time
  const validateLocally = (text: string) => {
    if (!text.trim()) {
      setIsValid(false);
      setSyntaxError('O conteúdo JSON não pode ficar em branco.');
      setErrorPosition(null);
      setParsedChannels([]);
      setWarnings([]);
      return;
    }

    try {
      const parsed = JSON.parse(text);
      setSyntaxError(null);
      setErrorPosition(null);

      const list: any[] = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.channels) ? parsed.channels : []);
      const localWarnings: string[] = [];

      if (!Array.isArray(list) || list.length === 0) {
        localWarnings.push('Nenhum canal foi detectado no array "channels".');
      } else {
        const seenIds = new Set<string>();
        list.forEach((ch, idx) => {
          if (!ch || typeof ch !== 'object') {
            localWarnings.push(`Canal #${idx + 1} não é um objeto válido.`);
            return;
          }
          if (!ch.name || typeof ch.name !== 'string' || !ch.name.trim()) {
            localWarnings.push(`Canal #${idx + 1} não tem o campo "name" preenchido.`);
          }
          if (ch.id) {
            if (seenIds.has(ch.id)) {
              localWarnings.push(`ID repetido: "${ch.id}" (índice #${idx + 1}).`);
            } else {
              seenIds.add(ch.id);
            }
          }
          const hasSources = Array.isArray(ch.sources) && ch.sources.length > 0 && ch.sources.some((s: any) => s && (s.url || typeof s === 'string'));
          const hasDirectUrl = typeof ch.url === 'string' && ch.url.trim().length > 0;
          const hasStreamUrl = typeof ch.streamUrl === 'string' && ch.streamUrl.trim().length > 0;
          if (!hasSources && !hasDirectUrl && !hasStreamUrl) {
            localWarnings.push(`Canal "${ch.name || idx + 1}" não possui URL de stream.`);
          }
        });
      }

      setWarnings(localWarnings);
      setParsedChannels(list as Channel[]);
      setIsValid(true);
    } catch (err: any) {
      setIsValid(false);
      setParsedChannels([]);
      const msg = err.message || 'Erro de sintaxe no JSON';
      setSyntaxError(msg);

      // Extract line and column from error message if available
      const lineMatch = msg.match(/line\s+(\d+)/i);
      const colMatch = msg.match(/column\s+(\d+)/i);
      const posMatch = msg.match(/at position\s+(\d+)/i);

      if (lineMatch && colMatch) {
        setErrorPosition({ line: parseInt(lineMatch[1], 10), column: parseInt(colMatch[1], 10) });
      } else if (posMatch) {
        const pos = parseInt(posMatch[1], 10);
        const textBefore = text.slice(0, pos);
        const lines = textBefore.split('\n');
        setErrorPosition({ line: lines.length, column: lines[lines.length - 1].length + 1 });
      } else {
        setErrorPosition(null);
      }
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setRawJson(val);
    validateLocally(val);
  };

  // Format / Beautify JSON
  const handleFormat = () => {
    try {
      const parsed = JSON.parse(rawJson);
      const formatted = JSON.stringify(parsed, null, 2);
      setRawJson(formatted);
      validateLocally(formatted);
      setFeedback({ type: 'info', text: 'JSON formatado com recuo padrão de 2 espaços.' });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: any) {
      setFeedback({ type: 'error', text: `Não é possível formatar: corrija o erro de sintaxe primeiro (${err.message})` });
    }
  };

  // Validate on Server
  const handleServerValidate = async () => {
    setIsValidatingServer(true);
    setFeedback(null);
    try {
      const res = await api.validateChannelsConfig({ rawJson });
      if (res.valid) {
        setFeedback({ 
          type: 'success', 
          text: `Validação aprovada! ${res.count || parsedChannels.length} canais válidos prontos para gravação.` 
        });
      } else {
        setFeedback({ 
          type: 'error', 
          text: `Erro de validação: ${res.error || 'Estrutura do arquivo inválida'}` 
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Erro ao comunicar com o validador do servidor' });
    } finally {
      setIsValidatingServer(false);
    }
  };

  // Save Configuration to Server
  const handleSave = async () => {
    if (!isValid) {
      setFeedback({ 
        type: 'error', 
        text: 'Não é permitido salvar o arquivo com erros de sintaxe JSON para proteger o sistema.' 
      });
      return;
    }

    if (parsedChannels.length === 0) {
      if (!confirm('O arquivo não contém nenhum canal detectado. Deseja mesmo prosseguir e esvaziar a grade?')) {
        return;
      }
    }

    setIsSaving(true);
    setFeedback(null);
    try {
      const res = await api.saveChannelsConfig({
        rawJson,
        author: currentUserEmail || 'Administrador'
      });

      if (res.success) {
        setInitialJson(rawJson);
        setFeedback({
          type: 'success',
          text: res.message || 'Arquivo de configuração salvo com sucesso!'
        });
        if (res.rawJson) {
          setRawJson(res.rawJson);
        }
        onSaveSuccess(res.channelsCount || parsedChannels.length, res.message);
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.message || 'Falha ao salvar configuração no servidor'
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Insert Sample Template
  const handleInsertTemplate = () => {
    if (rawJson.trim() && rawJson !== initialJson) {
      if (!confirm('Substituir o conteúdo atual pelo modelo exemplo padrão de canais?')) {
        return;
      }
    }
    const sample = JSON.stringify(SAMPLE_TEMPLATE, null, 2);
    setRawJson(sample);
    validateLocally(sample);
    setFeedback({ type: 'info', text: 'Modelo padrão carregado no editor. Clique em "Salvar Configuração" para aplicá-lo.' });
  };

  // Copy to clipboard
  const handleCopy = () => {
    navigator.clipboard.writeText(rawJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Download JSON file
  const handleDownload = () => {
    const blob = new Blob([rawJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `channels-config-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Upload JSON file
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setRawJson(content);
        validateLocally(content);
        setFeedback({ 
          type: 'info', 
          text: `Arquivo "${file.name}" importado com sucesso! Revise os canais e clique em Salvar.` 
        });
      }
    };
    reader.onerror = () => {
      setFeedback({ type: 'error', text: 'Erro ao ler o arquivo selecionado.' });
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const hasUnsavedChanges = rawJson !== initialJson;

  const filteredPreview = parsedChannels.filter(ch => {
    if (!previewFilter.trim()) return true;
    const term = previewFilter.toLowerCase();
    return (
      (ch.name && ch.name.toLowerCase().includes(term)) ||
      (ch.category && ch.category.toLowerCase().includes(term)) ||
      (ch.id && ch.id.toLowerCase().includes(term)) ||
      (ch.sources && ch.sources.some(s => s.url && s.url.toLowerCase().includes(term)))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header Info & Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900/90 border border-white/10 shadow-lg">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
            <FileCode className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-bold text-white">Editor de Configuração dos Canais (JSON)</h2>
              {isValid ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                  <Check className="w-3 h-3" />
                  JSON Válido ({parsedChannels.length} canais)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-500/30 animate-pulse">
                  <AlertCircle className="w-3 h-3" />
                  Erro de Formato
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Edite diretamente o arquivo de configuração da grade de canais com validação sintática e semântica rigorosa para evitar falhas em tempo de execução no reprodutor.
            </p>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-slate-400 font-mono">
              <span className="bg-slate-950/70 px-2 py-0.5 rounded border border-white/5">
                Arquivo: <strong className="text-slate-300">{filePath}</strong>
              </span>
              {lastModified && (
                <span className="bg-slate-950/70 px-2 py-0.5 rounded border border-white/5">
                  Última alteração: {new Date(lastModified).toLocaleString('pt-BR')}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onOpenHistory && (
            <button
              type="button"
              onClick={onOpenHistory}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 transition-colors"
            >
              <span>Ver Histórico da Grade</span>
              <ArrowRight className="w-3.5 h-3.5 text-indigo-400" />
            </button>
          )}

          <button
            type="button"
            onClick={loadConfig}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10 transition-colors disabled:opacity-50"
            title="Recarregar do Servidor"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Recarregar</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !isValid}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-white shadow-lg transition-all ${
              isValid
                ? 'bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 shadow-emerald-600/20 cursor-pointer'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-white/10'
            }`}
          >
            <Save className={`w-4 h-4 ${isSaving ? 'animate-spin' : ''}`} />
            <span>{isSaving ? 'Gravando Arquivo...' : 'Salvar Configuração'}</span>
          </button>
        </div>
      </div>

      {/* Real-time Feedback Banner */}
      {feedback && (
        <div className={`p-4 rounded-xl text-xs flex items-start gap-3 border transition-all ${
          feedback.type === 'success'
            ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-200'
            : feedback.type === 'error'
            ? 'bg-rose-950/70 border-rose-500/40 text-rose-200'
            : 'bg-indigo-950/70 border-indigo-500/40 text-indigo-200'
        }`}>
          {feedback.type === 'success' && <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
          {feedback.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />}
          {feedback.type === 'info' && <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />}
          <div className="flex-1">
            <span className="font-semibold">{feedback.text}</span>
          </div>
          <button 
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Syntax error warning box */}
      {!isValid && syntaxError && (
        <div className="p-4 rounded-xl bg-rose-950/80 border border-rose-500/50 text-rose-200 text-xs flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold text-rose-100 flex items-center gap-2">
              <span>Falha de validação de sintaxe JSON</span>
              {errorPosition?.line && (
                <span className="px-2 py-0.5 rounded bg-rose-900/60 font-mono text-[11px] border border-rose-700/50">
                  Linha {errorPosition.line}, Coluna {errorPosition.column}
                </span>
              )}
            </div>
            <p className="font-mono text-rose-300 text-[11px] break-all">{syntaxError}</p>
            <p className="text-[11px] text-rose-400/80">
              Corrija as vírgulas faltantes, aspas duplas em chaves e valores, ou colchetes antes de gravar para não corromper o catálogo.
            </p>
          </div>
        </div>
      )}

      {/* Schema warnings (if any) */}
      {isValid && warnings.length > 0 && (
        <div className="p-3.5 rounded-xl bg-amber-950/50 border border-amber-500/40 text-amber-200 text-xs flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-amber-100">Avisos estruturais na configuração ({warnings.length}):</span>
            <ul className="list-disc list-inside mt-1 text-[11px] text-amber-300 space-y-0.5">
              {warnings.slice(0, 3).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
              {warnings.length > 3 && (
                <li className="text-amber-400/80 italic">... e mais {warnings.length - 3} avisos.</li>
              )}
            </ul>
          </div>
        </div>
      )}

      {/* Toolbar & View Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900 border border-white/10 w-fit">
          <button
            type="button"
            onClick={() => setActiveTab('editor')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'editor'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>Código JSON</span>
            {hasUnsavedChanges && (
              <span className="w-2 h-2 rounded-full bg-amber-400" title="Alterações não salvas" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'preview'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Pré-visualização da Grade</span>
            <span className="px-1.5 py-0.2 rounded text-[10px] bg-white/10 font-mono">
              {parsedChannels.length}
            </span>
          </button>
        </div>

        {/* Toolbar Tools */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleFormat}
            disabled={!isValid}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10 transition-colors disabled:opacity-40"
            title="Formatar e indentar o JSON"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Formatar / Indentar</span>
          </button>

          <button
            type="button"
            onClick={handleServerValidate}
            disabled={isValidatingServer}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10 transition-colors"
            title="Executar validação rigorosa no servidor"
          >
            <ShieldCheck className={`w-3.5 h-3.5 text-emerald-400 ${isValidatingServer ? 'animate-spin' : ''}`} />
            <span>Validar Formato</span>
          </button>

          <button
            type="button"
            onClick={handleInsertTemplate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10 transition-colors"
            title="Carregar exemplo de modelo estruturado"
          >
            <FileCode className="w-3.5 h-3.5 text-indigo-400" />
            <span>Modelo Exemplo</span>
          </button>

          <div className="h-4 w-px bg-white/10 mx-1 hidden sm:block" />

          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10 transition-colors"
            title="Copiar todo o JSON para a área de transferência"
          >
            {copied ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copiado!' : 'Copiar'}</span>
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10 transition-colors"
            title="Baixar backup do arquivo JSON"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Baixar (.json)</span>
          </button>

          <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10 transition-colors cursor-pointer">
            <Upload className="w-3.5 h-3.5 text-purple-400" />
            <span>Importar</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Main Content: Code Editor or Visual Preview */}
      {activeTab === 'editor' ? (
        <div className="space-y-3">
          <div className="relative rounded-2xl border border-white/10 bg-slate-950 overflow-hidden shadow-2xl">
            {/* Editor Top bar */}
            <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-white/10 text-[11px] font-mono text-slate-400">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                <span className="ml-2 text-slate-300">channels-config.json</span>
                {hasUnsavedChanges && (
                  <span className="text-amber-400 font-semibold">• modificado</span>
                )}
              </div>
              <div className="flex items-center gap-4">
                <span>{rawJson.split('\n').length} linhas</span>
                <span>{(new Blob([rawJson]).size / 1024).toFixed(1)} KB</span>
                <span className={isValid ? 'text-emerald-400' : 'text-rose-400 font-bold'}>
                  {isValid ? 'Sintaxe OK' : 'Erro de Sintaxe'}
                </span>
              </div>
            </div>

            {/* Code Input */}
            <textarea
              ref={textareaRef}
              value={rawJson}
              onChange={handleTextChange}
              placeholder="Cole ou edite a configuração dos canais em formato JSON..."
              rows={22}
              spellCheck={false}
              className="w-full bg-slate-950 text-emerald-400 font-mono text-xs leading-relaxed p-4 focus:outline-none resize-y selection:bg-indigo-600/40 selection:text-white"
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                tabSize: 2
              }}
            />
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-slate-500 px-1">
            <div className="flex items-center gap-2">
              <Info className="w-3.5 h-3.5 text-slate-400" />
              <span>Dica: Use aspas duplas válidas e garanta que cada canal possua ao menos um link de transmissão em "sources".</span>
            </div>
            {hasUnsavedChanges && (
              <span className="text-amber-400 font-semibold">
                Você tem alterações não salvas no arquivo.
              </span>
            )}
          </div>
        </div>
      ) : (
        /* Visual Preview Tab */
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filtrar canais no JSON..."
                value={previewFilter}
                onChange={e => setPreviewFilter(e.target.value)}
                className="w-full bg-slate-900 text-xs text-white placeholder-slate-500 rounded-xl pl-9 pr-4 py-2 border border-white/10 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="text-xs text-slate-400">
              Exibindo <strong>{filteredPreview.length}</strong> de <strong>{parsedChannels.length}</strong> canais parseados
            </div>
          </div>

          {parsedChannels.length === 0 ? (
            <div className="text-center py-12 rounded-2xl border border-dashed border-white/10 bg-slate-900/40 text-slate-400">
              <Tv className="w-10 h-10 mx-auto text-slate-600 mb-2" />
              <p className="text-sm font-semibold text-slate-300">Nenhum canal válido para exibir</p>
              <p className="text-xs text-slate-500 mt-1">Verifique o código JSON na aba anterior para corrigir erros de formatação.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[600px] overflow-y-auto pr-1">
              {filteredPreview.map((ch, idx) => (
                <div 
                  key={ch.id || idx}
                  className="p-3.5 rounded-xl border border-white/10 bg-slate-900 hover:bg-slate-850 transition-colors flex items-start gap-3"
                >
                  <img
                    src={ch.logo || 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=200'}
                    alt={ch.name}
                    className="w-10 h-10 rounded-lg object-contain bg-slate-950 p-1 border border-white/10 shrink-0"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <h4 className="text-xs font-bold text-white truncate">{ch.name || 'Sem Nome'}</h4>
                      {ch.isVipOnly ? (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-500/30">
                          VIP
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                          Livre
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">{ch.category || 'Variedades'}</p>
                    <p className="text-[10px] font-mono text-slate-500 truncate mt-1">
                      {ch.sources?.[0]?.url || (ch as any).url || 'Sem stream definido'}
                    </p>
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
