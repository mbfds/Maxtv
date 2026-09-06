import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Play, 
  Crown, 
  Flame, 
  ChevronLeft, 
  ChevronRight, 
  Pause, 
  Radio, 
  Tv, 
  Film,
  Sparkles,
  Check
} from 'lucide-react';
import { Channel, VodItem } from '../types';

interface HeroBannerProps {
  onPlayChannel: (channel: Channel) => void;
  onPlayVod: (vod: VodItem) => void;
  onOpenCheckout: () => void;
  isVip: boolean;
  featuredVod?: VodItem;
  featuredChannel?: Channel;
  featuredVods?: VodItem[];
  featuredChannels?: Channel[];
}

interface HeroSlide {
  id: string;
  type: 'vod' | 'channel';
  title: string;
  synopsis: string;
  bannerUrl: string;
  isLive: boolean;
  badgeLabel: string;
  qualityBadge: string;
  audioBadge: string;
  highlightTag: string;
  vod?: VodItem;
  channel?: Channel;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({
  onPlayChannel,
  onPlayVod,
  onOpenCheckout,
  isVip,
  featuredVod,
  featuredChannel,
  featuredVods = [],
  featuredChannels = []
}) => {
  // Build slide items from props dynamically
  const slides = useMemo<HeroSlide[]>(() => {
    const list: HeroSlide[] = [];

    // Slide 1: Primary Featured VOD (Cidade de Deus or custom)
    if (featuredVod) {
      list.push({
        id: `hero-vod-${featuredVod.id}`,
        type: 'vod',
        title: featuredVod.title,
        synopsis: featuredVod.synopsis || 'Assista em alta definição 4K com som espacial e produção cinematográfica nacional premiada.',
        bannerUrl: featuredVod.bannerUrl || 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?auto=format&fit=crop&w=1920&q=80',
        isLive: false,
        badgeLabel: featuredVod.type === 'movie' ? 'Filme em Destaque' : 'Série MAXTV',
        qualityBadge: '4K Ultra HD',
        audioBadge: 'Áudio 5.1',
        highlightTag: 'Top 1 no Brasil',
        vod: featuredVod
      });
    }

    // Slide 2: Primary Featured Channel (CazéTV or top Sports)
    if (featuredChannel) {
      list.push({
        id: `hero-ch-${featuredChannel.id}`,
        type: 'channel',
        title: `${featuredChannel.name} • Ao Vivo`,
        synopsis: featuredChannel.epgNow 
          ? `No ar agora: "${featuredChannel.epgNow}". Acompanhe a cobertura ao vivo com som direto do campo e sinal digital sem atrasos.`
          : 'Transmissão ao vivo ininterrupta com as melhores competições, torneios esportivos e programas em tempo real.',
        bannerUrl: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=1920&q=80',
        isLive: true,
        badgeLabel: 'Ao Vivo Agora',
        qualityBadge: '1080p 60fps',
        audioBadge: 'Estéreo HD',
        highlightTag: 'Sinal ao Vivo',
        channel: featuredChannel
      });
    }

    // Slide 3: Secondary top VOD (e.g., O Auto da Compadecida 2, Duna 2 or Pantanal Selvagem)
    const secondVod = featuredVods.find(v => v.id !== featuredVod?.id && (v.genre.includes('Comédia') || v.genre.includes('Documentário') || v.featured)) || featuredVods[1];
    if (secondVod) {
      list.push({
        id: `hero-vod-${secondVod.id}`,
        type: 'vod',
        title: secondVod.title,
        synopsis: secondVod.synopsis,
        bannerUrl: secondVod.bannerUrl,
        isLive: false,
        badgeLabel: secondVod.genre.includes('Documentário') ? 'Documentário 4K' : 'Cinema & Entretenimento',
        qualityBadge: '4K HDR',
        audioBadge: 'Dolby Atmos',
        highlightTag: secondVod.genre[0] || 'Destaque',
        vod: secondVod
      });
    }

    // Slide 4: Secondary live channel (e.g., Globo, Premiere, SporTV or Band)
    const secondChannel = featuredChannels.find(c => c.id !== featuredChannel?.id && (c.category === 'Abertos' || c.category === 'Esportes')) || featuredChannels[1];
    if (secondChannel) {
      list.push({
        id: `hero-ch-${secondChannel.id}`,
        type: 'channel',
        title: `${secondChannel.name} HD`,
        synopsis: secondChannel.epgNow 
          ? `Transmissão ao vivo: ${secondChannel.epgNow}. Sinal estável com alta taxa de quadros e baixa latência de rede.`
          : 'Programação de entretenimento, jornalismo e esporte com sinal digital em alta definição.',
        bannerUrl: 'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?auto=format&fit=crop&w=1920&q=80',
        isLive: true,
        badgeLabel: 'TV Digital',
        qualityBadge: '1080p HD',
        audioBadge: 'Áudio Digital',
        highlightTag: secondChannel.category,
        channel: secondChannel
      });
    }

    // Fallback if empty
    if (list.length === 0) {
      list.push({
        id: 'hero-default',
        type: 'vod',
        title: 'Cidade de Deus: A Luta Não Para',
        synopsis: 'Vinte anos após os eventos do clássico filme, acompanhe as disputas e o cotidiano na comunidade carioca com fotografia de cinema e elenco consagrado.',
        bannerUrl: 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?auto=format&fit=crop&w=1920&q=80',
        isLive: false,
        badgeLabel: 'Série MAXTV',
        qualityBadge: '4K Ultra HD',
        audioBadge: 'Áudio 5.1',
        highlightTag: 'Destaque no Brasil',
        vod: featuredVod
      });
    }

    return list;
  }, [featuredVod, featuredChannel, featuredVods, featuredChannels]);

  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const touchStartXRef = useRef<number | null>(null);

  // Auto-slide effect (changes slide every 6.5s unless paused/hovered)
  useEffect(() => {
    if (isPaused || slides.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % slides.length);
    }, 6500);

    return () => clearInterval(interval);
  }, [isPaused, slides.length]);

  const handlePrev = () => {
    setCurrentIndex(prev => (prev - 1 + slides.length) % slides.length);
  };

  const handleNext = () => {
    setCurrentIndex(prev => (prev + 1) % slides.length);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartXRef.current - touchEndX;

    if (diff > 50) {
      handleNext();
    } else if (diff < -50) {
      handlePrev();
    }
    touchStartXRef.current = null;
  };

  // Safe active slide
  const activeSlide = slides[currentIndex] || slides[0];

  const handlePrimaryAction = () => {
    if (activeSlide.type === 'channel' && activeSlide.channel) {
      onPlayChannel(activeSlide.channel);
    } else if (activeSlide.type === 'vod' && activeSlide.vod) {
      onPlayVod(activeSlide.vod);
    } else if (featuredVod) {
      onPlayVod(featuredVod);
    }
  };

  return (
    <div 
      id="hero-banner-carousel"
      className="relative w-full h-[410px] sm:h-[470px] lg:h-[510px] rounded-3xl overflow-hidden border border-white/10 shadow-2xl mb-10 group select-none"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Background Slides with Cross-Fade */}
      {slides.map((slide, idx) => (
        <div
          key={slide.id}
          className={`absolute inset-0 bg-cover bg-center transition-all duration-1000 ease-out ${
            idx === currentIndex 
              ? 'opacity-100 scale-100 z-0' 
              : 'opacity-0 scale-105 pointer-events-none z-0'
          }`}
          style={{ backgroundImage: `url(${slide.bannerUrl})` }}
        />
      ))}

      {/* Dark Vignettes & Gradients for contrast and readability */}
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/70 to-transparent z-10" />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent z-10" />

      {/* Navigation Arrow - Left */}
      {slides.length > 1 && (
        <button
          id="hero-banner-prev"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handlePrev();
          }}
          aria-label="Conteúdo anterior em destaque"
          className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 z-30 p-2.5 sm:p-3 rounded-full bg-slate-950/60 hover:bg-slate-900/90 text-white/80 hover:text-white border border-white/15 hover:border-white/35 backdrop-blur-md shadow-xl transition-all active:scale-95 group/prev cursor-pointer opacity-90 sm:opacity-0 sm:group-hover:opacity-100"
        >
          <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6 transition-transform group-hover/prev:-translate-x-0.5" />
        </button>
      )}

      {/* Navigation Arrow - Right */}
      {slides.length > 1 && (
        <button
          id="hero-banner-next"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleNext();
          }}
          aria-label="Próximo conteúdo em destaque"
          className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 z-30 p-2.5 sm:p-3 rounded-full bg-slate-950/60 hover:bg-slate-900/90 text-white/80 hover:text-white border border-white/15 hover:border-white/35 backdrop-blur-md shadow-xl transition-all active:scale-95 group/next cursor-pointer opacity-90 sm:opacity-0 sm:group-hover:opacity-100"
        >
          <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 transition-transform group-hover/next:translate-x-0.5" />
        </button>
      )}

      {/* Content Container */}
      <div className="relative h-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-14 flex flex-col justify-end pb-12 sm:pb-16 z-20 pointer-events-none">
        {/* Badges */}
        <div className="flex flex-wrap items-center gap-2 mb-3 pointer-events-auto">
          {activeSlide.isLive ? (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-red-600 text-[11px] font-bold rounded-full uppercase tracking-wider text-white shadow-md shadow-red-950/50">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              <span>Ao Vivo</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600 text-[11px] font-bold rounded-full uppercase tracking-wider text-white shadow-md shadow-indigo-950/50">
              <Sparkles className="w-3 h-3" />
              <span>{activeSlide.badgeLabel}</span>
            </div>
          )}

          <span className="px-3 py-0.5 rounded-full text-xs font-semibold bg-slate-900/80 text-slate-300 border border-white/10 backdrop-blur-sm">
            {activeSlide.qualityBadge}
          </span>
          <span className="px-3 py-0.5 rounded-full text-xs font-semibold bg-indigo-950/70 text-indigo-300 border border-indigo-500/30 backdrop-blur-sm">
            {activeSlide.audioBadge}
          </span>
          <span className="flex items-center gap-1 text-xs text-indigo-300 font-semibold bg-slate-900/80 px-3 py-0.5 rounded-full border border-white/10 backdrop-blur-sm">
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span>{activeSlide.highlightTag}</span>
          </span>
        </div>

        {/* Dynamic Title */}
        <h1 
          key={`title-${activeSlide.id}`}
          className="text-2xl sm:text-4xl lg:text-5xl font-bold mb-3 tracking-tight leading-tight text-white max-w-2xl drop-shadow-lg transition-all duration-300 animate-fadeIn pointer-events-auto"
        >
          {activeSlide.title}
        </h1>

        {/* Dynamic Synopsis */}
        <p 
          key={`synopsis-${activeSlide.id}`}
          className="text-xs sm:text-sm lg:text-base text-slate-300 max-w-xl line-clamp-2 sm:line-clamp-3 mb-6 font-normal drop-shadow transition-all duration-300 pointer-events-auto"
        >
          {activeSlide.synopsis}
        </p>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 pointer-events-auto">
          <button
            id="hero-banner-play-action"
            type="button"
            onClick={handlePrimaryAction}
            className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-white text-slate-950 font-bold text-sm sm:text-base shadow-xl hover:bg-slate-200 active:scale-95 transition-all cursor-pointer"
          >
            <Play className="w-4 h-4 fill-slate-950 ml-0.5" />
            <span>{activeSlide.type === 'channel' ? 'Assistir Transmissão' : 'Assistir Agora'}</span>
          </button>

          {/* Quick link to alternative featured item */}
          {activeSlide.type === 'vod' && featuredChannel && (
            <button
              id="hero-banner-channel-quick"
              type="button"
              onClick={() => onPlayChannel(featuredChannel)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 backdrop-blur-md hover:bg-white/15 text-white font-semibold text-xs sm:text-sm border border-white/10 active:scale-95 transition-all cursor-pointer"
            >
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span>{featuredChannel.name}</span>
            </button>
          )}

          {activeSlide.type === 'channel' && featuredVod && (
            <button
              id="hero-banner-vod-quick"
              type="button"
              onClick={() => onPlayVod(featuredVod)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 backdrop-blur-md hover:bg-white/15 text-white font-semibold text-xs sm:text-sm border border-white/10 active:scale-95 transition-all cursor-pointer"
            >
              <Film className="w-3.5 h-3.5 text-indigo-400" />
              <span>{featuredVod.title}</span>
            </button>
          )}

          {!isVip && (
            <button
              id="hero-banner-vip-unlock"
              type="button"
              onClick={onOpenCheckout}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs sm:text-sm shadow-lg shadow-indigo-600/25 active:scale-95 transition-all cursor-pointer"
            >
              <Crown className="w-4 h-4 text-amber-300" />
              <span>Liberar Acesso VIP Pix</span>
            </button>
          )}
        </div>
      </div>

      {/* Slide Indicators & Auto-Slide Pause Button */}
      {slides.length > 1 && (
        <div className="absolute bottom-4 right-6 sm:right-10 z-30 flex items-center gap-2 bg-slate-950/70 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 shadow-lg">
          {/* Pause / Play Auto-Slide Toggle */}
          <button
            type="button"
            onClick={() => setIsPaused(!isPaused)}
            title={isPaused ? 'Retomar rotação automática' : 'Pausar rotação automática'}
            className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
            aria-label={isPaused ? 'Retomar slide automático' : 'Pausar slide automático'}
          >
            {isPaused ? <Play className="w-3 h-3 fill-slate-400" /> : <Pause className="w-3 h-3" />}
          </button>

          {/* Dots Indicator */}
          <div className="flex items-center gap-1.5 ml-1">
            {slides.map((slide, idx) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                aria-label={`Ir para destaque ${idx + 1}: ${slide.title}`}
                className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                  idx === currentIndex
                    ? 'w-6 bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)]'
                    : 'w-2 bg-white/30 hover:bg-white/60'
                }`}
              />
            ))}
          </div>

          <span className="text-[10px] font-mono font-medium text-slate-400 ml-1">
            {currentIndex + 1}/{slides.length}
          </span>
        </div>
      )}
    </div>
  );
};
