import React from 'react';
import { Play, Info, Crown, Flame, Sparkles } from 'lucide-react';
import { Channel, VodItem } from '../types';

interface HeroBannerProps {
  onPlayChannel: (channel: Channel) => void;
  onPlayVod: (vod: VodItem) => void;
  onOpenCheckout: () => void;
  isVip: boolean;
  featuredVod?: VodItem;
  featuredChannel?: Channel;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({
  onPlayChannel,
  onPlayVod,
  onOpenCheckout,
  isVip,
  featuredVod,
  featuredChannel
}) => {
  return (
    <div className="relative w-full h-[400px] sm:h-[460px] lg:h-[500px] rounded-3xl overflow-hidden border border-white/5 shadow-2xl mb-10 group">
      {/* Background Image with Dark Vignette */}
      <div 
        className="absolute inset-0 bg-cover bg-center scale-105 group-hover:scale-100 grayscale-[20%] group-hover:grayscale-0 transition-all duration-1000 ease-out"
        style={{
          backgroundImage: `url(${featuredVod?.bannerUrl || 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?auto=format&fit=crop&w=1920&q=80'})`
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/60 to-transparent z-10" />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-transparent z-10" />

      {/* Content */}
      <div className="relative h-full max-w-7xl mx-auto px-6 sm:px-10 flex flex-col justify-end pb-10 sm:pb-14 z-20">
        <div className="flex flex-wrap items-center gap-2.5 mb-3">
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-red-600 text-[10px] font-bold rounded uppercase tracking-tighter text-white shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span>Ao Vivo</span>
          </div>
          <span className="px-3 py-0.5 rounded-full text-xs font-semibold bg-slate-900/80 text-slate-300 border border-white/10">
            4K Ultra HD
          </span>
          <span className="px-3 py-0.5 rounded-full text-xs font-semibold bg-indigo-950/70 text-indigo-300 border border-indigo-500/30">
            Áudio 5.1
          </span>
          <span className="flex items-center gap-1 text-xs text-indigo-400 font-semibold bg-slate-900/80 px-3 py-0.5 rounded-full border border-white/10">
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span>Destaque no Brasil</span>
          </span>
        </div>

        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold mb-3 tracking-tight leading-tight text-white max-w-2xl drop-shadow-md">
          {featuredVod?.title || 'Cidade de Deus: A Luta Não Para'}
        </h1>

        <p className="text-sm sm:text-base text-slate-300 max-w-xl line-clamp-3 mb-6 font-normal drop-shadow">
          {featuredVod?.synopsis || 'Vinte anos após os eventos do clássico filme, acompanhe as disputas e o cotidiano na comunidade carioca com fotografia de cinema e elenco consagrado.'}
        </p>

        {/* Call to Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => featuredVod && onPlayVod(featuredVod)}
            className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-white text-slate-950 font-bold text-sm sm:text-base shadow-xl hover:bg-slate-200 active:scale-95 transition-all"
          >
            <Play className="w-4 h-4 fill-slate-950 ml-0.5" />
            <span>Assistir Agora</span>
          </button>

          {featuredChannel && (
            <button
              type="button"
              onClick={() => onPlayChannel(featuredChannel)}
              className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-white/10 backdrop-blur-md hover:bg-white/15 text-white font-semibold text-sm border border-white/10 active:scale-95 transition-all"
            >
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span>CazéTV ao Vivo</span>
            </button>
          )}

          {!isVip && (
            <button
              type="button"
              onClick={onOpenCheckout}
              className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm shadow-lg shadow-indigo-600/25 active:scale-95 transition-all"
            >
              <Crown className="w-4 h-4" />
              <span>Liberar Todos os Canais com Pix</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
