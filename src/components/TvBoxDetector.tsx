import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Tv, 
  Gamepad2, 
  Sliders, 
  Eye, 
  Type, 
  Check, 
  X, 
  Maximize2, 
  Sparkles, 
  Volume2, 
  ChevronRight,
  ArrowRight,
  Monitor
} from 'lucide-react';

export type TvFontScale = 'normal' | 'large' | 'xlarge';

interface TvBoxDetectorProps {
  isTvBoxMode: boolean;
  onToggleTvBoxMode: (enabled: boolean) => void;
}

export const TvBoxDetector: React.FC<TvBoxDetectorProps> = ({
  isTvBoxMode,
  onToggleTvBoxMode
}) => {
  // Configurações de leitura à distância e contraste
  const [fontScale, setFontScale] = useState<TvFontScale>(() => {
    try {
      const saved = localStorage.getItem('maxtv_tv_font_scale');
      if (saved === 'normal' || saved === 'large' || saved === 'xlarge') return saved;
      return 'large'; // Padrão recomendado para TV Box (10-foot reading)
    } catch {
      return 'large';
    }
  });

  const [highContrast, setHighContrast] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('maxtv_tv_high_contrast');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  // Notificação de detecção automática do D-Pad
  const [showAutoSwitchToast, setShowAutoSwitchToast] = useState<boolean>(false);
  const [toastDetails, setToastDetails] = useState<{ source: string; keyName?: string }>({
    source: 'D-Pad / Controle Remoto'
  });

  // Painel de ajustes rápidos aberto/fechado
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [connectedGamepadName, setConnectedGamepadName] = useState<string | null>(null);
  const [lastDpadKeyDetected, setLastDpadKeyDetected] = useState<string | null>(null);

  const autoSwitchToastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const gamepadPollAnimRef = useRef<number | null>(null);
  const lastGamepadActionTimeRef = useRef<number>(0);

  // Som suave de feedback ao ativar o modo TV via D-Pad (Web Audio API)
  const playFeedbackBeep = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);
    } catch {
      // Áudio opcional, ignora se bloqueado pelo navegador
    }
  }, []);

  // Aplica as classes CSS globais no <html> para leitura à distância e contraste
  useEffect(() => {
    const root = document.documentElement;
    try {
      if (isTvBoxMode) {
        root.classList.add('tv-box-mode');
        
        // Remove classes antigas de fonte
        root.classList.remove('tv-font-normal', 'tv-font-large', 'tv-font-xlarge');
        root.classList.add(`tv-font-${fontScale}`);

        // Contraste elevado para telas de TV à distância
        if (highContrast) {
          root.classList.add('tv-high-contrast');
        } else {
          root.classList.remove('tv-high-contrast');
        }
      } else {
        root.classList.remove('tv-box-mode', 'tv-font-normal', 'tv-font-large', 'tv-font-xlarge', 'tv-high-contrast');
      }

      localStorage.setItem('maxtv_tv_font_scale', fontScale);
      localStorage.setItem('maxtv_tv_high_contrast', highContrast ? 'true' : 'false');
    } catch (err) {
      console.warn('Erro ao atualizar classes TV Box:', err);
    }
  }, [isTvBoxMode, fontScale, highContrast]);

  // Dispara a alternância automática quando o D-Pad for detectado
  const handleDpadDetected = useCallback((source: string, keyName?: string) => {
    setLastDpadKeyDetected(keyName || source);

    if (!isTvBoxMode) {
      onToggleTvBoxMode(true);
      playFeedbackBeep();

      setToastDetails({ source, keyName });
      setShowAutoSwitchToast(true);

      if (autoSwitchToastTimeoutRef.current) {
        clearTimeout(autoSwitchToastTimeoutRef.current);
      }
      autoSwitchToastTimeoutRef.current = setTimeout(() => {
        setShowAutoSwitchToast(false);
      }, 7000);
    }
  }, [isTvBoxMode, onToggleTvBoxMode, playFeedbackBeep]);

  // 1. Detecção de D-Pad via Teclado e Controle Remoto Infravermelho/Bluetooth
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Chaves típicas de D-Pad em teclados, air-mouses e controles remotos de Smart TV / TV Box
      const dpadKeys = [
        'ArrowUp', 
        'ArrowDown', 
        'ArrowLeft', 
        'ArrowRight',
        'Enter', 
        'Select', 
        'OK',
        'MediaPlayPause', 
        'MediaPlay', 
        'MediaPause',
        'MediaTrackNext', 
        'MediaTrackPrevious',
        'ChannelUp', 
        'ChannelDown',
        'TVInput', 
        'Menu', 
        'Info', 
        'Guide',
        'GoBack',
        'ColorF0Red', 
        'ColorF1Green', 
        'ColorF2Yellow', 
        'ColorF3Blue'
      ];

      // Códigos numéricos de D-Pad de controles Android TV / Fire TV / Tizen / WebOS
      const isAndroidTvDpadCode = [
        19, // DPAD_UP
        20, // DPAD_DOWN
        21, // DPAD_LEFT
        22, // DPAD_RIGHT
        23, // DPAD_CENTER / SELECT
        66, // ENTER
        82, // MENU
        85, // MEDIA_PLAY_PAUSE
        166, // CHANNEL_UP
        167  // CHANNEL_DOWN
      ].includes(e.keyCode);

      const isDirectionalOrRemoteKey = dpadKeys.includes(e.key) || isAndroidTvDpadCode;

      if (isDirectionalOrRemoteKey) {
        // Evita disparar quando o usuário está digitando em inputs normais de texto (a menos que sejam setas)
        const target = e.target as HTMLElement | null;
        const isWritingInInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && !['ArrowUp', 'ArrowDown'].includes(e.key);

        if (!isWritingInInput) {
          handleDpadDetected('Controle Remoto / D-Pad', e.key || `Key #${e.keyCode}`);

          // Se estiver em modo TV, assegura que o elemento focado fique visível sem cortar na tela
          if (isTvBoxMode && document.activeElement && document.activeElement !== document.body) {
            setTimeout(() => {
              try {
                document.activeElement?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'nearest',
                  inline: 'nearest'
                });
              } catch {}
            }, 60);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, { passive: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleDpadDetected, isTvBoxMode]);

  // 2. Detecção de D-Pad via Gamepad API (Controles Bluetooth, Joysticks e Gamepads de TV Box)
  useEffect(() => {
    const handleGamepadConnected = (e: GamepadEvent) => {
      const gp = e.gamepad;
      if (gp) {
        setConnectedGamepadName(gp.id);
        // Ativa automaticamente ao conectar gamepad típico de TV Box
        handleDpadDetected('Gamepad / Controle Bluetooth', gp.id);
      }
    };

    const handleGamepadDisconnected = () => {
      setConnectedGamepadName(null);
    };

    window.addEventListener('gamepadconnected', handleGamepadConnected);
    window.addEventListener('gamepaddisconnected', handleGamepadDisconnected);

    // Loop de verificação de botões e direcionais (D-Pad) do gamepad
    const pollGamepads = () => {
      if (typeof navigator.getGamepads === 'function') {
        const gamepads = navigator.getGamepads();
        for (let i = 0; i < gamepads.length; i++) {
          const gp = gamepads[i];
          if (gp && gp.connected) {
            // Botões D-Pad padrão da especificação Gamepad:
            // 12: D-Pad Up, 13: D-Pad Down, 14: D-Pad Left, 15: D-Pad Right
            // 0: A/Cruz (Select), 1: B/Círculo (Voltar), 9: Start/Menu
            const dpadButtons = [12, 13, 14, 15, 0, 1, 9];
            const isDpadPressed = dpadButtons.some(bIdx => gp.buttons[bIdx]?.pressed);

            // Eixo analógico ou direcional (DPad em eixos 0 e 1, ou hat switch no eixo 9)
            const isAxisMoved = (Math.abs(gp.axes[0] || 0) > 0.6) || (Math.abs(gp.axes[1] || 0) > 0.6);

            if (isDpadPressed || isAxisMoved) {
              const now = Date.now();
              if (now - lastGamepadActionTimeRef.current > 1500) {
                lastGamepadActionTimeRef.current = now;
                handleDpadDetected('Gamepad D-Pad', gp.id);
              }
            }
          }
        }
      }
      gamepadPollAnimRef.current = requestAnimationFrame(pollGamepads);
    };

    gamepadPollAnimRef.current = requestAnimationFrame(pollGamepads);

    return () => {
      window.removeEventListener('gamepadconnected', handleGamepadConnected);
      window.removeEventListener('gamepaddisconnected', handleGamepadDisconnected);
      if (gamepadPollAnimRef.current) {
        cancelAnimationFrame(gamepadPollAnimRef.current);
      }
    };
  }, [handleDpadDetected]);

  return (
    <>
      {/* Notificação Flutuante de Alternância Automática para TV Box Mode */}
      {showAutoSwitchToast && (
        <div 
          id="tvbox-autoswitch-banner"
          className="fixed top-5 left-1/2 -translate-x-1/2 z-50 w-[94%] max-w-lg animate-fadeIn"
          role="alert"
        >
          <div className="p-4 rounded-3xl bg-slate-950/95 text-white border-2 border-amber-500/80 shadow-[0_10px_35px_rgba(245,158,11,0.35)] backdrop-blur-xl flex items-start gap-3.5">
            <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/40 shrink-0">
              <Tv className="w-6 h-6 animate-pulse" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[11px] font-black uppercase tracking-wider">
                  D-Pad Detectado
                </span>
                <span className="text-xs text-amber-300 font-bold truncate">
                  {toastDetails.source}
                </span>
              </div>

              <h4 className="text-sm sm:text-base font-black text-white mt-1">
                Layout alternado para o Modo TV Box!
              </h4>
              <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                Fontes ampliadas e contraste elevado foram ativados para leitura confortável a 3 metros de distância.
              </p>

              <div className="flex items-center gap-2 mt-3 pt-2 border-t border-white/10">
                <button
                  id="btn-tvbox-toast-config"
                  type="button"
                  onClick={() => {
                    setShowAutoSwitchToast(false);
                    setIsSettingsOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Ajustar Escala</span>
                </button>

                <button
                  id="btn-tvbox-toast-revert"
                  type="button"
                  onClick={() => {
                    onToggleTvBoxMode(false);
                    setShowAutoSwitchToast(false);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Desativar Modo TV
                </button>

                <button
                  type="button"
                  onClick={() => setShowAutoSwitchToast(false)}
                  className="ml-auto p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                  title="Fechar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Botão / Pill Flutuante de Status do Modo TV (Acesso Rápido) */}
      <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2">
        {isTvBoxMode ? (
          <button
            id="btn-tvbox-floating-status"
            type="button"
            onClick={() => setIsSettingsOpen(prev => !prev)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-2 border-amber-500/60 shadow-[0_4px_20px_rgba(245,158,11,0.3)] backdrop-blur-md text-xs font-black transition-all cursor-pointer"
            title="Ajustes do Modo TV Box (Escala de fontes e alto contraste)"
          >
            <Tv className="w-4 h-4 text-amber-400 animate-pulse" />
            <span className="hidden sm:inline">TV Box Mode</span>
            <span className="px-1.5 py-0.5 rounded-md bg-amber-500 text-slate-950 text-[10px] font-black">
              {fontScale === 'xlarge' ? 'A++ 20px' : fontScale === 'large' ? 'A+ 18px' : 'A 16px'}
            </span>
          </button>
        ) : (
          <button
            id="btn-tvbox-test-dpad-trigger"
            type="button"
            onClick={() => handleDpadDetected('Simulação de D-Pad', 'ArrowDown')}
            className="group flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-amber-300 border border-white/10 hover:border-amber-500/40 shadow-lg text-xs font-semibold transition-all cursor-pointer"
            title="Simular toque no D-Pad ou Controle Remoto para testar o Modo TV Box"
          >
            <Gamepad2 className="w-3.5 h-3.5 group-hover:text-amber-400" />
            <span className="hidden md:inline">Testar D-Pad</span>
          </button>
        )}
      </div>

      {/* Modal / Painel de Configurações de Leitura à Distância e Contraste */}
      {isSettingsOpen && (
        <div 
          id="tvbox-settings-modal"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setIsSettingsOpen(false)}
        >
          <div 
            className="w-full max-w-md bg-slate-900 border-2 border-amber-500/50 rounded-3xl p-6 shadow-2xl space-y-5 animate-fadeIn"
            onClick={e => e.stopPropagation()}
          >
            {/* Cabeçalho */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <Tv className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">
                    TV Box Mode & Leitura à Distância
                  </h3>
                  <p className="text-xs text-slate-400">
                    Otimizado para controle remoto D-Pad e TVs a 3 metros
                  </p>
                </div>
              </div>
              <button
                id="btn-close-tvbox-settings"
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Alternar Modo TV Box Ativo */}
            <div className="p-4 rounded-2xl bg-slate-950/70 border border-white/10 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <span className="text-sm font-bold text-white flex items-center gap-1.5">
                  <Monitor className="w-4 h-4 text-amber-400" />
                  Modo TV Box
                </span>
                <p className="text-xs text-slate-400">
                  Desativa desfoques pesados, acelera para 60fps e ativa anel D-Pad
                </p>
              </div>
              <button
                id="btn-toggle-tvbox-state"
                type="button"
                onClick={() => onToggleTvBoxMode(!isTvBoxMode)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                  isTvBoxMode ? 'bg-amber-500' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    isTvBoxMode ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Ajuste de Tamanho da Fonte (Leitura à Distância - 10-Foot UI) */}
            <div className="space-y-2.5">
              <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Type className="w-4 h-4 text-indigo-400" />
                  Tamanho da Fonte para Distância (10-Foot UI):
                </span>
                <span className="text-amber-400 font-black">
                  {fontScale === 'xlarge' ? 'Extra Grande (20px / +25%)' : fontScale === 'large' ? 'Grande (18px / +12%)' : 'Padrão (16px)'}
                </span>
              </label>

              <div className="grid grid-cols-3 gap-2">
                <button
                  id="btn-font-scale-normal"
                  type="button"
                  onClick={() => setFontScale('normal')}
                  className={`py-2.5 px-3 rounded-2xl border text-xs font-bold transition-all cursor-pointer text-center ${
                    fontScale === 'normal'
                      ? 'bg-amber-500 text-slate-950 border-amber-400 font-black shadow-md'
                      : 'bg-slate-950/60 text-slate-400 border-white/10 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span className="text-sm block font-normal">Aa</span>
                  <span className="text-[11px] block mt-0.5">Padrão</span>
                </button>

                <button
                  id="btn-font-scale-large"
                  type="button"
                  onClick={() => setFontScale('large')}
                  className={`py-2.5 px-3 rounded-2xl border text-xs font-bold transition-all cursor-pointer text-center ${
                    fontScale === 'large'
                      ? 'bg-amber-500 text-slate-950 border-amber-400 font-black shadow-md'
                      : 'bg-slate-950/60 text-slate-400 border-white/10 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span className="text-base block font-bold">Aa</span>
                  <span className="text-[11px] block mt-0.5">Grande (3m)</span>
                </button>

                <button
                  id="btn-font-scale-xlarge"
                  type="button"
                  onClick={() => setFontScale('xlarge')}
                  className={`py-2.5 px-3 rounded-2xl border text-xs font-bold transition-all cursor-pointer text-center ${
                    fontScale === 'xlarge'
                      ? 'bg-amber-500 text-slate-950 border-amber-400 font-black shadow-md'
                      : 'bg-slate-950/60 text-slate-400 border-white/10 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span className="text-lg block font-black">Aa</span>
                  <span className="text-[11px] block mt-0.5">Máximo (4m+)</span>
                </button>
              </div>
            </div>

            {/* Ajuste de Contraste Elevado */}
            <div className="p-4 rounded-2xl bg-slate-950/70 border border-white/10 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <span className="text-sm font-bold text-white flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-emerald-400" />
                  Alto Contraste para TV
                </span>
                <p className="text-xs text-slate-400">
                  Fundo preto absoluto, textos em prata brilhante e bordas nítidas
                </p>
              </div>
              <button
                id="btn-toggle-high-contrast"
                type="button"
                onClick={() => setHighContrast(prev => !prev)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                  highContrast ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    highContrast ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Informações de Conexão de Controle */}
            <div className="p-3.5 rounded-2xl bg-slate-950/40 border border-white/5 space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Gamepad2 className="w-3.5 h-3.5 text-amber-400" />
                  Status do D-Pad / Controle:
                </span>
                <span className="font-bold text-slate-200">
                  {connectedGamepadName ? 'Gamepad Conectado' : 'Pronto (Teclado / Remoto)'}
                </span>
              </div>
              {lastDpadKeyDetected && (
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-white/5">
                  <span>Último comando recebido:</span>
                  <code className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-mono">
                    {lastDpadKeyDetected}
                  </code>
                </div>
              )}
            </div>

            {/* Botão de Fechar */}
            <div className="pt-2 flex justify-end">
              <button
                id="btn-save-tvbox-settings"
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="w-full py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition-colors cursor-pointer text-center"
              >
                Salvar e Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
