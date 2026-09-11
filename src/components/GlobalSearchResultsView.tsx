import React, { useState } from 'react';
import { Search, Tv, Film, PlayCircle, Play, Heart, Crown, X, Sparkles, Filter } from 'lucide-react';
import { Channel, VodItem, FavoriteItem } from '../types';
import { CachedImage } from './CachedImage';

interface GlobalSearchResultsViewProps {
  searchQuery: string;
  onClearSearch: () => void;
  channels: Channel[];
  vodItems: VodItem[];
  isVip: boolean;
  onPlayChannel: (channel: Channel) => void;
  onPlayVod: (vod: VodItem) => void;
  onOpenCheckout: () => void;
  favorites?: FavoriteItem[];
  onToggleFavoriteChannel?: (channel: Channel) => void;
  onToggleFavoriteVod?: (vod: VodItem) => void;
}

export const GlobalSearchResultsView: React.FC<GlobalSearchResultsViewProps> = ({
  searchQuery,
  onClearSearch,
  channels,
  vodItems,
  isVip,
  onPlayChannel,
  onPlayVod,
  onOpenCheckout,
  favorites = [],
  onToggleFavoriteChannel,
  onToggleFavoriteVod
}) => {
  const [activeFilter, setActiveFilter] = useState<'all' | 'channels' | 'movies' | 'series'>('all');

  const normalize = (str: string) => {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  };

  const queryNorm = normalize(searchQuery);

  // Filter Channels
  const matchedChannels = channels.filter(ch => {
    if (!ch.isActive) return false;
    const nameMatch = normalize(ch.name).includes(queryNorm);
    const catMatch = normalize(ch.category).includes(queryNorm);
    const epgNowMatch = ch.epgNow ? normalize(ch.epgNow).includes(queryNorm) : false;
    return nameMatch || catMatch || epgNowMatch;
  });

  // Filter Movies
  const matchedMovies = vodItems.filter(item => {
    if (item.type !== 'movie') return false;
    const titleMatch = normalize(item.title).includes(queryNorm);
    const genreMatch = item.genre.some(g => normalize(g).includes(queryNorm));
    const synopsisMatch = item.synopsis ? normalize(item.synopsis).includes(queryNorm) : false;
    const yearMatch = item.year.toString().includes(queryNorm);
    return titleMatch || genreMatch || synopsisMatch || yearMatch;
  });

  // Filter Series
  const matchedSeries = vodItems.filter(item => {
    if (item.type !== 'series') return false;
    const titleMatch = normalize(item.title).includes(queryNorm);
    const genreMatch = item.genre.some(g => normalize(g).includes(queryNorm));
    const synopsisMatch = item.synopsis ? normalize(item.synopsis).includes(queryNorm) : false;
    const yearMatch = item.year.toString().includes(queryNorm);
    return titleMatch || genreMatch || synopsisMatch || yearMatch;
  });

  const totalMatches = matchedChannels.length + matchedMovies.length + matchedSeries.length;
  const isFavorite = (id: string) => favorites.some(f => f.id === id);

  return (
    <div className="w-full py-2 animate-in fade-in duration-200" id="global-search-results-view">
      {/* Search Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/70 border border-white/10 rounded-3xl p-5 sm:p-6 mb-8 backdrop-blur-md shadow-xl">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
            <Search className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                Busca Global: &ldquo;<span className="text-indigo-400">{searchQuery}</span>&rdquo;
              </h1>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-600 text-white shadow-sm">
                {totalMatches} {totalMatches === 1 ? 'resultado' : 'resultados'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Filtro simultâneo em canais ao vivo, filmes e séries do catálogo
            </p>
          </div>
        </div>

        {/* Clear Search & Filter Chips */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onClearSearch}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs font-semibold transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>Limpar Busca</span>
          </button>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 scrollbar-none">
        <button
          type="button"
          onClick={() => setActiveFilter('all')}
          className={`whitespace-nowrap px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
            activeFilter === 'all'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25 border border-indigo-500'
              : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-white/5 hover:bg-white/5'
          }`}
        >
          Todos os Resultados ({totalMatches})
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter('channels')}
          className={`flex items-center gap-1.5 whitespace-nowrap px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
            activeFilter === 'channels'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25 border border-indigo-500'
              : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-white/5 hover:bg-white/5'
          }`}
        >
          <Tv className="w-4 h-4" />
          <span>Canais ao Vivo ({matchedChannels.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter('movies')}
          className={`flex items-center gap-1.5 whitespace-nowrap px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
            activeFilter === 'movies'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25 border border-indigo-500'
              : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-white/5 hover:bg-white/5'
          }`}
        >
          <Film className="w-4 h-4" />
          <span>Filmes ({matchedMovies.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter('series')}
          className={`flex items-center gap-1.5 whitespace-nowrap px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
            activeFilter === 'series'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25 border border-indigo-500'
              : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-white/5 hover:bg-white/5'
          }`}
        >
          <PlayCircle className="w-4 h-4" />
          <span>Séries ({matchedSeries.length})</span>
        </button>
      </div>

      {/* Zero Results State */}
      {totalMatches === 0 && (
        <div className="bg-slate-900/50 border border-white/10 rounded-3xl p-12 text-center max-w-lg mx-auto my-8">
          <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Nenhum resultado encontrado</h3>
          <p className="text-sm text-slate-400 mb-6">
            Não encontramos canais, filmes ou séries correspondentes a &ldquo;{searchQuery}&rdquo;.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
            <span className="text-xs text-slate-500">Sugestões de busca:</span>
            {['Globo', 'CazéTV', 'Duna', 'Senna', 'Auto da Compadecida', 'Esportes'].map((sug) => (
              <button
                key={sug}
                type="button"
                onClick={() => {
                  // user can click suggestion
                  const event = new CustomEvent('maxtv_set_search', { detail: sug });
                  window.dispatchEvent(event);
                }}
                className="text-xs px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
              >
                {sug}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClearSearch}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors shadow-lg shadow-indigo-600/25 cursor-pointer"
          >
            Limpar e ver catálogo completo
          </button>
        </div>
      )}

      {/* SECTION 1: CANAIS AO VIVO */}
      {(activeFilter === 'all' || activeFilter === 'channels') && matchedChannels.length > 0 && (
        <div className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-red-600/20 border border-red-500/30 flex items-center justify-center text-red-400">
                <Tv className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  <span>Canais ao Vivo</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-950/80 text-red-400 border border-red-500/30">
                    {matchedChannels.length}
                  </span>
                </h2>
                <p className="text-xs text-slate-400">Transmissões de TV com sinal direto</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {matchedChannels.map(channel => {
              const locked = channel.isVipOnly && !isVip;

              return (
                <div
                  key={channel.id}
                  onClick={() => {
                    if (locked) onOpenCheckout();
                    else onPlayChannel(channel);
                  }}
                  className="group relative flex flex-col rounded-2xl overflow-hidden bg-slate-900 border border-white/10 hover:border-indigo-500/50 transition-all duration-200 shadow-md hover:shadow-indigo-950/40 hover:-translate-y-1 cursor-pointer"
                >
                  <div className="relative aspect-video w-full flex items-center justify-center p-4 bg-slate-950">
                    <CachedImage
                      src={channel.logo}
                      alt={channel.name}
                      fallbackType="channel"
                      fallbackText={channel.name}
                      className="max-h-12 max-w-[80%] object-contain filter group-hover:scale-110 transition-transform duration-300"
                      loading="lazy"
                      decoding="async"
                      showSkeleton={false}
                    />

                    {/* Live Pulse Indicator */}
                    <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-950/80 border border-red-500/30 backdrop-blur-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-[9px] font-bold uppercase tracking-wider text-red-400">Ao Vivo</span>
                    </div>

                    {/* Favorite Button */}
                    {onToggleFavoriteChannel && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavoriteChannel(channel);
                        }}
                        className={`absolute top-2 right-2 p-1.5 rounded-full backdrop-blur-md transition-all cursor-pointer z-10 ${
                          isFavorite(channel.id)
                            ? 'bg-red-600 text-white shadow-md'
                            : 'bg-slate-950/60 text-slate-400 hover:text-white hover:bg-slate-900 border border-white/10'
                        }`}
                        title={isFavorite(channel.id) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                      >
                        <Heart className={`w-3.5 h-3.5 ${isFavorite(channel.id) ? 'fill-white' : ''}`} />
                      </button>
                    )}

                    {/* Play / Lock Hover Overlay */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg transform scale-75 group-hover:scale-100 transition-transform">
                        {locked ? <Crown className="w-4 h-4 text-amber-300" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
                      </div>
                    </div>
                  </div>

                  <div className="p-3 flex flex-col justify-between flex-1">
                    <div>
                      <h4 className="text-xs sm:text-sm font-semibold text-white group-hover:text-indigo-400 transition-colors truncate" title={channel.name}>
                        {channel.name}
                      </h4>
                      {channel.epgNow ? (
                        <p className="text-[11px] text-indigo-300/90 truncate mt-0.5">
                          {channel.epgNow}
                        </p>
                      ) : (
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          {channel.category}
                        </p>
                      )}
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-400">
                      <span className="bg-slate-800/80 px-1.5 py-0.5 rounded text-slate-300 font-medium">
                        {channel.category}
                      </span>
                      {locked ? (
                        <span className="text-amber-400 font-bold flex items-center gap-0.5">
                          <Crown className="w-3 h-3" /> VIP
                        </span>
                      ) : (
                        <span className="text-indigo-400 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                          Assistir <Play className="w-2.5 h-2.5 fill-current" />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 2: FILMES */}
      {(activeFilter === 'all' || activeFilter === 'movies') && matchedMovies.length > 0 && (
        <div className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <Film className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  <span>Filmes Encontrados</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-950/80 text-indigo-300 border border-indigo-500/30">
                    {matchedMovies.length}
                  </span>
                </h2>
                <p className="text-xs text-slate-400">Longas-metragens e documentários sob demanda</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {matchedMovies.map(movie => {
              const locked = movie.isVipOnly && !isVip;

              return (
                <div
                  key={movie.id}
                  onClick={() => {
                    if (locked) onOpenCheckout();
                    else onPlayVod(movie);
                  }}
                  className="group relative flex flex-col rounded-2xl overflow-hidden bg-slate-900 border border-white/10 hover:border-indigo-500/50 transition-all duration-200 shadow-md hover:shadow-indigo-950/40 hover:-translate-y-1 cursor-pointer"
                >
                  <div className="relative aspect-[2/3] w-full overflow-hidden bg-slate-950">
                    <CachedImage
                      src={movie.posterUrl}
                      alt={movie.title}
                      fallbackType="vod"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                      decoding="async"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent pointer-events-none" />

                    {/* Top Badges */}
                    <div className="absolute top-2 left-2 flex items-center gap-1 z-10">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-900/90 text-indigo-300 border border-indigo-500/30">
                        Filme
                      </span>
                      {movie.isRecentlyAdded && (
                        <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-emerald-500 text-slate-950">
                          Novo
                        </span>
                      )}
                    </div>

                    {/* Favorite Button */}
                    {onToggleFavoriteVod && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavoriteVod(movie);
                        }}
                        className={`absolute top-2 right-2 p-1.5 rounded-full backdrop-blur-md transition-all cursor-pointer z-10 ${
                          isFavorite(movie.id)
                            ? 'bg-red-600 text-white shadow-md'
                            : 'bg-slate-950/60 text-slate-400 hover:text-white hover:bg-slate-900 border border-white/10'
                        }`}
                        title={isFavorite(movie.id) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                      >
                        <Heart className={`w-3.5 h-3.5 ${isFavorite(movie.id) ? 'fill-white' : ''}`} />
                      </button>
                    )}

                    {/* Hover Play / Lock Overlay */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg transform scale-75 group-hover:scale-100 transition-transform">
                        {locked ? <Crown className="w-5 h-5 text-amber-300" /> : <Play className="w-5 h-5 fill-white ml-0.5" />}
                      </div>
                    </div>
                  </div>

                  <div className="p-3 flex flex-col justify-between flex-1">
                    <div>
                      <h4 className="text-xs sm:text-sm font-semibold text-white group-hover:text-indigo-400 transition-colors truncate" title={movie.title}>
                        {movie.title}
                      </h4>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        {movie.year} • {movie.duration || 'Full HD'}
                      </p>
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-400">
                      <span className="bg-slate-800/80 px-1.5 py-0.5 rounded text-slate-300 font-medium truncate max-w-[80px]">
                        {movie.genre[0] || 'Filme'}
                      </span>
                      {locked ? (
                        <span className="text-amber-400 font-bold flex items-center gap-0.5">
                          <Crown className="w-3 h-3" /> VIP
                        </span>
                      ) : (
                        <span className="text-indigo-400 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                          Assistir <Play className="w-2.5 h-2.5 fill-current" />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 3: SÉRIES */}
      {(activeFilter === 'all' || activeFilter === 'series') && matchedSeries.length > 0 && (
        <div className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
                <PlayCircle className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  <span>Séries Encontradas</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-950/80 text-violet-300 border border-violet-500/30">
                    {matchedSeries.length}
                  </span>
                </h2>
                <p className="text-xs text-slate-400">Temporadas completas com episódios liberados</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {matchedSeries.map(series => {
              const locked = series.isVipOnly && !isVip;

              return (
                <div
                  key={series.id}
                  onClick={() => {
                    if (locked) onOpenCheckout();
                    else onPlayVod(series);
                  }}
                  className="group relative flex flex-col rounded-2xl overflow-hidden bg-slate-900 border border-white/10 hover:border-indigo-500/50 transition-all duration-200 shadow-md hover:shadow-indigo-950/40 hover:-translate-y-1 cursor-pointer"
                >
                  <div className="relative aspect-[2/3] w-full overflow-hidden bg-slate-950">
                    <CachedImage
                      src={series.posterUrl}
                      alt={series.title}
                      fallbackType="vod"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                      decoding="async"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent pointer-events-none" />

                    {/* Top Badges */}
                    <div className="absolute top-2 left-2 flex items-center gap-1 z-10">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-900/90 text-indigo-300 border border-indigo-500/30">
                        Série
                      </span>
                      {series.isRecentlyAdded && (
                        <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-emerald-500 text-slate-950">
                          Novo
                        </span>
                      )}
                    </div>

                    {/* Favorite Button */}
                    {onToggleFavoriteVod && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavoriteVod(series);
                        }}
                        className={`absolute top-2 right-2 p-1.5 rounded-full backdrop-blur-md transition-all cursor-pointer z-10 ${
                          isFavorite(series.id)
                            ? 'bg-red-600 text-white shadow-md'
                            : 'bg-slate-950/60 text-slate-400 hover:text-white hover:bg-slate-900 border border-white/10'
                        }`}
                        title={isFavorite(series.id) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                      >
                        <Heart className={`w-3.5 h-3.5 ${isFavorite(series.id) ? 'fill-white' : ''}`} />
                      </button>
                    )}

                    {/* Hover Play / Lock Overlay */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg transform scale-75 group-hover:scale-100 transition-transform">
                        {locked ? <Crown className="w-5 h-5 text-amber-300" /> : <Play className="w-5 h-5 fill-white ml-0.5" />}
                      </div>
                    </div>
                  </div>

                  <div className="p-3 flex flex-col justify-between flex-1">
                    <div>
                      <h4 className="text-xs sm:text-sm font-semibold text-white group-hover:text-indigo-400 transition-colors truncate" title={series.title}>
                        {series.title}
                      </h4>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        {series.year} • {series.duration || 'Temporada 1'}
                      </p>
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-400">
                      <span className="bg-slate-800/80 px-1.5 py-0.5 rounded text-slate-300 font-medium truncate max-w-[80px]">
                        {series.genre[0] || 'Série'}
                      </span>
                      {locked ? (
                        <span className="text-amber-400 font-bold flex items-center gap-0.5">
                          <Crown className="w-3 h-3" /> VIP
                        </span>
                      ) : (
                        <span className="text-indigo-400 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                          Assistir <Play className="w-2.5 h-2.5 fill-current" />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
