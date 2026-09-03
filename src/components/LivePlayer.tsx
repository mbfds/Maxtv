import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import mpegts from 'mpegts.js';
import { 
  Play, Pause, Volume2, Volume1, VolumeX, Maximize2, Minimize2, 
  RotateCcw, X, ShieldAlert, Sparkles, Crown, Radio, 
  Tv, AlertTriangle, ExternalLink, FastForward, Rewind,
  Server, RefreshCw, Film, PictureInPicture, Camera, 
  Settings, SlidersHorizontal, Check, Info, WifiOff, 
  HelpCircle, Activity, Heart, Zap, Wrench
} from 'lucide-react';
import { Channel, VodItem, User } from '../types';
import { checkStreamAvailability } from '../utils/streamChecker';
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

  // Free preview mode for VIP locked content so users can test streams
  const [previewMode, setPreviewMode] = useState<boolean>(false);
  const isLocked = item.isVipOnly && !isVip && !previewMode;

  // Build unified sources list
  const sources: { name: string; url: string; referer?: string; quality?: string }[] = React.useMemo(() => {
    if (type === 'channel') {
      return (item as Channel).sources.map((s, idx) => ({
        name: `Servidor ${idx + 1} (${s.quality || '1080p'})`,
        url: s.url,
        referer: s.referer,
        quality: s.quality || '1080p'
      }));
    }

    const vod = item as VodItem;
    if (vod.sources && vod.sources.length > 0) {
      return vod.sources.map(s => ({
        name: s.name,
        url: s.url,
        quality: s.quality || '1080p'
      }));
    }

    const list = [
      { name: 'Servidor 1 - Alta Velocidade (CDN)', url: vod.streamUrl, quality: '1080p' }
    ];
    if (vod.backupStreamUrl) {
      list.push({ name: 'Servidor 2 - HLS M3U8 (Akamai)', url: vod.backupStreamUrl, quality: '1080p' });
    }
    return list;
  }, [item, type]);

  const currentSource = sources[currentSourceIndex] || sources[0];
  const rawUrl = currentSource?.url || '';

  // By default, IPTV channels, HTTP streams, and M3U8s route through /api/proxy
  const needsProxy = React.useMemo(() => {
    return (
      type === 'channel' ||
      rawUrl.startsWith('http://') ||
      rawUrl.includes('satlabscloud.com.br') ||
      rawUrl.includes('reidoscanais') ||
      rawUrl.includes('hubby.cx') ||
      rawUrl.includes('tjtor8411') ||
      rawUrl.includes('.ts') ||
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

  // Manual on-demand health check
  const runManualHealthCheck = async () => {
    setIsCheckingHealth(true);
    showToast('Verificando status do canal em tempo real...');
    try {
      const res = await checkStreamAvailability(streamUrl, currentSource?.referer, 6000);
      if (res.online && !res.isOffline) {
        showToast(`Canal Online! Latência: ${res.latencyMs}ms`);
        setStreamWarning(null);
      } else {
        showToast(`Sinal com alta latência (${res.latencyMs}ms). Tente alternar o servidor.`);
        setStreamWarning(res.warningMessage || 'Sinal instável. Tente outro servidor.');
      }
    } catch {
      showToast('Falha na conexão com o servidor.');
    } finally {
      setIsCheckingHealth(false);
    }
  };

  const handleForceReload = () => {
    setReloadCounter(prev => prev + 1);
    setHasError(false);
    setIsLoading(true);
    setStreamWarning(null);
    showToast('Reiniciando transmissão com buffer limpo...');
  };
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying && !isLocked && !activeMenu) {
        setShowControls(false);
      }
    }, 3500);
  }, [isPlaying, isLocked, activeMenu]);

  // Pre-flight HEAD health check with auto-fallback
  useEffect(() => {
    if (isLocked || !rawUrl) return;

    let isMounted = true;
    setStreamWarning(null);
    setIsCheckingHealth(true);

    checkStreamAvailability(streamUrl, currentSource?.referer, 6000)
      .then((res) => {
        if (!isMounted) return;
        setIsCheckingHealth(false);
        // If video is already playing, never show connection warning
        if (videoRef.current && videoRef.current.currentTime > 0) {
          setStreamWarning(null);
          return;
        }

        if (res.isOffline || res.warningMessage) {
          // If direct connection is failing or timing out and proxy is off, automatically try proxy
          if (!usingProxy && res.isOffline) {
            console.log('[LivePlayer] Direct stream slow/offline, activating proxy automatically...');
            setForceProxy(true);
            showToast('Conexão direta instável. Ativando Proxy Seguro...');
            return;
          }

          setStreamWarning(
            res.warningMessage || 'Aviso: O sinal deste servidor demorou a responder. Caso ocorra lentidão, tente alternar o servidor.'
          );
        }
      })
      .catch(() => {
        if (isMounted) setIsCheckingHealth(false);
      });

    return () => {
      isMounted = false;
    };
  }, [streamUrl, isLocked, currentSource]);

  // Main video loader with comprehensive Hls.js & fallbacks
  useEffect(() => {
    if (isLocked) {
      setIsLoading(false);
      return;
    }

    const video = videoRef.current;
    if (!video || !rawUrl) return;

    setHasError(false);
    setErrorMessage('');
    setIsLoading(true);
    setQualities([]);

    // Destroy existing Hls and mpegts instances if any
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (mpegtsRef.current) {
      mpegtsRef.current.destroy();
      mpegtsRef.current = null;
    }

    const isHls = streamUrl.includes('.m3u8') || rawUrl.includes('.m3u8');
    const isTs = (streamUrl.includes('.ts') || rawUrl.includes('.ts')) && !streamUrl.includes('.mp4');

    // 1. HLS.JS (Full compatibility for M3U8 across modern browsers)
    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: type === 'channel',
        backBufferLength: 90,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        maxBufferSize: 60 * 1000 * 1000,
        manifestLoadingTimeOut: 12000,
        manifestLoadingMaxRetry: 4,
        fragLoadingTimeOut: 14000,
        fragLoadingMaxRetry: 5,
        levelLoadingTimeOut: 12000,
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
        console.warn('HLS.js event error:', data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              if (!usingProxy) {
                console.log('Network error on direct stream. Switching to internal proxy...');
                setForceProxy(true);
              } else if (currentSourceIndex < sources.length - 1) {
                console.log('Switching to next source in catalog...');
                setCurrentSourceIndex(prev => prev + 1);
              } else {
                setHasError(true);
                setErrorMessage('Falha na conexão de rede com a transmissão. Experimente alternar para outro servidor.');
                setIsLoading(false);
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log('HLS Media error encountered, attempting recovery...');
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              if (currentSourceIndex < sources.length - 1) {
                setCurrentSourceIndex(prev => prev + 1);
              } else {
                setHasError(true);
                setErrorMessage('O formato desta transmissão não pôde ser decodificado. Selecione o servidor alternativo.');
                setIsLoading(false);
              }
              break;
          }
        }
      });
    } else if (isTs && typeof window !== 'undefined' && mpegts.isSupported()) {
      // 2. MPEGTS.JS (Raw MPEG-TS Streams)
      try {
        const player = mpegts.createPlayer({
          type: 'mse',
          isLive: type === 'channel',
          url: streamUrl,
        }, {
          enableWorker: true,
          lazyLoadMaxDuration: 30,
          seekType: 'range'
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
          } else if (currentSourceIndex < sources.length - 1) {
            setCurrentSourceIndex(prev => prev + 1);
          } else {
            setHasError(true);
            setErrorMessage('Transmissão ao vivo instável ou sinal fora do ar temporariamente.');
            setIsLoading(false);
          }
        });
      } catch (err) {
        console.warn('mpegts init failed, falling back to direct video tag:', err);
        video.src = streamUrl;
        video.play().catch(() => setIsPlaying(false));
      }
    } else if (video.canPlayType('application/vnd.apple.mpegurl') && isHls) {
      // 3. NATIVE HLS (Safari / iOS)
      video.src = streamUrl;
      video.play().catch(() => setIsPlaying(false));
    } else {
      // 4. DIRECT MP4 / WEBM / VIDEO TAG
      video.src = streamUrl;
      video.play().then(() => {
        setIsPlaying(true);
        setIsLoading(false);
      }).catch((err) => {
        console.warn('Direct video play error:', err);
        if (!usingProxy && rawUrl.startsWith('http://')) {
          setForceProxy(true);
        } else {
          setIsPlaying(false);
        }
      });
    }

    // Safety watchdog: If video is still loading after 4.5 seconds and hasn't started, offer proxy or fallback
    const watchdogTimer = setTimeout(() => {
      if (video.readyState < 2 && !video.currentTime) {
        if (!usingProxy && rawUrl.startsWith('http://')) {
          setForceProxy(true);
        }
      }
    }, 4500);

    return () => {
      clearTimeout(watchdogTimer);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (mpegtsRef.current) {
        mpegtsRef.current.destroy();
        mpegtsRef.current = null;
      }
    };
  }, [streamUrl, rawUrl, isLocked, usingProxy, currentSourceIndex, type, sources.length]);

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
    } else if (currentSourceIndex < sources.length - 1) {
      console.log('Switching to next source index...');
      setCurrentSourceIndex(prev => prev + 1);
    } else {
      setHasError(true);
      setErrorMessage('Não foi possível reproduzir esta fonte. Tente outro servidor abaixo.');
      setIsLoading(false);
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
            {/* HTML5 Video Element */}
            <video
              ref={videoRef}
              playsInline
              className={`w-full h-full cursor-pointer bg-black ${getAspectClass()}`}
              onClick={togglePlay}
              onDoubleClick={toggleFullscreen}
              onEnded={() => setIsPlaying(false)}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onWaiting={() => setIsLoading(true)}
              onPlaying={() => { 
                setIsLoading(false); 
                setHasError(false); 
                setStreamWarning(null); 
              }}
              onCanPlay={() => {
                setIsLoading(false);
                setStreamWarning(null);
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

            {/* Friendly Stream Health / Offline Warning Banner (Pre-flight HEAD check) */}
            {streamWarning && !hasError && (
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
                  {isCheckingHealth ? 'Testando disponibilidade do sinal...' : 'Carregando vídeo...'}
                </span>
              </div>
            )}

            {/* Offline Error Screen */}
            {hasError && (
              <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-6 text-center z-25">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mb-3">
                  <WifiOff className="w-7 h-7 text-amber-400" />
                </div>
                <h4 className="text-lg font-bold text-white mb-1">
                  Não foi possível iniciar a transmissão
                </h4>
                <p className="text-xs text-slate-400 max-w-md mb-5 font-normal">
                  {errorMessage || 'O link do servidor de origem está offline ou respondendo com lentidão. Tente alternar para o servidor redundante ou ativar o proxy.'}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2.5 max-w-lg">
                  <button
                    type="button"
                    onClick={tryNextSource}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 cursor-pointer transition-all"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Mudar para Outro Servidor ({currentSourceIndex + 1}/{sources.length})</span>
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
