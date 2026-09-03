import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import mpegts from 'mpegts.js';
import * as dashjs from 'dashjs';
import { 
  Play, Pause, Volume2, Volume1, VolumeX, Maximize2, Minimize2, 
  RotateCcw, X, ShieldAlert, Sparkles, Crown, Radio, 
  Tv, AlertTriangle, ExternalLink, FastForward, Rewind,
  Server, RefreshCw, Film, PictureInPicture, Camera, 
  Settings, SlidersHorizontal, Check, Info, WifiOff, Wifi, ShieldOff,
  HelpCircle, Activity, Heart, Zap, Wrench, Clock, PauseCircle, PlayCircle,
  Shuffle, Layers, Cpu
} from 'lucide-react';
import { Channel, VodItem, User } from '../types';
import { checkStreamAvailability, reportChannelProblem } from '../utils/streamChecker';
import { favoritesStorage, FAVORITES_UPDATED_EVENT } from '../services/favoritesStorage';
import { watchProgressStorage } from '../services/watchProgressStorage';
import { ChannelTroubleshootModal } from './ChannelTroubleshootModal';

interface LivePlayerProps {
  item: Channel | VodItem;
  type: 'channel' | 'vod';
  isVip: boolean;
  currentUser?: User | null;
  authToken?: string;
  initialSeekTime?: number;
  onClose: () => void;
  onOpenCheckout: () => void;
  onOpenAuth?: () => void;
}

interface QualityOption {
  index: number;
  label: string;
  bitrate?: number;
}

type AspectRatioMode = 'contain' | 'cover' | 'fill';

