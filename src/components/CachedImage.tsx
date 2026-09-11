import React, { useState, useEffect, useRef } from 'react';
import { getCachedImageUrl } from '../services/imageCache';
import { Tv, Film } from 'lucide-react';

interface CachedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string;
  alt: string;
  fallbackType?: 'channel' | 'vod' | 'generic';
  fallbackText?: string;
  showSkeleton?: boolean;
}

export const CachedImage: React.FC<CachedImageProps> = ({
  src,
  alt,
  className = '',
  fallbackType = 'generic',
  fallbackText,
  showSkeleton = true,
  loading = 'lazy',
  decoding = 'async',
  ...rest
}) => {
  const [displaySrc, setDisplaySrc] = useState<string>(() => {
    // If empty or already local
    if (!src) return '';
    if (src.startsWith('data:') || src.startsWith('blob:')) return src;
    return src;
  });
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);
  const mountedRef = useRef<boolean>(true);

  useEffect(() => {
    mountedRef.current = true;
    if (!src) {
      setDisplaySrc('');
      setHasError(true);
      return;
    }

    setHasError(false);
    let isCancelled = false;

    // Resolve via Web Cache API
    getCachedImageUrl(src)
      .then((resolvedUrl) => {
        if (!isCancelled && mountedRef.current) {
          setDisplaySrc(resolvedUrl);
        }
      })
      .catch(() => {
        if (!isCancelled && mountedRef.current) {
          setDisplaySrc(src);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [src]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  if (hasError || !displaySrc) {
    if (fallbackType === 'channel') {
      const initial = (fallbackText || alt || 'TV').trim().substring(0, 2).toUpperCase();
      return (
        <div className={`flex flex-col items-center justify-center bg-slate-900/90 border border-white/10 text-indigo-400 select-none ${className}`}>
          <Tv className="w-5 h-5 mb-1 opacity-75" />
          <span className="text-[10px] font-bold tracking-wider uppercase text-slate-300">
            {initial}
          </span>
        </div>
      );
    }

    if (fallbackType === 'vod') {
      return (
        <div className={`flex flex-col items-center justify-center bg-slate-950 border border-white/10 text-slate-500 select-none p-3 text-center ${className}`}>
          <Film className="w-8 h-8 mb-2 opacity-50 text-indigo-400" />
          <span className="text-xs font-semibold text-slate-300 line-clamp-2">
            {alt || 'MAXTV'}
          </span>
        </div>
      );
    }

    return (
      <div className={`flex items-center justify-center bg-slate-900 border border-white/5 text-slate-500 ${className}`}>
        <span className="text-xs opacity-50">{(alt || '').substring(0, 3)}</span>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Background skeleton while image is resolving/loading */}
      {showSkeleton && !isLoaded && (
        <div className="absolute inset-0 bg-slate-900/80 animate-pulse flex items-center justify-center z-0">
          <div className="w-6 h-6 rounded-full border-2 border-indigo-500/20 border-t-indigo-500/80 animate-spin" />
        </div>
      )}

      <img
        src={displaySrc}
        alt={alt}
        loading={loading}
        decoding={decoding}
        referrerPolicy="no-referrer"
        onLoad={() => {
          if (mountedRef.current) setIsLoaded(true);
        }}
        onError={() => {
          // If the cached blob failed or original URL failed, try original or trigger fallback
          if (displaySrc !== src && src) {
            setDisplaySrc(src);
          } else {
            if (mountedRef.current) setHasError(true);
          }
        }}
        className={`w-full h-full object-cover transition-opacity duration-300 ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        }`}
        {...rest}
      />
    </div>
  );
};
