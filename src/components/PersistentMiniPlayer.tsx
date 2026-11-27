import React from 'react';
import {Disc3, Loader2, Pause, Play, Radio, SkipBack, X} from 'lucide-react';
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

  const progress = !isRadio && player.musicDurationSec > 0
    ? Math.min(100, Math.max(0, (player.musicTimeSec / player.musicDurationSec) * 100))
    : 0;

  const stopPlayback = () => {
    if (isRadio) player.stopRadioPlayback();
    else player.stopMusicPlayback();
  };

  return (
    <div
      className="fixed bottom-[76px] lg:bottom-4 left-3 right-3 lg:left-auto lg:right-6 lg:w-[410px] z-35 overflow-hidden rounded-[22px] bg-gradient-to-br from-slate-950 via-[#102B32] to-[#123E46] text-white border border-cyan-300/20 shadow-[0_12px_40px_rgba(3,20,30,0.38)] backdrop-blur-2xl"
      role="region"
      aria-label="پخش‌کننده پیوسته رفیقو"
    >
      <div className="flex items-center gap-3 px-3.5 pt-3 pb-2.5">
        <button
          type="button"
          onClick={onOpenMediaTab}
          className="flex-1 min-w-0 flex items-center gap-3 text-right cursor-pointer"
          aria-label="باز کردن صفحه پخش"
        >
          <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-300/25 to-emerald-400/10 border border-cyan-200/20 flex items-center justify-center shrink-0 overflow-hidden shadow-inner">
            {activeItem.artworkUrl ? (
              <img src={activeItem.artworkUrl} alt="" className="w-full h-full object-cover" />
            ) : isRadio ? (
              <Radio className={`w-6 h-6 text-cyan-200 ${isPlaying ? 'animate-pulse' : ''}`} />
            ) : (
              <Disc3 className={`w-6 h-6 text-cyan-200 ${isPlaying ? 'animate-spin' : ''}`} />
            )}
            {isPlaying && <span className="absolute bottom-1 right-1 w-2 h-2 rounded-full bg-emerald-300 ring-2 ring-slate-950" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[9px] font-bold tracking-wide text-cyan-200/80">{isRadio ? 'رادیو زنده' : 'در حال پخش'}</span>
              {isPlaying && <span className="flex items-end gap-[2px] h-3" aria-hidden="true"><i className="w-[2px] h-2 bg-cyan-300 rounded-full animate-pulse" /><i className="w-[2px] h-3 bg-emerald-300 rounded-full animate-pulse [animation-delay:120ms]" /><i className="w-[2px] h-1.5 bg-cyan-200 rounded-full animate-pulse [animation-delay:240ms]" /></span>}
            </div>
            <div className="text-[13px] font-extrabold truncate leading-5">{activeItem.title}</div>
            <div className="text-[10px] text-cyan-100/65 truncate mt-0.5">
              {isRadio ? 'پخش پیوسته رفیقو' : activeItem.artist || 'موسیقی رفیقو'}
            </div>
          </div>
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => player.togglePlayItem(
              isRadio ? player.currentRadioIndex : player.currentMusicIndex,
              isRadio ? 'radio' : 'tracks'
            )}
            aria-label={isPlaying ? 'توقف موقت' : 'ادامه پخش'}
            className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-200 to-teal-300 hover:from-cyan-100 hover:to-teal-200 text-slate-950 flex items-center justify-center shadow-lg shadow-cyan-950/30 transition-transform active:scale-95 cursor-pointer"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 translate-x-[1px]" />}
          </button>
          <button
            type="button"
            onClick={isRadio ? player.handleNextRadio : player.handleNextMusic}
            aria-label="مورد بعدی"
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center transition-colors cursor-pointer"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={stopPlayback}
            aria-label="بستن پلیر و توقف پخش"
            title="بستن و توقف پخش"
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-rose-500/90 text-white/70 hover:text-white border border-white/10 flex items-center justify-center transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="h-[3px] w-full bg-white/10" aria-label={!isRadio ? 'پیشرفت پخش' : 'رادیوی زنده'}>
        {isRadio ? (
          <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-cyan-400 via-emerald-300 to-cyan-400 animate-pulse" />
        ) : (
          <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-300 transition-[width] duration-300" style={{width: `${progress}%`}} />
        )}
      </div>
    </div>
  );
};