export const LivePlayer: React.FC<LivePlayerProps> = ({
  item,
  type,
  isVip,
  currentUser,
  authToken,
  initialSeekTime,
  onClose,
  onOpenCheckout,
  onOpenAuth
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const mpegtsRef = useRef<any>(null);
  const dashPlayerRef = useRef<dashjs.MediaPlayerClass | null>(null);
  const [compatibilityProtocol, setCompatibilityProtocol] = useState<'hls' | 'dash'>('hls');
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(1);
  const [lastNonZeroVolume, setLastNonZeroVolume] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isPiP, setIsPiP] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [currentSourceIndex, setCurrentSourceIndex] = useState<number>(0);

  // VOD timing & buffer state
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [bufferedEnd, setBufferedEnd] = useState<number>(0);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number>(0);

  // Advanced player settings
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [aspectRatio, setAspectRatio] = useState<AspectRatioMode>('contain');
  const [qualities, setQualities] = useState<QualityOption[]>([]);
  const [currentQuality, setCurrentQuality] = useState<number>(-1); // -1 = Auto
  const [activeMenu, setActiveMenu] = useState<'settings' | 'sources' | 'help' | null>(null);

  // UI feedback & controls visibility
  const [showControls, setShowControls] = useState<boolean>(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [splashAction, setSplashAction] = useState<'play' | 'pause' | 'rewind' | 'forward' | null>(null);

  // Favorites & Watch Progress states
  const [isFav, setIsFav] = useState<boolean>(() => favoritesStorage.isFavorite(item.id, currentUser?.email));
  const hasAppliedInitialSeekRef = useRef<boolean>(false);
  const lastSavedProgressTimeRef = useRef<number>(0);
  const [resumePrompt, setResumePrompt] = useState<{ time: number; formatted: string } | null>(null);

  useEffect(() => {
    const handleFavUpdate = () => {
      setIsFav(favoritesStorage.isFavorite(item.id, currentUser?.email));
    };
    window.addEventListener(FAVORITES_UPDATED_EVENT, handleFavUpdate);
    return () => window.removeEventListener(FAVORITES_UPDATED_EVENT, handleFavUpdate);
  }, [item.id, currentUser?.email]);

  // Stream pre-flight HEAD health check state
  const [streamWarning, setStreamWarning] = useState<string | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState<boolean>(false);
  const [showTroubleshootModal, setShowTroubleshootModal] = useState<boolean>(false);
  const [reloadCounter, setReloadCounter] = useState<number>(0);

  // Rigorous 3.5s timeout and channel health indicators
  const canPlayTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasCanPlayFiredRef = useRef<boolean>(false);
  const [isTimedOut, setIsTimedOut] = useState<boolean>(false);
  const [isConnectionUnstable, setIsConnectionUnstable] = useState<boolean>(false);
  const [connectionLatency, setConnectionLatency] = useState<number>(0);
  const [hasReportedError, setHasReportedError] = useState<boolean>(false);

  // Auto-retry counter (up to 3 times after 3.5s timeout or dead link before definitive error and Reportar Erro button)
  const [autoRetryCount, setAutoRetryCount] = useState<number>(0);
  const autoRetryCountRef = useRef<number>(0);

  // Exponential backoff states for subsequent retries beyond the initial 3 attempts
  const [connectionAttempts, setConnectionAttempts] = useState<number>(1);
  const connectionAttemptsRef = useRef<number>(1);
  const [backoffSecondsLeft, setBackoffSecondsLeft] = useState<number | null>(null);
  const [isBackoffActive, setIsBackoffActive] = useState<boolean>(false);
  const [isAutoRetryPaused, setIsAutoRetryPaused] = useState<boolean>(false);
  const isAutoRetryPausedRef = useRef<boolean>(false);
  const backoffTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Free preview mode for VIP locked content so users can test streams
  const [previewMode, setPreviewMode] = useState<boolean>(false);
  const isLocked = item.isVipOnly && !isVip && !previewMode;

  // Build unified sources list with protocol metadata
  const sources: { name: string; url: string; referer?: string; quality?: string; protocol?: 'hls' | 'dash' }[] = React.useMemo(() => {
    if (type === 'channel') {
      return (item as Channel).sources.map((s, idx) => {
        const isDashUrl = s.url.includes('.mpd');
        return {
          name: `Servidor ${idx + 1} (${isDashUrl ? 'DASH' : 'HLS'} ${s.quality || '1080p'})`,
          url: s.url,
          referer: s.referer,
          quality: s.quality || '1080p',
          protocol: isDashUrl ? 'dash' : 'hls'
        };
      });
    }

    const vod = item as VodItem;
    if (vod.sources && vod.sources.length > 0) {
      return vod.sources.map(s => {
        const isDashUrl = s.url.includes('.mpd');
        return {
          name: s.name,
          url: s.url,
          quality: s.quality || '1080p',
          protocol: isDashUrl ? 'dash' : 'hls'
        };
      });
    }

    const list: { name: string; url: string; quality?: string; protocol?: 'hls' | 'dash' }[] = [
      { 
        name: 'Servidor 1 - Alta Velocidade (CDN)', 
        url: vod.streamUrl, 
        quality: '1080p', 
        protocol: vod.streamUrl.includes('.mpd') ? 'dash' : 'hls' 
      }
    ];
    if (vod.backupStreamUrl) {
      list.push({ 
        name: 'Servidor 2 - HLS M3U8 (Akamai)', 
        url: vod.backupStreamUrl, 
        quality: '1080p', 
        protocol: vod.backupStreamUrl.includes('.mpd') ? 'dash' : 'hls' 
      });
    }
    return list;
  }, [item, type]);

  const currentSource = sources[currentSourceIndex] || sources[0];

  // Resolve rawUrl adapting protocol when Compatibility Mode is toggled
  const rawUrl = React.useMemo(() => {
    const base = currentSource?.url || '';
    if (compatibilityProtocol === 'dash') {
      if (base.includes('.mpd')) return base;
      if (base.includes('index.m3u8')) return base.replace('index.m3u8', 'manifest.mpd');
      if (base.includes('.m3u8')) return base.replace('.m3u8', '.mpd');
      return base;
    } else {
      if (base.includes('manifest.mpd')) return base.replace('manifest.mpd', 'index.m3u8');
      if (base.includes('.mpd')) return base.replace('.mpd', '.m3u8');
      return base;
    }
  }, [currentSource, compatibilityProtocol]);

  // By default, IPTV channels, HTTP streams, and M3U8/MPD route through /api/proxy
  const needsProxy = React.useMemo(() => {
    return (
      type === 'channel' ||
      rawUrl.startsWith('http://') ||
      rawUrl.includes('satlabscloud.com.br') ||
      rawUrl.includes('reidoscanais') ||
      rawUrl.includes('hubby.cx') ||
      rawUrl.includes('tjtor8411') ||
      rawUrl.includes('.ts') ||
      rawUrl.includes('.mpd') ||
      (rawUrl.includes('.m3u8') && !rawUrl.includes('mux.dev'))
    );
  }, [type, rawUrl]);

  const [forceProxy, setForceProxy] = useState<boolean | null>(null);
  const usingProxy = forceProxy !== null ? forceProxy : needsProxy;

  const streamUrl = React.useMemo(() => {
    let base = usingProxy 
      ? `/api/proxy?url=${encodeURIComponent(rawUrl)}${currentSource?.referer ? `&referer=${encodeURIComponent(currentSource.referer)}` : ''}` 
      : rawUrl;
    if (reloadCounter > 0) {
      const sep = base.includes('?') ? '&' : '?';
      base += `${sep}_rt=${reloadCounter}`;
    }
    return base;
  }, [usingProxy, rawUrl, currentSource, reloadCounter]);

  // Toast feedback helper
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2400);
  }, []);

  /**
   * Função checkChannelHealth: valida o status HTTP do stream usando fetch com o método HEAD
   * antes mesmo de carregar o vídeo, para identificar links mortos instantaneamente.
   * Se a conexão exceder 3,5 segundos ou retornar status HTTP >= 400, indica instabilidade/erro.
   */
  const checkChannelHealth = useCallback(async (customUrl?: string): Promise<{ 
    online: boolean; 
    isUnstable: boolean; 
    latencyMs: number; 
    statusCode?: number; 
    isDead: boolean;
  }> => {
    const targetUrl = customUrl || rawUrl || streamUrl;
    if (!targetUrl || isLocked) return { online: false, isUnstable: false, latencyMs: 0, isDead: false };

    setIsCheckingHealth(true);
    const startTime = performance.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    try {
      // 1. Valida o status HTTP usando fetch com método HEAD via /api/check-stream
      const checkEndpoint = `/api/check-stream?url=${encodeURIComponent(targetUrl)}${currentSource?.referer ? `&referer=${encodeURIComponent(currentSource.referer)}` : ''}`;
      let res: Response | null = null;
      try {
        res = await fetch(checkEndpoint, {
          method: 'HEAD',
          signal: controller.signal,
          headers: { 'Cache-Control': 'no-cache' }
        });
      } catch (err: any) {
        // Fallback para fetch direto se proxy local não responder
        try {
          res = await fetch(targetUrl, {
            method: 'HEAD',
            signal: controller.signal,
            mode: 'no-cors'
          });
        } catch {
          throw err;
        }
      }

      clearTimeout(timeoutId);
      const latency = Math.round(performance.now() - startTime);
      const statusCode = res?.status;

      // Status HTTP >= 400 identifica link morto instantaneamente
      const isDead = statusCode !== undefined && statusCode >= 400;
      const isOnline = !isDead && (res?.ok || res?.type === 'opaque' || (statusCode !== undefined && statusCode < 400));
      const isUnstable = latency > 3500 || !isOnline;

      setConnectionLatency(latency);

      if (isDead) {
        console.warn(`[checkChannelHealth] Link morto identificado instantaneamente via HEAD (${statusCode}) em ${latency}ms`);
        setIsConnectionUnstable(true);
        setStreamWarning(`Link morto detectado via HTTP HEAD (${statusCode}). O servidor recusou a conexão.`);
        return { online: false, isUnstable: true, latencyMs: latency, statusCode, isDead: true };
      }

      if (isUnstable) {
        setIsConnectionUnstable(true);
        setStreamWarning(`Latência de resposta: ${latency}ms (acima de 3,5s). Conexão instável.`);
        return { online: isOnline, isUnstable: true, latencyMs: latency, statusCode, isDead: false };
      }

      setIsConnectionUnstable(false);
      setStreamWarning(null);
      return { online: true, isUnstable: false, latencyMs: latency, statusCode, isDead: false };
    } catch (err: any) {
      clearTimeout(timeoutId);
      const latency = Math.round(performance.now() - startTime);
      console.warn(`[checkChannelHealth] Falha ou timeout HEAD (${latency}ms):`, err);
      setIsConnectionUnstable(true);
      setConnectionLatency(latency >= 3500 ? latency : 3500);
      setStreamWarning('Sinal instável: tempo de resposta da conexão HEAD excedeu 3,5 segundos.');
      return { online: false, isUnstable: true, latencyMs: latency, isDead: true };
    } finally {
      setIsCheckingHealth(false);
    }
  }, [rawUrl, streamUrl, isLocked, currentSource]);

  // Botão Reportar Erro: registra o status do canal no log administrativo para verificação rápida da grade
  const handleReportError = async (customReason?: string) => {
    try {
      const channelName = 'name' in item ? item.name : item.title;
      const defaultReason = isTimedOut
        ? 'Timeout de 3,5s na inicialização do vídeo (evento canplay não disparou)'
        : isConnectionUnstable
          ? `Conexão Instável (latência de resposta ${connectionLatency > 0 ? `${connectionLatency}ms` : '> 3,5s'})`
          : 'Sinal não carrega ou link inativo';
      const reason = customReason || defaultReason;

      await reportChannelProblem({
        channelId: item.id,
        channelName,
        sourceUrl: rawUrl || streamUrl,
        reason,
        userEmail: currentUser?.email || 'assinante'
      });

      setHasReportedError(true);
      showToast('Erro registrado no log administrativo! Nossos técnicos foram alertados.');
    } catch (err) {
      showToast('Erro reportado ao sistema!');
    }
  };

  // Reportar canal como offline quando a conexão exceder 3,5 segundos
  const handleReportOffline = () => {
    handleReportError('Canal reportado como OFFLINE pelo usuário (Conexão excedeu 3,5s)');
  };

  // Manual on-demand health check
  const runManualHealthCheck = async () => {
    showToast('Executando diagnóstico de conexão do sinal (limite 3,5s)...');
    const res = await checkChannelHealth();
    if (res.online && !res.isUnstable) {
      showToast(`Canal Online e Estável! Latência: ${res.latencyMs}ms`);
    } else {
      showToast(`Conexão Instável (${res.latencyMs}ms). Tente forçar recarregamento ou alternar servidor.`);
    }
  };

  // Lógica de Backoff Exponencial para auto-reconexão após as 3 tentativas iniciais
  const startExponentialBackoff = useCallback(() => {
    if (isAutoRetryPausedRef.current) return;

    if (backoffTimerRef.current) {
      clearInterval(backoffTimerRef.current);
      backoffTimerRef.current = null;
    }

    // Calcula o intervalo de backoff exponencial com base nas tentativas além das 3 iniciais
    const attemptsBeyond3 = Math.max(1, connectionAttemptsRef.current - 3);
    // Escala progressiva: ~4s, ~7s, ~12s, ~20s, até o teto de 30s
    const delaySeconds = Math.min(30, Math.round(4 * Math.pow(1.65, attemptsBeyond3 - 1)));

    setBackoffSecondsLeft(delaySeconds);
    setIsBackoffActive(true);

    let remaining = delaySeconds;
    backoffTimerRef.current = setInterval(() => {
      remaining -= 1;
      setBackoffSecondsLeft(remaining);

      if (remaining <= 0) {
        if (backoffTimerRef.current) {
          clearInterval(backoffTimerRef.current);
          backoffTimerRef.current = null;
        }
        setIsBackoffActive(false);
        setBackoffSecondsLeft(null);

        if (!isAutoRetryPausedRef.current) {
          // Dispara nova tentativa automática com espaçamento exponencial
          connectionAttemptsRef.current += 1;
          setConnectionAttempts(connectionAttemptsRef.current);
          setReloadCounter(c => c + 1);
        }
      }
    }, 1000);
  }, []);

  const handleForceReload = () => {
    autoRetryCountRef.current = 0;
    setAutoRetryCount(0);
    if (backoffTimerRef.current) {
      clearInterval(backoffTimerRef.current);
      backoffTimerRef.current = null;
    }
    setBackoffSecondsLeft(null);
    setIsBackoffActive(false);

    connectionAttemptsRef.current += 1;
    setConnectionAttempts(connectionAttemptsRef.current);

    if (canPlayTimeoutRef.current) {
      clearTimeout(canPlayTimeoutRef.current);
      canPlayTimeoutRef.current = null;
    }
    hasCanPlayFiredRef.current = false;
    setIsTimedOut(false);
    setHasError(false);
    setErrorMessage('');
    setIsLoading(true);
    setStreamWarning(null);
    setIsConnectionUnstable(false);
    setHasReportedError(false);
    setReloadCounter(prev => prev + 1);
    showToast('Reinicializando player e tentando nova conexão...');
  };

  const toggleAutoRetryPause = () => {
    if (isAutoRetryPaused) {
      isAutoRetryPausedRef.current = false;
      setIsAutoRetryPaused(false);
      showToast('Reconexão automática retomada');
      startExponentialBackoff();
    } else {
      isAutoRetryPausedRef.current = true;
      setIsAutoRetryPaused(true);
      if (backoffTimerRef.current) {
        clearInterval(backoffTimerRef.current);
        backoffTimerRef.current = null;
      }
      setBackoffSecondsLeft(null);
      setIsBackoffActive(false);
      showToast('Reconexão automática pausada');
    }
  };

  // Alternar Modo de Compatibilidade (HLS vs DASH) oferecendo tentativa final de recuperação
  const handleToggleCompatibilityMode = () => {
    const nextProtocol: 'hls' | 'dash' = compatibilityProtocol === 'hls' ? 'dash' : 'hls';
    setCompatibilityProtocol(nextProtocol);

    // Se o player suportar múltiplas fontes, tenta trocar para a fonte do protocolo correspondente ou rotaciona
    if (sources.length > 1) {
      const matchIdx = sources.findIndex(s => 
        nextProtocol === 'dash' 
          ? (s.url.includes('.mpd') || s.protocol === 'dash' || s.name.toLowerCase().includes('dash'))
          : (s.url.includes('.m3u8') || s.protocol === 'hls' || s.name.toLowerCase().includes('hls'))
      );
      if (matchIdx !== -1 && matchIdx !== currentSourceIndex) {
        setCurrentSourceIndex(matchIdx);
      } else {
        // Rotaciona para o próximo servidor disponível
        setCurrentSourceIndex(prev => (prev + 1) % sources.length);
      }
    }

    // Limpa backoff e reseta erros
    if (backoffTimerRef.current) {
      clearInterval(backoffTimerRef.current);
      backoffTimerRef.current = null;
    }
    setBackoffSecondsLeft(null);
    setIsBackoffActive(false);
    autoRetryCountRef.current = 0;
    setAutoRetryCount(0);
    connectionAttemptsRef.current += 1;
    setConnectionAttempts(connectionAttemptsRef.current);

    if (canPlayTimeoutRef.current) {
      clearTimeout(canPlayTimeoutRef.current);
      canPlayTimeoutRef.current = null;
    }
    hasCanPlayFiredRef.current = false;
    setIsTimedOut(false);
    setHasError(false);
    setErrorMessage('');
    setIsLoading(true);
    setStreamWarning(null);
    setIsConnectionUnstable(false);
    setHasReportedError(false);
    setReloadCounter(c => c + 1);

    showToast(`Modo de Compatibilidade ativado: alternando para protocolo ${nextProtocol === 'dash' ? 'DASH (MPEG-DASH)' : 'HLS (HTTP Live Streaming)'}...`);
  };

  // Reset auto-retry counters, backoff timer and errors on channel/item change
  useEffect(() => {
    autoRetryCountRef.current = 0;
    setAutoRetryCount(0);
    connectionAttemptsRef.current = 1;
    setConnectionAttempts(1);
    setCompatibilityProtocol('hls');
    if (backoffTimerRef.current) {
      clearInterval(backoffTimerRef.current);
      backoffTimerRef.current = null;
    }
    setBackoffSecondsLeft(null);
    setIsBackoffActive(false);
    setIsAutoRetryPaused(false);
    setHasReportedError(false);
    setIsConnectionUnstable(false);
    setHasError(false);
    setIsTimedOut(false);
    setErrorMessage('');
  }, [item.id]);

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying && !isLocked && !activeMenu) {
        setShowControls(false);
      }
    }, 3500);
  }, [isPlaying, isLocked, activeMenu]);

  // Main video loader with pre-flight HEAD check & 3.5s timeout with up to 3 automatic retries
  useEffect(() => {
    if (isLocked) {
      setIsLoading(false);
      return;
    }

    const video = videoRef.current;
    if (!video || !rawUrl) return;

    let isCancelled = false;

    // Reset errors and loading
    setHasError(false);
    setErrorMessage('');
    setIsLoading(true);
    setQualities([]);
    setIsTimedOut(false);
    hasCanPlayFiredRef.current = false;

    // Clear previous timeout
    if (canPlayTimeoutRef.current) {
      clearTimeout(canPlayTimeoutRef.current);
      canPlayTimeoutRef.current = null;
    }

    // Destroy existing Hls/mpegts instances
    if (hlsRef.current) {
      try { hlsRef.current.destroy(); } catch (e) {}
      hlsRef.current = null;
    }
    if (mpegtsRef.current) {
      try { mpegtsRef.current.destroy(); } catch (e) {}
      mpegtsRef.current = null;
    }

    const loadStream = async () => {
      // 1. Valida o status HTTP do stream usando fetch com método HEAD antes mesmo de carregar o vídeo
      const health = await checkChannelHealth(rawUrl);

      if (isCancelled) return;

      // Se identificar link morto instantaneamente
      if (health.isDead) {
        console.warn(`[LivePlayer] Link morto identificado antes do carregamento do vídeo.`);

        // Se ainda não esgotou as 3 tentativas automáticas
        if (autoRetryCountRef.current < 3) {
          const nextAttempt = autoRetryCountRef.current + 1;
          autoRetryCountRef.current = nextAttempt;
          setAutoRetryCount(nextAttempt);
          connectionAttemptsRef.current += 1;
          setConnectionAttempts(connectionAttemptsRef.current);
          setIsConnectionUnstable(true);
          setIsLoading(true);
          setStreamWarning(`Link inativo identificado (HTTP HEAD). Tentando reconexão automática (${nextAttempt}/3)...`);

          if (!usingProxy && nextAttempt === 2) {
            setForceProxy(true);
          }

          setTimeout(() => {
            if (!isCancelled) {
              setReloadCounter(c => c + 1);
            }
          }, 600);
          return;
        } else {
          // Esgotou as 3 tentativas automáticas iniciais - inicia backoff exponencial
          setIsLoading(false);
          setIsPlaying(false);
          setHasError(true);
          setIsTimedOut(true);
          setIsConnectionUnstable(true);
          setErrorMessage(`Link morto identificado instantaneamente via HTTP HEAD (${health.statusCode ? `Código HTTP ${health.statusCode}` : 'Servidor Inacessível'}) após 3 tentativas.`);
          startExponentialBackoff();
          return;
        }
      }

      // Se sinal respondeu ou não for link morto, inicia timeout assíncrono rigoroso de 3,5 segundos
      canPlayTimeoutRef.current = setTimeout(() => {
        if (!hasCanPlayFiredRef.current && !isCancelled) {
          console.warn(`[LivePlayer] Timeout de 3,5s: evento canplay não disparou dentro do limite (tentativa ${autoRetryCountRef.current + 1}/3)`);

          // Interromper a tentativa imediatamente
          if (hlsRef.current) {
            try {
              hlsRef.current.stopLoad();
              hlsRef.current.destroy();
              hlsRef.current = null;
            } catch (e) {}
          }
          if (mpegtsRef.current) {
            try {
              mpegtsRef.current.unload();
              mpegtsRef.current.detachMediaElement();
              mpegtsRef.current.destroy();
              mpegtsRef.current = null;
            } catch (e) {}
          }
          if (video) {
            try {
              video.pause();
              video.removeAttribute('src');
              video.load();
            } catch (e) {}
          }

          if (autoRetryCountRef.current < 3) {
            // Tenta automaticamente recarregar o stream do canal até 3 vezes!
            const nextAttempt = autoRetryCountRef.current + 1;
            autoRetryCountRef.current = nextAttempt;
            setAutoRetryCount(nextAttempt);
            connectionAttemptsRef.current += 1;
            setConnectionAttempts(connectionAttemptsRef.current);
            setIsConnectionUnstable(true);
            setIsLoading(true);
            setStreamWarning(`Tempo limite de 3,5s excedido. Tentando recarregar automaticamente (${nextAttempt}/3)...`);

            if (!usingProxy && nextAttempt === 2) {
              setForceProxy(true);
            }

            setReloadCounter(c => c + 1);
          } else {
            // Esgotou as 3 tentativas automáticas: exibe a mensagem definitiva de erro, botão 'Reportar Erro' e inicia backoff exponencial
            setIsLoading(false);
            setIsPlaying(false);
            setHasError(true);
            setIsTimedOut(true);
            setIsConnectionUnstable(true);
            setErrorMessage(
              'A inicialização da transmissão excedeu o limite de 3,5 segundos após 3 tentativas automáticas consecutivas. O canal pode estar offline ou o servidor congestionado.'
            );
            startExponentialBackoff();
          }
        }
      }, 3500);

      // Proceder com a montagem do player Dash / Hls / Ts / Nativo
      const isDash = compatibilityProtocol === 'dash' || streamUrl.includes('.mpd') || rawUrl.includes('.mpd');
      const isHls = !isDash && (streamUrl.includes('.m3u8') || rawUrl.includes('.m3u8') || compatibilityProtocol === 'hls');
      const isTs = !isDash && !isHls && (streamUrl.includes('.ts') || rawUrl.includes('.ts')) && !streamUrl.includes('.mp4');

      if (isDash) {
        try {
          const dashPlayer = dashjs.MediaPlayer().create();
          dashPlayerRef.current = dashPlayer;
          dashPlayer.initialize(video, streamUrl, true);

          dashPlayer.on(dashjs.MediaPlayer.events.STREAM_INITIALIZED, () => {
            setIsLoading(false);
            setHasError(false);
            setIsConnectionUnstable(false);
          });

          dashPlayer.on(dashjs.MediaPlayer.events.CAN_PLAY, () => {
            hasCanPlayFiredRef.current = true;
            if (canPlayTimeoutRef.current) {
              clearTimeout(canPlayTimeoutRef.current);
              canPlayTimeoutRef.current = null;
            }
            if (backoffTimerRef.current) {
              clearInterval(backoffTimerRef.current);
              backoffTimerRef.current = null;
            }
            setIsBackoffActive(false);
            setBackoffSecondsLeft(null);
            autoRetryCountRef.current = 0;
            setAutoRetryCount(0);
            setIsLoading(false);
            setHasError(false);
            setIsTimedOut(false);
            setStreamWarning(null);
            setIsConnectionUnstable(false);
          });

          dashPlayer.on(dashjs.MediaPlayer.events.ERROR, (e: any) => {
            console.warn('Dash.js error:', e);
            if (!usingProxy) {
              setForceProxy(true);
            } else if (autoRetryCountRef.current < 3) {
              const nextAttempt = autoRetryCountRef.current + 1;
              autoRetryCountRef.current = nextAttempt;
              setAutoRetryCount(nextAttempt);
              connectionAttemptsRef.current += 1;
              setConnectionAttempts(connectionAttemptsRef.current);
              setIsConnectionUnstable(true);
              setReloadCounter(c => c + 1);
            } else if (sources.length > 1 && currentSourceIndex < sources.length - 1) {
              setCurrentSourceIndex(prev => prev + 1);
            } else {
              setHasError(true);
              setErrorMessage('Falha ao decodificar a transmissão via protocolo DASH. Tente alternar o Modo de Compatibilidade para HLS ou trocar de servidor.');
              setIsLoading(false);
              setIsConnectionUnstable(true);
              startExponentialBackoff();
            }
          });
        } catch (err) {
          console.warn('Dashjs initialization failed:', err);
          video.src = streamUrl;
          video.play().catch(() => setIsPlaying(false));
        }
      } else if (isHls && Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          // Desativar lowLatencyMode agressivo para transmissões IPTV. Evita que o player
          // acelere a reprodução e esgote o buffer a cada 5 segundos.
          lowLatencyMode: false,
          backBufferLength: 60,
          maxBufferLength: 60,
          maxMaxBufferLength: 120,
          maxBufferSize: 90 * 1000 * 1000,
          // Mantém uma margem confortável de 5 segmentos (~15s) para absorver flutuações de rede sem travar
          liveSyncDurationCount: 5,
          liveMaxLatencyDurationCount: 12,
          // Pré-carrega o próximo fragmento antes do atual terminar, eliminando micro-pausas entre chunks
          startFragPrefetch: true,
          progressive: true,
          highBufferWatchdogPeriod: 2,
          nudgeOffset: 0.2,
          nudgeMaxRetry: 10,
          manifestLoadingTimeOut: 15000,
          manifestLoadingMaxRetry: 4,
          fragLoadingTimeOut: 20000,
          fragLoadingMaxRetry: 5,
          levelLoadingTimeOut: 15000,
        });

        hlsRef.current = hls;
        hls.loadSource(streamUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
          setIsLoading(false);
          
          // Extract available quality levels
          if (hls.levels && hls.levels.length > 0) {
            const detectedQualities: QualityOption[] = [
              { index: -1, label: 'Automática (Auto)' }
            ];
            hls.levels.forEach((lvl, idx) => {
              const height = lvl.height;
              const label = height ? `${height}p` : lvl.bitrate ? `${Math.round(lvl.bitrate / 1000)}k` : `Opção ${idx + 1}`;
              detectedQualities.push({
                index: idx,
                label,
                bitrate: lvl.bitrate
              });
            });
            setQualities(detectedQualities);
          }

          video.play().catch(() => {
            setIsPlaying(false);
          });
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
          const currentLevel = hls.levels[data.level];
          if (currentLevel) {
            console.log(`HLS switched to level: ${currentLevel.height}p`);
          }
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
          // Recuperação inteligente de micro-travamentos de buffer (Buffer Stalled)
          if (!data.fatal && data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) {
            console.log('HLS buffer stalled momentarily, nudging video smoothly...');
            if (video && !video.paused && video.readyState >= 2) {
              video.currentTime += 0.15;
            }
            return;
          }

          console.warn('HLS.js event error:', data);
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                if (!usingProxy) {
                  console.log('Network error on direct stream. Switching to internal proxy...');
                  setForceProxy(true);
                } else if (autoRetryCountRef.current < 3) {
                  const nextAttempt = autoRetryCountRef.current + 1;
                  autoRetryCountRef.current = nextAttempt;
                  setAutoRetryCount(nextAttempt);
                  connectionAttemptsRef.current += 1;
                  setConnectionAttempts(connectionAttemptsRef.current);
                  setIsConnectionUnstable(true);
                  setReloadCounter(c => c + 1);
                } else if (currentSourceIndex < sources.length - 1) {
                  console.log('Switching to next source in catalog...');
                  setCurrentSourceIndex(prev => prev + 1);
                } else {
                  setHasError(true);
                  setErrorMessage('Falha na conexão de rede com a transmissão após 3 tentativas automáticas.');
                  setIsLoading(false);
                  setIsConnectionUnstable(true);
                  startExponentialBackoff();
                }
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.log('HLS Media error encountered, attempting recovery...');
                hls.recoverMediaError();
                break;
              default:
                hls.destroy();
                if (autoRetryCountRef.current < 3) {
                  const nextAttempt = autoRetryCountRef.current + 1;
                  autoRetryCountRef.current = nextAttempt;
                  setAutoRetryCount(nextAttempt);
                  connectionAttemptsRef.current += 1;
                  setConnectionAttempts(connectionAttemptsRef.current);
                  setIsConnectionUnstable(true);
                  setReloadCounter(c => c + 1);
                } else if (currentSourceIndex < sources.length - 1) {
                  setCurrentSourceIndex(prev => prev + 1);
                } else {
                  setHasError(true);
                  setErrorMessage('O formato desta transmissão não pôde ser decodificado após 3 tentativas.');
                  setIsLoading(false);
                  setIsConnectionUnstable(true);
                  startExponentialBackoff();
                }
                break;
            }
          }
        });
      } else if (isTs && typeof window !== 'undefined' && mpegts.isSupported()) {
        try {
          const player = mpegts.createPlayer({
            type: 'mse',
            isLive: type === 'channel',
            url: streamUrl,
          }, {
            enableWorker: true,
            lazyLoad: false,
            lazyLoadMaxDuration: 60,
            seekType: 'range',
            liveBufferLatencyChasing: false,
            liveBufferLatencyMaxLatency: 20,
            liveBufferLatencyMinRemain: 5,
            autoCleanupSourceBuffer: true,
            autoCleanupMaxBackwardDuration: 60,
            autoCleanupMinBackwardDuration: 30,
          });

          mpegtsRef.current = player;
          player.attachMediaElement(video);
          player.load();
          const playPromise = player.play();
          if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => {
              setIsPlaying(false);
            });
          }

          player.on(mpegts.Events.ERROR, (errorType: any, errorDetail: any) => {
            console.warn('mpegts error:', errorType, errorDetail);
            if (!usingProxy) {
              setForceProxy(true);
            } else if (autoRetryCountRef.current < 3) {
              const nextAttempt = autoRetryCountRef.current + 1;
              autoRetryCountRef.current = nextAttempt;
              setAutoRetryCount(nextAttempt);
              connectionAttemptsRef.current += 1;
              setConnectionAttempts(connectionAttemptsRef.current);
              setIsConnectionUnstable(true);
              setReloadCounter(c => c + 1);
            } else if (currentSourceIndex < sources.length - 1) {
              setCurrentSourceIndex(prev => prev + 1);
            } else {
              setHasError(true);
              setErrorMessage('Transmissão ao vivo instável ou sinal fora do ar após 3 tentativas.');
              setIsLoading(false);
              setIsConnectionUnstable(true);
              startExponentialBackoff();
            }
          });
        } catch (err) {
          console.warn('mpegts init failed, falling back to direct video tag:', err);
          video.src = streamUrl;
          video.play().catch(() => setIsPlaying(false));
        }
      } else if (video.canPlayType('application/vnd.apple.mpegurl') && isHls) {
        video.src = streamUrl;
        video.play().catch(() => setIsPlaying(false));
      } else {
        video.src = streamUrl;
        video.play().then(() => {
          setIsPlaying(true);
          setIsLoading(false);
        }).catch((err) => {
          console.warn('Direct video play error:', err);
          if (!usingProxy && rawUrl.startsWith('http://')) {
            setForceProxy(true);
          } else if (autoRetryCountRef.current < 3) {
            const nextAttempt = autoRetryCountRef.current + 1;
            autoRetryCountRef.current = nextAttempt;
            setAutoRetryCount(nextAttempt);
            connectionAttemptsRef.current += 1;
            setConnectionAttempts(connectionAttemptsRef.current);
            setIsConnectionUnstable(true);
            setReloadCounter(c => c + 1);
          } else {
            setIsPlaying(false);
            setHasError(true);
            startExponentialBackoff();
          }
        });
      }
    };

    loadStream();

    return () => {
      isCancelled = true;
      if (canPlayTimeoutRef.current) {
        clearTimeout(canPlayTimeoutRef.current);
        canPlayTimeoutRef.current = null;
      }
      if (hlsRef.current) {
        try { hlsRef.current.destroy(); } catch (e) {}
        hlsRef.current = null;
      }
      if (mpegtsRef.current) {
        try { mpegtsRef.current.destroy(); } catch (e) {}
        mpegtsRef.current = null;
      }
      if (dashPlayerRef.current) {
        try {
          dashPlayerRef.current.reset();
          dashPlayerRef.current.destroy();
        } catch (e) {}
        dashPlayerRef.current = null;
      }
    };
  }, [streamUrl, rawUrl, isLocked, usingProxy, currentSourceIndex, type, sources.length, reloadCounter, checkChannelHealth, startExponentialBackoff, compatibilityProtocol]);

  // Fullscreen change listener
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  // PiP change listener
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onEnterPiP = () => setIsPiP(true);
    const onLeavePiP = () => setIsPiP(false);
    v.addEventListener('enterpictureinpicture', onEnterPiP);
    v.addEventListener('leavepictureinpicture', onLeavePiP);
    return () => {
      v.removeEventListener('enterpictureinpicture', onEnterPiP);
      v.removeEventListener('leavepictureinpicture', onLeavePiP);
    };
  }, []);

  // Video event handlers
  const handleVideoError = () => {
    console.warn('HTML5 Video Error encountered on streamUrl:', streamUrl);
    if (!usingProxy) {
      console.log('Retrying via server proxy...');
      setForceProxy(true);
    } else if (autoRetryCountRef.current < 3) {
      const nextAttempt = autoRetryCountRef.current + 1;
      autoRetryCountRef.current = nextAttempt;
      setAutoRetryCount(nextAttempt);
      setIsConnectionUnstable(true);
      setReloadCounter(c => c + 1);
    } else if (currentSourceIndex < sources.length - 1) {
      console.log('Switching to next source index...');
      setCurrentSourceIndex(prev => prev + 1);
    } else {
      setHasError(true);
      setErrorMessage('Não foi possível reproduzir esta transmissão após 3 tentativas automáticas.');
      setIsLoading(false);
      setIsConnectionUnstable(true);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const time = videoRef.current.currentTime;
      setCurrentTime(time);
      // Update buffer progress
      const video = videoRef.current;
      if (video.buffered.length > 0 && duration > 0) {
        try {
          const end = video.buffered.end(video.buffered.length - 1);
          setBufferedEnd((end / duration) * 100);
        } catch {
          // Ignore transient buffer query errors
        }
      }

      // Automatically save watch progress for VOD every 4 seconds
      if (type === 'vod' && time > 5) {
        if (Math.abs(time - lastSavedProgressTimeRef.current) >= 4) {
          lastSavedProgressTimeRef.current = time;
          watchProgressStorage.saveProgress(
            item as VodItem,
            time,
            video.duration || duration,
            currentUser?.email,
            authToken
          );
        }
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration || 0;
      setDuration(dur);
      setIsLoading(false);
      setHasError(false);
      if (playbackRate !== 1) {
        videoRef.current.playbackRate = playbackRate;
      }

      // Check initial seek or saved progress
      if (!hasAppliedInitialSeekRef.current && type === 'vod') {
        hasAppliedInitialSeekRef.current = true;
        if (initialSeekTime && initialSeekTime > 5 && (dur === 0 || initialSeekTime < dur * 0.95)) {
          videoRef.current.currentTime = initialSeekTime;
          setCurrentTime(initialSeekTime);
          showToast(`Retomado de ${formatTime(initialSeekTime)}`);
        } else {
          // Check saved progress from storage
          const saved = watchProgressStorage.getItemProgress(item.id, currentUser?.email);
          if (saved && saved.currentTime > 10 && saved.percent < 95) {
            setResumePrompt({
              time: saved.currentTime,
              formatted: formatTime(saved.currentTime)
            });
          }
        }
      }
    }
  };

  // Save progress on close or unmount
  const flushProgress = useCallback(() => {
    if (videoRef.current && type === 'vod') {
      const time = videoRef.current.currentTime;
      const dur = videoRef.current.duration || duration;
      if (time > 5) {
        watchProgressStorage.saveProgress(
          item as VodItem,
          time,
          dur,
          currentUser?.email,
          authToken
        );
      }
    }
  }, [type, item, duration, currentUser?.email, authToken]);

  useEffect(() => {
    return () => {
      flushProgress();
    };
  }, [flushProgress]);

  const handleClose = () => {
    flushProgress();
    onClose();
  };

  const toggleFavorite = () => {
    const res = favoritesStorage.toggleFavorite(item, type, currentUser?.email, authToken);
    setIsFav(res.isFav);
    showToast(res.isFav ? 'Adicionado aos Favoritos' : 'Removido dos Favoritos');
  };

  // Player action controls
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setIsPlaying(true);
      setSplashAction('play');
      showToast('Reproduzindo');
    } else {
      v.pause();
      setIsPlaying(false);
      setSplashAction('pause');
      showToast('Pausado');
    }
    setTimeout(() => setSplashAction(null), 600);
  }, [showToast]);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.muted || volume === 0) {
      const restored = lastNonZeroVolume > 0 ? lastNonZeroVolume : 0.8;
      v.muted = false;
      v.volume = restored;
      setVolume(restored);
      setIsMuted(false);
      showToast(`Volume: ${Math.round(restored * 100)}%`);
    } else {
      setLastNonZeroVolume(volume);
      v.muted = true;
      setIsMuted(true);
      showToast('Áudio silenciado (Mudo)');
    }
  }, [volume, lastNonZeroVolume, showToast]);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (val > 0) setLastNonZeroVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const adjustVolumeBy = useCallback((delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    const newVol = Math.max(0, Math.min(1, volume + delta));
    setVolume(newVol);
    if (newVol > 0) setLastNonZeroVolume(newVol);
    v.volume = newVol;
    v.muted = newVol === 0;
    setIsMuted(newVol === 0);
    showToast(`Volume: ${Math.round(newVol * 100)}%`);
  }, [volume, showToast]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const skipSeconds = useCallback((seconds: number) => {
    if (videoRef.current) {
      const current = videoRef.current.currentTime;
      const target = Math.max(0, Math.min(duration || 99999, current + seconds));
      videoRef.current.currentTime = target;
      setSplashAction(seconds > 0 ? 'forward' : 'rewind');
      showToast(`${seconds > 0 ? '+' : ''}${seconds}s`);
      setTimeout(() => setSplashAction(null), 600);
    }
  }, [duration, showToast]);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(console.error);
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(console.error);
      setIsFullscreen(false);
    }
  }, []);

  const togglePiP = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPiP(false);
        showToast('Mini-player fechado');
      } else if (document.pictureInPictureEnabled) {
        await video.requestPictureInPicture();
        setIsPiP(true);
        showToast('Mini-player (PiP) ativado');
      }
    } catch (err) {
      console.warn('PiP error:', err);
      showToast('Picture-in-Picture não suportado neste navegador.');
    }
  }, [showToast]);

  const changeSpeed = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
    showToast(`Velocidade: ${rate}x`);
    setActiveMenu(null);
  };

  const changeQuality = (index: number) => {
    setCurrentQuality(index);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = index;
    }
    const label = index === -1 ? 'Automática (Auto)' : qualities.find(q => q.index === index)?.label || 'Manual';
    showToast(`Qualidade: ${label}`);
    setActiveMenu(null);
  };

  const toggleAspectRatio = () => {
    const next: AspectRatioMode = 
      aspectRatio === 'contain' ? 'cover' : 
      aspectRatio === 'cover' ? 'fill' : 'contain';
    setAspectRatio(next);
    const label = next === 'contain' ? 'Ajustar à Tela (Contain)' : next === 'cover' ? 'Preencher (Zoom Sem Barras)' : 'Esticar (Fill 16:9)';
    showToast(label);
  };

  // Screenshot capture tool
  const captureScreenshot = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
        const a = document.createElement('a');
        const cleanName = ('title' in item ? item.title : item.name).replace(/[^a-zA-Z0-9]/g, '_');
        a.download = `captura_${cleanName}_${Date.now()}.jpg`;
        a.href = dataUrl;
        a.click();
        showToast('Captura de tela salva com sucesso!');
      }
    } catch (err) {
      console.warn('Screenshot capture CORS notice:', err);
      showToast('Não foi possível capturar a tela devido a restrições de CORS da fonte.');
    }
  }, [item, showToast]);

  // Next source switcher
  const tryNextSource = () => {
    if (currentSourceIndex < sources.length - 1) {
      setCurrentSourceIndex(prev => prev + 1);
    } else {
      setCurrentSourceIndex(0);
      setForceProxy(prev => !prev);
    }
    setHasError(false);
    setIsLoading(true);
    setStreamWarning(null);
  };

  // Keyboard shortcuts listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          resetControlsTimer();
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          resetControlsTimer();
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          resetControlsTimer();
          break;
        case 'p':
          e.preventDefault();
          togglePiP();
          resetControlsTimer();
          break;
        case 'c':
          e.preventDefault();
          captureScreenshot();
          resetControlsTimer();
          break;
        case 'arrowup':
          e.preventDefault();
          adjustVolumeBy(0.1);
          resetControlsTimer();
          break;
        case 'arrowdown':
          e.preventDefault();
          adjustVolumeBy(-0.1);
          resetControlsTimer();
          break;
        case 'arrowleft':
          e.preventDefault();
          if (type === 'vod') skipSeconds(-10);
          resetControlsTimer();
          break;
        case 'arrowright':
          e.preventDefault();
          if (type === 'vod') skipSeconds(10);
          resetControlsTimer();
          break;
        case 'escape':
          if (activeMenu) {
            setActiveMenu(null);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, toggleMute, toggleFullscreen, togglePiP, captureScreenshot, adjustVolumeBy, skipSeconds, type, activeMenu, resetControlsTimer]);

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs)) return '00:00';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) {
      return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const getAspectClass = () => {
    switch (aspectRatio) {
      case 'cover': return 'object-cover';
      case 'fill': return 'object-fill';
      case 'contain':
      default: return 'object-contain';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-xl flex flex-col items-center justify-center p-2 sm:p-6 animate-fadeIn">
      {/* Container */}
      <div 
        id="player-container"
        ref={containerRef}
        onMouseMove={resetControlsTimer}
        onMouseEnter={resetControlsTimer}
        className="relative w-full max-w-6xl aspect-video bg-black rounded-3xl overflow-hidden border border-white/10 shadow-2xl flex items-center justify-center group select-none"
      >
        {/* VIP Lock Screen */}
        {isLocked ? (
          <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-6 text-center z-20">
            <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/30 mb-4 animate-bounce text-white">
              <Crown className="w-7 h-7" />
            </div>
            <span className="text-xs uppercase font-semibold tracking-wider text-indigo-400 mb-1">
              Exclusivo para Assinantes VIP
            </span>
            <h3 className="text-2xl sm:text-3xl font-bold text-white mb-2 tracking-tight">
              {'title' in item ? item.title : item.name}
            </h3>
            <p className="text-sm text-slate-400 max-w-md mb-6 font-normal">
              Este conteúdo faz parte do catálogo VIP MAXTV. Você pode assinar via PIX com liberação instantânea ou assistir uma amostra grátis para testar o sinal agora mesmo!
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={onOpenCheckout}
                className="flex items-center gap-2 px-6 py-3 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm shadow-lg shadow-indigo-600/25 active:scale-95 transition-all cursor-pointer"
              >
                <Crown className="w-4 h-4" />
                <span>Assinar VIP por R$ 19,90 com PIX</span>
              </button>

              <button
                type="button"
                onClick={() => setPreviewMode(true)}
                className="flex items-center gap-2 px-5 py-3 rounded-full bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-sm font-semibold border border-emerald-500/40 transition-all cursor-pointer"
              >
                <Play className="w-4 h-4 fill-emerald-400 text-emerald-400" />
                <span>Degustação Grátis (Assistir Amostra)</span>
              </button>

              {!currentUser && onOpenAuth && (
                <button
                  type="button"
                  onClick={onOpenAuth}
                  className="flex items-center gap-2 px-5 py-3 rounded-full bg-indigo-950 hover:bg-indigo-900 text-indigo-300 text-sm font-semibold border border-indigo-500/30 transition-colors cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Já é assinante? Entrar na Conta</span>
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="px-5 py-3 rounded-full bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold border border-white/10 transition-colors cursor-pointer"
              >
                Voltar
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Ambient Background Glow Layer with Smooth Visual Blur Transition */}
            {('logo' in item && item.logo) || ('posterUrl' in item && item.posterUrl) ? (
              <div 
                className={`absolute inset-0 pointer-events-none transition-all duration-700 ease-out overflow-hidden ${
                  hasError 
                    ? 'opacity-40 filter blur-3xl scale-110' 
                    : 'opacity-0 filter blur-none scale-100'
                }`}
              >
                <img 
                  src={'posterUrl' in item ? item.posterUrl : ('bannerUrl' in item ? item.bannerUrl : item.logo)} 
                  alt="" 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer" 
                />
              </div>
            ) : null}

            {/* HTML5 Video Element with Visual Blur Transition when Error Persists */}
            <video
              ref={videoRef}
              playsInline
              className={`w-full h-full cursor-pointer bg-black ${getAspectClass()} transition-all duration-700 ease-out ${
                hasError 
                  ? 'filter blur-xl brightness-[0.25] scale-[1.03] pointer-events-none' 
                  : 'filter-none brightness-100 scale-100'
              }`}
              onClick={togglePlay}
              onDoubleClick={toggleFullscreen}
              onEnded={() => setIsPlaying(false)}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onWaiting={() => setIsLoading(true)}
              onPlaying={() => { 
                hasCanPlayFiredRef.current = true;
                if (canPlayTimeoutRef.current) {
                  clearTimeout(canPlayTimeoutRef.current);
                  canPlayTimeoutRef.current = null;
                }
                if (backoffTimerRef.current) {
                  clearInterval(backoffTimerRef.current);
                  backoffTimerRef.current = null;
                }
                setIsBackoffActive(false);
                setBackoffSecondsLeft(null);
                autoRetryCountRef.current = 0;
                setAutoRetryCount(0);
                setIsLoading(false); 
                setHasError(false); 
                setIsTimedOut(false);
                setStreamWarning(null); 
                setIsConnectionUnstable(false);
              }}
              onCanPlay={() => {
                hasCanPlayFiredRef.current = true;
                if (canPlayTimeoutRef.current) {
                  clearTimeout(canPlayTimeoutRef.current);
                  canPlayTimeoutRef.current = null;
                }
                if (backoffTimerRef.current) {
                  clearInterval(backoffTimerRef.current);
                  backoffTimerRef.current = null;
                }
                setIsBackoffActive(false);
                setBackoffSecondsLeft(null);
                autoRetryCountRef.current = 0;
                setAutoRetryCount(0);
                setIsLoading(false);
                setHasError(false);
                setIsTimedOut(false);
                setStreamWarning(null);
                setIsConnectionUnstable(false);
              }}
              onError={handleVideoError}
            />

            {/* Central Play/Pause/Skip Ripple Splash Animation */}
            {splashAction && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-25">
                <div className="w-20 h-20 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center text-white animate-ping">
                  {splashAction === 'play' && <Play className="w-8 h-8 fill-white" />}
                  {splashAction === 'pause' && <Pause className="w-8 h-8" />}
                  {splashAction === 'forward' && <FastForward className="w-8 h-8" />}
                  {splashAction === 'rewind' && <Rewind className="w-8 h-8" />}
                </div>
              </div>
            )}

            {/* Quick Feedback Toast (Top Center) */}
            {toastMessage && (
              <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 bg-slate-900/90 text-white text-xs font-semibold px-4 py-2 rounded-full border border-white/15 shadow-xl backdrop-blur-md transition-all animate-fadeIn">
                {toastMessage}
              </div>
            )}

            {/* Overlay Estilizado de Conexão Instável com Animação de Fade-In e Botão 'Tentar Novamente' Centralizado em Destaque */}
            {isConnectionUnstable && !hasError && (
              <div 
                id="unstable-connection-overlay"
                className="absolute inset-0 z-35 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-fadeIn select-none"
              >
                {/* Ícone de Alerta em Destaque */}
                <div className="relative mb-3.5">
                  <div className="absolute -inset-3 bg-amber-500/25 rounded-full blur-xl animate-pulse" />
                  <div className="relative w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-amber-400 shadow-xl shadow-amber-500/20">
                    <AlertTriangle className="w-8 h-8 animate-bounce" />
                  </div>
                </div>

                {/* Título e Badge de Latência */}
                <div className="flex items-center gap-2 mb-1.5">
                  <h4 className="text-xl font-bold text-white tracking-tight">
                    Conexão Instável
                  </h4>
                  <span className="text-[11px] font-mono font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    {connectionLatency > 0 ? `${connectionLatency}ms (> 3,5s)` : '> 3,5s'}
                  </span>
                </div>

                {/* Mensagem Explicativa */}
                <p className="text-xs sm:text-sm text-slate-300 max-w-md mb-3 leading-relaxed">
                  {streamWarning || 'A resposta do sinal demorou mais de 3,5 segundos para carregar o vídeo. O canal pode estar com instabilidade temporária no servidor de origem.'}
                </p>

                {/* Indicador de Tentativa Automática (se em andamento) */}
                {autoRetryCount > 0 && autoRetryCount <= 3 && (
                  <div className="flex items-center gap-2 mb-4 px-3.5 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/35 text-amber-300 text-xs font-semibold">
                    <div className="w-3.5 h-3.5 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                    <span>Tentando reconectar automaticamente ({autoRetryCount}/3)...</span>
                  </div>
                )}

                {/* Botão 'Tentar Novamente' em DESTAQUE CENTRALIZADO sobre o vídeo */}
                <div className="flex flex-col items-center gap-3 w-full max-w-md mt-1">
                  <button
                    type="button"
                    id="btn-retry-unstable"
                    onClick={handleForceReload}
                    className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-full bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-bold text-sm shadow-2xl shadow-amber-500/40 transition-all cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Tentar Novamente</span>
                  </button>

                  {/* Ações Secundárias */}
                  <div className="flex items-center justify-center gap-2 flex-wrap mt-1">
                    {sources.length > 1 && (
                      <button
                        type="button"
                        onClick={tryNextSource}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-indigo-600/40 hover:bg-indigo-600/60 text-indigo-200 border border-indigo-500/40 text-xs font-semibold transition-all cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Alternar Servidor ({currentSourceIndex + 1}/{sources.length})</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => { setForceProxy(!usingProxy); setReloadCounter(c => c + 1); }}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10 text-xs font-semibold transition-all cursor-pointer"
                    >
                      <span>{usingProxy ? 'Conexão Direta' : 'Ativar Proxy'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleReportOffline}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 text-xs font-semibold transition-all cursor-pointer"
                    >
                      <WifiOff className="w-3.5 h-3.5 text-rose-400" />
                      <span>Reportar Offline</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsConnectionUnstable(false)}
                      className="px-3 py-2 text-slate-400 hover:text-slate-200 text-xs transition-colors cursor-pointer"
                    >
                      Aguardar Sinal
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Friendly Stream Health / Warning Banner */}
            {streamWarning && !isConnectionUnstable && !hasError && (
              <div className="absolute top-16 sm:top-20 left-4 right-4 z-35 max-w-xl mx-auto bg-amber-500/15 border border-amber-500/40 backdrop-blur-md rounded-2xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-200 shadow-xl animate-fadeIn">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
                  <div className="text-xs">
                    <span className="font-semibold text-amber-300 block sm:inline mr-1">
                      Aviso de Conexão:
                    </span>
                    <span>{streamWarning}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 flex-wrap sm:flex-nowrap w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={runManualHealthCheck}
                    disabled={isCheckingHealth}
                    className="text-[11px] font-semibold bg-white/10 hover:bg-white/20 text-white px-2.5 py-1 rounded-full border border-white/20 transition-colors cursor-pointer"
                  >
                    {isCheckingHealth ? 'Testando...' : 'Testar Sinal'}
                  </button>
                  <button
                    type="button"
                    onClick={tryNextSource}
                    className="text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1 rounded-full shadow-sm transition-colors cursor-pointer"
                  >
                    Trocar Servidor
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowTroubleshootModal(true)}
                    className="text-[11px] font-semibold bg-amber-500/30 hover:bg-amber-500/40 text-amber-200 px-2.5 py-1 rounded-full border border-amber-400/30 transition-colors cursor-pointer"
                  >
                    Soluções
                  </button>
                  <button
                    type="button"
                    onClick={() => setStreamWarning(null)}
                    className="p-1 hover:bg-white/10 rounded-full text-amber-300 transition-colors cursor-pointer"
                    title="Dispensar aviso"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Buffering Spinner */}
            {isLoading && !hasError && (
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px] z-20">
                <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-3 shadow-lg" />
                <span className="text-xs font-semibold text-slate-200 bg-slate-900/80 px-3 py-1 rounded-full border border-white/10">
                  {isCheckingHealth ? 'Testando disponibilidade do sinal...' : 'Carregando transmissão...'}
                </span>
              </div>
            )}

            {/* Offline / Timeout Error Screen with Visual Blur Transition and Focus on Actions */}
            {hasError && (
              <div 
                id="error-modal-overlay"
                className="absolute inset-0 bg-slate-950/80 backdrop-blur-xl flex flex-col items-center justify-center p-4 sm:p-6 text-center z-25 overflow-y-auto transition-all duration-700 ease-out animate-fadeIn"
              >
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mb-3 shadow-2xl shadow-amber-500/20 ring-1 ring-amber-400/20">
                  {isTimedOut ? (
                    <Clock className="w-7 h-7 sm:w-8 sm:h-8 text-amber-400 animate-pulse" />
                  ) : (
                    <WifiOff className="w-7 h-7 sm:w-8 sm:h-8 text-amber-400" />
                  )}
                </div>
                <h4 className="text-lg sm:text-xl font-bold text-white mb-1.5 tracking-tight">
                  {isTimedOut ? 'Tempo Limite de 3,5s Excedido' : 'Não foi possível iniciar a transmissão'}
                </h4>
                <p className="text-xs sm:text-sm text-slate-300 max-w-lg mb-3 font-normal leading-relaxed">
                  {errorMessage || 'O link do servidor de origem está offline ou demorou mais de 3,5 segundos para responder. Tente recarregar ou alternar para outro servidor.'}
                </p>

                {/* Status de Tentativas de Conexão & Backoff Exponencial */}
                <div className="flex flex-wrap items-center justify-center gap-2 mb-3.5">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/90 border border-slate-700/80 text-[11px] font-semibold text-slate-300">
                    <Activity className="w-3.5 h-3.5 text-amber-400" />
                    <span>Tentativas de conexão: <strong className="text-white font-bold">{connectionAttempts}</strong></span>
                  </div>

                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/20 border border-purple-500/40 text-[11px] font-semibold text-purple-300">
                    <Layers className="w-3.5 h-3.5 text-purple-400" />
                    <span>Protocolo Atual: <strong className="text-white font-bold">{compatibilityProtocol.toUpperCase()}</strong></span>
                  </div>

                  {isBackoffActive && backoffSecondsLeft !== null && !isAutoRetryPaused && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-500/40 text-[11px] font-semibold text-indigo-300 animate-pulse">
                      <Clock className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Próxima reconexão em <strong className="text-white font-bold">{backoffSecondsLeft}s</strong> (Backoff Exponencial)</span>
                    </div>
                  )}

                  {isAutoRetryPaused && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-[11px] font-semibold text-amber-300">
                      <PauseCircle className="w-3.5 h-3.5 text-amber-400" />
                      <span>Reconexão automática pausada</span>
                    </div>
                  )}
                </div>

                {/* Sugestões de Verificação para problemas locais */}
                <div className="bg-slate-900/90 border border-slate-800/90 rounded-xl p-3.5 max-w-lg w-full text-left mb-4 shadow-lg">
                  <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs mb-2.5">
                    <Info className="w-4 h-4 shrink-0" />
                    <span>Sugestões de Verificação (resolução de problemas locais):</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="flex items-start gap-2 text-[11px] text-slate-300 bg-black/30 p-2 rounded-lg border border-white/5">
                      <Wifi className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                      <div>
                        <strong className="text-white block font-medium">Verifique sua conexão Wi-Fi</strong>
                        <span>Confirme se sua rede está ativa e sem quedas de sinal.</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 text-[11px] text-slate-300 bg-black/30 p-2 rounded-lg border border-white/5">
                      <ShieldOff className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                      <div>
                        <strong className="text-white block font-medium">Desconecte VPNs</strong>
                        <span>VPNs ativas ou DNS restritivos podem bloquear transmissões ao vivo.</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 text-[11px] text-slate-300 bg-black/30 p-2 rounded-lg border border-white/5">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400 mt-0.5 shrink-0" />
                      <div>
                        <strong className="text-white block font-medium">Desative bloqueadores (AdBlock)</strong>
                        <span>Extensões podem bloquear fragmentos .m3u8, .mpd ou .ts.</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 text-[11px] text-slate-300 bg-black/30 p-2 rounded-lg border border-white/5">
                      <Server className="w-3.5 h-3.5 text-sky-400 mt-0.5 shrink-0" />
                      <div>
                        <strong className="text-white block font-medium">Troque de Servidor ou Proxy</strong>
                        <span>Use os botões abaixo para testar rotas e proxies alternativos.</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2.5 max-w-xl">
                  {/* Botão Tentar Novamente */}
                  <button
                    type="button"
                    onClick={handleForceReload}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 cursor-pointer transition-all active:scale-95"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Tentar Novamente Agora</span>
                  </button>

                  {/* Botão Alternar Modo de Compatibilidade (HLS vs DASH) */}
                  <button
                    type="button"
                    id="btn-toggle-compatibility"
                    onClick={handleToggleCompatibilityMode}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-gradient-to-r from-purple-600/40 to-indigo-600/40 hover:from-purple-600/60 hover:to-indigo-600/60 text-purple-200 border border-purple-500/50 text-xs font-bold shadow-lg shadow-purple-900/30 cursor-pointer transition-all active:scale-95"
                    title="Alternar entre protocolos de transmissão (HLS vs DASH) para recuperação de stream"
                  >
                    <Shuffle className="w-4 h-4 text-purple-300" />
                    <span>Alternar Modo de Compatibilidade ({compatibilityProtocol === 'hls' ? 'DASH' : 'HLS'})</span>
                  </button>

                  {/* Pausar / Retomar Backoff Exponencial */}
                  <button
                    type="button"
                    onClick={toggleAutoRetryPause}
                    className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                      isAutoRetryPaused 
                        ? 'bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border-indigo-500/40' 
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-white/10'
                    }`}
                  >
                    {isAutoRetryPaused ? (
                      <>
                        <PlayCircle className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Retomar Auto-Reconexão</span>
                      </>
                    ) : (
                      <>
                        <PauseCircle className="w-3.5 h-3.5 text-slate-400" />
                        <span>Pausar Auto-Reconexão</span>
                      </>
                    )}
                  </button>

                  {/* Botão Reportar Erro */}
                  <button
                    type="button"
                    onClick={() => handleReportError()}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold border transition-all cursor-pointer shadow-md ${
                      hasReportedError
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 border-rose-500/50'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                    <span>{hasReportedError ? 'Erro Reportado no Log ✓' : 'Reportar Erro'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={tryNextSource}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 cursor-pointer transition-all"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Trocar de Servidor ({currentSourceIndex + 1}/{sources.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setForceProxy(!usingProxy); setHasError(false); setIsLoading(true); }}
                    className="px-4 py-2.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-white/10 cursor-pointer transition-all"
                  >
                    {usingProxy ? 'Tentar Conexão Direta' : 'Ativar Proxy Anti-Bloqueio'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowTroubleshootModal(true)}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold border border-amber-500/40 cursor-pointer transition-all"
                  >
                    <Activity className="w-3.5 h-3.5 text-amber-400" />
                    <span>Canal com Problema?</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleClose}
                    className="px-4 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-slate-400 text-xs font-semibold border border-white/10 cursor-pointer transition-all"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            )}

            {/* Top Bar (Title info, Quality indicator, Close button) */}
            <div 
              className={`absolute top-0 left-0 right-0 p-4 sm:p-6 bg-gradient-to-b from-black/85 via-black/45 to-transparent flex items-center justify-between z-30 transition-opacity duration-300 ${
                showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
              }`}
            >
              <div className="flex items-center gap-3">
                {'logo' in item && item.logo ? (
                  <img 
                    src={item.logo} 
                    alt={item.name} 
                    className="w-10 h-10 object-contain bg-slate-900/80 p-1 rounded-full border border-white/10 shadow-sm" 
                  />
                ) : 'posterUrl' in item && item.posterUrl ? (
                  <img 
                    src={item.posterUrl} 
                    alt={item.title} 
                    className="w-8 h-11 object-cover rounded-lg border border-white/10 shadow-sm" 
                  />
                ) : null}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-base sm:text-lg text-white">
                      {'name' in item ? item.name : item.title}
                    </span>
                    {type === 'channel' ? (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-red-600 text-[10px] font-bold rounded uppercase tracking-tighter text-white shadow-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        AO VIVO
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-indigo-600/80 text-[10px] font-bold rounded uppercase tracking-tighter text-white border border-indigo-400/30">
                        <Film className="w-3 h-3" />
                        {(item as VodItem).type === 'series' ? 'Série' : 'Filme 1080p'}
                      </span>
                    )}
                  </div>
                  {'epgNow' in item && item.epgNow ? (
                    <p className="text-xs text-slate-300">No Ar: {item.epgNow}</p>
                  ) : 'duration' in item && item.duration ? (
                    <p className="text-xs text-slate-400">Duração: {item.duration} • {item.rating || 'Livre'}</p>
                  ) : null}
                </div>
              </div>

              {/* Top Right Controls (Sources, Help, Close) */}
              <div className="flex items-center gap-2">
                {sources.length > 1 && (
                  <div className="hidden sm:flex items-center gap-1 bg-slate-900/80 border border-white/10 rounded-full p-1 text-xs backdrop-blur-md">
                    {sources.map((s, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setCurrentSourceIndex(idx);
                          setHasError(false);
                          setIsLoading(true);
                          setStreamWarning(null);
                        }}
                        className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                          currentSourceIndex === idx 
                            ? 'bg-indigo-600 text-white shadow-sm' 
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Servidor {idx + 1}
                      </button>
                    ))}
                  </div>
                )}

                {/* Channel Problem Troubleshooter Button */}
                <button
                  type="button"
                  onClick={() => setShowTroubleshootModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-semibold transition-all cursor-pointer backdrop-blur-md shadow-sm"
                  title="Assistente de sinal e diagnóstico para canal com problema"
                >
                  <Activity className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Canal com problema?</span>
                  <span className="sm:hidden">Ajuda</span>
                </button>

                {/* Botão Reportar Erro (Requisito 2) */}
                <button
                  type="button"
                  onClick={() => handleReportError()}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all cursor-pointer backdrop-blur-md shadow-sm ${
                    hasReportedError
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border-rose-500/30'
                  }`}
                  title="Reportar link inativo ou erro no canal para o log administrativo"
                >
                  <AlertTriangle className={`w-3.5 h-3.5 ${hasReportedError ? 'text-emerald-400' : 'text-rose-400'}`} />
                  <span className="hidden sm:inline">{hasReportedError ? 'Erro Reportado ✓' : 'Reportar Erro'}</span>
                  <span className="sm:hidden">{hasReportedError ? '✓' : 'Reportar'}</span>
                </button>

                {/* Favorite Toggle Button */}
                <button
                  type="button"
                  onClick={toggleFavorite}
                  className={`p-2.5 rounded-full border transition-all cursor-pointer backdrop-blur-md ${
                    isFav 
                      ? 'bg-red-600/30 text-red-400 border-red-500/50 hover:bg-red-600/40' 
                      : 'bg-slate-900/80 hover:bg-white/15 text-slate-300 hover:text-white border-white/10'
                  }`}
                  title={isFav ? 'Remover dos Favoritos' : 'Adicionar aos Favoritos'}
                >
                  <Heart className={`w-4 h-4 ${isFav ? 'fill-red-500 text-red-500' : ''}`} />
                </button>

                {/* Keyboard Shortcuts Help Button */}
                <button
                  type="button"
                  onClick={() => setActiveMenu(activeMenu === 'help' ? null : 'help')}
                  className="p-2.5 rounded-full bg-slate-900/80 hover:bg-white/15 text-slate-300 hover:text-white border border-white/10 transition-all cursor-pointer backdrop-blur-md"
                  title="Atalhos do Teclado"
                >
                  <HelpCircle className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={handleClose}
                  className="p-2.5 rounded-full bg-slate-900/80 hover:bg-white/15 text-white border border-white/10 transition-all cursor-pointer backdrop-blur-md"
                  title="Fechar Player"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Keyboard Shortcuts Overlay Modal */}
            {activeMenu === 'help' && (
              <div className="absolute top-18 right-6 z-45 w-72 bg-slate-900/95 border border-white/15 rounded-2xl p-4 shadow-2xl backdrop-blur-xl text-left animate-fadeIn">
                <div className="flex items-center justify-between pb-2 border-b border-white/10 mb-3">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />
                    Atalhos de Teclado
                  </span>
                  <button 
                    type="button" 
                    onClick={() => setActiveMenu(null)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="space-y-2 text-xs text-slate-300">
                  <div className="flex justify-between items-center"><span className="text-slate-400">Espaço / K</span><span className="font-semibold text-white">Play / Pausar</span></div>
                  <div className="flex justify-between items-center"><span className="text-slate-400">M</span><span className="font-semibold text-white">Silenciar / Mudo</span></div>
                  <div className="flex justify-between items-center"><span className="text-slate-400">F</span><span className="font-semibold text-white">Tela Cheia</span></div>
                  <div className="flex justify-between items-center"><span className="text-slate-400">P</span><span className="font-semibold text-white">Picture-in-Picture</span></div>
                  <div className="flex justify-between items-center"><span className="text-slate-400">C</span><span className="font-semibold text-white">Capturar Imagem</span></div>
                  <div className="flex justify-between items-center"><span className="text-slate-400">↑ / ↓</span><span className="font-semibold text-white">Volume ±10%</span></div>
                  <div className="flex justify-between items-center"><span className="text-slate-400">← / →</span><span className="font-semibold text-white">Avançar / Voltar 10s</span></div>
                  <div className="flex justify-between items-center"><span className="text-slate-400">Duplo Clique</span><span className="font-semibold text-white">Alternar Tela Cheia</span></div>
                </div>
              </div>
            )}

            {/* Settings Menu Popup (Speed, Quality, Aspect Ratio) */}
            {activeMenu === 'settings' && (
              <div className="absolute bottom-20 right-6 z-45 w-64 bg-slate-900/95 border border-white/15 rounded-2xl p-4 shadow-2xl backdrop-blur-xl text-left animate-fadeIn">
                <div className="flex items-center justify-between pb-2 border-b border-white/10 mb-3">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Settings className="w-3.5 h-3.5 text-indigo-400" />
                    Opções do Reprodutor
                  </span>
                  <button 
                    type="button" 
                    onClick={() => setActiveMenu(null)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Aspect Ratio */}
                <div className="mb-3">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                    Enquadramento de Vídeo
                  </span>
                  <div className="grid grid-cols-3 gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
                    {(['contain', 'cover', 'fill'] as AspectRatioMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => { setAspectRatio(mode); setActiveMenu(null); }}
                        className={`text-[10px] font-semibold py-1 rounded-lg transition-all cursor-pointer ${
                          aspectRatio === mode 
                            ? 'bg-indigo-600 text-white' 
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {mode === 'contain' ? 'Ajustar' : mode === 'cover' ? 'Zoom' : 'Esticar'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Playback Speed */}
                <div className="mb-3">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                    Velocidade de Reprodução
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => changeSpeed(rate)}
                        className={`text-[10px] font-semibold px-2 py-1 rounded-lg border transition-all cursor-pointer ${
                          playbackRate === rate
                            ? 'bg-indigo-600 border-indigo-500 text-white'
                            : 'bg-black/30 border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        {rate === 1 ? 'Normal' : `${rate}x`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quality / Resolution selection */}
                {qualities.length > 0 && (
                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                      Resolução / Qualidade (HLS)
                    </span>
                    <div className="max-h-28 overflow-y-auto space-y-1">
                      {qualities.map((q) => (
                        <button
                          key={q.index}
                          type="button"
                          onClick={() => changeQuality(q.index)}
                          className={`w-full flex items-center justify-between px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                            currentQuality === q.index
                              ? 'bg-indigo-600/30 text-indigo-300 font-semibold border border-indigo-500/30'
                              : 'text-slate-300 hover:bg-white/5'
                          }`}
                        >
                          <span>{q.label}</span>
                          {currentQuality === q.index && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Resume Playback Prompt Banner */}
            {resumePrompt && (
              <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-40 max-w-md w-[90%] sm:w-auto bg-slate-900/95 border border-indigo-500/50 backdrop-blur-md px-4 py-3 rounded-2xl shadow-2xl flex flex-wrap items-center justify-between gap-3 animate-fadeIn">
                <div className="flex items-center gap-2 text-xs text-white">
                  <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span>Você parou em <strong>{resumePrompt.formatted}</strong>. Retomar?</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (videoRef.current) {
                        videoRef.current.currentTime = resumePrompt.time;
                        setCurrentTime(resumePrompt.time);
                        showToast(`Retomado de ${resumePrompt.formatted}`);
                      }
                      setResumePrompt(null);
                    }}
                    className="px-3.5 py-1 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition-all cursor-pointer"
                  >
                    Retomar
                  </button>
                  <button
                    type="button"
                    onClick={() => setResumePrompt(null)}
                    className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-all cursor-pointer"
                  >
                    Do Início
                  </button>
                </div>
              </div>
            )}

            {/* Bottom Controls Bar */}
            <div 
              className={`absolute bottom-0 left-0 right-0 p-4 sm:p-6 bg-gradient-to-t from-black/95 via-black/75 to-transparent flex flex-col gap-2 z-30 transition-opacity duration-300 ${
                showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
              }`}
            >
              {/* Progress Scrubber for VOD or on-demand content */}
              {type === 'vod' && duration > 0 && (
                <div className="w-full flex items-center gap-3 relative">
                  <span className="text-[11px] font-mono text-slate-300 w-12 text-right">
                    {formatTime(currentTime)}
                  </span>
                  
                  {/* Custom interactive progress bar with buffered range and hover tooltip */}
                  <div 
                    className="relative w-full h-3 flex items-center cursor-pointer group/bar"
                    onMouseMove={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                      setHoverPosition(pos * 100);
                      setHoverTime(pos * duration);
                    }}
                    onMouseLeave={() => setHoverTime(null)}
                  >
                    {/* Background track */}
                    <div className="absolute inset-x-0 h-1.5 bg-white/20 rounded-full overflow-hidden">
                      {/* Buffered progress track */}
                      <div 
                        className="h-full bg-white/25 transition-all duration-300"
                        style={{ width: `${Math.min(100, bufferedEnd)}%` }}
                      />
                    </div>

                    {/* Active played progress */}
                    <div 
                      className="absolute left-0 h-1.5 bg-indigo-500 rounded-full"
                      style={{ width: `${Math.min(100, (currentTime / duration) * 100)}%` }}
                    />

                    {/* Native slider input overlay */}
                    <input
                      type="range"
                      min="0"
                      max={duration || 100}
                      step="0.5"
                      value={currentTime}
                      onChange={handleSeek}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />

                    {/* Hover time preview tooltip */}
                    {hoverTime !== null && (
                      <div 
                        className="absolute bottom-5 -translate-x-1/2 bg-slate-900/90 text-white text-[10px] font-mono font-semibold px-2 py-0.5 rounded border border-white/20 pointer-events-none shadow-lg backdrop-blur-sm"
                        style={{ left: `${hoverPosition}%` }}
                      >
                        {formatTime(hoverTime)}
                      </div>
                    )}
                  </div>

                  <span className="text-[11px] font-mono text-slate-400 w-12">
                    {formatTime(duration)}
                  </span>
                </div>
              )}

              {/* Controls Main Bar */}
              <div className="flex items-center justify-between gap-3">
                {/* Left side: Play, Skip, Volume */}
                <div className="flex items-center gap-1.5 sm:gap-2.5">
                  {/* Play / Pause Toggle Button */}
                  <button
                    type="button"
                    onClick={togglePlay}
                    className="p-2.5 rounded-full bg-white/20 hover:bg-white/30 text-white backdrop-blur-md transition-all cursor-pointer shadow-sm active:scale-95"
                    title={isPlaying ? 'Pausar (Espaço)' : 'Reproduzir (Espaço)'}
                  >
                    {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-white" />}
                  </button>

                  {/* Skip buttons (Rewind 10s & Forward 10s) */}
                  {type === 'vod' && (
                    <>
                      <button
                        type="button"
                        onClick={() => skipSeconds(-10)}
                        className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
                        title="Voltar 10 segundos (←)"
                      >
                        <Rewind className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => skipSeconds(10)}
                        className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
                        title="Avançar 10 segundos (→)"
                      >
                        <FastForward className="w-4 h-4" />
                      </button>
                    </>
                  )}

                  {/* Volume Controls & Slider */}
                  <div className="flex items-center gap-1.5 group/vol">
                    <button
                      type="button"
                      onClick={toggleMute}
                      className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
                      title={isMuted || volume === 0 ? 'Reativar Áudio (M)' : 'Silenciar Áudio (M)'}
                    >
                      {isMuted || volume === 0 ? (
                        <VolumeX className="w-5 h-5 text-red-400" />
                      ) : volume < 0.5 ? (
                        <Volume1 className="w-5 h-5" />
                      ) : (
                        <Volume2 className="w-5 h-5" />
                      )}
                    </button>

                    <div className="flex items-center gap-1.5">
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={isMuted ? 0 : volume}
                        onChange={handleVolumeChange}
                        className="w-16 sm:w-22 accent-indigo-500 h-1.5 bg-white/20 rounded-lg cursor-pointer"
                        title="Ajustar Volume"
                      />
                      <span className="hidden sm:inline text-[10px] font-mono text-slate-400 w-7">
                        {isMuted ? '0%' : `${Math.round(volume * 100)}%`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right side: Tools, Quality, Speed, PiP, Fullscreen */}
                <div className="flex items-center gap-1 sm:gap-2">
                  {/* Current Active Server */}
                  <button
                    type="button"
                    onClick={tryNextSource}
                    className="flex items-center gap-1 text-xs text-slate-300 hover:text-white px-2.5 py-1.5 rounded-full bg-slate-900/80 hover:bg-slate-800 border border-white/10 transition-colors cursor-pointer"
                    title="Alternar servidor de transmissão"
                  >
                    <Server className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="hidden md:inline">Servidor {currentSourceIndex + 1}/{sources.length}</span>
                  </button>

                  {/* Anti-block Proxy Status Indicator / Switcher */}
                  <button
                    type="button"
                    onClick={() => { setForceProxy(!usingProxy); setHasError(false); setIsLoading(true); }}
                    className={`hidden lg:flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
                      usingProxy 
                        ? 'bg-indigo-950/60 border-indigo-500/30 text-indigo-300' 
                        : 'bg-slate-900/80 border-white/10 text-slate-400'
                    }`}
                    title="Alternar modo de proxy interno"
                  >
                    <Activity className="w-3 h-3 text-indigo-400" />
                    <span>{usingProxy ? 'Proxy Ativo' : 'Direto'}</span>
                  </button>

                  {/* Screenshot / Frame Capture */}
                  <button
                    type="button"
                    onClick={captureScreenshot}
                    className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
                    title="Capturar Foto da Tela (C)"
                  >
                    <Camera className="w-4 h-4" />
                  </button>

                  {/* Picture in Picture */}
                  <button
                    type="button"
                    onClick={togglePiP}
                    className={`p-2 rounded-full transition-colors cursor-pointer ${
                      isPiP ? 'text-indigo-400 bg-white/10' : 'text-slate-300 hover:text-white hover:bg-white/10'
                    }`}
                    title="Modo Picture-in-Picture (P)"
                  >
                    <PictureInPicture className="w-4 h-4" />
                  </button>

                  {/* Settings Menu Toggle (Speed, Quality, Aspect Ratio) */}
                  <button
                    type="button"
                    onClick={() => setActiveMenu(activeMenu === 'settings' ? null : 'settings')}
                    className={`p-2 rounded-full transition-colors cursor-pointer ${
                      activeMenu === 'settings' ? 'text-indigo-400 bg-white/15' : 'text-slate-300 hover:text-white hover:bg-white/10'
                    }`}
                    title="Configurações de Reprodução"
                  >
                    <Settings className="w-4 h-4" />
                  </button>

                  {/* Fullscreen Button */}
                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    className="p-2.5 rounded-full bg-white/20 hover:bg-white/30 text-white backdrop-blur-md transition-all cursor-pointer active:scale-95 shadow-sm"
                    title={isFullscreen ? 'Sair da Tela Cheia (F)' : 'Tela Cheia (F)'}
                  >
                    {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Channel Trouble & Signal Recovery Assistant Modal */}
      <ChannelTroubleshootModal
        isOpen={showTroubleshootModal}
        onClose={() => setShowTroubleshootModal(false)}
        channelName={'name' in item ? item.name : item.title}
        channelId={item.id}
        streamUrl={streamUrl}
        rawUrl={rawUrl}
        sources={sources}
        currentSourceIndex={currentSourceIndex}
        onSelectSource={(idx) => {
          setCurrentSourceIndex(idx);
          setHasError(false);
          setIsLoading(true);
          setStreamWarning(null);
        }}
        usingProxy={usingProxy}
        onToggleProxy={() => {
          setForceProxy(!usingProxy);
          setHasError(false);
          setIsLoading(true);
        }}
        onForceReload={handleForceReload}
        userEmail={currentUser?.email}
        onShowToast={showToast}
      />
    </div>
  );
};
