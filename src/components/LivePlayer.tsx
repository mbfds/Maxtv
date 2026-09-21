import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import mpegts from 'mpegts.js';
import * as dashjs from 'dashjs';
import { 
  Play, Pause, Volume2, Volume1, Volume, VolumeX, Maximize2, Minimize2, 
  RotateCcw, X, ShieldAlert, Sparkles, Crown, Radio, 
  Tv, AlertTriangle, ExternalLink, FastForward, Rewind,
  Server, RefreshCw, Film, PictureInPicture, Camera, 
  Settings, SlidersHorizontal, Check, Info, WifiOff, Wifi, ShieldOff,
  HelpCircle, Activity, Heart, Zap, Wrench, Clock, PauseCircle, PlayCircle,
  Shuffle, Layers, Cpu, Subtitles, Upload, Link, Trash2, FileText, SkipForward, ListOrdered,
  ChevronDown, ArrowLeft, Cast, Airplay
} from 'lucide-react';
import { Channel, VodItem, User, SubtitleTrack } from '../types';
import { api } from '../services/api';
import { checkStreamAvailability, reportChannelProblem } from '../utils/streamChecker';
import { calculateDynamicBufferProfile, applyDynamicBufferToHls, getBrowserNetworkMetrics, getBufferedAheadSeconds, DynamicBufferConfig } from '../utils/smartBufferManager';
import { isBrazilHostedUrl } from '../utils/sourcePrioritizer';
import { favoritesStorage, FAVORITES_UPDATED_EVENT } from '../services/favoritesStorage';
import { watchProgressStorage } from '../services/watchProgressStorage';
import { ChannelTroubleshootModal } from './ChannelTroubleshootModal';
import { CastModal } from './CastModal';
import { castService } from '../services/castService';
import {
  SubtitleCue,
  SubtitleStyleConfig,
  getStoredSubtitleConfig,
  saveStoredSubtitleConfig,
  getActiveCues,
  loadSubtitleFromFile,
  loadSubtitleFromUrl,
  parseSubtitleText,
  createVttBlobUrl
} from '../utils/subtitleParser';

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

export interface SubtitleTrackOption {
  id: string;
  label: string;
  language: string;
  isCustom?: boolean;
  isDefaultPreset?: boolean;
  isHls?: boolean;
  hlsIndex?: number;
  cues?: SubtitleCue[];
  blobUrl?: string;
  sourceUrl?: string;
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
  const serverDropdownRef = useRef<HTMLDivElement>(null);

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
  const [activeMenu, setActiveMenu] = useState<'settings' | 'sources' | 'help' | 'subtitles' | 'episodes' | 'controls' | null>(null);

