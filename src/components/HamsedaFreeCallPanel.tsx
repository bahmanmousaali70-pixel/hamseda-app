import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Check,
  Copy,
  Mic,
  MicOff,
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneOff,
  Radio,
  RefreshCw,
  ShieldCheck,
  Video,
  VideoOff,
  Wifi,
} from 'lucide-react';
import {toPersianDigits} from '../data/persianLibrary';
import {apiUrl, wsUrl} from '../services/apiConfig';
import {isNativeAndroid, requestSecurityPermissionsNative} from '../services/nativeAndroidBridge';
import {playSoftChime, unlockAudioPlayback} from '../services/speechEngine';

const CALL_CODE_STORAGE_KEY = 'hamseda_free_call_code_v1';
const PEER_ID_STORAGE_KEY = 'hamseda_free_call_peer_id_v1';

interface RoomPeer {
  peerId: string;
  name: string;
  joinedAt: number;
}

type CallStatus = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected';

interface HamsedaFreeCallPanelProps {
  selfName: string;
  partnerName: string;
  initialCallCode?: string;
  onStatusToast: (msg: string) => void;
}

function normalizeCallCode(raw: string): string {
  const ascii = raw
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  return ascii
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u0600-\u06ff_-]/g, '')
    .slice(0, 48);
}

