import React, { useState, useEffect, useCallback } from 'react';
import QRCode from 'qrcode';
import { 
  Cast, Airplay, Tv, Smartphone, Copy, CheckCheck, X, 
  Wifi, HelpCircle, MonitorPlay, Radio, Sparkles, RefreshCw,
  Play, Pause, Volume2, VolumeX, CheckCircle2, Flame,
  ExternalLink, Layers
} from 'lucide-react';
import { castService, CastDevice, CastConnectionState } from '../services/castService';

interface CastModalProps {
  isOpen: boolean;
  onClose: () => void;
  mediaTitle: string;
  mediaType: 'channel' | 'vod';
  mediaLogo?: string;
  streamUrl: string;
  webPlayerUrl: string;
  castState: CastConnectionState;
  isCastSupported?: boolean;
  isAirPlaySupported?: boolean;
  videoElement?: HTMLVideoElement | null;
  onTriggerNativeCast?: () => Promise<boolean>;
  onDisconnectCast?: () => void;
}

export const CastModal: React.FC<CastModalProps> = ({
  isOpen,
  onClose,
  mediaTitle,
  mediaType,
  mediaLogo,
  streamUrl,
  webPlayerUrl,
  castState: initialCastState,
  isCastSupported = true,
  isAirPlaySupported = false,
  videoElement,
  onTriggerNativeCast,
  onDisconnectCast,
}) => {
  const [activeTab, setActiveTab] = useState<'devices' | 'qrcode' | 'stream' | 'guide'>('devices');
  const [devices, setDevices] = useState<CastDevice[]>([]);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [connectingDeviceId, setConnectingDeviceId] = useState<string | null>(null);
  const [activeDevice, setActiveDevice] = useState<CastDevice | null>(null);
  const [localCastState, setLocalCastState] = useState<CastConnectionState>(initialCastState);
  
  // Remote playback controls state for active cast session
  const [isRemotePlaying, setIsRemotePlaying] = useState<boolean>(true);
  const [isRemoteMuted, setIsRemoteMuted] = useState<boolean>(false);
  const [remoteVolume, setRemoteVolume] = useState<number>(1);

  // QR Code & Copy states
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [copiedType, setCopiedType] = useState<'web' | 'stream' | null>(null);

  // Load and scan devices on modal open
  const scanDevices = useCallback(async () => {
    setIsScanning(true);
    try {
      const found = await castService.scanForDevices();
      setDevices(found);
    } catch (err) {
      console.warn('Erro ao escanear dispositivos:', err);
    } finally {
      // Small intentional delay so the radar visual feedback is satisfying
      setTimeout(() => setIsScanning(false), 600);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    scanDevices();

    // Subscribe to CastService state changes
    const unsubscribe = castService.subscribe((state, device) => {
      setLocalCastState(state);
      setActiveDevice(device);
      if (state === 'disconnected') {
        setConnectingDeviceId(null);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [isOpen, scanDevices]);

  // Generate QR code for TV browser
  useEffect(() => {
    if (!isOpen || !webPlayerUrl) return;

    QRCode.toDataURL(webPlayerUrl, {
      width: 280,
      margin: 2,
      color: {
        dark: '#020617',
        light: '#ffffff',
      },
    })
      .then((url) => setQrCodeDataUrl(url))
      .catch((err) => console.error('Erro ao gerar QR code:', err));
  }, [isOpen, webPlayerUrl]);

  if (!isOpen) return null;

  const handleConnectDevice = async (device: CastDevice) => {
    setConnectingDeviceId(device.id);
    try {
      const success = await castService.connectAndCast(
        device,
        {
          title: mediaTitle,
          streamUrl,
          mediaType,
          posterUrl: mediaLogo,
          currentTime: videoElement?.currentTime || 0,
        },
        videoElement
      );

      if (success) {
        setActiveDevice(device);
        setLocalCastState('connected');
      } else if (onTriggerNativeCast) {
        // Fallback to native browser prompt
        await onTriggerNativeCast();
      }
    } catch (err) {
      console.error('Falha ao conectar no dispositivo:', err);
    } finally {
      setConnectingDeviceId(null);
    }
  };

  const handleDisconnect = async () => {
    await castService.disconnect(videoElement);
    if (onDisconnectCast) {
      onDisconnectCast();
    }
    setLocalCastState('disconnected');
    setActiveDevice(null);
  };

  const handleTogglePlayRemote = async () => {
    if (isRemotePlaying) {
      await castService.pause();
      setIsRemotePlaying(false);
    } else {
      await castService.play();
      setIsRemotePlaying(true);
    }
  };

  const handleToggleMuteRemote = async () => {
    if (isRemoteMuted) {
      await castService.setVolume(remoteVolume || 0.8);
      setIsRemoteMuted(false);
    } else {
      await castService.setVolume(0);
      setIsRemoteMuted(true);
    }
  };

  const handleVolumeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setRemoteVolume(val);
    setIsRemoteMuted(val === 0);
    await castService.setVolume(val);
  };

  const handleCopy = async (text: string, type: 'web' | 'stream') => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 3000);
    } catch {
      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 3000);
    }
  };

  const getDeviceIcon = (device: CastDevice) => {
    switch (device.type) {
      case 'chromecast':
        return <Cast className="w-5 h-5 text-indigo-400" />;
      case 'airplay':
        return <Airplay className="w-5 h-5 text-purple-400" />;
      case 'firetv':
        return <Flame className="w-5 h-5 text-amber-400" />;
      case 'smarttv':
      case 'dlna':
      default:
        return <Tv className="w-5 h-5 text-emerald-400" />;
    }
  };

  return (
    <div 
      id="cast-device-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        id="cast-device-modal-card"
        className="relative w-full max-w-md sm:max-w-lg bg-slate-900 border border-white/15 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
              <Cast className="w-5 h-5 animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-white truncate">
                  Transmitir para a TV
                </h3>
                {localCastState === 'connected' ? (
                  <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    Conectado
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/10 text-slate-300">
                    Rede Local Wi-Fi
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 truncate mt-0.5">
                {mediaTitle}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0"
            title="Fechar (ESC)"
            aria-label="Fechar modal de transmissão"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-white/10 bg-slate-950/40 p-1.5 gap-1 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('devices')}
            className={`flex-1 py-2 px-2.5 rounded-xl font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'devices'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Cast className="w-3.5 h-3.5" />
            <span>Dispositivos</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('qrcode')}
            className={`flex-1 py-2 px-2.5 rounded-xl font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'qrcode'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>QR Code TV</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('stream')}
            className={`flex-1 py-2 px-2.5 rounded-xl font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'stream'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Link M3U8</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('guide')}
            className={`flex-1 py-2 px-2.5 rounded-xl font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'guide'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Dicas</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-sm text-slate-300 flex-1">
          {/* TAB 1: Seleção de Dispositivos (Chromecast / DLNA / Smart TVs) */}
          {activeTab === 'devices' && (
            <div className="space-y-4 animate-fadeIn">
              {/* Active Transmission Banner (if connected) */}
              {localCastState === 'connected' && activeDevice && (
                <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-950/60 via-slate-900 to-slate-950 border border-emerald-500/35 shadow-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
                      <div>
                        <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                          Transmitindo agora
                        </div>
                        <div className="text-sm font-bold text-white">
                          {activeDevice.name}
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      {activeDevice.protocol}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 truncate">
                    Fluxo de vídeo redirecionado para a tela externa com sucesso.
                  </p>

                  {/* Remote Playback Controls */}
                  <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleTogglePlayRemote}
                        className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                        title={isRemotePlaying ? 'Pausar na TV' : 'Reproduzir na TV'}
                      >
                        {isRemotePlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </button>

                      <button
                        type="button"
                        onClick={handleToggleMuteRemote}
                        className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                        title={isRemoteMuted ? 'Ativar Som' : 'Silenciar TV'}
                      >
                        {isRemoteMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
                      </button>

                      <div className="hidden sm:flex items-center gap-1.5 w-24">
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={isRemoteMuted ? 0 : remoteVolume}
                          onChange={handleVolumeChange}
                          className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleDisconnect}
                      className="px-3 py-1.5 rounded-xl bg-red-600/25 hover:bg-red-600/40 text-red-300 border border-red-500/30 text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Desconectar
                    </button>
                  </div>
                </div>
              )}

              {/* Scanning status and refresh bar */}
              <div className="flex items-center justify-between px-1 text-xs">
                <div className="flex items-center gap-2 text-slate-300">
                  <Wifi className={`w-4 h-4 text-indigo-400 ${isScanning ? 'animate-bounce' : ''}`} />
                  <span className="font-medium">
                    {isScanning ? 'Buscando telas na sua rede Wi-Fi...' : 'Telas detectadas na rede local:'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={scanDevices}
                  disabled={isScanning}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-all text-[11px] cursor-pointer disabled:opacity-50"
                  title="Atualizar busca na rede local"
                >
                  <RefreshCw className={`w-3 h-3 text-indigo-400 ${isScanning ? 'animate-spin' : ''}`} />
                  <span>Atualizar</span>
                </button>
              </div>

              {/* Devices List */}
              <div className="space-y-2.5">
                {devices.map((device) => {
                  const isThisConnecting = connectingDeviceId === device.id;
                  const isThisActive = localCastState === 'connected' && activeDevice?.id === device.id;

                  return (
                    <div
                      key={device.id}
                      className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                        isThisActive
                          ? 'bg-emerald-950/30 border-emerald-500/40 ring-1 ring-emerald-500/30'
                          : 'bg-white/5 hover:bg-white/10 border-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-2.5 rounded-xl shrink-0 ${
                          isThisActive
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-slate-800 text-slate-300'
                        }`}>
                          {getDeviceIcon(device)}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-white text-xs sm:text-sm truncate">
                              {device.name}
                            </h4>
                            <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-white/10 text-slate-300 shrink-0">
                              {device.protocol}
                            </span>
                          </div>

                          <p className="text-[11px] text-slate-400 truncate mt-0.5">
                            {device.location} • {device.model || 'Smart TV'}
                          </p>
                        </div>
                      </div>

                      <div className="shrink-0">
                        {isThisActive ? (
                          <button
                            type="button"
                            onClick={handleDisconnect}
                            className="px-3 py-1.5 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 text-xs font-semibold transition-colors cursor-pointer"
                          >
                            Desconectar
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleConnectDevice(device)}
                            disabled={isThisConnecting}
                            className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-bold shadow-md shadow-indigo-600/25 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                          >
                            {isThisConnecting ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                <span>Conectando...</span>
                              </>
                            ) : (
                              <>
                                <Cast className="w-3.5 h-3.5" />
                                <span>Transmitir</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Quick Native Cast Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (onTriggerNativeCast) {
                      await onTriggerNativeCast();
                    } else if (devices[0]) {
                      handleConnectDevice(devices[0]);
                    }
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <MonitorPlay className="w-4 h-4 text-indigo-400" />
                  <span>Abrir Seletor Padrão do Navegador (Chrome / AirPlay)</span>
                </button>
              </div>

              <div className="text-[11px] text-slate-400 leading-relaxed bg-slate-950/60 p-3 rounded-xl border border-white/5">
                💡 <strong>Dica:</strong> Certifique-se de que a Smart TV ou Chromecast está ligada e conectada à mesma rede Wi-Fi que este dispositivo.
              </div>
            </div>
          )}

          {/* TAB 2: QR Code TV */}
          {activeTab === 'qrcode' && (
            <div className="space-y-4 animate-fadeIn text-center">
              <p className="text-xs text-slate-300">
                Aponte a câmera do seu smartphone ou controle da Smart TV para abrir este canal diretamente no navegador da TV sem digitar nada:
              </p>

              <div className="flex justify-center my-2">
                <div className="p-3 bg-white rounded-2xl shadow-xl border-4 border-indigo-500/30 inline-block">
                  {qrCodeDataUrl ? (
                    <img 
                      src={qrCodeDataUrl} 
                      alt="QR Code para Transmissão na TV" 
                      className="w-44 h-44 sm:w-52 sm:h-52 object-contain rounded-lg"
                    />
                  ) : (
                    <div className="w-44 h-44 flex items-center justify-center text-slate-800 text-xs">
                      Gerando QR Code...
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input 
                  type="text" 
                  readOnly 
                  value={webPlayerUrl}
                  className="flex-1 px-3 py-2 bg-black/50 border border-white/10 rounded-xl text-xs text-slate-300 font-mono truncate focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleCopy(webPlayerUrl, 'web')}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                >
                  {copiedType === 'web' ? (
                    <>
                      <CheckCheck className="w-3.5 h-3.5 text-emerald-300" />
                      <span>Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: Link M3U8 para VLC / Kodi */}
          {activeTab === 'stream' && (
            <div className="space-y-3.5 animate-fadeIn">
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-white/10 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-indigo-400" />
                    URL Direta do Stream ({mediaType === 'channel' ? 'HLS / M3U8' : 'VOD Stream'})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={streamUrl}
                    className="flex-1 px-3 py-2 bg-black/60 border border-white/10 rounded-xl text-xs text-slate-300 font-mono truncate select-all focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleCopy(streamUrl, 'stream')}
                    className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                  >
                    {copiedType === 'stream' ? (
                      <>
                        <CheckCheck className="w-3.5 h-3.5 text-emerald-300" />
                        <span>Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar Link</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-2 text-xs">
                <h5 className="font-bold text-white text-xs flex items-center gap-1.5">
                  <Tv className="w-4 h-4 text-indigo-400" />
                  Como usar no VLC Media Player ou na Smart TV:
                </h5>
                <ol className="list-decimal list-inside space-y-1 text-slate-300 text-[11px] leading-relaxed">
                  <li>Abra o <strong>VLC</strong> no seu computador, TV Box ou Smart TV.</li>
                  <li>Clique em <strong>Mídia</strong> &gt; <strong>Abrir Fluxo de Rede...</strong> (ou aperte Ctrl+N).</li>
                  <li>Cole a URL direta copiada acima e clique em <strong>Reproduzir</strong>.</li>
                </ol>
              </div>
            </div>
          )}

          {/* TAB 4: Dicas por Plataforma */}
          {activeTab === 'guide' && (
            <div className="space-y-3 animate-fadeIn text-xs leading-relaxed">
              <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-1">
                <div className="font-bold text-white flex items-center gap-1.5">
                  <Cast className="w-3.5 h-3.5 text-indigo-400" />
                  Google Chromecast &amp; Android TV
                </div>
                <p className="text-slate-400 text-[11px]">
                  Clique na aba <strong>Dispositivos</strong> e selecione seu Chromecast, ou use o menu do navegador (três pontinhos) &gt; <strong>Transmitir</strong>.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-1">
                <div className="font-bold text-white flex items-center gap-1.5">
                  <Airplay className="w-3.5 h-3.5 text-purple-400" />
                  Apple AirPlay (iPhone, iPad, Mac)
                </div>
                <p className="text-slate-400 text-[11px]">
                  Selecione sua Apple TV ou Smart TV compatível com AirPlay 2 na lista de dispositivos ou pelo Safari.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-1">
                <div className="font-bold text-white flex items-center gap-1.5">
                  <Tv className="w-3.5 h-3.5 text-emerald-400" />
                  Smart TV Samsung (Tizen) &amp; LG (webOS)
                </div>
                <p className="text-slate-400 text-[11px]">
                  Use a detecção DLNA/UPnP na aba <strong>Dispositivos</strong> ou aponte a câmera na aba <strong>QR Code TV</strong> para abrir diretamente na tela da TV.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 px-5 border-t border-white/10 bg-slate-950/70 flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1 text-[11px]">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            Google Cast SDK &amp; DLNA Ativos
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
