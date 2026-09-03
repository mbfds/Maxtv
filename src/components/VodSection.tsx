import React, { useState } from 'react';
import { Film, PlayCircle, Star, Clock, Calendar, Crown, Play, X, Info, Heart } from 'lucide-react';
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
  const [selectedGenre, setSelectedGenre] = useState<string>('Todos');
  const [activeModalItem, setActiveModalItem] = useState<VodItem | null>(null);

  const isItemFavorite = (id: string) => favorites.some(f => f.id === id);

  // Extract all unique genres
  const allGenres = ['Todos', ...Array.from(new Set(items.flatMap(i => i.genre)))];

  const filteredItems = items.filter(item => {
    if (activeType !== 'all' && item.type !== activeType) return false;
    if (selectedGenre !== 'Todos' && !item.genre.includes(selectedGenre)) return false;
    if (searchQuery && !item.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="w-full">
      {/* Continue Watching Row if user has progress */}
      {watchProgress.length > 0 && !searchQuery && selectedGenre === 'Todos' && (
        <div className="mb-8">
          <ContinueWatchingRow
            progressItems={watchProgress}
            allVodItems={items}
            onPlayVod={onPlayVod}
            onRemoveProgress={onRemoveProgress}
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-1 bg-slate-900/50 p-1.5 rounded-full border border-white/10">
          <button
            type="button"
            onClick={() => setActiveType('all')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
              activeType === 'all'
                ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            Todos
          </button>
          <button
            type="button"
            onClick={() => setActiveType('movie')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
              activeType === 'movie'
                ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            Filmes
          </button>
          <button
            type="button"
            onClick={() => setActiveType('series')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
              activeType === 'series'
                ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            Séries
          </button>
        </div>

        {/* Genre pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
          {allGenres.slice(0, 8).map(genre => (
            <button
              key={genre}
              type="button"
              onClick={() => setSelectedGenre(genre)}
              className={`whitespace-nowrap px-3.5 py-1 rounded-full text-xs font-medium transition-all ${
                selectedGenre === genre
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20 font-semibold'
                  : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-white/5'
              }`}
            >
              {genre}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of VOD */}
      {filteredItems.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-slate-900/50 border border-white/5">
          <Film className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-300 font-medium">Nenhum título encontrado</p>
          <p className="text-xs text-slate-500 mt-1">Tente ajustar seus filtros ou termo de busca.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filteredItems.map(item => {
            const isLocked = item.isVipOnly && !isVip;

            return (
              <div
                key={item.id}
                onClick={() => setActiveModalItem(item)}
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

                  {/* Badges */}
                  <div className="absolute top-2.5 left-2.5 flex flex-col gap-1">
                    <span className="text-[10px] font-semibold uppercase px-2.5 py-0.5 rounded-full bg-slate-900/90 text-slate-200 border border-white/10">
                      {item.type === 'movie' ? 'Filme' : 'Série'}
                    </span>
                    {item.rating && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-900/90 text-amber-300 border border-white/10">
                        ★ {item.rating}
                      </span>
                    )}
                  </div>

                  {/* Top Right: Favorite Button + VIP badge */}
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
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-slate-950/40 backdrop-blur-[2px] transition-all">
                    <div className="w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-xl shadow-indigo-600/40">
                      <Play className="w-5 h-5 fill-white ml-0.5" />
                    </div>
                  </div>
                </div>

                {/* Info */}
                <div className="p-3.5">
                  <h3 className="text-sm font-semibold text-white group-hover:text-indigo-400 transition-colors truncate">
                    {item.title}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                    <span>{item.year}</span>
                    <span>•</span>
                    <span className="truncate">{item.duration || item.genre[0]}</span>
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
                className="absolute top-4 right-4 p-2 rounded-full bg-slate-950/80 hover:bg-white/10 text-white border border-white/10 transition-colors"
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
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{activeModalItem.title}</h2>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6">
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

              {/* Action */}
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
                  className="px-5 py-2.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-white/10 transition-colors"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const itm = activeModalItem;
                    setActiveModalItem(null);
                    if (itm.isVipOnly && !isVip) {
                      onOpenCheckout();
                    } else {
                      onPlayVod(itm);
                    }
                  }}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs sm:text-sm shadow-lg shadow-indigo-600/25 transition-all"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>{activeModalItem.isVipOnly && !isVip ? 'Liberar com VIP Pix' : 'Assistir Agora'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