  // Subtitles (.vtt / .srt) State
  const [availableSubtitleTracks, setAvailableSubtitleTracks] = useState<SubtitleTrackOption[]>([]);
  const [selectedSubtitleTrackId, setSelectedSubtitleTrackId] = useState<string | null>(null);
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyleConfig>(getStoredSubtitleConfig);
  const [showUrlInput, setShowUrlInput] = useState<boolean>(false);
  const [urlInput, setUrlInput] = useState<string>('');
  const [isLoadingUrl, setIsLoadingUrl] = useState<boolean>(false);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);
  const subtitleFileInputRef = useRef<HTMLInputElement>(null);

  // UI feedback & controls visibility
  const [showControls, setShowControls] = useState<boolean>(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [splashAction, setSplashAction] = useState<'play' | 'pause' | 'rewind' | 'forward' | null>(null);

  // Buffer Adaptativo & Failover Automático
  const failedSourcesSetRef = useRef<Set<number>>(new Set());
  const streamLoadStartTimeRef = useRef<number>(Date.now());
  const recentStallsRef = useRef<number>(0);
  const lastFragSpeedMbpsRef = useRef<number | undefined>(undefined);
  const [activeBufferProfileLabel, setActiveBufferProfileLabel] = useState<string>('Buffer Turbo BR Adaptativo');

  // Favorites & Watch Progress states
  const [isFav, setIsFav] = useState<boolean>(() => favoritesStorage.isFavorite(item.id, currentUser?.email));
  const hasAppliedInitialSeekRef = useRef<boolean>(false);
  const lastSavedProgressTimeRef = useRef<number>(0);
  const [resumePrompt, setResumePrompt] = useState<{ time: number; formatted: string } | null>(null);

  // Transmissão para TV / Outra Tela (Chromecast / AirPlay / Smart TV)
  const [isCastModalOpen, setIsCastModalOpen] = useState<boolean>(false);
  const [castState, setCastState] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [isCastSupported, setIsCastSupported] = useState<boolean>(false);
  const [isAirPlaySupported, setIsAirPlaySupported] = useState<boolean>(false);

  // Status de Rede (Online/Offline)
  const [isNetworkOnline, setIsNetworkOnline] = useState<boolean>(() => typeof navigator !== 'undefined' ? navigator.onLine : true);

  const webPlayerUrl = React.useMemo(() => {
    if (typeof window === 'undefined') return '';
    const origin = window.location.origin;
    const itemId = item.id;
    return `${origin}/?play=${encodeURIComponent(itemId)}&type=${type}`;
  }, [item.id, type]);

  useEffect(() => {
    const handleFavUpdate = () => {
      setIsFav(favoritesStorage.isFavorite(item.id, currentUser?.email));
    };
    window.addEventListener(FAVORITES_UPDATED_EVENT, handleFavUpdate);
    return () => window.removeEventListener(FAVORITES_UPDATED_EVENT, handleFavUpdate);
  }, [item.id, currentUser?.email]);

  // Load initial subtitle tracks for VOD (preset samples or metadata subtitles)
  useEffect(() => {
    const defaultTracks: SubtitleTrackOption[] = [];
    if (type === 'vod') {
      const vod = item as VodItem;
      if (vod.subtitles && vod.subtitles.length > 0) {
        vod.subtitles.forEach((sub, idx) => {
          defaultTracks.push({
            id: sub.id || `vod-sub-${idx}`,
            label: sub.label,
            language: sub.language,
            isDefaultPreset: true,
            sourceUrl: sub.url,
            cues: sub.content ? parseSubtitleText(sub.content) : undefined,
            blobUrl: sub.content ? createVttBlobUrl(sub.content) : undefined
          });
        });
      }

      // Add built-in sample subtitles for quick testing and preview
      defaultTracks.push({
        id: 'sample-pt',
        label: 'Português (Brasil) - Amostra WebVTT',
        language: 'pt-BR',
        isDefaultPreset: true,
        sourceUrl: '/subtitles/sample-pt.vtt'
      });
      defaultTracks.push({
        id: 'sample-en',
        label: 'English (US) - Sample WebVTT',
        language: 'en-US',
        isDefaultPreset: true,
        sourceUrl: '/subtitles/sample-en.vtt'
      });
    }

    setAvailableSubtitleTracks(defaultTracks);
    setSelectedSubtitleTrackId(null);
  }, [item.id, type]);

  // Stream pre-flight HEAD health check state
  const [streamWarning, setStreamWarning] = useState<string | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState<boolean>(false);
  const [showTroubleshootModal, setShowTroubleshootModal] = useState<boolean>(false);
  const [reloadCounter, setReloadCounter] = useState<number>(0);

  // Rigorous 10s timeout and channel health indicators
  const canPlayTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasCanPlayFiredRef = useRef<boolean>(false);
  const [isTimedOut, setIsTimedOut] = useState<boolean>(false);
  const [isConnectionUnstable, setIsConnectionUnstable] = useState<boolean>(false);
  const [connectionLatency, setConnectionLatency] = useState<number>(0);
  const [hasReportedError, setHasReportedError] = useState<boolean>(false);

  // Auto-retry counter (up to 3 times after 10s timeout or dead link before definitive error and Reportar Erro button)
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

  // Production session tracking & 5-minute guest preview limit
  const [sessionId] = useState<string>(() => `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);
  const [guestWatchSeconds, setGuestWatchSeconds] = useState<number>(0);
  const [isFiveMinLimitReached, setIsFiveMinLimitReached] = useState<boolean>(false);
  const isLocked = false; // Todos os usuários acessam com direito aos 5 minutos de degustação

  // Series identification and episode tracking (Piloto Automático applies specifically to series)
  const isSeries = type === 'vod' && 'type' in item && (item as VodItem).type === 'series';

  const seriesEpisodes = React.useMemo<{
    seasonNumber: number;
    episodeNumber: number;
    title: string;
    duration: string;
    streamUrl: string;
  }[]>(() => {
    if (!isSeries) return [];
    const epList: {
      seasonNumber: number;
      episodeNumber: number;
      title: string;
      duration: string;
      streamUrl: string;
    }[] = [];
    const vod = item as VodItem;
    if (vod.seasons && vod.seasons.length > 0) {
      for (const s of vod.seasons) {
        if (s.episodes && s.episodes.length > 0) {
          for (const ep of s.episodes) {
            epList.push({
              seasonNumber: s.seasonNumber,
              episodeNumber: ep.episodeNumber,
              title: ep.title,
              duration: ep.duration,
              streamUrl: ep.streamUrl
            });
          }
        }
      }
    }
    if (epList.length === 0) {
      const defaultUrl = vod.streamUrl || vod.backupStreamUrl || '';
      for (let i = 1; i <= 6; i++) {
        epList.push({
          seasonNumber: 1,
          episodeNumber: i,
          title: `Episódio ${i}`,
          duration: '48m',
          streamUrl: defaultUrl
        });
      }
    }
    return epList;
  }, [item, isSeries]);

  const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState<number>(() => {
    if (!isSeries) return 0;
    const vod = item as VodItem;
    if (vod.activeEpisodeNumber) {
      const idx = seriesEpisodes.findIndex(
        e => e.episodeNumber === vod.activeEpisodeNumber &&
             (!vod.activeSeasonNumber || e.seasonNumber === vod.activeSeasonNumber)
      );
      if (idx !== -1) return idx;
    }
    if (vod.streamUrl) {
      const idx = seriesEpisodes.findIndex(e => e.streamUrl === vod.streamUrl);
      if (idx !== -1) return idx;
    }
    return 0;
  });

  useEffect(() => {
    if (isSeries) {
      const vod = item as VodItem;
      let target = 0;
      if (vod.activeEpisodeNumber) {
        const idx = seriesEpisodes.findIndex(
          e => e.episodeNumber === vod.activeEpisodeNumber &&
               (!vod.activeSeasonNumber || e.seasonNumber === vod.activeSeasonNumber)
        );
        if (idx !== -1) target = idx;
      } else if (vod.streamUrl) {
        const idx = seriesEpisodes.findIndex(e => e.streamUrl === vod.streamUrl);
        if (idx !== -1) target = idx;
      }
      setCurrentEpisodeIndex(target);
    }
  }, [item, isSeries, seriesEpisodes]);

  const currentEpisode = isSeries ? (seriesEpisodes[currentEpisodeIndex] || seriesEpisodes[0]) : null;
  const nextEpisode = isSeries && currentEpisodeIndex < seriesEpisodes.length - 1
    ? seriesEpisodes[currentEpisodeIndex + 1]
    : null;

  // Autopilot (Piloto Automático) State: only applicable for series
  const [isAutopilotEnabled, setIsAutopilotEnabled] = useState<boolean>(() => {
    if (isSeries && (item as VodItem).autoPilotEnabled !== undefined) {
      return (item as VodItem).autoPilotEnabled!;
    }
    const saved = localStorage.getItem('maxtv_series_autopilot');
    return saved !== 'false'; // Default to true
  });

  const [autopilotCountdown, setAutopilotCountdown] = useState<number | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasAutoTriggeredRef = useRef<boolean>(false);

  // Build unified sources list with protocol metadata e priorização de CDN Brasil com menor latência
  const sources: { name: string; url: string; referer?: string; quality?: string; protocol?: 'hls' | 'dash' | 'mp4'; isBrazilCdn?: boolean }[] = React.useMemo(() => {
    if (type === 'channel') {
      const list = (item as Channel).sources.map((s, idx) => {
        const isDashUrl = s.url.includes('.mpd');
        const isBr = isBrazilHostedUrl(s.url);
        return {
          name: isBr
            ? `Servidor ${idx + 1} (CDN Brasil • Baixa Latência)`
            : `Servidor ${idx + 1} (${isDashUrl ? 'DASH' : 'HLS'} ${s.quality || '1080p'})`,
          url: s.url,
          referer: s.referer,
          quality: s.quality || '1080p',
          protocol: (isDashUrl ? 'dash' : 'hls') as 'dash' | 'hls',
          isBrazilCdn: isBr
        };
      });

      // Priorização de fontes: servidores com CDN brasileira no topo
      if (list.length > 1) {
        return [...list].sort((a, b) => {
          if (a.isBrazilCdn && !b.isBrazilCdn) return -1;
          if (!a.isBrazilCdn && b.isBrazilCdn) return 1;
          return 0;
        });
      }
      return list;
    }

    const vod = item as VodItem;
    if (vod.sources && vod.sources.length > 0) {
      return vod.sources.map(s => {
        const isDashUrl = s.url.includes('.mpd');
        const isHlsUrl = s.url.includes('.m3u8');
        const isBr = isBrazilHostedUrl(s.url);
        return {
          name: isBr ? `${s.name} (CDN Brasil)` : s.name,
          url: s.url,
          quality: s.quality || '1080p',
          protocol: isDashUrl ? 'dash' : (isHlsUrl ? 'hls' : 'mp4'),
          isBrazilCdn: isBr
        };
      });
    }

    const effectiveStreamUrl = (isSeries && currentEpisode?.streamUrl)
      ? currentEpisode.streamUrl
      : vod.streamUrl;

    const list: { name: string; url: string; quality?: string; protocol?: 'hls' | 'dash' | 'mp4'; isBrazilCdn?: boolean }[] = [
      { 
        name: 'Servidor 1 - Alta Velocidade (CDN)', 
        url: effectiveStreamUrl, 
        quality: '1080p', 
        protocol: effectiveStreamUrl.includes('.mpd') ? 'dash' : (effectiveStreamUrl.includes('.m3u8') ? 'hls' : 'mp4'),
        isBrazilCdn: isBrazilHostedUrl(effectiveStreamUrl)
      }
    ];
    if (vod.backupStreamUrl) {
      list.push({ 
        name: 'Servidor 2 - Backup Alternativo', 
        url: vod.backupStreamUrl, 
        quality: '1080p', 
        protocol: vod.backupStreamUrl.includes('.mpd') ? 'dash' : (vod.backupStreamUrl.includes('.m3u8') ? 'hls' : 'mp4'),
        isBrazilCdn: isBrazilHostedUrl(vod.backupStreamUrl)
      });
    }
    return list;
  }, [item, type, isSeries, currentEpisode]);

  const currentSource = sources[currentSourceIndex] || sources[0];

  // Resolve rawUrl adapting protocol when Compatibility Mode is toggled
  const rawUrl = React.useMemo(() => {
    const base = currentSource?.url || '';
    if (type === 'vod' || base.includes('.mp4') || base.includes('.webm')) {
      return base;
    }
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
  }, [currentSource, compatibilityProtocol, type]);

  // By default, IPTV channels, HTTP streams, and M3U8/MPD route through /api/proxy
  // to avoid CORS, Mixed Content (HTTP on HTTPS), and Referer blocks.
  const needsProxy = React.useMemo(() => {
    if (!rawUrl) return false;
    // Already routed through /api/proxy: do not double-wrap
    if (rawUrl.startsWith('/api/proxy')) return false;
    // Local / relative assets (e.g. /public/demo.mp4) do not need proxy
    if (rawUrl.startsWith('/') && !rawUrl.startsWith('//')) return false;
    // External streams (http:// or https://) must route through /api/proxy
    return true;
  }, [rawUrl]);

  const [forceProxy, setForceProxy] = useState<boolean | null>(null);
  const usingProxy = forceProxy !== null ? forceProxy : needsProxy;

  const streamUrl = React.useMemo(() => {
    if (!rawUrl) return '';

    // If rawUrl already starts with /api/proxy, clean and return without double-wrapping
    if (rawUrl.startsWith('/api/proxy')) {
      let base = rawUrl;
      if (currentSource?.referer && !base.includes('referer=')) {
        const sep = base.includes('?') ? '&' : '?';
        base += `${sep}referer=${encodeURIComponent(currentSource.referer)}`;
      }
      if (reloadCounter > 0) {
        const sep = base.includes('?') ? '&' : '?';
        base += `${sep}_rt=${reloadCounter}`;
      }
      return base;
    }

    // Wrap external URLs into /api/proxy when usingProxy is enabled
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

  // Mecanismo de failover automático para players: detecta falhas e alterna entre múltiplas fontes
  const triggerAutomaticFailover = useCallback((reason: string): boolean => {
    failedSourcesSetRef.current.add(currentSourceIndex);

    const currentFailedSource = sources[currentSourceIndex];
    if (currentFailedSource?.url) {
      api.recordStreamTelemetry({
        url: currentFailedSource.url,
        success: false,
        error: reason,
        channelId: (item as any)?.id,
        channelName: (item as any)?.name
      }).catch(() => {});
    }

    // Identifica se há outra fonte configurada que ainda não falhou
    let nextIndex = -1;
    for (let i = 0; i < sources.length; i++) {
      if (!failedSourcesSetRef.current.has(i)) {
        nextIndex = i;
        break;
      }
    }

    if (nextIndex !== -1 && nextIndex !== currentSourceIndex) {
      streamLoadStartTimeRef.current = Date.now();
      setIsLoading(false);
      setHasError(false);
      setIsTimedOut(false);
      setIsConnectionUnstable(false);
      setStreamWarning(null);
      autoRetryCountRef.current = 0;
      setCurrentSourceIndex(nextIndex);
      setReloadCounter(c => c + 1);
      return true;
    }

    // Se todas as fontes falharam, mas ainda não testou o Proxy Acelerado Brasil
    if (!usingProxy) {
      setForceProxy(true);
      failedSourcesSetRef.current.clear();
      streamLoadStartTimeRef.current = Date.now();
      setCurrentSourceIndex(0);
      setIsLoading(false);
      setHasError(false);
      setIsTimedOut(false);
      setIsConnectionUnstable(false);
      setStreamWarning(null);
      autoRetryCountRef.current = 0;
      setReloadCounter(c => c + 1);
      return true;
    }

    // Se todas as fontes falharam via Proxy, tenta conexão direta como último recurso
    if (usingProxy && forceProxy !== false) {
      setForceProxy(false);
      failedSourcesSetRef.current.clear();
      streamLoadStartTimeRef.current = Date.now();
      setCurrentSourceIndex(0);
      setIsLoading(false);
      setHasError(false);
      setIsTimedOut(false);
      setIsConnectionUnstable(false);
      setStreamWarning(null);
      autoRetryCountRef.current = 0;
      setReloadCounter(c => c + 1);
      return true;
    }

    return false;
  }, [sources, currentSourceIndex, usingProxy, forceProxy, item]);

  // Lógica de Reconexão Silenciosa no Background (Overlay-Free e sem feedbacks visuais intrusivos)
  const silentReconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const silentReconnectCountRef = useRef<number>(0);
  const [isSilentlyReconnecting, setIsSilentlyReconnecting] = useState<boolean>(false);

  const triggerSilentReconnect = useCallback((reason: string) => {
    setIsSilentlyReconnecting(true);
    setHasError(false);
    setIsLoading(false);
    setIsConnectionUnstable(false);
    setStreamWarning(null);

    // 1. Tenta failover silencioso para outro servidor se disponível
    if (sources.length > 1) {
      const switched = triggerAutomaticFailover(reason);
      if (switched) return;
    }

    // 2. Se já tentou fontes ou só tem uma, agenda tentativa silenciosa no background
    if (silentReconnectTimerRef.current) {
      clearTimeout(silentReconnectTimerRef.current);
    }

    silentReconnectCountRef.current += 1;
    const delay = Math.min(5000, 1500 + (silentReconnectCountRef.current * 1000));

    silentReconnectTimerRef.current = setTimeout(() => {
      setHasError(false);
      setIsLoading(false);
      setReloadCounter(c => c + 1);
    }, delay);
  }, [sources.length, triggerAutomaticFailover]);

  const triggerSilentReconnectRef = useRef(triggerSilentReconnect);
  triggerSilentReconnectRef.current = triggerSilentReconnect;

  // Interrompe o vídeo, limpa cache/buffers do player e exibe o modal de assinatura ou login
  const terminatePlayerAndClearCache = useCallback(() => {
    setIsPlaying(false);
    setIsFiveMinLimitReached(true);

    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      } catch (e) {}
    }
    if (hlsRef.current) {
      try {
        hlsRef.current.stopLoad();
        hlsRef.current.detachMedia();
        hlsRef.current.destroy();
      } catch (e) {}
      hlsRef.current = null;
    }
    if (mpegtsRef.current) {
      try {
        mpegtsRef.current.pause();
        mpegtsRef.current.unload();
        mpegtsRef.current.detachMediaElement();
        mpegtsRef.current.destroy();
      } catch (e) {}
      mpegtsRef.current = null;
    }
    if (dashPlayerRef.current) {
      try {
        dashPlayerRef.current.reset();
      } catch (e) {}
      dashPlayerRef.current = null;
    }

    // Exibe o modal de autenticação ou assinatura para o usuário
    if (!currentUser && onOpenAuth) {
      onOpenAuth();
    } else if (onOpenCheckout) {
      onOpenCheckout();
    }
  }, [currentUser, onOpenAuth, onOpenCheckout]);

  // 5-minute guest watch timer (300 segundos sem reiniciar para usuários não VIP)
  useEffect(() => {
    if (isVip) {
      setIsFiveMinLimitReached(false);
      return;
    }

    if (isFiveMinLimitReached) return;

    const interval = setInterval(() => {
      if (isPlaying && !isFiveMinLimitReached) {
        setGuestWatchSeconds(prev => {
          const next = prev + 1;
          if (next >= 300) { // 5 minutos = 300s
            terminatePlayerAndClearCache();
          }
          return next;
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlaying, isVip, isFiveMinLimitReached, terminatePlayerAndClearCache]);

  // Session heartbeat: tracks watch time & syncs with database
  useEffect(() => {
    const sendHeartbeat = async (reset = false) => {
      try {
        const res = await api.sessionHeartbeat({
          sessionId,
          mediaId: item.id,
          mediaType: type,
          isVip,
          deltaSeconds: reset ? 0 : 15,
          userEmail: currentUser?.email,
          resetCycle: reset
        });
        if (res && res.isLimitExceeded && !isVip) {
          terminatePlayerAndClearCache();
        }
      } catch (err) {
        // Ignored in production
      }
    };

    if (!isVip && isPlaying && !isFiveMinLimitReached) {
      const hbTimer = setInterval(() => {
        sendHeartbeat(false);
      }, 15000);
      return () => clearInterval(hbTimer);
    }
  }, [sessionId, item.id, type, isVip, isPlaying, isFiveMinLimitReached, currentUser]);

  // Handler for restarting transmission after 5 min limit
  const handleRestartPlayback = () => {
    setGuestWatchSeconds(0);
    setIsFiveMinLimitReached(false);
    setIsLoading(true);

    api.sessionHeartbeat({
      sessionId,
      mediaId: item.id,
      mediaType: type,
      isVip: false,
      deltaSeconds: 0,
      resetCycle: true
    }).catch(() => {});

    const video = videoRef.current;
    if (video) {
      if (type === 'vod') {
        video.currentTime = 0;
      }
      video.play().then(() => {
        setIsPlaying(true);
        setIsLoading(false);
        showToast('Transmissão reiniciada com sucesso! Mais 5 minutos liberados.');
      }).catch(() => {
        setReloadCounter(c => c + 1);
      });
    } else {
      setReloadCounter(c => c + 1);
    }
  };

  /**
   * Função checkChannelHealth: valida o status HTTP do stream usando fetch com o método HEAD
   * antes mesmo de carregar o vídeo, para identificar links mortos instantaneamente.
   * Se a conexão exceder 10 segundos ou retornar status HTTP >= 400, indica instabilidade/erro.
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
    const timeoutId = setTimeout(() => controller.abort(), 10000);

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
      const isUnstable = latency > 10000 || !isOnline;

      setConnectionLatency(latency);

      if (isDead) {
        setIsConnectionUnstable(true);
        setStreamWarning(`Link morto detectado via HTTP HEAD (${statusCode}). O servidor recusou a conexão.`);
        return { online: false, isUnstable: true, latencyMs: latency, statusCode, isDead: true };
      }

      if (isUnstable) {
        setIsConnectionUnstable(true);
        setStreamWarning(`Latência de resposta: ${latency}ms (acima de 10s). Conexão instável.`);
        return { online: isOnline, isUnstable: true, latencyMs: latency, statusCode, isDead: false };
      }

      setIsConnectionUnstable(false);
      setStreamWarning(null);
      return { online: true, isUnstable: false, latencyMs: latency, statusCode, isDead: false };
    } catch (err: any) {
      clearTimeout(timeoutId);
      const latency = Math.round(performance.now() - startTime);
      setIsConnectionUnstable(true);
      setConnectionLatency(latency >= 10000 ? latency : 10000);
      setStreamWarning('Sinal instável: tempo de resposta da conexão HEAD excedeu 10 segundos.');
      return { online: false, isUnstable: true, latencyMs: latency, isDead: true };
    } finally {
      setIsCheckingHealth(false);
    }
  }, [rawUrl, streamUrl, isLocked, currentSource]);

  // Botão Reportar Erro: registra o status do canal no log administrativo para verificação rápida da grade
  const handleReportError = async (customReason?: string) => {
    try {
      const channelName = 'name' in item ? item.name : (item as any).title;
      const defaultReason = isTimedOut
        ? 'Timeout de 10s na inicialização do vídeo (evento canplay não disparou)'
        : isConnectionUnstable
          ? `Conexão Instável (latência de resposta ${connectionLatency > 0 ? `${connectionLatency}ms` : '> 10s'})`
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

  // Reportar canal como offline quando a conexão exceder 10 segundos
  const handleReportOffline = () => {
    handleReportError('Canal reportado como OFFLINE pelo usuário (Conexão excedeu 10s)');
  };

  // Manual on-demand health check
  const runManualHealthCheck = async () => {
    showToast('Executando diagnóstico de conexão do sinal (limite 10s)...');
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

  // Monitoramento de conectividade de rede do navegador (Online / Offline)
  useEffect(() => {
    const handleOnline = () => {
      setIsNetworkOnline(true);
      // Reconexão silenciosa imediata no background sem mensagens visuais
      triggerSilentReconnectRef.current('Conexão de rede restabelecida');
    };

    const handleOffline = () => {
      setIsNetworkOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleForceReload = () => {
    autoRetryCountRef.current = 0;
    setAutoRetryCount(0);
    if (silentReconnectTimerRef.current) {
      clearTimeout(silentReconnectTimerRef.current);
      silentReconnectTimerRef.current = null;
    }
    silentReconnectCountRef.current = 0;
    setIsSilentlyReconnecting(false);

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
    setIsLoading(false);
    setStreamWarning(null);
    setIsConnectionUnstable(false);
    setHasReportedError(false);
    setReloadCounter(prev => prev + 1);
  };

  const toggleAutoRetryPause = () => {
    if (isAutoRetryPaused) {
      isAutoRetryPausedRef.current = false;
      setIsAutoRetryPaused(false);
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

  // Main video loader with pre-flight HEAD check & 10s timeout with up to 3 automatic retries
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
      const hasHlsExt = streamUrl.includes('.m3u8') || rawUrl.includes('.m3u8') || streamUrl.includes('.m3u') || rawUrl.includes('.m3u');
      const hasDashExt = streamUrl.includes('.mpd') || rawUrl.includes('.mpd');
      const hasMp4Ext = rawUrl.includes('.mp4') || streamUrl.includes('.mp4') || rawUrl.includes('.webm') || streamUrl.includes('.mkv');

      const isDash = compatibilityProtocol === 'dash' || (!hasHlsExt && hasDashExt);
      const isHls = !isDash && (compatibilityProtocol === 'hls' || hasHlsExt || (!hasMp4Ext && type === 'channel'));
      const isMp4 = !isDash && !isHls && (hasMp4Ext || type === 'vod');
      const isTs = !isMp4 && !isDash && !isHls && (streamUrl.includes('.ts') || rawUrl.includes('.ts'));

      // 1. Diagnóstico não-bloqueante de latência em segundo plano (início instantâneo na TV Box e sem falsos positivos)
      if (!isMp4 && rawUrl) {
        checkChannelHealth(rawUrl).then(health => {
          if (!isCancelled && health.isUnstable) {
            setIsConnectionUnstable(true);
          }
        }).catch(() => {});
      }

      // Timeout assíncrono (15s para VOD/filmes, 10s para canais ao vivo)
      const timeoutLimit = isMp4 ? 15000 : 10000;
      canPlayTimeoutRef.current = setTimeout(() => {
        if (!hasCanPlayFiredRef.current && !isCancelled) {

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

          // Timeout de inicialização: aciona reconexão silenciosa no background sem overlays
          triggerSilentReconnectRef.current('Tempo limite esgotado');
        }
      }, timeoutLimit);

      // Proceder com a montagem do player MP4 Nativo / Dash / Hls / Ts
      if (isMp4) {
        setIsLoading(true);
        video.src = streamUrl;
        video.load();

        const handleCanPlay = () => {
          hasCanPlayFiredRef.current = true;
          if (canPlayTimeoutRef.current) {
            clearTimeout(canPlayTimeoutRef.current);
            canPlayTimeoutRef.current = null;
          }
          setIsLoading(false);
          setHasError(false);
          setIsTimedOut(false);
          setIsConnectionUnstable(false);
          setStreamWarning(null);
        };

        video.addEventListener('canplay', handleCanPlay, { once: true });
        video.addEventListener('loadeddata', handleCanPlay, { once: true });

        video.play().then(() => {
          setIsPlaying(true);
          setIsLoading(false);
        }).catch(() => {
          setIsLoading(false);
        });

        if (initialSeekTime && initialSeekTime > 0) {
          video.currentTime = initialSeekTime;
        }
      } else if (isDash) {
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

          dashPlayer.on(dashjs.MediaPlayer.events.PLAYBACK_STALLED, () => {
            // Reprodução aguardando buffer
          });

          dashPlayer.on(dashjs.MediaPlayer.events.BUFFER_EMPTY, () => {
            // Silencioso sem overlay
          });

          dashPlayer.on(dashjs.MediaPlayer.events.BUFFER_LOADED, () => {
            setIsLoading(false);
          });

          dashPlayer.on(dashjs.MediaPlayer.events.ERROR, () => {
            triggerSilentReconnectRef.current('Erro protocolo DASH');
          });
        } catch (err) {
          video.src = streamUrl;
          video.play().catch(() => setIsPlaying(false));
        }
      } else if (isHls && Hls.isSupported()) {
        // Gerenciador de buffer dinâmico anti-travamento adaptado para redes do Brasil
        const netMetrics = getBrowserNetworkMetrics();
        const initialBufferConfig = calculateDynamicBufferProfile({
          downlinkMbps: netMetrics.downlinkMbps,
          rttMs: netMetrics.rttMs,
          effectiveType: netMetrics.effectiveType,
          measuredThroughputMbps: lastFragSpeedMbpsRef.current,
          lastMeasuredLatencyMs: connectionLatency,
          recentStallsCount: recentStallsRef.current,
        });
        setActiveBufferProfileLabel(initialBufferConfig.profileLabel);

        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: initialBufferConfig.backBufferLength,
          maxBufferLength: initialBufferConfig.maxBufferLength,
          maxMaxBufferLength: initialBufferConfig.maxMaxBufferLength,
          maxBufferSize: initialBufferConfig.maxBufferSize,
          liveSyncDurationCount: initialBufferConfig.liveSyncDurationCount,
          liveMaxLatencyDurationCount: initialBufferConfig.liveMaxLatencyDurationCount,
          startFragPrefetch: true,
          progressive: true,
          highBufferWatchdogPeriod: 2,
          nudgeOffset: 0.2,
          nudgeMaxRetry: 10,
          manifestLoadingTimeOut: 15000,
          manifestLoadingMaxRetry: 4,
          fragLoadingTimeOut: initialBufferConfig.fragLoadingTimeOutMs,
          fragLoadingMaxRetry: initialBufferConfig.fragLoadingMaxRetry,
          levelLoadingTimeOut: 15000,
        });

        hlsRef.current = hls;
        hls.loadSource(streamUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.FRAG_LOADED, (event, data) => {
          const fragData = data as any;
          const stats = fragData?.frag?.stats || fragData?.stats;
          if (stats) {
            const durationMs = (stats.tload || 0) - (stats.trequest || 0);
            const loadedBytes = stats.loaded || stats.total || 0;
            if (durationMs > 0 && loadedBytes > 0) {
              const speedMbps = (loadedBytes * 8) / (durationMs * 1000);
              lastFragSpeedMbpsRef.current = speedMbps;
              
              const updatedNet = getBrowserNetworkMetrics();
              const dynamicCfg = calculateDynamicBufferProfile({
                downlinkMbps: updatedNet.downlinkMbps,
                rttMs: updatedNet.rttMs,
                effectiveType: updatedNet.effectiveType,
                measuredThroughputMbps: speedMbps,
                lastMeasuredLatencyMs: connectionLatency,
                recentStallsCount: recentStallsRef.current,
              });

              applyDynamicBufferToHls(hls, dynamicCfg);
              setActiveBufferProfileLabel(dynamicCfg.profileLabel);
            }
          }
        });

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

          // Detect embedded HLS subtitle tracks if available
          if (hls.subtitleTracks && hls.subtitleTracks.length > 0) {
            const hlsTracks: SubtitleTrackOption[] = hls.subtitleTracks.map((st, idx) => ({
              id: `hls-sub-${idx}`,
              label: st.name || (st.lang ? `Embarcada (${st.lang.toUpperCase()})` : `Faixa ${idx + 1}`),
              language: st.lang || 'und',
              isHls: true,
              hlsIndex: idx
            }));
            setAvailableSubtitleTracks(prev => {
              const nonHls = prev.filter(p => !p.isHls);
              return [...hlsTracks, ...nonHls];
            });
          }

          video.play().catch(() => {
            setIsPlaying(false);
          });
        });

        hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (event, data) => {
          if (data.subtitleTracks && data.subtitleTracks.length > 0) {
            const hlsTracks: SubtitleTrackOption[] = data.subtitleTracks.map((st, idx) => ({
              id: `hls-sub-${idx}`,
              label: st.name || (st.lang ? `Embarcada (${st.lang.toUpperCase()})` : `Faixa ${idx + 1}`),
              language: st.lang || 'und',
              isHls: true,
              hlsIndex: idx
            }));
            setAvailableSubtitleTracks(prev => {
              const nonHls = prev.filter(p => !p.isHls);
              return [...hlsTracks, ...nonHls];
            });
          }
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, () => {
          // Level switched silently
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
          if (!data.fatal && (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR || data.details === Hls.ErrorDetails.BUFFER_SEEK_OVER_HOLE || data.details === Hls.ErrorDetails.BUFFER_NUDGE_ON_STALL)) {
            recentStallsRef.current += 1;
            if (hls.config) {
              hls.config.maxBufferLength = Math.min(130, (hls.config.maxBufferLength || 60) + 20);
              hls.config.liveSyncDurationCount = Math.min(10, (hls.config.liveSyncDurationCount || 5) + 1);
            }
            return;
          }

          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                if (autoRetryCountRef.current < 2) {
                  autoRetryCountRef.current += 1;
                  try {
                    hls.startLoad();
                  } catch (e) {
                    triggerSilentReconnectRef.current('Erro de rede HLS');
                  }
                } else {
                  autoRetryCountRef.current = 0;
                  try {
                    hls.destroy();
                  } catch (e) {}
                  triggerSilentReconnectRef.current('Falha de rede persistente HLS');
                }
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                try {
                  hls.recoverMediaError();
                } catch {
                  triggerSilentReconnectRef.current('Erro de mídia HLS');
                }
                break;
              default:
                try {
                  hls.destroy();
                } catch (e) {}
                triggerSilentReconnectRef.current('Falha geral HLS');
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

          player.on(mpegts.Events.ERROR, () => {
            triggerSilentReconnectRef.current('Erro MPEG-TS');
          });
        } catch (err) {
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
        }).catch(() => {
          triggerSilentReconnectRef.current('Erro reprodução direta');
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
      if (silentReconnectTimerRef.current) {
        clearTimeout(silentReconnectTimerRef.current);
        silentReconnectTimerRef.current = null;
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

  // Detecção e eventos de Transmissão para TV (Chromecast / Google RemotePlayback / Apple AirPlay)
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    // Inscrição no serviço Google Cast SDK e DLNA
    const unsubscribeCast = castService.subscribe((state, device) => {
      setCastState(state);
      if (state === 'connected' && device) {
        showToast(`Transmitindo na TV: ${device.name}`);
      }
    });

    // RemotePlayback API (Google Chrome, Edge, Android)
    const remote = (v as any).remote;
    if (remote) {
      setIsCastSupported(true);
      const updateCastState = () => {
        const s = remote.state || 'disconnected';
        setCastState(s);
        if (s === 'connected') {
          showToast('Transmitindo na TV');
        } else if (s === 'disconnected') {
          showToast('Transmissão na TV desconectada');
        }
      };
      updateCastState();
      try {
        remote.addEventListener('connecting', updateCastState);
        remote.addEventListener('connect', updateCastState);
        remote.addEventListener('disconnect', updateCastState);
      } catch {
        // ignore
      }

      return () => {
        unsubscribeCast();
        try {
          remote.removeEventListener('connecting', updateCastState);
          remote.removeEventListener('connect', updateCastState);
          remote.removeEventListener('disconnect', updateCastState);
        } catch {
          // ignore
        }
      };
    }

    return () => {
      unsubscribeCast();
    };

    // WebKit AirPlay API (Safari / macOS / iOS)
    if (typeof (v as any).webkitShowPlaybackTargetPicker === 'function') {
      setIsAirPlaySupported(true);
      const onTargetAvailabilityChange = (e: any) => {
        if (e.availability === 'available') {
          setIsAirPlaySupported(true);
        }
      };
      v.addEventListener('webkitplaybacktargetavailabilitychanged', onTargetAvailabilityChange);
      return () => {
        v.removeEventListener('webkitplaybacktargetavailabilitychanged', onTargetAvailabilityChange);
      };
    }
  }, [showToast]);

  const triggerNativeCast = useCallback(async (): Promise<boolean> => {
    const v = videoRef.current;
    const mediaTitle = 'name' in item ? item.name : (item as any).title;
    const mediaLogo = 'logo' in item ? item.logo : 'posterUrl' in item ? item.posterUrl : undefined;

    // 1. Tenta o Google Cast SDK Oficial (Chromecast / Google TV / Android TV)
    try {
      const castSuccess = await castService.requestGoogleCastSession({
        title: mediaTitle,
        streamUrl,
        mediaType: type,
        posterUrl: mediaLogo,
        currentTime: v?.currentTime || 0
      }, v);

      if (castSuccess) {
        showToast('Transmitindo na TV via Google Cast!');
        return true;
      }
    } catch (castErr) {
      console.warn('[LivePlayer] Google Cast falhou ou cancelado:', castErr);
    }

    if (!v) return false;

    // 2. Tenta API W3C Remote Playback (Chrome / Edge / Android / Smart TV)
    const remote = (v as any).remote;
    if (remote && typeof remote.prompt === 'function') {
      try {
        showToast('Buscando dispositivos para transmitir...');
        await remote.prompt();
        return true;
      } catch (err: any) {
        if (err?.name !== 'NotFoundError' && err?.name !== 'AbortError') {
          // Permite que o modal continue aberto para opções alternativas
        }
      }
    }

    // 3. Tenta Apple AirPlay (Safari / Apple TV / iPhone / iPad / Mac)
    if (typeof (v as any).webkitShowPlaybackTargetPicker === 'function') {
      try {
        (v as any).webkitShowPlaybackTargetPicker();
        showToast('Abrindo seletor Apple AirPlay...');
        return true;
      } catch {
        // ignore
      }
    }

    return false;
  }, [item, streamUrl, type, showToast]);

  const disconnectCast = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const remote = (v as any).remote;
    if (remote && typeof remote.disconnect === 'function') {
      try {
        remote.disconnect();
      } catch {
        // ignore
      }
    }
    setCastState('disconnected');
    showToast('Transmissão na TV desconectada');
  }, [showToast]);

  // Video event handlers
  const handleVideoError = () => {
    triggerSilentReconnectRef.current('Erro no elemento de vídeo');
  };

  // Series Autopilot (Piloto Automático) Episode Switcher
  const playNextEpisode = useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setAutopilotCountdown(null);
    hasAutoTriggeredRef.current = false;

    if (isSeries && nextEpisode) {
      const nextIdx = currentEpisodeIndex + 1;
      setCurrentEpisodeIndex(nextIdx);
      setCurrentTime(0);
      hasAppliedInitialSeekRef.current = true;
      setIsLoading(true);
      setHasError(false);
      showToast(`Iniciando T${nextEpisode.seasonNumber}:E${nextEpisode.episodeNumber} - ${nextEpisode.title}`);

      if (videoRef.current) {
        videoRef.current.currentTime = 0;
      }
    }
  }, [isSeries, nextEpisode, currentEpisodeIndex, showToast]);

  const startNextEpisodeCountdown = useCallback((initialSeconds: number = 5) => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    hasAutoTriggeredRef.current = true;
    const startSec = Math.max(1, Math.min(8, initialSeconds));
    setAutopilotCountdown(startSec);

    countdownTimerRef.current = setInterval(() => {
      setAutopilotCountdown(prev => {
        if (prev === null || prev <= 1) {
          if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          playNextEpisode();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, [playNextEpisode]);

  const cancelAutopilotCountdown = useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setAutopilotCountdown(null);
    showToast('Avanço automático cancelado.');
  }, [showToast]);

  const toggleAutopilot = useCallback(() => {
    setIsAutopilotEnabled(prev => {
      const nextVal = !prev;
      localStorage.setItem('maxtv_series_autopilot', String(nextVal));
      if (!nextVal && countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
        setAutopilotCountdown(null);
      }
      showToast(nextVal 
        ? 'Piloto Automático ATIVADO: Ao fim do episódio, o próximo inicia sozinho!' 
        : 'Piloto Automático DESATIVADO.');
      return nextVal;
    });
  }, [showToast]);

  const playEpisodeByIndex = useCallback((idx: number) => {
    if (idx < 0 || idx >= seriesEpisodes.length) return;
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setAutopilotCountdown(null);
    hasAutoTriggeredRef.current = false;
    setCurrentEpisodeIndex(idx);
    setCurrentTime(0);
    hasAppliedInitialSeekRef.current = true;
    setIsLoading(true);
    setHasError(false);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
    }
    const targetEp = seriesEpisodes[idx];
    showToast(`Reproduzindo T${targetEp.seasonNumber}:E${targetEp.episodeNumber} - ${targetEp.title}`);
  }, [seriesEpisodes, showToast]);

  const handleVideoEnded = useCallback(() => {
    setIsPlaying(false);

    if (isSeries && nextEpisode) {
      if (isAutopilotEnabled) {
        startNextEpisodeCountdown(5);
      } else {
        showToast(`Fim do episódio. Próximo: T${nextEpisode.seasonNumber}:E${nextEpisode.episodeNumber}`);
      }
    } else if (isSeries && !nextEpisode) {
      showToast('Você concluiu todos os episódios desta série!');
    }
  }, [isSeries, nextEpisode, isAutopilotEnabled, startNextEpisodeCountdown, showToast]);

  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    };
  }, []);

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
          const vodItemToSave: VodItem = (isSeries && currentEpisode)
            ? {
                ...(item as VodItem),
                activeSeasonNumber: currentEpisode.seasonNumber,
                activeEpisodeNumber: currentEpisode.episodeNumber,
                activeEpisodeTitle: currentEpisode.title
              }
            : (item as VodItem);
          watchProgressStorage.saveProgress(
            vodItemToSave,
            time,
            video.duration || duration,
            currentUser?.email,
            authToken
          );
        }
      }

      // Series Piloto Automático: if within 8s of the end of the episode and playing
      if (
        isSeries &&
        isAutopilotEnabled &&
        nextEpisode &&
        (video.duration || duration) > 20 &&
        time > 0 &&
        (video.duration || duration) - time <= 8 &&
        autopilotCountdown === null &&
        !hasAutoTriggeredRef.current
      ) {
        startNextEpisodeCountdown(Math.ceil((video.duration || duration) - time));
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
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
    }
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
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
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
        showToast('Picture-in-Picture restaurado');
      } else if (document.pictureInPictureEnabled) {
        await video.requestPictureInPicture();
        setIsPiP(true);
        showToast('Picture-in-Picture ativado! Você pode navegar pelo catálogo.');
      } else if ((video as any).webkitSetPresentationMode) {
        // Suporte Safari / WebKit iOS/macOS
        const currentMode = (video as any).webkitPresentationMode;
        (video as any).webkitSetPresentationMode(currentMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture');
        setIsPiP(currentMode !== 'picture-in-picture');
      } else {
        showToast('Picture-in-Picture não suportado neste navegador.');
      }
    } catch (err: any) {
      console.warn('Erro ao alternar Picture-in-Picture:', err);
      showToast('Não foi possível ativar Picture-in-Picture.');
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
        const cleanName = ('title' in item ? (item as any).title : item.name).replace(/[^a-zA-Z0-9]/g, '_');
        a.download = `captura_${cleanName}_${Date.now()}.jpg`;
        a.href = dataUrl;
        a.click();
        showToast('Captura de tela salva com sucesso!');
      }
    } catch {
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

  // Subtitle Selection and Management Methods
  const handleSelectSubtitleTrack = async (trackId: string | null) => {
    if (!trackId) {
      setSelectedSubtitleTrackId(null);
      if (hlsRef.current) hlsRef.current.subtitleTrack = -1;
      showToast('Legendas desativadas');
      return;
    }

    const track = availableSubtitleTracks.find(t => t.id === trackId);
    if (!track) return;

    if (track.isHls && typeof track.hlsIndex === 'number') {
      if (hlsRef.current) hlsRef.current.subtitleTrack = track.hlsIndex;
      setSelectedSubtitleTrackId(trackId);
      showToast(`Legenda ativada: ${track.label}`);
      return;
    }

    // Disable embedded HLS track if custom/preset track is chosen
    if (hlsRef.current) hlsRef.current.subtitleTrack = -1;

    // Lazy load cues if not yet fetched
    if ((!track.cues || track.cues.length === 0) && track.sourceUrl) {
      try {
        showToast('Baixando faixa de legenda .vtt...');
        const loaded = await loadSubtitleFromUrl(track.sourceUrl, track.label);
        setAvailableSubtitleTracks(prev => prev.map(t => {
          if (t.id === trackId) {
            return {
              ...t,
              cues: loaded.cues,
              blobUrl: loaded.blobUrl
            };
          }
          return t;
        }));
        setSelectedSubtitleTrackId(trackId);
        showToast(`Legenda "${track.label}" ativada!`);
      } catch (err: any) {
        showToast(`Falha ao carregar legenda: ${err.message || 'Erro de rede'}`);
      }
    } else {
      setSelectedSubtitleTrackId(trackId);
      showToast(`Legenda "${track.label}" ativada!`);
    }
  };

  const processSubtitleFile = async (file: File) => {
    try {
      showToast('Carregando arquivo de legenda...');
      const result = await loadSubtitleFromFile(file);
      if (result.cues.length === 0) {
        showToast('Nenhuma fala de legenda válida encontrada no arquivo (.vtt/.srt).');
        return;
      }
      const newTrack: SubtitleTrackOption = {
        id: `custom-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        label: result.label,
        language: 'pt',
        isCustom: true,
        cues: result.cues,
        blobUrl: result.blobUrl
      };

      setAvailableSubtitleTracks(prev => [newTrack, ...prev]);
      setSelectedSubtitleTrackId(newTrack.id);
      if (hlsRef.current) hlsRef.current.subtitleTrack = -1;
      showToast(`Legenda "${result.label}" carregada com sucesso!`);
    } catch (err: any) {
      showToast(`Erro ao carregar legenda: ${err.message}`);
    }
  };

  const handleSubtitleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processSubtitleFile(file);
    e.target.value = '';
  };

  const handleLoadSubtitleUrl = async () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    try {
      setIsLoadingUrl(true);
      showToast('Carregando legenda por link...');
      const result = await loadSubtitleFromUrl(trimmed);
      if (result.cues.length === 0) {
        showToast('Nenhum trecho de legenda foi detectado no endereço informado.');
        return;
      }
      const newTrack: SubtitleTrackOption = {
        id: `custom-url-${Date.now()}`,
        label: `${result.label} (Web)`,
        language: 'pt',
        isCustom: true,
        sourceUrl: trimmed,
        cues: result.cues,
        blobUrl: result.blobUrl
      };

      setAvailableSubtitleTracks(prev => [newTrack, ...prev]);
      setSelectedSubtitleTrackId(newTrack.id);
      if (hlsRef.current) hlsRef.current.subtitleTrack = -1;
      setUrlInput('');
      setShowUrlInput(false);
      showToast(`Legenda remota carregada com sucesso!`);
    } catch (err: any) {
      showToast(`Erro ao baixar legenda da web: ${err.message}`);
    } finally {
      setIsLoadingUrl(false);
    }
  };

  const handleRemoveCustomTrack = (trackId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setAvailableSubtitleTracks(prev => prev.filter(t => t.id !== trackId));
    if (selectedSubtitleTrackId === trackId) {
      setSelectedSubtitleTrackId(null);
    }
    showToast('Faixa de legenda removida');
  };

  const adjustSubtitleOffset = (delta: number) => {
    setSubtitleStyle(prev => {
      const updated = {
        ...prev,
        offsetSeconds: Number((prev.offsetSeconds + delta).toFixed(1))
      };
      saveStoredSubtitleConfig(updated);
      return updated;
    });
    const nextOffset = Number((subtitleStyle.offsetSeconds + delta).toFixed(1));
    showToast(`Sincronização: ${nextOffset > 0 ? `+${nextOffset}` : nextOffset}s`);
  };

  const resetSubtitleOffset = () => {
    setSubtitleStyle(prev => {
      const updated = { ...prev, offsetSeconds: 0 };
      saveStoredSubtitleConfig(updated);
      return updated;
    });
    showToast('Sincronização redefinida para 0.0s');
  };

  const updateSubtitleConfig = (partial: Partial<SubtitleStyleConfig>) => {
    setSubtitleStyle(prev => {
      const updated = { ...prev, ...partial };
      saveStoredSubtitleConfig(updated);
      return updated;
    });
  };

  const getSubtitleFontSize = () => {
    switch (subtitleStyle.fontSize) {
      case 'small': return isFullscreen ? '18px' : '15px';
      case 'medium': return isFullscreen ? '24px' : '19px';
      case 'large': return isFullscreen ? '30px' : '24px';
      case 'extralarge': return isFullscreen ? '38px' : '30px';
      default: return '19px';
    }
  };

  const getSubtitleClasses = () => {
    let classes = '';
    if (subtitleStyle.fontColor === 'yellow') classes += ' text-yellow-300';
    else if (subtitleStyle.fontColor === 'cyan') classes += ' text-cyan-300';
    else classes += ' text-white';

    if (subtitleStyle.backgroundMode === 'translucent') {
      classes += ' bg-black/80 backdrop-blur-[2px] px-3.5 py-1 rounded-lg shadow-xl border border-white/10';
    } else if (subtitleStyle.backgroundMode === 'solid') {
      classes += ' bg-black px-3.5 py-1 rounded-lg shadow-2xl';
    } else {
      classes += ' px-2 py-0.5 rounded';
    }
    return classes;
  };

  const getSubtitleInlineStyles = (): React.CSSProperties => {
    if (subtitleStyle.backgroundMode === 'outline') {
      return {
        textShadow: '0 0 4px #000, 2px 2px 3px #000, -2px -2px 3px #000, 2px -2px 3px #000, -2px 2px 3px #000'
      };
    }
    return {
      textShadow: '0 1px 3px rgba(0,0,0,0.85)'
    };
  };

  // Drag & Drop handlers for subtitle files (.vtt / .srt)
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingFile) setIsDraggingFile(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingFile(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.vtt') || lower.endsWith('.srt') || file.type.includes('vtt') || file.type.includes('text')) {
        await processSubtitleFile(file);
      } else {
        showToast('Formato não suportado. Por favor, arraste um arquivo .vtt ou .srt');
      }
    }
  };

  // Memoized active subtitle track and active cues
  const activeSubtitleTrack = React.useMemo(() => {
    if (!selectedSubtitleTrackId) return null;
    return availableSubtitleTracks.find(t => t.id === selectedSubtitleTrackId) || null;
  }, [selectedSubtitleTrackId, availableSubtitleTracks]);

  const activeSubtitleCues = React.useMemo(() => {
    if (!activeSubtitleTrack || !activeSubtitleTrack.cues || activeSubtitleTrack.cues.length === 0) return [];
    return getActiveCues(activeSubtitleTrack.cues, currentTime, subtitleStyle.offsetSeconds);
  }, [activeSubtitleTrack, currentTime, subtitleStyle.offsetSeconds]);

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
        case 't':
          e.preventDefault();
          setIsCastModalOpen(prev => !prev);
          resetControlsTimer();
          break;
        case 'c':
          e.preventDefault();
          captureScreenshot();
          resetControlsTimer();
          break;
        case 'l':
          e.preventDefault();
          setActiveMenu(prev => prev === 'subtitles' ? null : 'subtitles');
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
        case 'n':
          if (isSeries && nextEpisode) {
            e.preventDefault();
            playNextEpisode();
            resetControlsTimer();
          }
          break;
        case 'enter':
          e.preventDefault();
          togglePlay();
          resetControlsTimer();
          break;
        case 'escape':
        case 'backspace':
          e.preventDefault();
          if (activeMenu) {
            setActiveMenu(null);
          } else {
            handleClose();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, toggleMute, toggleFullscreen, togglePiP, captureScreenshot, adjustVolumeBy, skipSeconds, type, activeMenu, resetControlsTimer, isSeries, nextEpisode, playNextEpisode, onClose]);

  // Preserva a posição exata de rolagem da navegação do usuário ao abrir e fechar o player
  useEffect(() => {
    const savedScrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    const savedScrollX = window.scrollX || window.pageXOffset || document.documentElement.scrollLeft || 0;

    return () => {
      // Retorna exatamente para onde o usuário estava navegando na página
      requestAnimationFrame(() => {
        window.scrollTo({
          top: savedScrollY,
          left: savedScrollX,
          behavior: 'instant' as ScrollBehavior
        });
      });
    };
  }, []);

  // Fecha o dropdown de servidores quando clicar fora do menu
  useEffect(() => {
    if (activeMenu !== 'sources') return;
    const handleOutsideMenuClick = (e: MouseEvent) => {
      if (serverDropdownRef.current && !serverDropdownRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideMenuClick);
    return () => document.removeEventListener('mousedown', handleOutsideMenuClick);
  }, [activeMenu]);

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
    <div 
      id="player-modal-backdrop"
      onClick={(e) => {
        // Clicar fora do reprodutor fecha o vídeo e retorna para a navegação
        if (!isPiP && (e.target === e.currentTarget || (e.target as HTMLElement)?.id === 'player-modal-backdrop')) {
          handleClose();
        }
      }}
      className={isPiP 
        ? "fixed bottom-5 right-5 z-50 pointer-events-auto" 
        : "fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-xl flex flex-col items-center justify-center p-2 sm:p-6 animate-fadeIn cursor-pointer"}
    >
      {/* Floating mini dock widget when Picture-in-Picture is active */}
      {isPiP && (
        <div 
          id="pip-floating-dock-card"
          className="w-80 sm:w-96 rounded-2xl bg-slate-900/95 border border-indigo-500/40 shadow-2xl p-3 flex items-center justify-between gap-3 backdrop-blur-xl animate-scaleUp text-white"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-slate-950 border border-white/10 p-1 flex items-center justify-center shrink-0">
              {('logo' in item && item.logo) ? (
                <img src={item.logo} alt={'name' in item ? item.name : (item as any).title} className="w-full h-full object-contain" />
              ) : (
                <Tv className="w-5 h-5 text-indigo-400" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] text-indigo-400 font-bold uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>PiP Ativo</span>
              </div>
              <h4 className="text-xs font-bold text-white truncate">{'name' in item ? item.name : (item as any).title}</h4>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={togglePlay}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              title={isPlaying ? 'Pausar' : 'Reproduzir'}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
            </button>
            <button
              type="button"
              onClick={togglePiP}
              className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer"
              title="Restaurar Player em Tela Cheia"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="p-2 rounded-xl bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white transition-colors cursor-pointer"
              title="Encerrar Transmissão"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      {/* Container */}
      <div 
        id="live-player-root"
        data-player-container="true"
        ref={containerRef}
        onClick={(e) => e.stopPropagation()}
        onMouseMove={resetControlsTimer}
        onMouseEnter={resetControlsTimer}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={isPiP 
          ? "live-player-clean w-1 h-1 opacity-0 pointer-events-none absolute overflow-hidden" 
          : "live-player-clean relative w-full max-w-6xl aspect-video bg-black rounded-3xl overflow-hidden border border-white/10 shadow-2xl flex items-center justify-center group select-none cursor-default"}
      >
        {/* Hidden File Input for Subtitles (.vtt / .srt) */}
        <input
          type="file"
          ref={subtitleFileInputRef}
          onChange={handleSubtitleFileInput}
          accept=".vtt,.srt,text/vtt,text/plain"
          className="hidden"
        />

        {/* Drag & Drop Subtitle File Overlay */}
        {isDraggingFile && (
          <div className="absolute inset-0 z-50 bg-indigo-950/90 border-2 border-dashed border-indigo-400 rounded-3xl flex flex-col items-center justify-center p-6 text-center backdrop-blur-md pointer-events-none animate-fadeIn">
            <div className="p-4 rounded-full bg-indigo-600/30 text-indigo-300 mb-3 animate-bounce">
              <Upload className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Solte o arquivo de legenda aqui</h3>
            <p className="text-xs text-indigo-200">Suporta arquivos WebVTT (.vtt) e SubRip (.srt)</p>
          </div>
        )}
        {/* 5-Minute Guest Limit Modal / Overlay */}
        {isFiveMinLimitReached && !isVip && (
          <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-6 text-center z-50 animate-fadeIn backdrop-blur-md">
            <div className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/30 mb-4 text-white">
              <Clock className="w-8 h-8 text-amber-300" />
            </div>
            <span className="text-xs uppercase font-bold tracking-wider text-indigo-400 mb-1">
              Tempo de Degustação Excedido (5 minutos)
            </span>
            <h3 className="text-2xl sm:text-3xl font-bold text-white mb-2 tracking-tight">
              Você assistiu 5 minutos sem reiniciar
            </h3>
            <p className="text-sm text-slate-300 max-w-lg mb-6 leading-relaxed">
              Aproveite acesso ilimitado a todos os canais ao vivo em Full HD/4K, filmes e séries sem anúncios por apenas <strong className="text-emerald-400 font-bold">R$ 10,00/mês</strong> em 1 dispositivo exclusivo. Ou reinicie a transmissão para mais 5 minutos de degustação.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={onOpenCheckout}
                className="flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-sm shadow-xl shadow-indigo-600/30 active:scale-95 transition-all cursor-pointer"
              >
                <Crown className="w-4 h-4 text-amber-300" />
                <span>Assinar VIP por R$ 10,00 (1 Dispositivo)</span>
              </button>

              <button
                type="button"
                onClick={handleRestartPlayback}
                className="flex items-center gap-2 px-6 py-3 rounded-full bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-sm font-semibold border border-emerald-500/40 hover:border-emerald-400 transition-all cursor-pointer"
              >
                <RotateCcw className="w-4 h-4 text-emerald-400" />
                <span>Reiniciar Transmissão (+5 minutos)</span>
              </button>

              {!currentUser && onOpenAuth && (
                <button
                  type="button"
                  onClick={onOpenAuth}
                  className="flex items-center gap-2 px-5 py-3 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-sm font-semibold border border-white/10 transition-colors cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  <span>Já é assinante? Entrar</span>
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="px-5 py-3 rounded-full bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold border border-white/10 transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        )}

        {/* Degustação Floating Pill for Non-VIP */}
        {!isVip && !isFiveMinLimitReached && (
          <div className="absolute top-4 left-4 z-30 flex items-center gap-2 bg-slate-900/80 backdrop-blur-md border border-amber-500/30 px-3 py-1.5 rounded-full text-xs text-white shadow-lg">
            <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span className="font-medium">
              Degustação: <strong className="text-amber-300 font-bold">{Math.max(0, 300 - guestWatchSeconds)}s restantes</strong>
            </span>
            <button
              type="button"
              onClick={onOpenCheckout}
              className="ml-1 px-2 py-0.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] transition-colors"
            >
              VIP R$ 10
            </button>
          </div>
        )}
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
                  src={(item as any).posterUrl || (item as any).bannerUrl || (item as any).logo}
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
              {...({ 'x-webkit-airplay': 'allow' } as any)}
              className={`w-full h-full cursor-pointer bg-black ${getAspectClass()} transition-all duration-700 ease-out ${
                hasError 
                  ? 'filter blur-xl brightness-[0.25] scale-[1.03] pointer-events-none' 
                  : 'filter-none brightness-100 scale-100'
              }`}
              onClick={togglePlay}
              onDoubleClick={toggleFullscreen}
              onEnded={handleVideoEnded}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onWaiting={() => {
                recentStallsRef.current += 1;
                if (hlsRef.current) {
                  const net = getBrowserNetworkMetrics();
                  const dyn = calculateDynamicBufferProfile({
                    downlinkMbps: net.downlinkMbps,
                    rttMs: net.rttMs,
                    effectiveType: net.effectiveType,
                    measuredThroughputMbps: lastFragSpeedMbpsRef.current,
                    lastMeasuredLatencyMs: connectionLatency,
                    recentStallsCount: recentStallsRef.current,
                  });
                  applyDynamicBufferToHls(hlsRef.current, dyn);
                  setActiveBufferProfileLabel(dyn.profileLabel);
                }
              }}
              onStalled={() => {
                // Silencioso no background - sem acionar overlays de carregamento
              }}
              onPlaying={() => { 
                hasCanPlayFiredRef.current = true;
                setIsSilentlyReconnecting(false);
                silentReconnectCountRef.current = 0;
                if (silentReconnectTimerRef.current) {
                  clearTimeout(silentReconnectTimerRef.current);
                  silentReconnectTimerRef.current = null;
                }
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
                failedSourcesSetRef.current.clear();
                setIsLoading(false); 
                setHasError(false); 
                setIsTimedOut(false);
                setStreamWarning(null); 
                setIsConnectionUnstable(false);
              }}
              onCanPlay={() => {
                hasCanPlayFiredRef.current = true;
                setIsSilentlyReconnecting(false);
                silentReconnectCountRef.current = 0;
                if (silentReconnectTimerRef.current) {
                  clearTimeout(silentReconnectTimerRef.current);
                  silentReconnectTimerRef.current = null;
                }
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

                // Telemetria de sucesso para ranqueamento dos links top funcionando
                const latency = Math.max(50, Date.now() - streamLoadStartTimeRef.current);
                if (currentSource?.url) {
                  api.recordStreamTelemetry({
                    url: currentSource.url,
                    success: true,
                    latencyMs: latency,
                    channelId: (item as any)?.id,
                    channelName: (item as any)?.name
                  }).catch(() => {});
                }
              }}
              onError={handleVideoError}
            >
              {activeSubtitleTrack?.blobUrl && (
                <track
                  kind="subtitles"
                  src={activeSubtitleTrack.blobUrl}
                  srcLang={activeSubtitleTrack.language || 'pt'}
                  label={activeSubtitleTrack.label}
                  default
                />
              )}
            </video>

            {/* Subtitle Cue Overlay (High-contrast, customizable styling and offset sync) */}
            {activeSubtitleTrack && activeSubtitleCues.length > 0 && (
              <div 
                className={`absolute inset-x-0 z-25 pointer-events-none flex flex-col items-center justify-end px-4 text-center select-none transition-all duration-200 ${
                  showControls ? 'bottom-24 sm:bottom-28' : 'bottom-10 sm:bottom-12'
                }`}
              >
                <div className="flex flex-col items-center gap-1.5 max-w-[92%] sm:max-w-[80%]">
                  {activeSubtitleCues.map((cue, idx) => (
                    <span
                      key={cue.id || idx}
                      className={`inline-block font-sans font-semibold leading-snug tracking-normal transition-opacity duration-150 ${getSubtitleClasses()}`}
                      style={{
                        fontSize: getSubtitleFontSize(),
                        ...getSubtitleInlineStyles()
                      }}
                    >
                      {cue.text.split('\n').map((line, lIdx) => (
                        <React.Fragment key={lIdx}>
                          {line}
                          {lIdx < cue.text.split('\n').length - 1 && <br />}
                        </React.Fragment>
                      ))}
                    </span>
                  ))}
                </div>
              </div>
            )}

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

            {/* Active Cast Floating Pill */}
            {castState === 'connected' && !toastMessage && (
              <button
                type="button"
                onClick={() => setIsCastModalOpen(true)}
                className="absolute top-16 left-1/2 -translate-x-1/2 z-40 bg-indigo-950/90 hover:bg-indigo-900 text-indigo-200 text-xs font-semibold px-4 py-1.5 rounded-full border border-indigo-400/40 shadow-xl backdrop-blur-md transition-all animate-fadeIn flex items-center gap-2 cursor-pointer active:scale-95"
                title="Transmitindo na TV. Clique para opções de transmissão."
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <Cast className="w-3.5 h-3.5 text-indigo-400" />
                <span>Transmitindo na TV</span>
              </button>
            )}

            {/* Series Autopilot (Piloto Automático) Next Episode Floating Card */}
            {autopilotCountdown !== null && nextEpisode && (
              <div 
                id="series-autopilot-countdown-overlay"
                className="absolute bottom-24 right-4 sm:right-8 z-45 max-w-xs sm:max-w-sm bg-slate-950/95 border border-indigo-500/50 rounded-2xl p-4 shadow-2xl backdrop-blur-xl text-left animate-fadeIn text-white select-none"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2.5 w-2.5 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500"></span>
                    </span>
                    <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                      Piloto Automático
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={cancelAutopilotCountdown}
                    className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                    title="Cancelar avanço automático"
                    aria-label="Cancelar avanço automático"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-sm font-semibold text-white line-clamp-1 mb-0.5">
                  Próximo: T{nextEpisode.seasonNumber}:E{nextEpisode.episodeNumber} - {nextEpisode.title}
                </p>
                <p className="text-xs text-slate-300 mb-2.5">
                  Iniciando automaticamente em <strong className="text-indigo-300 font-mono text-sm">{autopilotCountdown}s</strong>...
                </p>

                {/* Progress bar countdown */}
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mb-3">
                  <div 
                    className="h-full bg-indigo-500 rounded-full transition-all duration-1000 ease-linear shadow-[0_0_10px_rgba(99,102,241,0.8)]"
                    style={{ width: `${Math.max(0, Math.min(100, (autopilotCountdown / 5) * 100))}%` }}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    id="series-autopilot-play-now"
                    type="button"
                    onClick={playNextEpisode}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 active:scale-95 transition-all cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-white" />
                    <span>Assistir Próximo</span>
                  </button>

                  <button
                    id="series-autopilot-cancel"
                    type="button"
                    onClick={cancelAutopilotCountdown}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-white/10 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Minimalist Spinner (Apenas na inicialização e sem bloqueio visual) */}
            {isLoading && !hasError && !hasCanPlayFiredRef.current && !isSilentlyReconnecting && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-20">
                <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              </div>
            )}

            {/* Tela de Erro (Suprimida durante tentativas de reconexão no background) */}
            {hasError && !isSilentlyReconnecting && (
              <div 
                id="error-modal-overlay"
                className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-25 animate-fadeIn select-none"
              >
                {/* Ícone Discreto */}
                <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-3.5 text-slate-400 shadow-lg">
                  <WifiOff className="w-7 h-7" />
                </div>

                {/* Título Limpo */}
                <h4 className="text-lg sm:text-xl font-bold text-white mb-1.5 tracking-tight">
                  Sinal Indisponível
                </h4>

                {/* Mensagem Curta e Amigável */}
                <p className="text-xs sm:text-sm text-slate-400 max-w-sm mb-6 leading-relaxed">
                  Não foi possível carregar este canal no momento.
                </p>

                {/* Apenas as Ações Essenciais */}
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={handleForceReload}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/25 cursor-pointer transition-all active:scale-95"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Tentar Novamente</span>
                  </button>

                  {sources.length > 1 && (
                    <button
                      type="button"
                      onClick={tryNextSource}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-white/10 hover:bg-white/15 text-slate-200 border border-white/10 text-xs font-semibold cursor-pointer transition-all active:scale-95"
                    >
                      <Server className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Outro Servidor</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleClose}
                    className="px-5 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-semibold border border-white/10 cursor-pointer transition-all"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            )}

            
            {/* Minimalist Top & Bottom Overlay */}
            <div 
              className={`absolute inset-0 pointer-events-none transition-opacity duration-300 z-35 flex flex-col justify-between ${
                showControls ? 'opacity-100' : 'opacity-0'
              }`}
            >
              {/* Top Layer - Discrete Corners */}
              <div className="flex items-start justify-between p-4 sm:p-6 w-full">
                 <div className="flex items-center gap-3 bg-slate-900/40 hover:bg-slate-900/70 backdrop-blur-md rounded-2xl px-3 py-2 pointer-events-auto transition-colors border border-white/5">
                   {('logo' in item && item.logo) ? (
                      <img src={item.logo} alt={'name' in item ? item.name : (item as any).title} className="w-8 h-8 object-contain shrink-0" />
                   ) : ('posterUrl' in item && item.posterUrl) ? (
                      <img src={item.posterUrl} alt={(item as any).title} className="w-6 h-8 object-cover rounded shrink-0" />
                   ) : null}
                   <div className="flex flex-col">
                     <span className="font-bold text-sm text-white drop-shadow-sm max-w-[200px] sm:max-w-xs truncate">
                       {'name' in item ? item.name : (item as any).title}
                     </span>
                     {type === 'channel' ? (
                        <div className="flex items-center gap-1.5 mt-0.5">
                           <span className="flex items-center gap-1 text-[9px] font-bold text-red-400 uppercase tracking-tighter shrink-0">
                             <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> AO VIVO
                           </span>
                        </div>
                     ) : (
                        <span className="text-[10px] text-slate-300">{formatTime(currentTime)} / {formatTime(duration)}</span>
                     )}
                   </div>
                 </div>

                 {/* Actions Top Right */}
                 <div className="flex items-center gap-2 pointer-events-auto">
                   <button
                     id="btn-player-cast-header"
                     type="button"
                     onClick={() => setIsCastModalOpen(true)}
                     className={`p-3 rounded-full backdrop-blur-md transition-all shadow-lg border cursor-pointer ${
                       castState === 'connected'
                         ? 'bg-emerald-600/90 border-emerald-400 text-white'
                         : 'bg-slate-900/40 hover:bg-indigo-600/80 text-white border-white/5'
                     }`}
                     title="Transmitir para a TV (Chromecast / Smart TV)"
                   >
                     <Cast className={`w-5 h-5 ${castState === 'connected' ? 'text-white animate-pulse' : 'text-indigo-300'}`} />
                   </button>

                   <button
                      onClick={handleClose}
                      className="p-3 rounded-full bg-slate-900/40 hover:bg-red-600/80 text-white backdrop-blur-md transition-all pointer-events-auto shadow-lg border border-white/5 group"
                   >
                      <X className="w-5 h-5 group-hover:rotate-90 transition-transform" />
                   </button>
                 </div>
              </div>

              {/* Bottom Layer - Progress Bar & Quick Menu */}
              <div className="w-full flex flex-col justify-end p-4 sm:p-6 pointer-events-auto">
                <div className="flex justify-end items-center gap-2 w-full mb-3">
                   {/* Dedicated Cast Button in Bottom Bar */}
                   <button
                     id="btn-player-cast-bottom"
                     type="button"
                     onClick={() => setIsCastModalOpen(true)}
                     className={`p-3 rounded-full backdrop-blur-md shadow-lg border transition-all cursor-pointer flex items-center gap-2 ${
                       castState === 'connected'
                         ? 'bg-emerald-600/90 border-emerald-400 text-white'
                         : 'bg-slate-900/50 hover:bg-indigo-600/80 border-white/10 text-white'
                     }`}
                     title="Transmitir para a TV (Chromecast / Smart TV)"
                   >
                     <Cast className={`w-5 h-5 ${castState === 'connected' ? 'text-white' : 'text-indigo-300'}`} />
                     {castState === 'connected' && (
                       <span className="text-[10px] font-bold pr-1">Na TV</span>
                     )}
                   </button>

                   {/* Quick Actions Button */}
                   <button
                     id="btn-player-settings-toggle"
                     onClick={() => setActiveMenu(activeMenu === 'controls' ? null : 'controls')}
                     className={`p-3 rounded-full backdrop-blur-md shadow-lg border transition-all cursor-pointer ${
                       activeMenu === 'controls' ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-900/50 hover:bg-slate-900/80 border-white/10 text-white'
                     }`}
                     title="Configurações e Controles"
                   >
                     <Settings className="w-5 h-5" />
                   </button>
                </div>

                {/* Progress Scrubber for VOD */}
                {type === 'vod' && duration > 0 && (
                   <div className="w-full h-1.5 bg-white/20 hover:bg-white/30 rounded-full relative cursor-pointer group transition-colors" onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                      handleSeek({ target: { value: pos * duration } } as any);
                   }}>
                     {/* Buffered progress track */}
                     <div 
                        className="absolute left-0 h-full bg-white/40 rounded-full pointer-events-none transition-all duration-300"
                        style={{ width: `${Math.min(100, bufferedEnd)}%` }}
                      />
                     <div className="absolute left-0 h-full bg-indigo-500 rounded-full pointer-events-none" style={{ width: `${Math.min(100, (currentTime / duration) * 100)}%` }} />
                   </div>
                )}
              </div>
            </div>

            {/* Combined Quick Access Controls Menu Popup */}
            {activeMenu === 'controls' && (
              <div className="absolute bottom-20 right-6 sm:right-10 z-45 w-72 bg-slate-900/95 border border-white/10 rounded-2xl p-4 shadow-2xl backdrop-blur-xl text-left animate-fadeIn space-y-4">
                
                {/* 1. Playback & Volume Row */}
                <div className="flex items-center gap-3 bg-black/40 p-2 rounded-xl border border-white/5">
                  <button onClick={togglePlay} className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer shrink-0">
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                  </button>
                  <div className="flex items-center gap-2 flex-1">
                    <button onClick={toggleMute} className="text-slate-300 hover:text-white cursor-pointer shrink-0">
                      {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={isMuted ? 0 : volume}
                      onChange={handleVolumeChange}
                      className="w-full accent-indigo-500 h-1.5 bg-white/20 hover:bg-white/30 rounded-lg cursor-pointer transition-colors"
                    />
                  </div>
                </div>

                {/* 2. Grid Toggles (Fullscreen, PiP, Cast, Servers) */}
                
                {isSeries && (
                  <div className="flex items-center justify-between bg-white/5 p-2 rounded-xl border border-white/10">
                    <button 
                      onClick={playNextEpisode} 
                      disabled={!nextEpisode}
                      className={`flex flex-col items-center justify-center p-2 rounded-xl transition-colors w-14 ${nextEpisode ? 'bg-white/10 hover:bg-white/20 text-white cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
                      title="Próximo Episódio"
                    >
                      <SkipForward className="w-4 h-4 mb-1" />
                      <span className="text-[9px] font-semibold text-center">Próximo</span>
                    </button>
                    
                    <button
                      onClick={toggleAutopilot}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer flex-1 justify-center mx-2 ${
                        isAutopilotEnabled
                          ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/50 shadow-sm shadow-indigo-600/20'
                          : 'bg-slate-900/60 text-slate-400 border-white/10 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      <Sparkles className={`w-3.5 h-3.5 ${isAutopilotEnabled ? 'text-amber-300 animate-pulse' : 'text-slate-400'}`} />
                      Piloto Auto: {isAutopilotEnabled ? 'ON' : 'OFF'}
                    </button>
                    
                    <button
                      onClick={() => setActiveMenu('episodes')}
                      className={`flex flex-col items-center justify-center p-2 rounded-xl transition-colors w-14 cursor-pointer ${'bg-white/10 hover:bg-white/20 text-white border border-transparent'}`}
                      title="Episódios"
                    >
                      <ListOrdered className="w-4 h-4 mb-1" />
                      <span className="text-[9px] font-semibold text-center">Lista</span>
                    </button>
                  </div>
                )}
                
                {/* 2. Grid Toggles (Fullscreen, PiP, Cast, Servers) */}
                <div className="grid grid-cols-4 gap-1.5">
                  <button onClick={toggleFullscreen} className="flex flex-col items-center justify-center p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white cursor-pointer transition-colors text-[9px] font-semibold text-center h-14">
                    {isFullscreen ? <Minimize2 className="w-4 h-4 mb-1" /> : <Maximize2 className="w-4 h-4 mb-1" />}
                    <span>Tela Cheia</span>
                  </button>
                  <button onClick={togglePiP} className={`flex flex-col items-center justify-center p-2 rounded-xl cursor-pointer transition-colors text-[9px] font-semibold text-center h-14 ${isPiP ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/30' : 'bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white'}`}>
                    <PictureInPicture className="w-4 h-4 mb-1" />
                    <span>Mini PiP</span>
                  </button>
                  <button onClick={() => { setActiveMenu(null); setIsCastModalOpen(true); }} className="flex flex-col items-center justify-center p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white cursor-pointer transition-colors text-[9px] font-semibold text-center h-14">
                    <Cast className="w-4 h-4 mb-1" />
                    <span>Transmitir</span>
                  </button>
                  {sources.length > 1 && (
                    <button onClick={tryNextSource} className="flex flex-col items-center justify-center p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white cursor-pointer transition-colors text-[9px] font-semibold text-center h-14">
                      <Server className="w-4 h-4 mb-1 text-indigo-400" />
                      <span>Svr {currentSourceIndex + 1}/{sources.length}</span>
                    </button>
                  )}
                  {type === 'vod' && (
                    <button onClick={() => { setActiveMenu('subtitles'); }} className={`flex flex-col items-center justify-center p-2 rounded-xl cursor-pointer transition-colors text-[9px] font-semibold text-center h-14 ${selectedSubtitleTrackId ? 'bg-purple-900/40 text-purple-300 border border-purple-500/30' : 'bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white'}`}>
                      <Subtitles className="w-4 h-4 mb-1" />
                      <span>Legendas</span>
                    </button>
                  )}
                </div>

                {/* 3. Settings Lists (Quality, Speed, Aspect) */}
                <div className="space-y-3 pt-2 border-t border-white/5">
                  {qualities.length > 0 && (
                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">Resolução</span>
                      <div className="flex gap-1 overflow-x-auto custom-scrollbar pb-1">
                        {qualities.map((q) => (
                          <button
                            key={q.index}
                            type="button"
                            onClick={() => changeQuality(q.index)}
                            className={`shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer ${currentQuality === q.index ? 'bg-indigo-600 text-white' : 'bg-black/30 text-slate-400 hover:text-white border border-white/10'}`}
                          >
                            {q.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {type === 'vod' && (
                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">Velocidade</span>
                      <div className="flex gap-1 overflow-x-auto custom-scrollbar pb-1">
                        {[0.5, 1, 1.25, 1.5, 2].map((rate) => (
                          <button
                            key={rate}
                            type="button"
                            onClick={() => changeSpeed(rate)}
                            className={`shrink-0 px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer ${playbackRate === rate ? 'bg-indigo-600 text-white' : 'bg-black/30 text-slate-400 hover:text-white border border-white/10'}`}
                          >
                            {rate === 1 ? 'Normal' : `${rate}x`}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">Enquadramento</span>
                    <div className="grid grid-cols-3 gap-1">
                      {(['contain', 'cover', 'fill'] as AspectRatioMode[]).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => { setAspectRatio(mode); setActiveMenu(null); }}
                          className={`text-[10px] font-semibold py-1.5 rounded-lg transition-all cursor-pointer ${aspectRatio === mode ? 'bg-indigo-600 text-white' : 'bg-black/30 text-slate-400 hover:text-white border border-white/10'}`}
                        >
                          {mode === 'contain' ? 'Ajustar' : mode === 'cover' ? 'Zoom' : 'Esticar'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            
            {/* Episodes Drawer Popup */}
            {activeMenu === 'episodes' && isSeries && (
              <div className="absolute bottom-20 right-6 sm:right-10 z-45 w-80 max-h-[70vh] overflow-y-auto bg-slate-900/95 border border-white/10 rounded-2xl p-4 shadow-2xl backdrop-blur-xl text-left animate-fadeIn space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                  <span className="text-sm font-bold text-white flex items-center gap-1.5">
                    <ListOrdered className="w-4 h-4 text-indigo-400" />
                    Episódios
                  </span>
                  <button 
                     onClick={() => setActiveMenu('controls')}
                     className="text-xs font-semibold text-slate-400 hover:text-white cursor-pointer p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-1.5">
                  {seriesEpisodes.map((ep, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        handleSeek({ target: { value: 0 } } as any);
                        playEpisodeByIndex(idx);
                      }}
                      className={`w-full text-left p-2 rounded-xl transition-colors cursor-pointer ${currentEpisodeIndex === idx ? 'bg-indigo-600/20 border border-indigo-500/30' : 'hover:bg-white/5 border border-transparent'}`}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className={`text-xs font-bold ${currentEpisodeIndex === idx ? 'text-indigo-400' : 'text-slate-200'}`}>T{ep.seasonNumber}:E{ep.episodeNumber}</span>
                        {currentEpisodeIndex === idx && <span className="text-[10px] font-semibold text-indigo-300 bg-indigo-900/50 px-1.5 py-0.5 rounded">Reproduzindo</span>}
                      </div>
                      <span className={`text-xs block line-clamp-1 ${currentEpisodeIndex === idx ? 'text-indigo-200' : 'text-slate-400'}`}>{ep.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {/* Subtitles Menu Popup (keep it independent but adjust position if needed) */}
            {activeMenu === 'subtitles' && (
              <div className="absolute bottom-20 right-6 sm:right-10 z-45 w-72 sm:w-80 max-h-[70vh] overflow-y-auto bg-slate-900/95 border border-white/10 rounded-2xl p-4 shadow-2xl backdrop-blur-xl text-left animate-fadeIn space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Subtitles className="w-4 h-4 text-purple-400" />
                    Legendas
                  </span>
                  <button 
                     onClick={() => setActiveMenu('controls')}
                     className="text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
                  >
                    Voltar
                  </button>
                </div>
                {/* Subtitles selection mapping... */}
                <div className="space-y-1">
                  <button
                    onClick={() => handleSelectSubtitleTrack(null)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                      selectedSubtitleTrackId === null
                        ? 'bg-purple-950/60 border border-purple-500/40 text-purple-300'
                        : 'text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    <span>Desativada</span>
                    {selectedSubtitleTrackId === null && <Check className="w-3.5 h-3.5 text-purple-400" />}
                  </button>
                  {availableSubtitleTracks.map((track) => (
                    <button
                      key={track.id}
                      onClick={() => handleSelectSubtitleTrack(track.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                        selectedSubtitleTrackId === track.id
                          ? 'bg-purple-950/60 border border-purple-500/40 text-purple-300'
                          : 'text-slate-300 hover:bg-white/5'
                      }`}
                    >
                      <span className="truncate pr-2">{track.label}</span>
                      {selectedSubtitleTrackId === track.id && <Check className="w-3.5 h-3.5 text-purple-400 shrink-0" />}
                    </button>
                  ))}
                  {/* Upload Legenda button */}
                  <button
                    onClick={() => subtitleFileInputRef.current?.click()}
                    className="w-full mt-2 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-white bg-white/10 hover:bg-white/20 border border-white/10 transition-colors cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" /> Enviar Legenda (.vtt)
                  </button>
                </div>
              </div>
            )}

            </div>
      {/* Channel Trouble & Signal Recovery Assistant Modal */}
      <ChannelTroubleshootModal
        isOpen={showTroubleshootModal}
        onClose={() => setShowTroubleshootModal(false)}
        channelName={'name' in item ? item.name : (item as any).title}
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

      {/* Transmitir para TV / Cast Modal */}
      <CastModal
        isOpen={isCastModalOpen}
        onClose={() => setIsCastModalOpen(false)}
        mediaTitle={'name' in item ? item.name : (item as any).title}
        mediaType={type}
        mediaLogo={'logo' in item ? item.logo : 'posterUrl' in item ? item.posterUrl : undefined}
        streamUrl={streamUrl}
        webPlayerUrl={webPlayerUrl}
        castState={castState}
        isCastSupported={isCastSupported}
        isAirPlaySupported={isAirPlaySupported}
        videoElement={videoRef.current}
        onTriggerNativeCast={triggerNativeCast}
        onDisconnectCast={disconnectCast}
      />
    </div>
  );
};