function getOrCreatePeerId(): string {
  try {
    const existing = localStorage.getItem(PEER_ID_STORAGE_KEY);
    if (existing && existing.length >= 6) return existing;
    const generated = `hs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(PEER_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    return `hs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${toPersianDigits(String(mins).padStart(2, '0'))}:${toPersianDigits(String(secs).padStart(2, '0'))}`;
}

export const HamsedaFreeCallPanel: React.FC<HamsedaFreeCallPanelProps> = ({
  selfName,
  partnerName,
  initialCallCode,
  onStatusToast,
}) => {
  const myPeerId = useMemo(() => getOrCreatePeerId(), []);

  const [codeInput, setCodeInput] = useState<string>(() => {
    if (initialCallCode) return normalizeCallCode(initialCallCode);
    try {
      return localStorage.getItem(CALL_CODE_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [joinedRoom, setJoinedRoom] = useState<string>('');
  const [transportMode, setTransportMode] = useState<'none' | 'ws' | 'sse'>('none');
  const [roomConnecting, setRoomConnecting] = useState(false);
  const [roomError, setRoomError] = useState('');
  const [peers, setPeers] = useState<RoomPeer[]>([]);
  const [copiedCode, setCopiedCode] = useState(false);

  // Active call state
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [isVideoCall, setIsVideoCall] = useState(false);
  const [remotePeer, setRemotePeer] = useState<{peerId: string; name: string} | null>(null);
  const [incomingVideoRequested, setIncomingVideoRequested] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  const pingTimerRef = useRef<number | null>(null);
  const ringTimerRef = useRef<number | null>(null);
  const callTimerRef = useRef<number | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const iceServersRef = useRef<RTCIceServer[]>([
    {urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302']},
    {urls: ['stun:stun.cloudflare.com:3478']},
  ]);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const joinedRoomRef = useRef(joinedRoom);
  joinedRoomRef.current = joinedRoom;
  const transportModeRef = useRef(transportMode);
  transportModeRef.current = transportMode;
  const remotePeerRef = useRef(remotePeer);
  remotePeerRef.current = remotePeer;
  const callStatusRef = useRef(callStatus);
  callStatusRef.current = callStatus;
  const isVideoRef = useRef(isVideoCall);
  isVideoRef.current = isVideoCall;
  const selfNameRef = useRef(selfName);
  selfNameRef.current = selfName;

  useEffect(() => {
    if (initialCallCode) {
      const normalized = normalizeCallCode(initialCallCode);
      if (normalized) {
        setCodeInput(normalized);
        try {
          localStorage.setItem(CALL_CODE_STORAGE_KEY, normalized);
        } catch {
          // ignore
        }
      }
    }
  }, [initialCallCode]);

  useEffect(() => {
    fetch(apiUrl('/api/rtc/ice-config'))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.iceServers && Array.isArray(d.iceServers) && d.iceServers.length > 0) {
          iceServersRef.current = d.iceServers;
        }
      })
      .catch(() => {});
  }, []);

  const stopRingLoop = useCallback(() => {
    if (ringTimerRef.current !== null) {
      window.clearInterval(ringTimerRef.current);
      ringTimerRef.current = null;
    }
  }, []);

  const startRingLoop = useCallback(() => {
    stopRingLoop();
    void playSoftChime('chime');
    ringTimerRef.current = window.setInterval(() => {
      void playSoftChime('chime');
    }, 2800);
  }, [stopRingLoop]);

  const cleanupCallMedia = useCallback(() => {
    stopRingLoop();
    if (callTimerRef.current !== null) {
      window.clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
    pendingIceRef.current = [];
    if (pcRef.current) {
      try {
        pcRef.current.onicecandidate = null;
        pcRef.current.ontrack = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.close();
      } catch {
        // ignore
      }
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore
        }
      }
      localStreamRef.current = null;
    }
    remoteStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    setCallStatus('idle');
    setRemotePeer(null);
    setMicMuted(false);
    setCamOff(false);
    setCallSeconds(0);
    setIncomingVideoRequested(false);
  }, [stopRingLoop]);

  const sendSignal = useCallback(
    async (signalType: string, payload: unknown = {}, targetPeerId?: string) => {
      const room = joinedRoomRef.current;
      if (!room) return;
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'signal',
            roomCode: room,
            peerId: myPeerId,
            name: selfNameRef.current,
            targetPeerId,
            signalType,
            payload,
          })
        );
        return;
      }
      await fetch(apiUrl('/api/rtc/signal'), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          roomCode: room,
          peerId: myPeerId,
          name: selfNameRef.current,
          targetPeerId,
          signalType,
          payload,
        }),
      }).catch(() => {});
    },
    [myPeerId]
  );

  const attachLocalAndRemoteMedia = useCallback((localStream: MediaStream | null, remoteStream: MediaStream | null) => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
    if (remoteStream) {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
        void remoteAudioRef.current.play().catch(() => {});
      }
    }
  }, []);

  useEffect(() => {
    if (callStatus === 'connected' || callStatus === 'connecting') {
      attachLocalAndRemoteMedia(localStreamRef.current, remoteStreamRef.current);
    }
  }, [callStatus, isVideoCall, attachLocalAndRemoteMedia]);

  const acquireUserMedia = useCallback(async (withVideo: boolean): Promise<MediaStream> => {
    if (isNativeAndroid()) {
      await requestSecurityPermissionsNative().catch(() => {});
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('این مرورگر یا دستگاه از تماس صوتی مستقیم (WebRTC) پشتیبانی نمی‌کند.');
    }
    return navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: withVideo ? {facingMode: 'user', width: {ideal: 640}, height: {ideal: 480}} : false,
    });
  }, []);

  const createPeerConnection = useCallback(
    (targetPeerId: string): RTCPeerConnection => {
      if (pcRef.current) {
        try {
          pcRef.current.close();
        } catch {
          // ignore
        }
      }
      const pc = new RTCPeerConnection({
        iceServers: iceServersRef.current,
      });
      const remoteStream = new MediaStream();
      remoteStreamRef.current = remoteStream;

      if (localStreamRef.current) {
        for (const track of localStreamRef.current.getTracks()) {
          pc.addTrack(track, localStreamRef.current);
        }
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          void sendSignal('rtc:ice', event.candidate.toJSON(), targetPeerId);
        }
      };

      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          for (const tr of event.streams[0].getTracks()) {
            if (!remoteStream.getTracks().some((t) => t.id === tr.id)) {
              remoteStream.addTrack(tr);
            }
          }
        } else if (event.track) {
          remoteStream.addTrack(event.track);
        }
        attachLocalAndRemoteMedia(localStreamRef.current, remoteStream);
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === 'connected') {
          stopRingLoop();
          setCallStatus('connected');
          if (callTimerRef.current === null) {
            setCallSeconds(0);
            callTimerRef.current = window.setInterval(() => {
              setCallSeconds((prev) => prev + 1);
            }, 1000);
          }
        } else if (state === 'failed') {
          onStatusToast('ارتباط همتا-به-همتا قطع شد. اگر با اینترنت موبایل وصل هستید، دوباره تلاش کنید.');
          cleanupCallMedia();
        } else if (state === 'closed') {
          cleanupCallMedia();
        }
      };

      pcRef.current = pc;
      return pc;
    },
    [attachLocalAndRemoteMedia, cleanupCallMedia, onStatusToast, sendSignal, stopRingLoop]
  );

  const handleIncomingServerEvent = useCallback(
    async (data: {
      type?: string;
      roomCode?: string;
      peers?: RoomPeer[];
      peerId?: string;
      name?: string;
      fromPeerId?: string;
      fromName?: string;
      signalType?: string;
      payload?: Record<string, unknown>;
      message?: string;
    }) => {
      if (data.type === 'error' && data.message) {
        setRoomError(data.message);
        setRoomConnecting(false);
        return;
      }

      if (data.type === 'room:state' && Array.isArray(data.peers)) {
        setRoomConnecting(false);
        setRoomError('');
        setPeers(data.peers.filter((p) => p.peerId !== myPeerId));
        return;
      }

      if (data.type === 'peer:left' && data.peerId) {
        if (remotePeerRef.current?.peerId === data.peerId && callStatusRef.current !== 'idle') {
          onStatusToast(`«${data.name || 'طرف مقابل'}» تماس را قطع کرد.`);
          cleanupCallMedia();
        }
        return;
      }

      if (data.type !== 'signal' || !data.fromPeerId || !data.signalType) return;
      const fromPeerId = data.fromPeerId;
      const fromName = data.fromName || partnerName || 'همراه هم‌صدا';
      const payload = (data.payload || {}) as Record<string, unknown>;

      if (data.signalType === 'call:ring') {
        if (callStatusRef.current !== 'idle') {
          void sendSignal('call:reject', {reason: 'busy'}, fromPeerId);
          return;
        }
        const videoRequested = Boolean(payload.video);
        setRemotePeer({peerId: fromPeerId, name: fromName});
        setIncomingVideoRequested(videoRequested);
        setIsVideoCall(videoRequested);
        setCallStatus('ringing');
        startRingLoop();
        return;
      }

      if (data.signalType === 'call:reject') {
        stopRingLoop();
        const reason = payload.reason === 'busy' ? 'در حال مکالمه دیگر است' : 'تماس را رد کرد';
        onStatusToast(`«${fromName}» ${reason}.`);
        cleanupCallMedia();
        return;
      }

      if (data.signalType === 'call:hangup') {
        stopRingLoop();
        if (callStatusRef.current !== 'idle') {
          onStatusToast(`تماس با «${fromName}» پایان یافت.`);
          cleanupCallMedia();
        }
        return;
      }

      if (data.signalType === 'call:accept') {
        stopRingLoop();
        if (callStatusRef.current !== 'calling') return;
        setCallStatus('connecting');
        setRemotePeer({peerId: fromPeerId, name: fromName});
        try {
          if (!localStreamRef.current) {
            localStreamRef.current = await acquireUserMedia(isVideoRef.current);
          }
          const pc = createPeerConnection(fromPeerId);
          attachLocalAndRemoteMedia(localStreamRef.current, remoteStreamRef.current);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await sendSignal('rtc:offer', {sdp: offer.sdp, type: offer.type}, fromPeerId);
        } catch (err) {
          onStatusToast(err instanceof Error ? err.message : 'خطا در برقراری تماس.');
          void sendSignal('call:hangup', {}, fromPeerId);
          cleanupCallMedia();
        }
        return;
      }

      if (data.signalType === 'rtc:offer') {
        const sdp = typeof payload.sdp === 'string' ? payload.sdp : '';
        if (!sdp) return;
        stopRingLoop();
        setCallStatus('connecting');
        try {
          if (!localStreamRef.current) {
            localStreamRef.current = await acquireUserMedia(isVideoRef.current);
          }
          const pc = createPeerConnection(fromPeerId);
          attachLocalAndRemoteMedia(localStreamRef.current, remoteStreamRef.current);
          await pc.setRemoteDescription(new RTCSessionDescription({type: 'offer', sdp}));
          for (const candidate of pendingIceRef.current) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
          }
          pendingIceRef.current = [];
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendSignal('rtc:answer', {sdp: answer.sdp, type: answer.type}, fromPeerId);
        } catch (err) {
          onStatusToast(err instanceof Error ? err.message : 'خطا در دریافت تماس.');
          void sendSignal('call:hangup', {}, fromPeerId);
          cleanupCallMedia();
        }
        return;
      }

      if (data.signalType === 'rtc:answer') {
        const sdp = typeof payload.sdp === 'string' ? payload.sdp : '';
        const pc = pcRef.current;
        if (!sdp || !pc) return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription({type: 'answer', sdp}));
          for (const candidate of pendingIceRef.current) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
          }
          pendingIceRef.current = [];
        } catch {
          // ignore invalid SDP answer
        }
        return;
      }

      if (data.signalType === 'rtc:ice') {
        const candidateInit = payload as RTCIceCandidateInit;
        if (!candidateInit || !candidateInit.candidate) return;
        const pc = pcRef.current;
        if (pc && pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(candidateInit)).catch(() => {});
        } else {
          pendingIceRef.current.push(candidateInit);
        }
      }
    },
    [
      acquireUserMedia,
      attachLocalAndRemoteMedia,
      cleanupCallMedia,
      createPeerConnection,
      myPeerId,
      onStatusToast,
      partnerName,
      sendSignal,
      startRingLoop,
      stopRingLoop,
    ]
  );

  const disconnectRoom = useCallback(
    (silent = false) => {
      const prevRoom = joinedRoomRef.current;
      if (pingTimerRef.current !== null) {
        window.clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }
      if (wsRef.current) {
        try {
          wsRef.current.onclose = null;
          wsRef.current.close();
        } catch {
          // ignore
        }
        wsRef.current = null;
      }
      if (sseRef.current) {
        try {
          sseRef.current.close();
        } catch {
          // ignore
        }
        sseRef.current = null;
      }
      if (prevRoom && transportModeRef.current === 'sse') {
        void fetch(apiUrl('/api/rtc/leave'), {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({roomCode: prevRoom, peerId: myPeerId}),
        }).catch(() => {});
      }
      cleanupCallMedia();
      setJoinedRoom('');
      setPeers([]);
      setTransportMode('none');
      setRoomConnecting(false);
      if (!silent && prevRoom) {
        onStatusToast('از اتاق تماس رایگان خارج شدید.');
      }
    },
    [cleanupCallMedia, myPeerId, onStatusToast]
  );

  useEffect(() => {
    return () => {
      disconnectRoom(true);
    };
  }, [disconnectRoom]);

  const connectSseFallback = useCallback(
    (roomCode: string) => {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      const streamUrl = apiUrl(
        `/api/rtc/stream?room=${encodeURIComponent(roomCode)}&peerId=${encodeURIComponent(myPeerId)}&name=${encodeURIComponent(selfNameRef.current)}`
      );
      const es = new EventSource(streamUrl);
      sseRef.current = es;
      es.onopen = () => {
        setTransportMode('sse');
        setRoomConnecting(false);
        setRoomError('');
      };
      es.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          void handleIncomingServerEvent(parsed);
        } catch {
          // ignore
        }
      };
      es.onerror = () => {
        setRoomConnecting(false);
        setRoomError('اتصال به سرور تماس برقرار نشد. اینترنت یا فیلترشکن و نشانی سرور را بررسی کنید.');
      };
    },
    [handleIncomingServerEvent, myPeerId]
  );

  const handleJoinRoom = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleaned = normalizeCallCode(codeInput);
    if (cleaned.length < 3) {
      onStatusToast('کد دوطرفه تماس باید حداقل ۳ رقم یا حرف باشد (مثلاً 482915).');
      return;
    }
    unlockAudioPlayback();
    disconnectRoom(true);
    setCodeInput(cleaned);
    try {
      localStorage.setItem(CALL_CODE_STORAGE_KEY, cleaned);
    } catch {
      // ignore
    }

    setJoinedRoom(cleaned);
    setRoomConnecting(true);
    setRoomError('');

    let settled = false;
    try {
      const socket = new WebSocket(wsUrl('/api/rtc-ws'));
      wsRef.current = socket;

      const fallbackTimeout = window.setTimeout(() => {
        if (!settled && socket.readyState !== WebSocket.OPEN) {
          settled = true;
          try {
            socket.close();
          } catch {
            // ignore
          }
          wsRef.current = null;
          connectSseFallback(cleaned);
        }
      }, 3200);

      socket.onopen = () => {
        settled = true;
        window.clearTimeout(fallbackTimeout);
        setTransportMode('ws');
        setRoomConnecting(false);
        socket.send(
          JSON.stringify({
            type: 'join',
            roomCode: cleaned,
            peerId: myPeerId,
            name: selfNameRef.current,
          })
        );
        pingTimerRef.current = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({type: 'ping'}));
          }
        }, 15000);
      };

      socket.onmessage = (event) => {
        try {
          const parsed = JSON.parse(String(event.data));
          void handleIncomingServerEvent(parsed);
        } catch {
          // ignore
        }
      };

      socket.onerror = () => {
        if (!settled) {
          settled = true;
          window.clearTimeout(fallbackTimeout);
          wsRef.current = null;
          connectSseFallback(cleaned);
        }
      };

      socket.onclose = () => {
        window.clearTimeout(fallbackTimeout);
        if (pingTimerRef.current !== null) {
          window.clearInterval(pingTimerRef.current);
          pingTimerRef.current = null;
        }
        if (joinedRoomRef.current === cleaned && transportModeRef.current === 'ws') {
          setTransportMode('none');
        }
      };
    } catch {
      connectSseFallback(cleaned);
    }
  };

  const handleGenerateCode = () => {
    const generated = String(Math.floor(100000 + Math.random() * 900000));
    setCodeInput(generated);
    try {
      localStorage.setItem(CALL_CODE_STORAGE_KEY, generated);
    } catch {
      // ignore
    }
    onStatusToast(`کد جدید ${toPersianDigits(generated)} ساخته شد. هر دو طرف همین کد را بزنید و دکمه اتصال را لمس کنید.`);
  };

  const handleCopyCode = async () => {
    const cleaned = normalizeCallCode(codeInput);
    if (!cleaned) return;
    const shareText = `کد تماس رایگان هم‌صدا: ${cleaned}\nلینک مستقیم: https://hamseda-app.ai.studio/?callCode=${encodeURIComponent(cleaned)}`;
    try {
      await navigator.clipboard.writeText(shareText);
      setCopiedCode(true);
      onStatusToast('کد تماس و لینک مستقیم کپی شد. برای همراهتان بفرستید.');
      setTimeout(() => setCopiedCode(false), 2500);
    } catch {
      onStatusToast(`کد تماس شما: ${cleaned}`);
    }
  };

  const handleStartCall = async (target: RoomPeer, withVideo: boolean) => {
    unlockAudioPlayback();
    setIsVideoCall(withVideo);
    setRemotePeer({peerId: target.peerId, name: target.name});
    setCallStatus('calling');
    try {
      const stream = await acquireUserMedia(withVideo);
      localStreamRef.current = stream;
      attachLocalAndRemoteMedia(stream, null);
      await sendSignal('call:ring', {video: withVideo}, target.peerId);
      onStatusToast(`در حال زنگ زدن به «${target.name}»...`);
    } catch (err) {
      onStatusToast(err instanceof Error ? err.message : 'دسترسی به میکروفون/دوربین انجام نشد.');
      cleanupCallMedia();
    }
  };

  const handleAcceptCall = async () => {
    if (!remotePeer) return;
    unlockAudioPlayback();
    stopRingLoop();
    setCallStatus('connecting');
    try {
      const stream = await acquireUserMedia(incomingVideoRequested);
      localStreamRef.current = stream;
      setIsVideoCall(incomingVideoRequested);
      attachLocalAndRemoteMedia(stream, null);
      await sendSignal('call:accept', {video: incomingVideoRequested}, remotePeer.peerId);
    } catch (err) {
      onStatusToast(err instanceof Error ? err.message : 'دسترسی به میکروفون/دوربین انجام نشد.');
      void sendSignal('call:reject', {reason: 'media_denied'}, remotePeer.peerId);
      cleanupCallMedia();
    }
  };

  const handleRejectCall = () => {
    if (remotePeer) {
      void sendSignal('call:reject', {reason: 'declined'}, remotePeer.peerId);
    }
    cleanupCallMedia();
  };

  const handleHangup = () => {
    if (remotePeer) {
      void sendSignal('call:hangup', {}, remotePeer.peerId);
    }
    cleanupCallMedia();
  };

  const handleToggleMic = () => {
    if (!localStreamRef.current) return;
    const next = !micMuted;
    for (const track of localStreamRef.current.getAudioTracks()) {
      track.enabled = !next;
    }
    setMicMuted(next);
  };

  const handleToggleCam = () => {
    if (!localStreamRef.current) return;
    const next = !camOff;
    for (const track of localStreamRef.current.getVideoTracks()) {
      track.enabled = !next;
    }
    setCamOff(next);
  };

  return (
    <section className="rounded-2xl bg-white dark:bg-[#121E1C] border border-emerald-200/90 dark:border-emerald-800/80 p-5 sm:p-7 space-y-5 shadow-xs">
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-400">
            <Radio className="w-4 h-4" />
            <span>تماس اینترنتی رایگان هم‌صدا با هم‌صدا (بدون سیم‌کارت و بدون نیاز به لاگین گوگل)</span>
          </div>
          <h2 className="mt-1.5 text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">
            کد تماس دوطرفه (ارتباط مستقیم گوشی {selfName} با {partnerName})
          </h2>
          <p className="mt-1 text-xs sm:text-sm leading-6 text-slate-600 dark:text-slate-300">
            یک کد دلخواه (مثلاً <strong dir="ltr">482915</strong> یا <strong dir="ltr">bahman-zari</strong>) بسازید و هر دو گوشی همان کد را وارد کرده و دکمه <strong>«اتصال با کد»</strong> را بزنید تا تماس صوتی یا تصویری رایگان برقرار شود.
          </p>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          <span
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border ${
              joinedRoom && transportMode !== 'none'
                ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                : 'bg-slate-50 dark:bg-[#0B1312] border-slate-200 dark:border-emerald-900 text-slate-600 dark:text-slate-400'
            }`}
          >
            <Wifi className="w-3.5 h-3.5" />
            {joinedRoom && transportMode !== 'none'
              ? `متصل به کد ${toPersianDigits(joinedRoom)}`
              : roomConnecting
                ? 'در حال اتصال...'
                : 'آماده اتصال با کد'}
          </span>
        </div>
      </div>

      {/* Pairing Code Entry & Actions */}
      <form onSubmit={handleJoinRoom} className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
        <div className="lg:col-span-6 flex items-center gap-2">
          <input
            type="text"
            dir="ltr"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            placeholder="کد دوطرفه تماس (مثلاً 482915)"
            className="flex-1 min-h-[48px] px-4 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50/70 dark:bg-[#0B1312] text-base font-bold tracking-wider text-center text-slate-900 dark:text-white"
          />
          <button
            type="button"
            onClick={handleGenerateCode}
            title="ساخت کد تصادفی جدید"
            className="min-h-[48px] px-3.5 rounded-xl border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#0B1312] hover:bg-slate-50 dark:hover:bg-emerald-950/40 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <RefreshCw className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            <span>ساخت کد</span>
          </button>
          <button
            type="button"
            onClick={handleCopyCode}
            disabled={!codeInput.trim()}
            title="کپی کد و لینک"
            className="min-h-[48px] px-3.5 rounded-xl border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#0B1312] hover:bg-slate-50 dark:hover:bg-emerald-950/40 disabled:opacity-40 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            {copiedCode ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            <span className="hidden sm:inline">کپی</span>
          </button>
        </div>

        <div className="lg:col-span-6 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={roomConnecting || !codeInput.trim()}
            className="flex-1 min-w-[160px] min-h-[48px] px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
          >
            <PhoneCall className="w-4 h-4" />
            <span>{joinedRoom ? 'بروزرسانی اتصال با کد' : 'اتصال با کد دوطرفه'}</span>
          </button>
          {joinedRoom && (
            <button
              type="button"
              onClick={() => disconnectRoom(false)}
              className="min-h-[48px] px-4 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 text-xs font-bold cursor-pointer"
            >
              قطع اتاق کد
            </button>
          )}
        </div>
      </form>

      {roomError && (
        <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 p-3 text-xs text-rose-800 dark:text-rose-200">
          {roomError}
        </div>
      )}

      {/* Incoming Call Ringing Card */}
      {callStatus === 'ringing' && remotePeer && (
        <div className="rounded-2xl bg-gradient-to-l from-emerald-800 to-emerald-950 text-white p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center animate-pulse">
              <PhoneIncoming className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <div className="text-xs text-emerald-200">
                {incomingVideoRequested ? 'تماس تصویری رایگان هم‌صدا' : 'تماس صوتی رایگان هم‌صدا'}
              </div>
              <div className="text-lg font-extrabold mt-0.5">{remotePeer.name} زنگ می‌زند...</div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleAcceptCall}
              className="min-h-[48px] px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-extrabold flex items-center gap-2 cursor-pointer"
            >
              <Phone className="w-4 h-4" />
              <span>پاسخ تماس</span>
            </button>
            <button
              type="button"
              onClick={handleRejectCall}
              className="min-h-[48px] px-5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold flex items-center gap-2 cursor-pointer"
            >
              <PhoneOff className="w-4 h-4" />
              <span>رد کردن</span>
            </button>
          </div>
        </div>
      )}

      {/* Active / Connecting Call Screen */}
      {(callStatus === 'calling' || callStatus === 'connecting' || callStatus === 'connected') && remotePeer && (
        <div className="rounded-2xl bg-slate-950 text-white border border-emerald-800/70 p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-700/40 flex items-center justify-center">
                {isVideoCall ? <Video className="w-5 h-5 text-emerald-300" /> : <PhoneCall className="w-5 h-5 text-emerald-300" />}
              </div>
              <div>
                <div className="text-sm font-extrabold">{remotePeer.name}</div>
                <div className="text-xs text-emerald-300">
                  {callStatus === 'calling'
                    ? 'در حال زنگ زدن...'
                    : callStatus === 'connecting'
                      ? 'در حال برقراری ارتباط صوتی مستقیم...'
                      : `در حال مکالمه · ${formatDuration(callSeconds)}`}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-300">
              <ShieldCheck className="w-4 h-4" />
              <span>تماس مستقیم P2P رایگان</span>
            </div>
          </div>

          {isVideoCall && (
            <div className="relative rounded-xl overflow-hidden bg-black aspect-video max-h-[340px]">
              <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="absolute bottom-3 left-3 w-28 sm:w-36 aspect-video rounded-xl object-cover border-2 border-white/40 bg-slate-900 shadow-lg"
              />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={handleToggleMic}
              className={`min-h-[46px] px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer ${
                micMuted ? 'bg-amber-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-white'
              }`}
            >
              {micMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              <span>{micMuted ? 'میکروفون بسته' : 'میکروفون باز'}</span>
            </button>

            {isVideoCall && (
              <button
                type="button"
                onClick={handleToggleCam}
                className={`min-h-[46px] px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer ${
                  camOff ? 'bg-amber-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-white'
                }`}
              >
                {camOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                <span>{camOff ? 'دوربین خاموش' : 'دوربین روشن'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleHangup}
              className="min-h-[46px] px-5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs sm:text-sm font-extrabold flex items-center gap-2 cursor-pointer"
            >
              <PhoneOff className="w-4 h-4" />
              <span>پایان تماس</span>
            </button>
          </div>
        </div>
      )}

      {/* Room Presence & Call Initiation Buttons */}
      {joinedRoom && callStatus === 'idle' && (
        <div className="rounded-xl bg-slate-50/90 dark:bg-[#0B1312] border border-slate-200/80 dark:border-emerald-900/70 p-4 space-y-3">
          {peers.length === 0 ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
              <span>
                شما با کد <strong dir="ltr" className="text-emerald-800 dark:text-emerald-300">{joinedRoom}</strong> وارد شدید. در انتظار ورود {partnerName} از روی گوشی یا مرورگر دیگر با همین کد...
              </span>
              <span className="text-[11px] text-slate-500">
                (هر دو طرف همین کد را در بخش تماس وارد کرده و «اتصال با کد» را بزنید)
              </span>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                افراد حاضر روی کد «{toPersianDigits(joinedRoom)}» ({toPersianDigits(peers.length)} نفر آماده تماس):
              </div>
              {peers.map((peer) => (
                <div
                  key={peer.peerId}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl bg-white dark:bg-[#121E1C] border border-slate-200 dark:border-emerald-900 p-3.5"
                >
                  <div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white">{peer.name}</div>
                    <div className="text-[11px] text-emerald-700 dark:text-emerald-400">آنلاین و آماده مکالمه رایگان هم‌صدا</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleStartCall(peer, false)}
                      className="min-h-[44px] px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer"
                    >
                      <Phone className="w-4 h-4" />
                      <span>تماس صوتی رایگان</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStartCall(peer, true)}
                      className="min-h-[44px] px-4 rounded-xl bg-slate-900 dark:bg-emerald-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer"
                    >
                      <Video className="w-4 h-4" />
                      <span>تماس تصویری</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
