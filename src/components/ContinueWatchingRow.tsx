import React from 'react';
import { Play, X, Clock, Film, PlayCircle } from 'lucide-react';
import { WatchProgress, VodItem } from '../types';
import { CachedImage } from './CachedImage';

interface ContinueWatchingRowProps {
  items: WatchProgress[];
  onPlay: (vod: VodItem, initialTime: number) => void;
  onRemove: (id: string) => void;
  allVodItems?: VodItem[];
  title?: string;
}

export const ContinueWatchingRow: React.FC<ContinueWatchingRowProps> = ({
  items,
  onPlay,
  onRemove,
  allVodItems = [],
  title = 'Continuar Assistindo'
}) => {
  if (!items || items.length === 0) return null;

  const formatSeconds = (secs: number) => {
    if (!secs || isNaN(secs)) return '00:00';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) {
      return `${h}h ${m < 10 ? '0' : ''}${m}m`;
    }
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const getTimeRemaining = (currentTime: number, duration: number) => {
    const left = Math.max(0, duration - currentTime);
    if (left <= 0) return 'Concluído';
    const minutes = Math.ceil(left / 60);
    if (minutes > 60) {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return `Restam ${h}h ${m}m`;
    }
    return `Restam ${minutes} min`;
  };

  const handleItemClick = (progress: WatchProgress) => {
    // Find complete VodItem if present in catalog, otherwise reconstruct from progress
    const found = allVodItems.find(v => v.id === progress.id);
    const vodToPlay: VodItem = found || {
      id: progress.id,
      title: progress.title,
      type: progress.type,
      year: progress.year || new Date().getFullYear(),
      genre: progress.genre || ['Geral'],
      bannerUrl: progress.bannerUrl || progress.posterUrl,
      posterUrl: progress.posterUrl,
      synopsis: 'Retomando reprodução salva anteriormente.',
      streamUrl: progress.streamUrl,
      rating: progress.rating
    };

    onPlay(vodToPlay, progress.currentTime);
  };

  return (
    <div className="w-full mb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <span>{title}</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-950/80 text-indigo-300 border border-indigo-500/30">
                {items.length} {items.length === 1 ? 'título' : 'títulos'}
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Retome de onde você parou com progresso sincronizado
            </p>
          </div>
        </div>
      </div>

      {/* Horizontal Carousel / Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {items.map(item => (
          <div
            key={item.id}
            className="group relative flex flex-col rounded-2xl overflow-hidden bg-slate-900 border border-white/10 hover:border-indigo-500/50 transition-all shadow-lg hover:shadow-indigo-950/30 hover:-translate-y-1"
          >
            {/* Poster with Play Action */}
            <div 
              className="relative aspect-video w-full overflow-hidden bg-slate-950 cursor-pointer"
              onClick={() => handleItemClick(item)}
            >
              <CachedImage
                src={item.bannerUrl || item.posterUrl}
                alt={item.title}
                fallbackType="vod"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                loading="lazy"
                decoding="async"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent pointer-events-none" />

              {/* Badges */}
              <div className="absolute top-2 left-2 flex items-center gap-1">
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-900/90 text-indigo-300 border border-indigo-500/30">
                  {item.type === 'series' ? 'Série' : 'Filme'}
                </span>
              </div>

              {/* Remove button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(item.id);
                }}
                className="absolute top-2 right-2 w-6 h-6 rounded-full bg-slate-950/80 hover:bg-red-600 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer border border-white/10 z-10"
                title="Remover do Continuar Assistindo"
              >
                <X className="w-3.5 h-3.5" />
              </button>

              {/* Play icon overlay */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-10 h-10 rounded-full bg-indigo-600/90 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <Play className="w-4 h-4 fill-white ml-0.5" />
                </div>
              </div>

              {/* Progress bar overlay at bottom of image */}
              <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-slate-800/80">
                <div 
                  className="h-full bg-indigo-500 transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, item.percent))}%` }}
                />
              </div>
            </div>

            {/* Info details */}
            <div className="p-3 flex flex-col justify-between flex-1">
              <div>
                <h4 
                  onClick={() => handleItemClick(item)}
                  className="text-xs sm:text-sm font-semibold text-white group-hover:text-indigo-400 transition-colors truncate cursor-pointer"
                  title={item.title}
                >
                  {item.title}
                </h4>
                {item.episodeTitle ? (
                  <p className="text-[11px] text-indigo-300 truncate mt-0.5">
                    {item.episodeTitle}
                  </p>
                ) : null}
              </div>

              <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-400">
                <span className="font-medium text-slate-300">
                  {getTimeRemaining(item.currentTime, item.duration)}
                </span>
                <span className="text-[10px] text-indigo-400 font-semibold">
                  {item.percent}%
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
