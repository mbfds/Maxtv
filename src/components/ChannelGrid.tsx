import React, { useState } from 'react';
import { Tv, Play, Crown, Radio, Sparkles, Filter, Heart } from 'lucide-react';
import { Channel, ChannelCategory, FavoriteItem, WatchProgress, VodItem } from '../types';
import { ContinueWatchingRow } from './ContinueWatchingRow';

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

  const isItemFavorite = (id: string) => favorites.some(f => f.id === id);

  // Filter channels
  const filteredChannels = channels.filter(ch => {
    if (!ch.isActive) return false;
    const matchesCategory = selectedCategory === 'Todos' || ch.category === selectedCategory;
    const matchesSearch = !searchQuery || ch.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="w-full">
      {/* Continue Watching Section on Main Page */}
      {watchProgress.length > 0 && !searchQuery && selectedCategory === 'Todos' && onPlayVod && (
        <div className="mb-8">
          <ContinueWatchingRow
            progressItems={watchProgress}
            allVodItems={allVodItems}
            onPlayVod={onPlayVod}
            onRemoveProgress={onRemoveProgress}
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

      {/* Channels Grid */}
      {filteredChannels.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-slate-900/50 border border-white/5">
          <Tv className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-300 font-medium">Nenhum canal encontrado</p>
          <p className="text-xs text-slate-500 mt-1">Tente pesquisar com outro termo ou selecionar outra categoria.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filteredChannels.map((channel, idx) => {
            const isLocked = channel.isVipOnly && !isVip;
            // Sleek interface signal/popularity gauge
            const signalWidth = 55 + ((idx * 13 + channel.name.length * 5) % 40);

            return (
              <div
                key={channel.id}
                onClick={() => onSelectChannel(channel)}
                className={`group relative flex flex-col justify-between p-4 rounded-2xl bg-slate-900 border transition-all cursor-pointer hover:border-indigo-500/50 hover:shadow-xl hover:shadow-indigo-950/20 hover:-translate-y-1 ${
                  isLocked 
                    ? 'border-white/5 hover:border-indigo-500/40' 
                    : 'border-white/5 hover:border-indigo-500/50'
                }`}
              >
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
                      title={isItemFavorite(channel.id) ? 'Remover dos Favoritos' : 'Adicionar aos Favoritos'}
                    >
                      <Heart className={`w-3.5 h-3.5 ${isItemFavorite(channel.id) ? 'fill-red-500 text-red-500' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* Channel Logo & Center circular container */}
                <div className="relative w-16 h-16 rounded-full bg-slate-800/90 border border-white/5 flex items-center justify-center p-2.5 mx-auto my-3 group-hover:scale-105 group-hover:border-indigo-500/30 transition-all shadow-inner">
                  {channel.logo ? (
                    <img
                      src={channel.logo}
                      alt={channel.name}
                      className="max-h-10 max-w-full object-contain filter drop-shadow group-hover:scale-105 transition-transform"
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
