import React, { useState, useEffect, useMemo } from 'react';
import { 
  Film, 
  PlayCircle, 
  Star, 
  Clock, 
  Crown, 
  Play, 
  X, 
  Heart, 
  Check, 
  SlidersHorizontal,
  RotateCcw,
  Sparkles,
  Flame,
  Smile,
  Compass,
  Tag
} from 'lucide-react';
import { VodItem, FavoriteItem, WatchProgress } from '../types';
import { ContinueWatchingRow } from './ContinueWatchingRow';

interface VodSectionProps {
  items: VodItem[];
  filterType?: 'all' | 'movie' | 'series';
  searchQuery: string;
  isVip: boolean;
  onPlayVod: (vod: VodItem, initialTime?: number) => void;
  onOpenCheckout: () => void;
  favorites?: FavoriteItem[];
  onToggleFavorite?: (vod: VodItem) => void;
  watchProgress?: WatchProgress[];
  onRemoveProgress?: (id: string) => void;
}

export const VodSection: React.FC<VodSectionProps> = ({
  items,
  filterType = 'all',
  searchQuery,
  isVip,
  onPlayVod,
  onOpenCheckout,
  favorites = [],
  onToggleFavorite,
  watchProgress = [],
  onRemoveProgress
}) => {
  const [activeType, setActiveType] = useState<'all' | 'movie' | 'series'>(filterType);
  const [selectedSubgenre, setSelectedSubgenre] = useState<string>('Todos');
  const [activeModalItem, setActiveModalItem] = useState<VodItem | null>(null);

  // Synchronize activeType if parent tab changes
  useEffect(() => {
    if (filterType) {
      setActiveType(filterType);
    }
  }, [filterType]);

  const isItemFavorite = (id: string) => favorites.some(f => f.id === id);

  // Common subgenres with priority display (including Ação, Comédia, Documentário as requested)
  const PRESET_SUBGENRES = [
    'Todos',
    'Ação',
    'Comédia',
    'Documentário',
    'Drama',
    'Ficção Científica',
    'Aventura',
    'Crime',
    'Suspense',
    'Terror',
    'Animação',
    'Nacional',
    'Biografia',
    'Esporte'
  ];

  // Extract all unique genres from items
  const catalogGenres = useMemo(() => {
    return Array.from(
      new Set(items.flatMap(i => (Array.isArray(i.genre) ? i.genre : [])))
    ).filter(Boolean);
  }, [items]);

  // Combined subgenre list without duplicates
  const allSubgenres = useMemo(() => {
    return [
      'Todos',
      ...Array.from(new Set([...PRESET_SUBGENRES.filter(g => g !== 'Todos'), ...catalogGenres]))
    ];
  }, [catalogGenres]);

  // Helper to count items in a subgenre given the current activeType
  const getSubgenreCount = (subgenre: string) => {
    return items.filter(item => {
      if (activeType !== 'all' && item.type !== activeType) return false;
      if (subgenre === 'Todos') return true;
      return item.genre.some(g => g.toLowerCase() === subgenre.toLowerCase() || g.toLowerCase().includes(subgenre.toLowerCase()));
    }).length;
  };

  // Filter items based on activeType, selectedSubgenre and searchQuery
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (activeType !== 'all' && item.type !== activeType) return false;
      if (selectedSubgenre !== 'Todos') {
        const matchesSubgenre = item.genre.some(
          g => g.toLowerCase() === selectedSubgenre.toLowerCase() || 
               g.toLowerCase().includes(selectedSubgenre.toLowerCase())
        );
        if (!matchesSubgenre) return false;
      }
      if (searchQuery && !item.title.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [items, activeType, selectedSubgenre, searchQuery]);

  // Helper for formatting playback time in minutes and seconds
  const formatSeconds = (secs?: number) => {
    if (!secs || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    if (m >= 60) {
      const h = Math.floor(m / 60);
      const remM = m % 60;
      return `${h}h ${remM < 10 ? '0' : ''}${remM}m`;
    }
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Find progress for the currently opened modal item
  const activeModalProgress = activeModalItem 
    ? watchProgress.find(p => p.id === activeModalItem.id) 
    : undefined;

  const isModalItemWatched = Boolean(
    activeModalProgress && (
      activeModalProgress.percent >= 90 || 
      (activeModalProgress.duration > 0 && activeModalProgress.duration - activeModalProgress.currentTime < 30)
    )
  );

  return (
    <div className="w-full">
      {/* Continue Watching Row if user has progress */}
      {watchProgress.length > 0 && !searchQuery && selectedSubgenre === 'Todos' && (
        <div className="mb-8">
          <ContinueWatchingRow
            progressItems={watchProgress}
            allVodItems={items}
            onPlayVod={onPlayVod}
            onRemoveProgress={onRemoveProgress}
          />
        </div>
      )}

      {/* Top Filter Bar: Type Tabs (Todos, Filmes, Séries) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-1 bg-slate-900/60 p-1 rounded-2xl border border-white/10 shadow-sm w-fit">
          <button
            id="vod-filter-type-all"
            type="button"
            onClick={() => setActiveType('all')}
            className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeType === 'all'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            Todos
          </button>
          <button
            id="vod-filter-type-movie"
            type="button"
            onClick={() => setActiveType('movie')}
            className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeType === 'movie'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            Filmes
          </button>
          <button
            id="vod-filter-type-series"
            type="button"
            onClick={() => setActiveType('series')}
            className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeType === 'series'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            Séries
          </button>
        </div>

        {/* Active Filter Counter & Clear Option */}
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>{filteredItems.length} {filteredItems.length === 1 ? 'título' : 'títulos'}</span>
          {selectedSubgenre !== 'Todos' && (
            <button
              id="vod-subgenre-clear-btn"
              type="button"
              onClick={() => setSelectedSubgenre('Todos')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10 transition-colors cursor-pointer"
            >
              <span>{selectedSubgenre}</span>
              <X className="w-3 h-3 text-slate-400 hover:text-white" />
            </button>
          )}
        </div>
      </div>

      {/* Subgenre Selector (Ação, Comédia, Documentário, etc.) */}
      <div 
        id="vod-subgenre-selector" 
        className="relative bg-slate-900/40 border border-white/5 rounded-2xl p-3 mb-6 shadow-sm"
      >
        <div className="flex items-center justify-between gap-2 mb-2 px-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
            <span>Subgêneros</span>
          </div>
          {selectedSubgenre !== 'Todos' && (
            <span className="text-[11px] text-indigo-400 font-medium">
              Filtrado por: <strong className="text-white">{selectedSubgenre}</strong>
            </span>
          )}
        </div>

        {/* Scrollable Subgenre Pills with counts */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 pt-0.5 scrollbar-thin scrollbar-thumb-white/10">
          {allSubgenres.map(genre => {
            const count = getSubgenreCount(genre);
            const isSelected = selectedSubgenre.toLowerCase() === genre.toLowerCase();

            // Skip genres that have 0 items unless it's Todos or the active one
            if (count === 0 && genre !== 'Todos' && !isSelected) {
              return null;
            }

            return (
              <button
                key={genre}
                id={`vod-subgenre-pill-${genre.toLowerCase().replace(/\s+/g, '-')}`}
                type="button"
                onClick={() => setSelectedSubgenre(genre)}
                className={`whitespace-nowrap flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-600/30 border border-indigo-400/40'
                    : 'bg-slate-900/80 text-slate-300 hover:text-white hover:bg-slate-800 border border-white/10'
                }`}
              >
                <span>{genre}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  isSelected 
                    ? 'bg-indigo-950/60 text-indigo-200' 
                    : 'bg-slate-800 text-slate-400'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid of VOD Items */}
      {filteredItems.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-slate-900/50 border border-white/5">
          <Film className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-300 font-medium">Nenhum título encontrado</p>
          <p className="text-xs text-slate-500 mt-1 mb-4">
            Não encontramos conteúdos para o subgênero &quot;{selectedSubgenre}&quot;.
          </p>
          <button
            type="button"
            onClick={() => setSelectedSubgenre('Todos')}
            className="px-4 py-2 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
          >
            Ver Todos os Títulos
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filteredItems.map(item => {
            const isLocked = item.isVipOnly && !isVip;

            // Check user's watch progress for this VOD
            const progress = watchProgress.find(p => p.id === item.id);
            const isWatched = Boolean(
              progress && (
                progress.percent >= 90 || 
                (progress.duration > 0 && progress.duration - progress.currentTime < 30)
              )
            );
            const isInProgress = Boolean(
              progress && progress.percent > 0 && !isWatched
            );

            return (
              <div
                key={item.id}
                id={`vod-card-${item.id}`}
                onClick={() => {
                  const initialTime = (isInProgress && progress?.currentTime && progress.currentTime > 5) 
                    ? progress.currentTime 
                    : undefined;
                  onPlayVod(item, initialTime);
                }}
                className="group relative flex flex-col rounded-2xl overflow-hidden bg-slate-900 border border-white/5 hover:border-indigo-500/50 transition-all cursor-pointer hover:shadow-2xl hover:shadow-indigo-950/20 hover:-translate-y-1.5"
              >
                {/* Poster image */}
                <div className="relative aspect-[2/3] w-full overflow-hidden bg-slate-950">
                  <img
                    src={item.posterUrl}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-80" />

                  {/* Top Left Badges (Type, Rating, Watched Checkmark or In-Progress) */}
                  <div className="absolute top-2.5 left-2.5 flex flex-col gap-1 z-10">
                    {/* Watched Checkmark Badge */}
                    {isWatched && (
                      <div 
                        id={`vod-watched-badge-${item.id}`}
                        className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold shadow-md shadow-emerald-950/60 backdrop-blur-sm border border-emerald-400/40"
                        title="Assistido completamente"
                      >
                        <Check className="w-3 h-3 stroke-[2.5]" />
                        <span>Assistido</span>
                      </div>
                    )}

                    {/* In-Progress Percentage Badge */}
                    {isInProgress && progress && (
                      <div 
                        id={`vod-progress-badge-${item.id}`}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-900/90 text-indigo-300 text-[10px] font-semibold border border-indigo-500/40 backdrop-blur-sm"
                        title={`${Math.round(progress.percent)}% assistido`}
                      >
                        <Clock className="w-2.5 h-2.5 text-indigo-400" />
                        <span>{Math.round(progress.percent)}%</span>
                      </div>
                    )}

                    <span className="text-[10px] font-semibold uppercase px-2.5 py-0.5 rounded-full bg-slate-900/90 text-slate-200 border border-white/10 w-fit">
                      {item.type === 'movie' ? 'Filme' : 'Série'}
                    </span>
                    {item.rating && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-900/90 text-amber-300 border border-white/10 w-fit">
                        ★ {item.rating}
                      </span>
                    )}
                  </div>

                  {/* Top Right: Info + Favorite Button + VIP badge */}
                  <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1.5">
                    {isLocked && (
                      <div className="bg-indigo-600 text-white px-2.5 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1 shadow-md shadow-indigo-600/20">
                        <Crown className="w-3 h-3" />
                        VIP
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveModalItem(item);
                      }}
                      className="p-1.5 rounded-full backdrop-blur-md bg-slate-900/80 text-white/70 border border-white/10 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
                      title="Sinopse e Detalhes"
                    >
                      <Film className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite?.(item);
                      }}
                      className={`p-1.5 rounded-full backdrop-blur-md border transition-all cursor-pointer ${
                        isItemFavorite(item.id)
                          ? 'bg-red-600/30 text-red-400 border-red-500/50 hover:bg-red-600/40'
                          : 'bg-slate-900/80 text-white/70 border-white/10 hover:text-white hover:bg-slate-800'
                      }`}
                      title={isItemFavorite(item.id) ? 'Remover dos Favoritos' : 'Adicionar aos Favoritos'}
                    >
                      <Heart className={`w-3.5 h-3.5 ${isItemFavorite(item.id) ? 'fill-red-500 text-red-500' : ''}`} />
                    </button>
                  </div>

                  {/* Play icon overlay on hover */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-slate-950/40 backdrop-blur-[2px] transition-all z-10">
                    <div className="w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-xl shadow-indigo-600/40">
                      <Play className="w-5 h-5 fill-white ml-0.5" />
                    </div>
                  </div>

                  {/* Visual Progress Bar at the bottom of the poster */}
                  {isWatched ? (
                    <div 
                      id={`vod-progress-bar-${item.id}`}
                      className="absolute bottom-0 inset-x-0 h-1.5 bg-slate-950/90 z-20"
                      title="Assistido completamente (100%)"
                    >
                      <div className="h-full bg-emerald-500 w-full shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                    </div>
                  ) : isInProgress && progress ? (
                    <div 
                      id={`vod-progress-bar-${item.id}`}
                      className="absolute bottom-0 inset-x-0 h-1.5 bg-slate-950/90 z-20"
                      title={`${Math.round(progress.percent)}% assistido`}
                    >
                      <div 
                        className="h-full bg-indigo-500 rounded-r shadow-[0_0_8px_rgba(99,102,241,0.8)] transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(5, progress.percent))}%` }}
                      />
                    </div>
                  ) : null}
                </div>

                {/* Card Information Footer */}
                <div className="p-3.5">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-semibold text-white group-hover:text-indigo-400 transition-colors truncate flex-1">
                      {item.title}
                    </h3>
                    {isWatched && (
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" title="Assistido" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                    <span>{item.year}</span>
                    <span>•</span>
                    <span className="truncate">{item.duration || item.genre[0]}</span>
                    {isInProgress && progress && (
                      <>
                        <span>•</span>
                        <span className="text-indigo-300 font-mono text-[11px]">
                          {Math.round(progress.percent)}%
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* VOD Details Modal */}
      {activeModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative w-full max-w-2xl bg-slate-900 border border-white/10 rounded-3xl overflow-hidden shadow-2xl animate-fadeIn">
            {/* Modal Header Banner */}
            <div className="relative h-56 w-full overflow-hidden bg-slate-950">
              <img
                src={activeModalItem.bannerUrl}
                alt={activeModalItem.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/60 to-transparent" />
              <button
                type="button"
                onClick={() => setActiveModalItem(null)}
                className="absolute top-4 right-4 p-2 rounded-full bg-slate-950/80 hover:bg-white/10 text-white border border-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="absolute bottom-4 left-6 right-6">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs uppercase font-semibold text-indigo-400">
                    {activeModalItem.type === 'movie' ? 'Filme Sob Demanda' : 'Série MAXTV'}
                  </span>
                  <span className="text-xs text-slate-300">• {activeModalItem.year}</span>
                  {activeModalItem.rating && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-amber-300 border border-white/10 font-semibold">
                      ★ {activeModalItem.rating}
                    </span>
                  )}
                  {isModalItemWatched && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold">
                      <Check className="w-3 h-3 text-emerald-400" />
                      Assistido
                    </span>
                  )}
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{activeModalItem.title}</h2>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              {/* Watch Progress Banner inside modal */}
              {activeModalProgress && (
                <div className="mb-4 p-3 rounded-xl bg-slate-950/70 border border-white/10 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    {isModalItemWatched ? (
                      <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                        <Check className="w-4 h-4" />
                      </div>
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
                        <Clock className="w-4 h-4" />
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-semibold text-white">
                        {isModalItemWatched ? 'Você já concluiu este título' : 'Reprodução em andamento'}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {isModalItemWatched
                          ? '100% assistido'
                          : `Parou aos ${formatSeconds(activeModalProgress.currentTime)} (${Math.round(activeModalProgress.percent)}%)`}
                      </p>
                    </div>
                  </div>

                  {activeModalProgress.currentTime > 5 && (
                    <button
                      type="button"
                      onClick={() => {
                        const itm = activeModalItem;
                        const time = activeModalProgress.currentTime;
                        setActiveModalItem(null);
                        onPlayVod(itm, time);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition-all cursor-pointer"
                    >
                      Continuar ({formatSeconds(activeModalProgress.currentTime)})
                    </button>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2 mb-4">
                {activeModalItem.genre.map(g => (
                  <span key={g} className="text-xs px-3 py-1 rounded-full bg-slate-800 text-slate-300 border border-white/10">
                    {g}
                  </span>
                ))}
              </div>

              <p className="text-sm text-slate-300 leading-relaxed mb-6 font-normal">
                {activeModalItem.synopsis}
              </p>

              {/* Episodes if series */}
              {activeModalItem.seasons && activeModalItem.seasons.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-xs uppercase font-semibold text-slate-400 mb-2.5">Episódios Disponíveis:</h4>
                  <div className="space-y-2 max-h-44 overflow-y-auto pr-2">
                    {activeModalItem.seasons[0].episodes.map(ep => (
                      <div
                        key={ep.episodeNumber}
                        onClick={() => {
                          setActiveModalItem(null);
                          onPlayVod({
                            ...activeModalItem,
                            streamUrl: ep.streamUrl
                          });
                        }}
                        className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 hover:bg-white/5 border border-white/5 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <Play className="w-4 h-4 text-indigo-400 fill-indigo-400" />
                          <span className="text-xs font-semibold text-white">{ep.title}</span>
                        </div>
                        <span className="text-xs text-slate-400">{ep.duration}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => onToggleFavorite?.(activeModalItem)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-full border text-xs font-semibold transition-all cursor-pointer ${
                    isItemFavorite(activeModalItem.id)
                      ? 'bg-red-600/20 text-red-400 border-red-500/40 hover:bg-red-600/30'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-white/10'
                  }`}
                >
                  <Heart className={`w-4 h-4 ${isItemFavorite(activeModalItem.id) ? 'fill-red-500 text-red-500' : ''}`} />
                  <span>{isItemFavorite(activeModalItem.id) ? 'Nos Favoritos' : 'Favoritar'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveModalItem(null)}
                  className="px-5 py-2.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-white/10 transition-colors cursor-pointer"
                >
                  Fechar
                </button>

                {!isVip && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveModalItem(null);
                      onOpenCheckout();
                    }}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold text-xs sm:text-sm border border-amber-500/40 transition-all cursor-pointer"
                  >
                    <Crown className="w-3.5 h-3.5 text-amber-400" />
                    <span>Plano VIP R$ 10,00</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    const itm = activeModalItem;
                    setActiveModalItem(null);
                    onPlayVod(itm, 0); // Start from beginning
                  }}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs sm:text-sm shadow-lg shadow-indigo-600/25 transition-all cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>
                    {isModalItemWatched 
                      ? 'Assistir Novamente' 
                      : isVip 
                        ? 'Assistir Agora' 
                        : 'Assistir (Prévia 5 min)'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
