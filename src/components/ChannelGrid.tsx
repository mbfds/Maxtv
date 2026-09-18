import React, { useState } from 'react';
import { Tv, Play, Crown, Radio, Sparkles, Filter, Heart } from 'lucide-react';
import { Channel, ChannelCategory, FavoriteItem, WatchProgress, VodItem } from '../types';
import { ContinueWatchingRow } from './ContinueWatchingRow';
import { CachedImage } from './CachedImage';

interface ChannelGridProps {
  channels: Channel[];
  searchQuery: string;
  isVip: boolean;
  onSelectChannel: (channel: Channel) => void;
  onOpenCheckout: () => void;
  favorites?: FavoriteItem[];
  onToggleFavorite?: (channel: Channel) => void;
  watchProgress?: WatchProgress[];
  allVodItems?: VodItem[];
  onPlayVod?: (vod: VodItem, initialTime?: number) => void;
  onRemoveProgress?: (id: string) => void;
}

const CATEGORIES: ChannelCategory[] = [
  'Todos',
  'Abertos',
  'Esportes',
  'Notícias',
  'Filmes & Séries',
  'Infantis',
  'Documentários',
  'Variedades & Música'
];

interface ChannelCardItemProps {
  channel: Channel;
  idx: number;
  isVip: boolean;
  isFavorite: boolean;
  signalWidth: number;
  onSelectChannel: (channel: Channel) => void;
  onToggleFavorite?: (channel: Channel) => void;
}

const ObserverChannelCard: React.FC<ChannelCardItemProps> = React.memo(({
  channel,
  idx,
  isVip,
  isFavorite,
  signalWidth,
  onSelectChannel,
  onToggleFavorite
}) => {
  const cardRef = React.useRef<HTMLDivElement>(null);
  // The first 18 channels render immediately so above-the-fold appears without delay
  const [isVisible, setIsVisible] = useState<boolean>(() => idx < 18);

  React.useEffect(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      setIsVisible(true);
      return;
    }

    const el = cardRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
          } else {
            // Unmount heavy media when scrolled far off-screen to preserve TV Box memory
            if (entry.boundingClientRect.top > window.innerHeight + 350 || entry.boundingClientRect.bottom < -350) {
              setIsVisible(false);
            }
          }
        });
      },
      {
        root: null,
        rootMargin: '300px 0px 300px 0px',
        threshold: 0
      }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);

  const isLocked = channel.isVipOnly && !isVip;

  return (
    <div
      ref={cardRef}
      tabIndex={0}
      role="button"
      aria-label={`Assistir canal ${channel.name}`}
      onClick={() => onSelectChannel(channel)}
      onFocus={() => setIsVisible(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelectChannel(channel);
        }
      }}
      className={`group relative flex flex-col justify-between p-4 rounded-2xl bg-slate-900 border transition-all cursor-pointer hover:border-indigo-500/50 hover:shadow-xl hover:shadow-indigo-950/20 hover:-translate-y-1 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500 focus-visible:scale-105 focus-visible:z-20 tv-card-contain min-h-[175px] ${
        isLocked 
          ? 'border-white/5 hover:border-indigo-500/40' 
          : 'border-white/5 hover:border-indigo-500/50'
      }`}
    >
      {!isVisible ? (
        // Ultra-lightweight placeholder to preserve exact dimensions and save 90%+ RAM on TV Box
        <div className="flex flex-col items-center justify-center h-full min-h-[140px] opacity-30 select-none">
          <div className="w-12 h-12 rounded-full bg-slate-800 animate-pulse mb-2" />
          <div className="w-16 h-3 bg-slate-800 rounded animate-pulse" />
        </div>
      ) : (
        <>
          {/* Top Badge (Category + Live/VIP status + Favorite) */}
          <div className="flex items-center justify-between w-full mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-2 py-0.5 rounded-full bg-slate-950/60 border border-white/5 truncate max-w-[75px]">
              {channel.category}
            </span>

            <div className="flex items-center gap-1.5">
              {isLocked ? (
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full">
                  <Crown className="w-2.5 h-2.5" />
                  VIP
                </span>
              ) : (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-600 text-[10px] font-bold text-white uppercase tracking-tighter shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  Ao Vivo
                </span>
              )}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite?.(channel);
                }}
                className="p-1 rounded-full text-slate-400 hover:text-red-400 hover:bg-white/10 transition-colors cursor-pointer"
                title={isFavorite ? 'Remover dos Favoritos' : 'Adicionar aos Favoritos'}
              >
                <Heart className={`w-3.5 h-3.5 ${isFavorite ? 'fill-red-500 text-red-500' : ''}`} />
              </button>
            </div>
          </div>

          {/* Channel Logo & Center circular container */}
          <div className="relative w-16 h-16 rounded-full bg-slate-800/90 border border-white/5 flex items-center justify-center p-2.5 mx-auto my-3 group-hover:scale-105 group-hover:border-indigo-500/30 transition-all shadow-inner overflow-hidden">
            {channel.logo ? (
              <CachedImage
                src={channel.logo}
                alt={channel.name}
                fallbackType="channel"
                fallbackText={channel.name}
                className="max-h-10 max-w-full object-contain filter drop-shadow group-hover:scale-105 transition-transform"
                loading="lazy"
                decoding="async"
                showSkeleton={false}
              />
            ) : (
              <Tv className="w-7 h-7 text-slate-500 group-hover:text-indigo-400 transition-colors" />
            )}

            {/* Play Overlay on Hover */}
            <div className="absolute inset-0 bg-indigo-600/30 opacity-0 group-hover:opacity-100 rounded-full flex items-center justify-center transition-opacity backdrop-blur-[1px]">
              <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-600/50">
                <Play className="w-3.5 h-3.5 fill-white ml-0.5" />
              </div>
            </div>
          </div>

          {/* Channel Title & EPG */}
          <div className="w-full text-center mt-1">
            <h3 className="text-sm font-semibold text-white group-hover:text-indigo-400 transition-colors truncate">
              {channel.name}
            </h3>
            <p className="text-[11px] text-slate-400 truncate mt-0.5">
              {channel.epgNow || 'Programação ao Vivo'}
            </p>

            {/* Sleek gauge bar */}
            <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden mt-2.5">
              <div 
                className="h-full bg-indigo-500 rounded-full transition-all"
                style={{ width: `${signalWidth}%` }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
});

