import React, { useState } from 'react';
import { 
  Heart, Tv, Film, PlayCircle, Play, Trash2, Search, 
  Crown, Sparkles, LogIn, ArrowRight, Clock, Star
} from 'lucide-react';
import { FavoriteItem, Channel, VodItem, User, WatchProgress } from '../types';
import { ContinueWatchingRow } from './ContinueWatchingRow';

interface FavoritesViewProps {
  favorites: FavoriteItem[];
  watchProgress: WatchProgress[];
  currentUser: User | null;
  channels: Channel[];
  vodItems: VodItem[];
  isVip: boolean;
  onPlayChannel: (channel: Channel) => void;
  onPlayVod: (vod: VodItem, initialTime?: number) => void;
  onRemoveFavorite: (id: string) => void;
  onRemoveProgress: (id: string) => void;
  onOpenAuth: () => void;
  onNavigateTab: (tab: 'live' | 'movies' | 'series') => void;
  onOpenCheckout: () => void;
}

export const FavoritesView: React.FC<FavoritesViewProps> = ({
  favorites,
  watchProgress,
  currentUser,
  channels,
  vodItems,
  isVip,
  onPlayChannel,
  onPlayVod,
  onRemoveFavorite,
  onRemoveProgress,
  onOpenAuth,
  onNavigateTab,
  onOpenCheckout
}) => {
  const [filter, setFilter] = useState<'all' | 'channel' | 'vod'>('all');
  const [search, setSearch] = useState<string>('');

  // Filter items
  const filteredFavorites = favorites.filter(fav => {
    if (filter === 'channel' && fav.type !== 'channel') return false;
    if (filter === 'vod' && fav.type !== 'vod') return false;

    if (search.trim()) {
      const term = search.toLowerCase();
      const title = (fav.title || fav.name || '').toLowerCase();
      const category = (fav.category || '').toLowerCase();
      return title.includes(term) || category.includes(term);
    }
    return true;
  });

  const channelsCount = favorites.filter(f => f.type === 'channel').length;
  const vodCount = favorites.filter(f => f.type === 'vod').length;

  const handlePlayFavorite = (fav: FavoriteItem) => {
    if (fav.type === 'channel') {
      const foundCh = channels.find(c => c.id === fav.id);
      if (foundCh) {
        onPlayChannel(foundCh);
      } else {
        // Fallback Channel object from snapshot
        const reconstructedChannel: Channel = {
          id: fav.id,
          name: fav.name || fav.title || 'Canal Favorito',
          category: (fav.category as any) || 'Abertos',
          logo: fav.logo || '',
          isActive: true,
          isVipOnly: fav.isVipOnly,
          sources: fav.streamUrl ? [{ url: fav.streamUrl }] : []
        };
        onPlayChannel(reconstructedChannel);
      }
    } else {
      const foundVod = vodItems.find(v => v.id === fav.id);
      if (foundVod) {
        onPlayVod(foundVod);
      } else {
        // Fallback VodItem object from snapshot
        const reconstructedVod: VodItem = {
          id: fav.id,
          title: fav.title || fav.name || 'Filme Favorito',
          type: 'movie',
          year: fav.year || new Date().getFullYear(),
          genre: fav.genre || [fav.category || 'Geral'],
          bannerUrl: fav.bannerUrl || fav.posterUrl || '',
          posterUrl: fav.posterUrl || '',
          synopsis: fav.synopsis || 'Conteúdo salvo na lista de favoritos.',
          streamUrl: fav.streamUrl || '',
          duration: fav.duration,
          rating: fav.rating,
          isVipOnly: fav.isVipOnly
        };
        onPlayVod(reconstructedVod);
      }
    }
  };

  return (
    <div className="w-full space-y-8 animate-fadeIn">
      {/* Top Banner / Heading */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 border border-white/10 p-6 sm:p-8 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-red-500/20 border border-red-500/30 text-red-400">
                <Heart className="w-4 h-4 fill-red-500" />
              </span>
              <span className="text-xs uppercase font-bold tracking-wider text-indigo-400">
                Minha Lista Pessoal
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Favoritos & Continuar Assistindo
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-xl font-normal">
              Acesse seus canais ao vivo prediletos e retome seus filmes e séries de onde parou em qualquer dispositivo.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {!currentUser ? (
              <button
                type="button"
                onClick={onOpenAuth}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-semibold shadow-lg shadow-indigo-600/25 transition-all cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>Entrar para Sincronizar</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-slate-900/90 border border-white/10 text-xs text-slate-300">
                <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                <span>Sincronizado na conta: <strong>{currentUser.name}</strong></span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Continuar Assistindo Row (Always in highlight at the top of favorites) */}
      {watchProgress && watchProgress.length > 0 && (
        <ContinueWatchingRow
          items={watchProgress}
          onPlay={onPlayVod}
          onRemove={onRemoveProgress}
          allVodItems={vodItems}
          title="Continuar Assistindo"
        />
      )}

      {/* Favorites Header & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <span>Seus Títulos Favoritos</span>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-900 text-slate-400 border border-white/10">
              {favorites.length}
            </span>
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Subtabs */}
          <div className="flex items-center gap-1 bg-slate-900/70 p-1 rounded-full border border-white/10">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                filter === 'all'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Todos ({favorites.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('channel')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                filter === 'channel'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Canais ({channelsCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter('vod')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                filter === 'vod'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Filmes/Séries ({vodCount})
            </button>
          </div>

          {/* Quick Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar em favoritos..."
              className="pl-8 pr-3 py-1.5 rounded-full bg-slate-900 border border-white/10 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-44 sm:w-56"
            />
          </div>
        </div>
      </div>

      {/* Favorites List */}
      {filteredFavorites.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-slate-900/50 border border-white/5 space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center mx-auto text-indigo-400">
            <Heart className="w-8 h-8 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">
              {search ? 'Nenhum favorito coincide com a busca' : 'Nenhum favorito adicionado ainda'}
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 font-normal">
              {search 
                ? 'Tente buscar com outro termo ou limpe o filtro.' 
                : 'Você pode marcar canais ao vivo e filmes com o ícone de coração em qualquer lugar do aplicativo para tê-los salvos aqui.'
              }
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => onNavigateTab('live')}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/25 transition-all cursor-pointer"
            >
              <Tv className="w-4 h-4" />
              <span>Explorar Canais ao Vivo</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('movies')}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-white/10 transition-all cursor-pointer"
            >
              <Film className="w-4 h-4" />
              <span>Ver Catálogo de Filmes</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filteredFavorites.map(item => {
            const isChannel = item.type === 'channel';
            const isLocked = item.isVipOnly && !isVip;

            return (
              <div
                key={item.id}
                className="group relative flex flex-col justify-between rounded-2xl overflow-hidden bg-slate-900 border border-white/10 hover:border-indigo-500/50 transition-all shadow-lg hover:shadow-indigo-950/30 hover:-translate-y-1"
              >
                {/* Media Image / Logo container */}
                <div 
                  className={`relative w-full overflow-hidden bg-slate-950 cursor-pointer ${
                    isChannel ? 'aspect-video flex items-center justify-center p-4' : 'aspect-[2/3]'
                  }`}
                  onClick={() => handlePlayFavorite(item)}
                >
                  {isChannel ? (
                    item.logo ? (
                      <img
                        src={item.logo}
                        alt={item.name || item.title}
                        className="max-h-12 max-w-full object-contain filter drop-shadow group-hover:scale-105 transition-transform"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <Tv className="w-10 h-10 text-slate-500" />
                    )
                  ) : (
                    <img
                      src={item.posterUrl || item.bannerUrl}
                      alt={item.title || item.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                  )}

                  {!isChannel && (
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-80" />
                  )}

                  {/* Badges */}
                  <div className="absolute top-2 left-2 flex items-center gap-1 z-10">
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-900/90 text-slate-200 border border-white/10">
                      {isChannel ? 'Canal' : 'Filme'}
                    </span>
                    {item.rating && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-900/90 text-amber-300 border border-white/10">
                        ★ {item.rating}
                      </span>
                    )}
                  </div>

                  {/* Remove Favorite Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveFavorite(item.id);
                    }}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-slate-950/80 hover:bg-red-600 text-red-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer border border-white/10 z-20"
                    title="Remover dos favoritos"
                  >
                    <Heart className="w-3.5 h-3.5 fill-current" />
                  </button>

                  {/* Play Overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-slate-950/40 backdrop-blur-[2px] transition-all">
                    <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-xl shadow-indigo-600/40">
                      <Play className="w-4 h-4 fill-white ml-0.5" />
                    </div>
                  </div>
                </div>

                {/* Card details */}
                <div className="p-3 flex flex-col justify-between flex-1">
                  <div>
                    <h3 
                      onClick={() => handlePlayFavorite(item)}
                      className="text-xs sm:text-sm font-semibold text-white group-hover:text-indigo-400 transition-colors truncate cursor-pointer"
                      title={item.name || item.title}
                    >
                      {item.name || item.title}
                    </h3>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">
                      {isChannel ? (item.category || 'Canal ao Vivo') : (item.year ? `${item.year} • ${item.genre?.[0] || 'Filme'}` : 'Filme HD')}
                    </p>
                  </div>

                  <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => handlePlayFavorite(item)}
                      className="flex items-center gap-1 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
                    >
                      <Play className="w-3 h-3 fill-indigo-400" />
                      <span>Assistir</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onRemoveFavorite(item.id)}
                      className="text-slate-500 hover:text-red-400 transition-colors cursor-pointer p-1"
                      title="Remover"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
