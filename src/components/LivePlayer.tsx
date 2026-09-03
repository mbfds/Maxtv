import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import mpegts from 'mpegts.js';
import { 
  Play, Pause, Volume2, VolumeX, Maximize2, Minimize2, 
  RotateCcw, X, ShieldAlert, Sparkles, Crown, Radio, 
  Tv, AlertTriangle, ExternalLink
} from 'lucide-react';
import { Channel, VodItem } from '../types';

interface LivePlayerProps {
  item: Channel | VodItem;
  type: 'channel' | 'vod';
  isVip: boolean;
  onClose: () => void;
  onOpenCheckout: () => void;
}

export const LivePlayer: React.FC<LivePlayerProps> = ({
  item,
  type,
  isVip,
  onClose,
  onOpenCheckout
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
  const [usingProxy, setUsingProxy] = useState<boolean>(false);
  const [currentSourceIndex, setCurrentSourceIndex] = useState<number>(0);

  // VIP check
  const isLocked = item.isVipOnly && !isVip;

  // Determine current stream URL
  const sources = type === 'channel' ? (item as Channel).sources : [{ url: (item as VodItem).streamUrl }];
  const currentSource = sources[currentSourceIndex] || sources[0];
  const rawUrl = currentSource?.url || '';

  const streamUrl = usingProxy 
    ? `/api/proxy?url=${encodeURIComponent(rawUrl)}${currentSource?.referer ? `&referer=${encodeURIComponent(currentSource.referer)}` : ''}` 
    : rawUrl;

  useEffect(() => {
    if (isLocked) return;

    const video = videoRef.current;
    if (!video || !rawUrl) return;

    setHasError(false);
    setErrorMessage('');

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
    const isTs = streamUrl.includes('.ts') || rawUrl.includes('.ts');

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
      });

      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {
          setIsPlaying(false);
        });
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        console.warn('HLS error:', data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              // If not using proxy yet, automatically try via proxy!
              if (!usingProxy) {
                console.log('Network error on direct stream. Switching to internal proxy...');
                setUsingProxy(true);
              } else {
                setHasError(true);
                setErrorMessage('Falha ao conectar à transmissão de satélite.');
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              setHasError(true);
              setErrorMessage('Formato de transmissão não suportado pelo navegador.');
              break;
          }
        }
      });
    } else if (isTs && typeof window !== 'undefined' && mpegts.isSupported()) {
      try {
        const player = mpegts.createPlayer({
          type: 'mse',
          isLive: true,
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
          } else {
            setHasError(true);
            setErrorMessage('Transmissão ao vivo instável ou sinal fora do ar temporariamente.');
          }
        });
      } catch (err) {
        console.warn('mpegts init failed, trying direct video tag:', err);
        video.src = streamUrl;
        video.play().catch(() => setIsPlaying(false));
      }
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS (Safari / iOS)
      video.src = streamUrl;
      video.play().catch(() => setIsPlaying(false));
    } else {
      // Direct MP4 / WebM
      video.src = streamUrl;
      video.play().catch(() => setIsPlaying(false));
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (mpegtsRef.current) {
        mpegtsRef.current.destroy();
        mpegtsRef.current = null;
      }
    };
  }, [streamUrl, rawUrl, isLocked, usingProxy]);

  // Video event listeners
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
      setUsingProxy(false);
      setHasError(false);
    } else {
      // Cycle back to 0 with proxy enabled
      setCurrentSourceIndex(0);
      setUsingProxy(true);
      setHasError(false);
    }
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
              {item.title || (item as Channel).name}
            </h3>
            <p className="text-sm text-slate-400 max-w-md mb-6 font-normal">
              Este canal e os conteúdos 4K requerem uma assinatura ativa do Streaming Brasil MAXTV. Ative agora via PIX com aprovação instantânea!
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={onOpenCheckout}
                className="flex items-center gap-2 px-6 py-3 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm shadow-lg shadow-indigo-600/25 active:scale-95 transition-all"
              >
                <Crown className="w-4 h-4" />
                <span>Assinar VIP por R$ 19,90 via PIX</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-3 rounded-full bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold border border-white/10 transition-colors"
              >
                Voltar à Grade
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* HTML5 Video Element */}
            <video
              ref={videoRef}
              playsInline
              className="w-full h-full object-contain cursor-pointer"
              onClick={togglePlay}
              onEnded={() => setIsPlaying(false)}
            />

            {/* Error or Offline Banner */}
            {hasError && (
              <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-6 text-center z-10">
                <AlertTriangle className="w-12 h-12 text-amber-400 mb-3" />
                <h4 className="text-lg font-bold text-white mb-1">Transmissão em Manutenção</h4>
                <p className="text-xs text-slate-400 max-w-md mb-4">{errorMessage || 'A fonte de transmissão deste canal está temporariamente instável.'}</p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={tryNextSource}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Tentar Fonte Alternativa</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setUsingProxy(!usingProxy); setHasError(false); }}
                    className="px-5 py-2.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-white/10"
                  >
                    {usingProxy ? 'Usar Conexão Direta' : 'Ativar Proxy Anti-Bloqueio'}
                  </button>
                </div>
              </div>
            )}

            {/* Floating Top Bar (Channel / Title info + Close button) */}
            <div className="absolute top-0 left-0 right-0 p-4 sm:p-6 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between z-30 transition-opacity opacity-0 group-hover:opacity-100">
              <div className="flex items-center gap-3">
                {'logo' in item && item.logo && (
                  <img 
                    src={item.logo} 
                    alt={item.name} 
                    className="w-10 h-10 object-contain bg-slate-900/80 p-1 rounded-full border border-white/10 shadow-sm" 
                  />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-base sm:text-lg text-white">
                      {'name' in item ? item.name : item.title}
                    </span>
                    {type === 'channel' && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-red-600 text-[10px] font-bold rounded uppercase tracking-tighter text-white shadow-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        AO VIVO
                      </span>
                    )}
                  </div>
                  {'epgNow' in item && item.epgNow && (
                    <p className="text-xs text-slate-300">No Ar: {item.epgNow}</p>
                  )}
                </div>
              </div>

              {/* Close button */}
              <button
                type="button"
                onClick={onClose}
                className="p-2.5 rounded-full bg-slate-900/80 hover:bg-white/10 text-white border border-white/10 transition-all"
                title="Fechar Player"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Bottom Controls Bar */}
            <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex items-center justify-between gap-4 z-30 transition-opacity opacity-0 group-hover:opacity-100">
              {/* Play / Pause / Mute / Volume */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="p-2.5 rounded-full bg-white/20 hover:bg-white/30 text-white backdrop-blur-md transition-all"
                >
                  {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-white" />}
                </button>

                <div className="flex items-center gap-2 group/vol">
                  <button
                    type="button"
                    onClick={toggleMute}
                    className="p-2 text-slate-300 hover:text-white"
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

                {type === 'channel' && sources.length > 1 && (
                  <button
                    type="button"
                    onClick={tryNextSource}
                    className="hidden sm:flex items-center gap-1.5 text-xs text-slate-300 hover:text-white px-3 py-1 rounded-full bg-slate-900/80 border border-white/10"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Fonte {currentSourceIndex + 1}/{sources.length}</span>
                  </button>
                )}
              </div>

              {/* Status and Fullscreen */}
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-2 text-xs font-semibold text-indigo-300 bg-indigo-950/60 px-3 py-1 rounded-full border border-indigo-500/30">
                  <Radio className="w-3 h-3 text-indigo-400 animate-pulse" />
                  <span>Sinal Estável 1080p</span>
                </div>

                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="p-2.5 rounded-full bg-white/20 hover:bg-white/30 text-white backdrop-blur-md transition-all"
                  title="Tela Cheia"
                >
                  {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
