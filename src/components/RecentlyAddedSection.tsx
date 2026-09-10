import React, { useState, useRef } from 'react';
import { Sparkles, Film, PlayCircle, Play, Heart, Crown, ChevronLeft, ChevronRight, Clock, Star } from 'lucide-react';
import { VodItem, FavoriteItem } from '../types';

interface RecentlyAddedSectionProps {
  items: VodItem[];
  isVip: boolean;
  onPlayVod: (vod: VodItem) => void;
  onOpenCheckout: () => void;
  favorites?: FavoriteItem[];
  onToggleFavorite?: (vod: VodItem) => void;
  title?: string;
  subtitle?: string;
}

export const RecentlyAddedSection: React.FC<RecentlyAddedSectionProps> = ({
  items,
  isVip,
  onPlayVod,
  onOpenCheckout,
  favorites = [],
  onToggleFavorite,
  title = 'Recém Adicionados',
  subtitle = 'Os mais recentes lançamentos de filmes e séries em alta definição'
}) => {
  const [filter, setFilter] = useState<'all' | 'movie' | 'series'>('all');
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Filter recently added items (marked as isRecentlyAdded, or year >= 2024, or fallback to first items)
  const recentItems = items.filter(item => {
    if (filter === 'movie' && item.type !== 'movie') return false;
    if (filter === 'series' && item.type !== 'series') return false;
    return item.isRecentlyAdded || item.year >= 2024;
  });

  // Fallback if none match filter
  const displayItems = recentItems.length > 0 
    ? recentItems 
    : items.filter(item => filter === 'all' || item.type === filter).slice(0, 8);

  const isFavorite = (id: string) => favorites.some(f => f.id === id);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = direction === 'left' ? -420 : 420;
      scrollContainerRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  if (displayItems.length === 0) return null;

  return (
    <section className="w-full mb-10" id="recently-added-section">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-lg shadow-indigo-600/25">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                {title}
              </h2>
              <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse">
                Novidades
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {subtitle}
            </p>
          </div>
        </div>

        {/* Filter Tabs & Scroll Controls */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center bg-slate-900/80 p-1 rounded-xl border border-white/10 text-xs">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                filter === 'all'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Todos ({items.filter(i => i.isRecentlyAdded || i.year >= 2024).length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('movie')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                filter === 'movie'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              <span>Filmes</span>
            </button>
            <button
              type="button"
              onClick={() => setFilter('series')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                filter === 'series'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <PlayCircle className="w-3.5 h-3.5" />
              <span>Séries</span>
            </button>
          </div>

          {/* Left / Right Carousel Controls */}
          <div className="hidden sm:flex items-center gap-1.5 ml-2">
            <button
              type="button"
              onClick={() => scroll('left')}
              aria-label="Rolar para esquerda"
              className="w-8 h-8 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center border border-white/10 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => scroll('right')}
              aria-label="Rolar para direita"
              className="w-8 h-8 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center border border-white/10 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Horizontal Scrollable Carousel */}
      <div
        ref={scrollContainerRef}
        className="flex gap-4 overflow-x-auto pb-4 scroll-smooth scrollbar-none snap-x focus:outline-none"
        tabIndex={0}
      >
        {displayItems.map(item => {
          const locked = item.isVipOnly && !isVip;

          return (
            <div
              key={item.id}
              className="flex-none w-[230px] sm:w-[260px] md:w-[280px] snap-start group relative flex flex-col rounded-2xl overflow-hidden bg-slate-900/90 border border-white/10 hover:border-indigo-500/50 shadow-lg hover:shadow-indigo-950/40 transition-all duration-300 hover:-translate-y-1"
            >
              {/* Image banner / poster */}
              <div 
                className="relative aspect-[16/10] w-full overflow-hidden bg-slate-950 cursor-pointer"
                onClick={() => {
                  if (locked) {
                    onOpenCheckout();
                  } else {
                    onPlayVod(item);
                  }
                }}
              >
                <img
                  src={item.bannerUrl || item.posterUrl}
                  alt={item.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent" />

                {/* Top Badges */}
                <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 z-10">
                  <span className="flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 shadow-md shadow-emerald-950/50">
                    <Sparkles className="w-2.5 h-2.5" />
                    Novo
                  </span>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-900/90 text-indigo-300 border border-indigo-500/30 backdrop-blur-sm">
                    {item.type === 'series' ? 'Série' : 'Filme'}
                  </span>
                </div>

                {/* Favorite button */}
                {onToggleFavorite && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite(item);
                    }}
                    className={`absolute top-2.5 right-2.5 p-1.5 rounded-full backdrop-blur-md transition-all cursor-pointer z-20 ${
                      isFavorite(item.id)
                        ? 'bg-red-600 text-white shadow-md'
                        : 'bg-slate-950/60 text-slate-300 hover:text-white hover:bg-slate-900 border border-white/10'
                    }`}
                    title={isFavorite(item.id) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                  >
                    <Heart className={`w-3.5 h-3.5 ${isFavorite(item.id) ? 'fill-white' : ''}`} />
                  </button>
                )}

                {/* Quality & Year badge at bottom of image */}
                <div className="absolute bottom-2 left-2.5 flex items-center gap-1.5 text-[10px] font-semibold text-slate-300">
                  <span className="px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm border border-white/10">
                    {item.year}
                  </span>
                  {item.rating && (
                    <span className="px-1.5 py-0.5 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-500/20">
                      {item.rating}
                    </span>
                  )}
                  <span className="px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-500/20">
                    {item.duration || 'Full HD'}
                  </span>
                </div>

                {/* Hover Play Button Overlay */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 backdrop-blur-[1px]">
                  <div className="w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-xl shadow-indigo-600/40 transform scale-75 group-hover:scale-100 transition-transform">
                    {locked ? (
                      <Crown className="w-5 h-5 text-amber-300" />
                    ) : (
                      <Play className="w-5 h-5 fill-white ml-0.5" />
                    )}
                  </div>
                </div>
              </div>

              {/* Card Meta & Details */}
              <div className="p-3.5 flex flex-col justify-between flex-1">
                <div>
                  <h3
                    onClick={() => {
                      if (locked) onOpenCheckout();
                      else onPlayVod(item);
                    }}
                    className="text-sm font-bold text-white group-hover:text-indigo-400 transition-colors line-clamp-1 cursor-pointer"
                    title={item.title}
                  >
                    {item.title}
                  </h3>

                  <p className="text-xs text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                    {item.synopsis}
                  </p>
                </div>

                <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between">
                  <div className="flex flex-wrap items-center gap-1 text-[10px] text-slate-400">
                    {item.genre.slice(0, 2).map((g, idx) => (
                      <span key={idx} className="bg-slate-800/60 px-1.5 py-0.5 rounded text-slate-300">
                        {g}
                      </span>
                    ))}
                  </div>

                  {locked ? (
                    <button
                      type="button"
                      onClick={() => onOpenCheckout()}
                      className="flex items-center gap-1 text-[11px] font-bold text-amber-400 hover:text-amber-300 cursor-pointer"
                    >
                      <Crown className="w-3 h-3" />
                      <span>VIP</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onPlayVod(item)}
                      className="flex items-center gap-1 text-[11px] font-bold text-indigo-400 hover:text-indigo-300 group-hover:translate-x-0.5 transition-transform cursor-pointer"
                    >
                      <span>Assistir</span>
                      <Play className="w-2.5 h-2.5 fill-current ml-0.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