export const ChannelGrid: React.FC<ChannelGridProps> = ({
  channels,
  searchQuery,
  isVip,
  onSelectChannel,
  onOpenCheckout,
  favorites = [],
  onToggleFavorite,
  watchProgress = [],
  allVodItems = [],
  onPlayVod,
  onRemoveProgress
}) => {
  const [selectedCategory, setSelectedCategory] = useState<ChannelCategory>('Todos');
  const [visibleCount, setVisibleCount] = useState<number>(60);
  const sentinelRef = React.useRef<HTMLDivElement>(null);

  const isItemFavorite = (id: string) => favorites.some(f => f.id === id);

  // Filter channels with useMemo to avoid recomputing on every render
  const filteredChannels = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return channels.filter(ch => {
      if (!ch.isActive) return false;
      const matchesCategory = selectedCategory === 'Todos' || ch.category === selectedCategory;
      const matchesSearch = !q || ch.name.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [channels, selectedCategory, searchQuery]);

  // Reset pagination when category or search changes
  React.useEffect(() => {
    setVisibleCount(60);
  }, [selectedCategory, searchQuery]);

  const visibleChannels = React.useMemo(() => {
    return filteredChannels.slice(0, visibleCount);
  }, [filteredChannels, visibleCount]);

  const handleLoadMore = React.useCallback(() => {
    setVisibleCount(prev => Math.min(prev + 60, filteredChannels.length));
  }, [filteredChannels.length]);

  // Infinite scroll auto-loader via IntersectionObserver
  React.useEffect(() => {
    if (!sentinelRef.current || visibleChannels.length >= filteredChannels.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          handleLoadMore();
        }
      },
      { rootMargin: '400px' }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [visibleChannels.length, filteredChannels.length, handleLoadMore]);

  return (
    <div className="w-full">
      {/* Continue Watching Section on Main Page */}
      {watchProgress.length > 0 && !searchQuery && selectedCategory === 'Todos' && onPlayVod && (
        <div className="mb-8">
          <ContinueWatchingRow
            items={watchProgress}
            allVodItems={allVodItems}
            onPlay={onPlayVod}
            onRemove={onRemoveProgress}
          />
        </div>
      )}

      {/* Category Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-6 scrollbar-none">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            type="button"
            onClick={() => setSelectedCategory(cat)}
            className={`whitespace-nowrap px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all ${
              selectedCategory === cat
                ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shadow-sm'
                : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-white/5'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Counter and Status */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <h2 className="text-xl font-bold text-white tracking-tight">
            Grade de Canais ao Vivo
          </h2>
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-900 text-slate-400 border border-white/10">
            {filteredChannels.length} canais
          </span>
        </div>

        {!isVip && (
          <button
            type="button"
            onClick={onOpenCheckout}
            className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-semibold transition-colors"
          >
            <Crown className="w-3.5 h-3.5" />
            <span>Liberar todos os canais VIP</span>
          </button>
        )}
      </div>

      {/* Channels Grid with Virtualized Visibility */}
      {filteredChannels.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-slate-900/50 border border-white/5">
          <Tv className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-300 font-medium">Nenhum canal encontrado</p>
          <p className="text-xs text-slate-500 mt-1">Tente pesquisar com outro termo ou selecionar outra categoria.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {visibleChannels.map((channel, idx) => {
              const signalWidth = 55 + ((idx * 13 + channel.name.length * 5) % 40);

              return (
                <ObserverChannelCard
                  key={channel.id}
                  channel={channel}
                  idx={idx}
                  isVip={isVip}
                  isFavorite={isItemFavorite(channel.id)}
                  signalWidth={signalWidth}
                  onSelectChannel={onSelectChannel}
                  onToggleFavorite={onToggleFavorite}
                />
              );
            })}
          </div>

          {visibleChannels.length < filteredChannels.length && (
            <div ref={sentinelRef} className="text-center mt-8 pb-4">
              <button
                type="button"
                onClick={handleLoadMore}
                className="px-6 py-3 rounded-full bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-white/10 text-xs font-bold transition-all shadow-md active:scale-95"
              >
                Carregar mais canais ({visibleChannels.length} de {filteredChannels.length})
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
