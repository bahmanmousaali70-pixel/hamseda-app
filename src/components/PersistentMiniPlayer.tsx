import React from 'react';
import {Disc3, Loader2, Pause, Play, Radio, SkipBack, Square} from 'lucide-react';
import type {PersistentMediaPlayer} from '../hooks/useMediaPlayer';

interface PersistentMiniPlayerProps {
  player: PersistentMediaPlayer;
  visible: boolean;
  onOpenMediaTab: () => void;
}

export const PersistentMiniPlayer: React.FC<PersistentMiniPlayerProps> = ({
  player,
  visible,
  onOpenMediaTab,
}) => {
  if (!visible) return null;

  const isRadio = player.activePlayerMode === 'radio';
  const activeItem = isRadio ? player.activeRadioStation : player.activeMusicTrack;
  const isPlaying = isRadio ? player.isRadioPlaying : player.isMusicPlaying;
  const isLoading = isRadio ? player.isRadioLoading : player.isMusicLoading;

  if (!activeItem || (!isPlaying && !isLoading && player.currentRadioIndex < 0 && player.currentMusicIndex < 0)) {
    return null;
  }

  return (
    <div
      className="fixed bottom-[76px] lg:bottom-4 left-3 right-3 lg:left-auto lg:right-6 lg:w-[390px] z-35 rounded-2xl bg-slate-950/95 dark:bg-[#0D1A18]/95 text-white border border-emerald-700/50 shadow-2xl backdrop-blur-xl px-3.5 py-2.5 flex items-center gap-3"
      role="region"
      aria-label="پخش‌کننده پیوسته هم‌صدا"
    >
      <button
        type="button"
        onClick={onOpenMediaTab}
        className="flex-1 min-w-0 flex items-center gap-2.5 text-right cursor-pointer"
      >
        <div className="w-10 h-10 rounded-xl bg-emerald-900/90 flex items-center justify-center shrink-0 overflow-hidden">
          {isRadio ? (
            <Radio className={`w-5 h-5 text-amber-300 ${isPlaying ? 'animate-pulse' : ''}`} />
          ) : (
            <Disc3 className={`w-5 h-5 text-emerald-300 ${isPlaying ? 'animate-spin' : ''}`} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-extrabold truncate">{activeItem.title}</div>
          <div className="text-[10px] text-emerald-200/80 truncate">
            {isRadio ? 'رادیو زنده پیوسته' : activeItem.artist || 'موسیقی هم‌صدا'}
          </div>
        </div>
      </button>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() =>
            player.togglePlayItem(
              isRadio ? player.currentRadioIndex : player.currentMusicIndex,
              isRadio ? 'radio' : 'tracks'
            )
          }
          aria-label={isPlaying ? 'توقف موقت' : 'ادامه پخش'}
          className="min-w-[38px] min-h-[38px] rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 flex items-center justify-center cursor-pointer"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isPlaying ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4" />
          )}
        </button>
        <button
          type="button"
          onClick={isRadio ? player.handleNextRadio : player.handleNextMusic}
          aria-label="مورد بعدی"
          className="min-w-[36px] min-h-[36px] rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer"
        >
          <SkipBack className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={isRadio ? player.stopRadioPlayback : player.stopMusicPlayback}
          aria-label="بستن پخش‌کننده"
          className="min-w-[36px] min-h-[36px] rounded-xl bg-white/10 hover:bg-rose-600/80 flex items-center justify-center cursor-pointer"
        >
          <Square className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
