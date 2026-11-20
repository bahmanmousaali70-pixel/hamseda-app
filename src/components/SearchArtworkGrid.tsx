import React, {useState} from 'react';
import {Disc3, ExternalLink, Headphones, Loader2, Pause, Play, Radio} from 'lucide-react';

export interface SearchArtworkItem {
  id: string;
  title: string;
  subtitle?: string;
  metaText?: string;
  artworkUrl?: string;
  externalUrl?: string;
  kind?: 'podcast' | 'music' | 'radio';
  isActive?: boolean;
  isPlaying?: boolean;
  isLoading?: boolean;
}

interface SearchArtworkGridProps {
  items: SearchArtworkItem[];
  onSelect: (item: SearchArtworkItem) => void;
  onQuickPlay?: (item: SearchArtworkItem) => void;
  columnsClassName?: string;
  emptyLabel?: string;
}

export const SearchArtworkGrid: React.FC<SearchArtworkGridProps> = ({
  items,
  onSelect,
  onQuickPlay,
  columnsClassName = 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5',
  emptyLabel = 'موردی برای نمایش در این شبکه وجود ندارد.',
}) => {
  const [failedUrls, setFailedUrls] = useState<Record<string, boolean>>({});

  if (items.length === 0) {
    return (
      <div className="py-6 text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className={`grid ${columnsClassName} gap-3`}>
      {items.map((item) => {
        const hasArt = Boolean(item.artworkUrl && !failedUrls[item.artworkUrl]);
        const playAction = onQuickPlay ?? onSelect;

        return (
          <div
            key={item.id}
            className={`group rounded-xl border overflow-hidden transition-colors flex flex-col ${
              item.isActive
                ? 'border-emerald-600 dark:border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/50 ring-1 ring-emerald-600/25'
                : 'border-slate-200 dark:border-emerald-900/70 bg-white dark:bg-[#121E1C] hover:border-emerald-500/50 dark:hover:border-emerald-700'
            }`}
          >
            <div className="relative aspect-square w-full overflow-hidden bg-slate-100 dark:bg-[#0B1312]">
              <button
                type="button"
                onClick={() => onSelect(item)}
                aria-label={`انتخاب ${item.title}`}
                className="w-full h-full block text-right cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
              >
                {hasArt ? (
                  <img
                    src={item.artworkUrl}
                    alt={item.title}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={() => {
                      if (item.artworkUrl) {
                        setFailedUrls((prev) => ({...prev, [item.artworkUrl!]: true}));
                      }
                    }}
                    className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-emerald-900/10 via-slate-100 to-emerald-700/15 dark:from-emerald-950 dark:via-[#0E1A18] dark:to-emerald-900/35 flex flex-col items-center justify-center p-3 text-center gap-2">
                    {item.kind === 'radio' ? (
                      <Radio className="w-8 h-8 text-emerald-700 dark:text-emerald-400" />
                    ) : item.kind === 'music' ? (
                      <Disc3 className="w-8 h-8 text-emerald-700 dark:text-emerald-400" />
                    ) : (
                      <Headphones className="w-8 h-8 text-emerald-700 dark:text-emerald-400" />
                    )}
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 line-clamp-2 leading-4">
                      {item.title}
                    </span>
                  </div>
                )}
              </button>

              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/75 via-black/25 to-transparent"
              />

              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  playAction(item);
                }}
                aria-label={item.isPlaying ? `توقف ${item.title}` : `پخش ${item.title}`}
                className={`absolute bottom-2 left-2 min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl flex items-center justify-center shadow-sm cursor-pointer transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                  item.isPlaying
                    ? 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                    : 'bg-emerald-700/95 hover:bg-emerald-600 text-white'
                }`}
              >
                {item.isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : item.isPlaying ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </button>

              {item.externalUrl && (
                <a
                  href={item.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => event.stopPropagation()}
                  aria-label={`باز کردن منبع ${item.title}`}
                  className="absolute top-2 left-2 min-w-[36px] min-h-[36px] rounded-lg bg-black/55 hover:bg-black/75 text-white flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>

            <button
              type="button"
              onClick={() => onSelect(item)}
              className="p-3 text-right flex-1 flex flex-col justify-between gap-1 cursor-pointer min-h-[68px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
            >
              <div className="space-y-0.5 min-w-0 w-full">
                <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                  {item.title}
                </div>
                {item.subtitle && (
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {item.subtitle}
                  </div>
                )}
              </div>
              {item.metaText && (
                <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 truncate tabular-nums w-full">
                  {item.metaText}
                </div>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
};
