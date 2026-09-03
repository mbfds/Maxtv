import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import mpegts from 'mpegts.js';
import { 
  Play, Pause, Volume2, VolumeX, Maximize2, Minimize2, 
  RotateCcw, X, ShieldAlert, Sparkles, Crown, Radio, 
  Tv, AlertTriangle, ExternalLink, FastForward, Rewind,
  Server, RefreshCw, Film
} from 'lucide-react';
import { Channel, VodItem, User } from '../types';

interface LivePlayerProps {
  item: Channel | VodItem;
  type: 'channel' | 'vod';
  isVip: boolean;
  currentUser?: User | null;
  onClose: () => void;
  onOpenCheckout: () => void;
  onOpenAuth?: () => void;
}

export const LivePlayer: React.FC<LivePlayerProps> = ({
  item,
  type,
  isVip,
  currentUser,
  onClose,
  onOpenCheckout,
  onOpenAuth
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const mpegtsRef = useRef<any>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [currentSourceIndex, setCurrentSourceIndex] = useState<number>(0);

  // VOD timing state
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);

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

  // By default, if the URL is plain http (and page is https) or from IPTV domains, route via /api/proxy
  const shouldDefaultProxy = rawUrl.startsWith('http://') || rawUrl.includes('hubby.cx') || rawUrl.includes('tjtor8411');
  const [usingProxy, setUsingProxy] = useState<boolean>(shouldDefaultProxy);

  // VIP check
  const isLocked = item.isVipOnly && !isVip;

  const streamUrl = usingProxy 
    ? `/api/proxy?url=${encodeURIComponent(rawUrl)}${currentSource?.referer ? `&referer=${encodeURIComponent(currentSource.referer)}` : ''}` 
    : rawUrl;

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

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: type === 'channel',
        backBufferLength: 90,
      });

      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoading(false);
        video.play().catch(() => {
          setIsPlaying(false);
        });
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        console.warn('HLS error:', data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              if (!usingProxy) {
                console.log('Network error on direct stream. Switching to internal proxy...');
                setUsingProxy(true);
              } else if (currentSourceIndex < sources.length - 1) {
                console.log('Switching to next source in catalog...');
                setCurrentSourceIndex(prev => prev + 1);
              } else {
                setHasError(true);
                setErrorMessage('Falha ao conectar à transmissão. Tente alternar o servidor de vídeo abaixo.');
                setIsLoading(false);
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              if (currentSourceIndex < sources.length - 1) {
                setCurrentSourceIndex(prev => prev + 1);
              } else {
                setHasError(true);
                setErrorMessage('Formato de transmissão não suportado. Tente o servidor alternativo.');
                setIsLoading(false);
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
            setUsingProxy(true);
          } else if (currentSourceIndex < sources.length - 1) {
            setCurrentSourceIndex(prev => prev + 1);
          } else {
            setHasError(true);
            setErrorMessage('Transmissão ao vivo instável ou sinal fora do ar temporariamente.');
            setIsLoading(false);
          }
        });
      } catch (err) {
        console.warn('mpegts init failed, trying direct video tag:', err);
        video.src = streamUrl;
        video.play().catch(() => setIsPlaying(false));
      }
    } else if (video.canPlayType('application/vnd.apple.mpegurl') && isHls) {
      // Native HLS (Safari / iOS)
      video.src = streamUrl;
      video.play().catch(() => setIsPlaying(false));
    } else {
      // Direct MP4 / WebM / Media Stream
      video.src = streamUrl;
      video.play().then(() => {
        setIsPlaying(true);
        setIsLoading(false);
      }).catch((err) => {
        console.warn('Direct video play error:', err);
        if (!usingProxy && rawUrl.startsWith('http://')) {
          setUsingProxy(true);
        } else {
          setIsPlaying(false);
        }
      });
    }

    // Safety watchdog: If video is still loading after 4 seconds and hasn't started, offer alternate source
    const watchdogTimer = setTimeout(() => {
      if (video.readyState < 2 && !video.currentTime) {
        if (!usingProxy && rawUrl.startsWith('http://')) {
          setUsingProxy(true);
        }
      }
    }, 4000);

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
  }, [streamUrl, rawUrl, isLocked, usingProxy, currentSourceIndex, type]);

  // Video event handlers
  const handleVideoError = () => {
    console.warn('HTML5 Video Error encountered on streamUrl:', streamUrl);
    if (!usingProxy) {
      console.log('Retrying via server proxy...');
      setUsingProxy(true);
    } else if (currentSourceIndex < sources.length - 1) {
      console.log('Switching to next source index...');
      setCurrentSourceIndex(prev => prev + 1);
    } else {
      setHasError(true);
      setErrorMessage('Não foi possível carregar o vídeo. Tente outro servidor abaixo.');
      setIsLoading(false);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration || 0);
      setIsLoading(false);
      setHasError(false);
    }
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setIsPlaying(true);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const skipSeconds = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, Math.min(duration || 99999, videoRef.current.currentTime + seconds));
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(console.error);
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(console.error);
      setIsFullscreen(false);
    }
  };

  const tryNextSource = () => {
    if (currentSourceIndex < sources.length - 1) {
      setCurrentSourceIndex(prev => prev + 1);
    } else {
      setCurrentSourceIndex(0);
      setUsingProxy(prev => !prev);
    }
    setHasError(false);
    setIsLoading(true);
  };

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

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-xl flex flex-col items-center justify-center p-2 sm:p-6 animate-fadeIn">
      {/* Container */}
      <div 
        ref={containerRef}
        className="relative w-full max-w-6xl aspect-video bg-black rounded-3xl overflow-hidden border border-white/10 shadow-2xl flex items-center justify-center group"
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
              Este conteúdo faz parte do catálogo VIP MAXTV. Você pode assinar via PIX com liberação instantânea ou solicitar ao administrador para liberar meses de cortesia!
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
              className="w-full h-full object-contain cursor-pointer bg-black"
              onClick={togglePlay}
              onEnded={() => setIsPlaying(false)}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onWaiting={() => setIsLoading(true)}
              onPlaying={() => { setIsLoading(false); setHasError(false); }}
              onCanPlay={() => setIsLoading(false)}
              onError={handleVideoError}
            />

            {/* Buffering Spinner */}
            {isLoading && !hasError && (
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px] z-20">
                <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-3 shadow-lg" />
                <span className="text-xs font-semibold text-slate-200 bg-slate-900/80 px-3 py-1 rounded-full border border-white/10">
                  Carregando vídeo...
                </span>
              </div>
            )}

            {/* Error or Offline Banner */}
            {hasError && (
              <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-6 text-center z-20">
                <AlertTriangle className="w-12 h-12 text-amber-400 mb-3" />
                <h4 className="text-lg font-bold text-white mb-1">
                  Não foi possível iniciar a reprodução
                </h4>
                <p className="text-xs text-slate-400 max-w-md mb-5">
                  {errorMessage || 'O servidor de origem deste vídeo está temporariamente indisponível. Utilize um dos servidores alternativos abaixo.'}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={tryNextSource}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Mudar para Outro Servidor ({currentSourceIndex + 1}/{sources.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setUsingProxy(!usingProxy); setHasError(false); setIsLoading(true); }}
                    className="px-5 py-2.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-white/10 cursor-pointer"
                  >
                    {usingProxy ? 'Tentar Conexão Direta' : 'Ativar Proxy Anti-Bloqueio'}
                  </button>
                </div>
              </div>
            )}

            {/* Floating Top Bar (Channel / Title info + Close button) */}
            <div className="absolute top-0 left-0 right-0 p-4 sm:p-6 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between z-30 transition-opacity opacity-0 group-hover:opacity-100">
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

              {/* Top Right Controls */}
              <div className="flex items-center gap-2">
                {sources.length > 1 && (
                  <div className="hidden sm:flex items-center gap-1 bg-slate-900/80 border border-white/10 rounded-full p-1 text-xs">
                    {sources.map((s, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setCurrentSourceIndex(idx);
                          setHasError(false);
                          setIsLoading(true);
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

                <button
                  type="button"
                  onClick={onClose}
                  className="p-2.5 rounded-full bg-slate-900/80 hover:bg-white/10 text-white border border-white/10 transition-all cursor-pointer"
                  title="Fechar Player"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Bottom Controls Bar */}
            <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 bg-gradient-to-t from-black/95 via-black/70 to-transparent flex flex-col gap-2 z-30 transition-opacity opacity-0 group-hover:opacity-100">
              {/* Progress Scrubber for VOD or on-demand content */}
              {type === 'vod' && duration > 0 && (
                <div className="w-full flex items-center gap-3">
                  <span className="text-[11px] font-mono text-slate-400 w-12 text-right">
                    {formatTime(currentTime)}
                  </span>
                  <input
                    type="range"
                    min="0"
                    max={duration || 100}
                    step="1"
                    value={currentTime}
                    onChange={handleSeek}
                    className="w-full h-1.5 bg-white/20 hover:bg-white/30 accent-indigo-500 rounded-lg cursor-pointer transition-all"
                  />
                  <span className="text-[11px] font-mono text-slate-400 w-12">
                    {formatTime(duration)}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between gap-4">
                {/* Play / Skip / Mute / Volume */}
                <div className="flex items-center gap-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={togglePlay}
                    className="p-2.5 rounded-full bg-white/20 hover:bg-white/30 text-white backdrop-blur-md transition-all cursor-pointer"
                    title={isPlaying ? 'Pausar' : 'Reproduzir'}
                  >
                    {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-white" />}
                  </button>

                  {type === 'vod' && (
                    <>
                      <button
                        type="button"
                        onClick={() => skipSeconds(-10)}
                        className="p-2 text-slate-300 hover:text-white transition-colors cursor-pointer"
                        title="Voltar 10s"
                      >
                        <Rewind className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => skipSeconds(10)}
                        className="p-2 text-slate-300 hover:text-white transition-colors cursor-pointer"
                        title="Avançar 10s"
                      >
                        <FastForward className="w-4 h-4" />
                      </button>
                    </>
                  )}

                  <div className="flex items-center gap-2 group/vol">
                    <button
                      type="button"
                      onClick={toggleMute}
                      className="p-2 text-slate-300 hover:text-white cursor-pointer"
                    >
                      {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={isMuted ? 0 : volume}
                      onChange={handleVolumeChange}
                      className="w-16 sm:w-24 accent-indigo-500 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Status, Alternate Source & Fullscreen */}
                <div className="flex items-center gap-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={tryNextSource}
                    className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white px-3 py-1.5 rounded-full bg-slate-900/80 border border-white/10 hover:border-indigo-500/50 transition-colors cursor-pointer"
                    title="Alternar servidor de transmissão"
                  >
                    <Server className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="hidden sm:inline">Servidor {currentSourceIndex + 1}/{sources.length}</span>
                  </button>

                  <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-emerald-300 bg-emerald-950/60 px-3 py-1.5 rounded-full border border-emerald-500/30">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>HD 1080p</span>
                  </div>

                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    className="p-2.5 rounded-full bg-white/20 hover:bg-white/30 text-white backdrop-blur-md transition-all cursor-pointer"
                    title="Tela Cheia"
                  >
                    {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
