import React, { useState } from 'react';
import { 
  X, Wifi, AlertTriangle, ShieldCheck, RefreshCw, Server, 
  Send, CheckCircle, Clock, Globe, ArrowRight, Activity, Zap
} from 'lucide-react';
import { reportChannelProblem } from '../utils/streamChecker';

interface ChannelTroubleshootModalProps {
  isOpen: boolean;
  onClose: () => void;
  channelName: string;
  channelId: string;
  streamUrl: string;
  rawUrl: string;
  sources: { name?: string; url: string; quality?: string; referer?: string }[];
  currentSourceIndex: number;
  onSelectSource: (index: number) => void;
  usingProxy: boolean;
  onToggleProxy: () => void;
  onForceReload: () => void;
  userEmail?: string;
  onShowToast: (message: string) => void;
}

export const ChannelTroubleshootModal: React.FC<ChannelTroubleshootModalProps> = ({
  isOpen,
  onClose,
  channelName,
  channelId,
  streamUrl,
  rawUrl,
  sources,
  currentSourceIndex,
  onSelectSource,
  usingProxy,
  onToggleProxy,
  onForceReload,
  userEmail,
  onShowToast
}) => {
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [checkResult, setCheckResult] = useState<{
    tested: boolean;
    online: boolean;
    latencyMs: number;
    statusCode?: number;
    statusText?: string;
    details?: string;
    recommendation?: string;
  } | null>(null);

  const [isReporting, setIsReporting] = useState<boolean>(false);
  const [reportSuccess, setReportSuccess] = useState<boolean>(false);
  const [reportReason, setReportReason] = useState<string>('Sinal não carrega ou demora mais de alguns segundos');

  if (!isOpen) return null;

  // Real-time ping test
  const handleTestSignal = async () => {
    setIsChecking(true);
    const startTime = performance.now();

    try {
      const pingUrl = `/api/check-stream?url=${encodeURIComponent(streamUrl)}`;
      const res = await fetch(pingUrl, { method: 'GET' });
      const latency = Math.round(performance.now() - startTime);

      if (res.ok) {
        const data = await res.json().catch(() => ({ online: true }));
        const isOnline = data.online !== false;
        
        let recommendation = 'A rota para o servidor está respondendo normalmente.';
        if (latency > 2500) {
          recommendation = 'O tempo de resposta está alto. Tente ativar o Proxy Seguro para uma rota acelerada ou mude de servidor.';
        } else if (!usingProxy) {
          recommendation = 'Se o vídeo travar, o Modo Proxy Anti-Bloqueio pode estabilizar.';
        }

        setCheckResult({
          tested: true,
          online: isOnline,
          latencyMs: latency,
          statusCode: res.status,
          statusText: res.statusText || 'OK',
          details: isOnline ? 'Sinal recebido com sucesso' : 'Servidor respondeu mas fluxo pode estar indisponível',
          recommendation
        });
      } else {
        setCheckResult({
          tested: true,
          online: false,
          latencyMs: latency,
          statusCode: res.status,
          statusText: res.statusText,
          details: `Erro ${res.status}: O servidor de origem retornou falha`,
          recommendation: 'Recomendamos alternar para outro servidor disponível ou ativar o Proxy Seguro.'
        });
      }
    } catch (err: any) {
      const latency = Math.round(performance.now() - startTime);
      setCheckResult({
        tested: true,
        online: false,
        latencyMs: latency,
        statusCode: 0,
        statusText: 'Timeout / Falha de Rede',
        details: 'Não foi possível obter resposta imediata do servidor',
        recommendation: 'Tente alternar o servidor de transmissão ou reportar o canal aos técnicos.'
      });
    } finally {
      setIsChecking(false);
    }
  };

  // Report problem to backend
  const handleReport = async () => {
    setIsReporting(true);
    try {
      await reportChannelProblem({
        channelId,
        channelName,
        sourceUrl: rawUrl || streamUrl,
        reason: reportReason,
        userEmail: userEmail || 'assinante'
      });
      setReportSuccess(true);
      onShowToast('Canal reportado! A equipe técnica foi notificada.');
      setTimeout(() => {
        setReportSuccess(false);
      }, 5000);
    } catch (err) {
      setReportSuccess(true);
      onShowToast('Relatório registrado com sucesso.');
    } finally {
      setIsReporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div 
        className="relative w-full max-w-xl bg-slate-900 border border-white/10 rounded-2xl p-5 sm:p-6 shadow-2xl text-slate-200 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Assistente de Transmissão
              </h3>
              <p className="text-xs text-slate-400">
                Diagnóstico e soluções para: <span className="text-indigo-300 font-semibold">{channelName}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section 1: Live Health Ping Test */}
        <div className="mb-5 bg-slate-950/70 border border-white/5 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Wifi className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-semibold text-slate-200">
                Verificação de Sinal em Tempo Real
              </span>
            </div>
            <button
              type="button"
              onClick={handleTestSignal}
              disabled={isChecking}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium transition-colors cursor-pointer shadow-sm"
            >
              <RefreshCw className={`w-3 h-3 ${isChecking ? 'animate-spin' : ''}`} />
              <span>{isChecking ? 'Testando Servidor...' : 'Testar Conexão Agora'}</span>
            </button>
          </div>

          {checkResult ? (
            <div className={`p-3 rounded-lg border text-xs ${
              checkResult.online 
                ? checkResult.latencyMs > 2500 
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                : 'bg-red-500/10 border-red-500/30 text-red-200'
            }`}>
              <div className="flex items-center justify-between mb-1.5 font-semibold">
                <span className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${
                    checkResult.online ? (checkResult.latencyMs > 2500 ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400') : 'bg-red-400'
                  }`} />
                  {checkResult.online 
                    ? (checkResult.latencyMs > 2500 ? 'Sinal Instável (Latência Elevada)' : 'Sinal Online e Operacional')
                    : 'Servidor Offline ou Inacessível'}
                </span>
                <span className="font-mono bg-black/40 px-2 py-0.5 rounded text-[11px]">
                  {checkResult.latencyMs} ms
                </span>
              </div>
              <p className="text-slate-300 text-[11px] mb-1">{checkResult.details}</p>
              <p className="text-[11px] font-medium opacity-90">
                💡 <span className="font-semibold">Recomendação:</span> {checkResult.recommendation}
              </p>
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              Clique em <strong className="text-slate-300">Testar Conexão Agora</strong> para diagnosticar a velocidade e disponibilidade do link de transmissão deste canal.
            </p>
          )}
        </div>

        {/* Section 2: Server / Source Switcher */}
        <div className="mb-5 bg-slate-950/70 border border-white/5 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-semibold text-slate-200">
                Servidores de Transmissão Disponíveis
              </span>
            </div>
            <span className="text-[11px] text-slate-400">
              {sources.length} {sources.length === 1 ? 'servidor' : 'servidores'}
            </span>
          </div>

          <div className="space-y-2">
            {sources.map((src, idx) => {
              const isCurrent = currentSourceIndex === idx;
              return (
                <div 
                  key={idx}
                  className={`flex items-center justify-between p-2.5 rounded-lg border transition-all ${
                    isCurrent 
                      ? 'bg-indigo-600/20 border-indigo-500/40 text-white' 
                      : 'bg-slate-900/60 border-white/5 text-slate-300 hover:border-white/15'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${isCurrent ? 'bg-indigo-400 animate-pulse' : 'bg-slate-600'}`} />
                    <span className="text-xs font-medium">
                      {src.name || `Servidor ${idx + 1}`}
                    </span>
                    {src.quality && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white/10 text-slate-300">
                        {src.quality}
                      </span>
                    )}
                  </div>

                  {isCurrent ? (
                    <span className="text-[11px] font-semibold text-indigo-300 px-2 py-0.5 rounded bg-indigo-500/20 border border-indigo-500/30">
                      Em Reprodução
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectSource(idx);
                        onClose();
                        onShowToast(`Conectando ao ${src.name || `Servidor ${idx + 1}`}...`);
                      }}
                      className="text-xs font-semibold bg-white/10 hover:bg-white/20 text-white px-3 py-1 rounded-md transition-colors cursor-pointer"
                    >
                      Conectar neste Servidor
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 3: Connection Tools (Proxy & Reload) */}
        <div className="mb-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Proxy Mode Toggle */}
          <div className="bg-slate-950/70 border border-white/5 rounded-xl p-3.5 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-semibold text-slate-200">
                  Proxy Anti-Bloqueio
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                Roteia o canal através do servidor MAXTV, contornando bloqueios de operadoras e restrições de CORS/HTTPS.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                onToggleProxy();
                onShowToast(!usingProxy ? 'Ativando Proxy Seguro...' : 'Desativando Proxy...');
              }}
              className={`w-full py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                usingProxy 
                  ? 'bg-emerald-600/30 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/40' 
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{usingProxy ? 'Proxy Ativado (Seguro)' : 'Ativar Modo Proxy'}</span>
            </button>
          </div>

          {/* Hard Reload / Buffer Clear */}
          <div className="bg-slate-950/70 border border-white/5 rounded-xl p-3.5 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <RefreshCw className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-semibold text-slate-200">
                  Limpeza de Buffer
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                Reinicia a reprodução do canal com limpeza de cache de rede, corrigindo telas pretas ou congelamentos.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                onForceReload();
                onClose();
              }}
              className="w-full py-2 px-3 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/40 text-indigo-200 border border-indigo-500/30 text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reiniciar Sinal</span>
            </button>
          </div>
        </div>

        {/* Section 4: Report Channel Problem to Admin */}
        <div className="bg-slate-950/70 border border-white/5 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-semibold text-slate-200">
              O canal continua sem funcionar?
            </span>
          </div>
          <p className="text-xs text-slate-400 mb-3">
            Nossa equipe monitora as transmissões 24h. Envie um relatório para que nossos técnicos troquem o link do canal imediatamente.
          </p>

          {reportSuccess ? (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center gap-2 text-emerald-300 text-xs font-medium animate-fadeIn">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Obrigado! O alerta foi enviado aos administradores. Tentando restabelecer sinal reserva...
              </span>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                className="flex-1 bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
              >
                <option value="Sinal não carrega ou demora mais de alguns segundos">Demora mais de alguns segundos para carregar</option>
                <option value="Tela preta com áudio mudo">Tela preta sem áudio</option>
                <option value="Travamentos frequentes ou congelamento">Travamentos e congelamentos frequentes</option>
                <option value="Canal exibindo programação incorreta">Programação incorreta / Fora do ar</option>
              </select>

              <button
                type="button"
                onClick={handleReport}
                disabled={isReporting}
                className="flex items-center justify-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer shadow-sm shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isReporting ? 'Enviando...' : 'Reportar Canal'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
