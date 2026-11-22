import React, {useCallback, useEffect, useRef, useState} from 'react';
import {addVoiceIce, answerVoiceCall, createVoiceCall, currentVoiceUid, ensureVoiceIdentity, lookupVoiceInvite, updateVoiceCallStatus, watchIncomingVoiceCalls, watchVoiceCall, watchVoiceIce, type VoiceCallDocument, type VoiceContact, type VoiceIdentity} from '../services/voiceCallService';

const CONTACTS_KEY = 'hamseda_voice_contacts_v1';
const AUTO_ANSWER_KEY = 'hamseda_voice_auto_answer_v1';
const TRUSTED_KEY = 'hamseda_voice_trusted_uids_v1';
const ICE_CONFIG: RTCConfiguration = {
  iceServers: [{urls: 'stun:stun.l.google.com:19302'}],
};

interface CallsViewProps {
  displayName: string;
  visible: boolean;
}

interface ActiveCall {
  id: string;
  otherName: string;
  direction: 'incoming' | 'outgoing';
}

function readContacts(): VoiceContact[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(CONTACTS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.uid === 'string') : [];
  } catch {
    return [];
  }
}

export const CallsView: React.FC<CallsViewProps> = ({displayName, visible}) => {
  const [identity, setIdentity] = useState<VoiceIdentity | null>(null);
  const [nameDraft, setNameDraft] = useState(displayName || '');
  const [contacts, setContacts] = useState<VoiceContact[]>(readContacts);
  const [inviteDraft, setInviteDraft] = useState('');
  const [incomingCalls, setIncomingCalls] = useState<VoiceCallDocument[]>([]);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [callStatus, setCallStatus] = useState('آماده تماس');
  const [autoAnswer, setAutoAnswer] = useState(() => localStorage.getItem(AUTO_ANSWER_KEY) === 'true');
  const [trustedUids, setTrustedUids] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(TRUSTED_KEY) || '[]'); } catch { return []; }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const callIdRef = useRef<string | null>(null);
  const uidRef = useRef<string | null>(null);
  const remoteUidRef = useRef<string | null>(null);
  const pendingLocalIceRef = useRef<RTCIceCandidate[]>([]);
  const pendingRemoteIceRef = useRef<RTCIceCandidateInit[]>([]);
  const unsubsRef = useRef<Array<() => void>>([]);
  const autoAnsweredRef = useRef<Set<string>>(new Set());

  const cleanupMedia = useCallback(() => {
    unsubsRef.current.forEach((unsubscribe) => unsubscribe());
    unsubsRef.current = [];
    peerRef.current?.close();
    peerRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    callIdRef.current = null;
    remoteUidRef.current = null;
    pendingLocalIceRef.current = [];
    pendingRemoteIceRef.current = [];
    setRemoteStream(null);
    setMuted(false);
    setActiveCall(null);
    setBusy(false);
  }, []);

  const createPeer = useCallback(async (callId: string, remoteUid: string) => {
    const uid = uidRef.current;
    if (!uid) throw new Error('شناسه هم‌صدا آماده نیست.');
    const stream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true}, video: false});
    localStreamRef.current = stream;
    const peer = new RTCPeerConnection(ICE_CONFIG);
    peerRef.current = peer;
    callIdRef.current = callId === 'pending' ? null : callId;
    remoteUidRef.current = remoteUid;
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));
    peer.ontrack = (event) => {
      const [incoming] = event.streams;
      if (incoming) setRemoteStream(incoming);
    };
    peer.onicecandidate = (event) => {
      if (!event.candidate) return;
      const targetUid = remoteUidRef.current;
      const currentCallId = callIdRef.current;
      if (!targetUid || !currentCallId) {
        pendingLocalIceRef.current.push(event.candidate);
        return;
      }
      void addVoiceIce(currentCallId, uid, targetUid, event.candidate).catch((err) => {
        setError(err instanceof Error ? err.message : 'ارسال اطلاعات اتصال ناموفق بود.');
      });
    };
    if (callId !== 'pending') {
      const stopIce = watchVoiceIce(
        callId,
        uid,
        (candidate) => {
          void peer.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {
            pendingRemoteIceRef.current.push(candidate);
          });
        },
        (err) => setError(err.message)
      );
      unsubsRef.current.push(stopIce);
    }
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'connected') setCallStatus('تماس برقرار شد.');
      if (peer.connectionState === 'failed') setCallStatus('اتصال برقرار نشد؛ شبکه یا سرور واسط لازم است.');
    };
    return peer;
  }, []);

  const flushLocalIce = useCallback(async () => {
    const callId = callIdRef.current;
    const uid = uidRef.current;
    const targetUid = remoteUidRef.current;
    if (!callId || !uid || !targetUid || !peerRef.current) return;
    const queued = [...pendingLocalIceRef.current];
    pendingLocalIceRef.current = [];
    for (const candidate of queued) {
      try { await addVoiceIce(callId, uid, targetUid, candidate); } catch { /* retry is not useful for stale ICE */ }
    }
  }, []);

  const flushRemoteIce = useCallback(async () => {
    const peer = peerRef.current;
    if (!peer?.remoteDescription) return;
    const queued = [...pendingRemoteIceRef.current];
    pendingRemoteIceRef.current = [];
    for (const candidate of queued) {
      try { await peer.addIceCandidate(new RTCIceCandidate(candidate)); } catch { /* ignore stale candidates */ }
    }
  }, []);

  const finishCall = useCallback(async (status: 'ended' | 'rejected' = 'ended') => {
    const callId = callIdRef.current;
    const uid = uidRef.current;
    if (callId && uid) {
      try { await updateVoiceCallStatus(callId, status, uid); } catch { /* remote may have already ended */ }
    }
    cleanupMedia();
    setCallStatus(status === 'rejected' ? 'تماس رد شد' : 'تماس پایان یافت');
  }, [cleanupMedia]);

  const acceptIncoming = useCallback(async (call: VoiceCallDocument) => {
    if (busy || activeCall) return;
    setBusy(true);
    setError('');
    setCallStatus('در حال پاسخ‌گویی…');
    try {
      const peer = await createPeer(call.id, call.callerUid);
      if (!call.offer) throw new Error('اطلاعات تماس ناقص است.');
      await peer.setRemoteDescription(new RTCSessionDescription(call.offer));
      await flushRemoteIce();
      await flushLocalIce();
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await answerVoiceCall(call.id, answer);
      setActiveCall({id: call.id, otherName: call.callerName || 'کاربر هم‌صدا', direction: 'incoming'});
      setCallStatus('در حال برقراری تماس…');
    } catch (err) {
      cleanupMedia();
      setError(err instanceof Error ? err.message : 'پاسخ به تماس ناموفق بود.');
    } finally {
      setBusy(false);
    }
    const stopCall = watchVoiceCall(call.id, (updated) => {
      if (updated?.status === 'ended' || updated?.status === 'rejected') {
        cleanupMedia();
        setCallStatus(updated.status === 'rejected' ? 'تماس رد شد.' : 'تماس پایان یافت.');
      }
    }, (err) => setError(err.message));
    unsubsRef.current.push(stopCall);
  }, [activeCall, busy, cleanupMedia, createPeer, flushLocalIce, flushRemoteIce]);

  useEffect(() => {
    let cancelled = false;
    void ensureVoiceIdentity(nameDraft).then((result) => {
      if (cancelled) return;
      setIdentity(result);
      uidRef.current = result.uid;
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'ساخت شناسه تماس ناموفق بود.');
    });
    return () => { cancelled = true; };
  // Identity is created once per mounted app view; name changes are saved explicitly.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!identity) return;
    const stop = watchIncomingVoiceCalls(
      identity.uid,
      (calls) => setIncomingCalls(calls),
      (err) => setError(err.message)
    );
    return stop;
  }, [identity]);

  useEffect(() => {
    if (!remoteStream || !audioRef.current) return;
    audioRef.current.srcObject = remoteStream;
    void audioRef.current.play().catch(() => setCallStatus('برای شنیدن صدا، پخش را از صفحه تماس فعال کنید.'));
  }, [remoteStream]);

  useEffect(() => {
    if (!autoAnswer || !identity || activeCall || busy) return;
    const trustedIncoming = incomingCalls.find((call) =>
      trustedUids.includes(call.callerUid) && !autoAnsweredRef.current.has(call.id)
    );
    if (trustedIncoming) {
      autoAnsweredRef.current.add(trustedIncoming.id);
      void acceptIncoming(trustedIncoming);
    }
  }, [autoAnswer, identity, activeCall, busy, incomingCalls, trustedUids, acceptIncoming]);

  useEffect(() => () => cleanupMedia(), [cleanupMedia]);

  const saveName = async () => {
    setBusy(true);
    setError('');
    try {
      const updated = await ensureVoiceIdentity(nameDraft);
      setIdentity(updated);
      uidRef.current = updated.uid;
      setCallStatus('نام و شناسه به‌روزرسانی شد.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ذخیره نام انجام نشد.');
    } finally {
      setBusy(false);
    }
  };

  const addContact = async () => {
    setError('');
    setBusy(true);
    try {
      const contact = await lookupVoiceInvite(inviteDraft);
      const next = [...contacts.filter((item) => item.uid !== contact.uid), contact];
      setContacts(next);
      localStorage.setItem(CONTACTS_KEY, JSON.stringify(next));
      setInviteDraft('');
      setCallStatus(contact.displayName + ' به مخاطبان هم‌صدا اضافه شد.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'افزودن مخاطب ناموفق بود.');
    } finally {
      setBusy(false);
    }
  };

  const toggleTrusted = (uid: string) => {
    const next = trustedUids.includes(uid) ? trustedUids.filter((item) => item !== uid) : [...trustedUids, uid];
    setTrustedUids(next);
    localStorage.setItem(TRUSTED_KEY, JSON.stringify(next));
  };

  const toggleAutoAnswer = (checked: boolean) => {
    setAutoAnswer(checked);
    localStorage.setItem(AUTO_ANSWER_KEY, String(checked));
  };

  const startOutgoingCall = async (contact: VoiceContact) => {
    if (!identity || busy || activeCall) return;
    setBusy(true);
    setError('');
    setCallStatus('در حال آماده‌سازی تماس…');
    try {
      const peer = await createPeer('pending', contact.uid);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const callId = await createVoiceCall({
        callerUid: identity.uid,
        calleeUid: contact.uid,
        callerName: identity.displayName,
        calleeName: contact.displayName,
        offer,
      });
      callIdRef.current = callId;
      const stopIce = watchVoiceIce(
        callId,
        identity.uid,
        (candidate) => {
          const activePeer = peerRef.current;
          if (!activePeer?.remoteDescription) {
            pendingRemoteIceRef.current.push(candidate);
            return;
          }
          void activePeer.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {
            pendingRemoteIceRef.current.push(candidate);
          });
        },
        (err) => setError(err.message)
      );
      unsubsRef.current.push(stopIce);
      const queued = [...pendingLocalIceRef.current];
      pendingLocalIceRef.current = [];
      for (const candidate of queued) {
        await addVoiceIce(callId, identity.uid, contact.uid, candidate);
      }
      setActiveCall({id: callId, otherName: contact.displayName, direction: 'outgoing'});
      setCallStatus('در انتظار پاسخ ' + contact.displayName + '…');
      const stopCall = watchVoiceCall(
        callId,
        async (call) => {
          if (!call) return;
          if (call.answer && peerRef.current && !peerRef.current.remoteDescription) {
            try {
              await peerRef.current.setRemoteDescription(new RTCSessionDescription(call.answer));
              await flushRemoteIce();
              await flushLocalIce();
              setCallStatus('تماس برقرار شد.');
            } catch (err) {
              setError(err instanceof Error ? err.message : 'اتصال تماس کامل نشد.');
            }
          }
          if (call.status === 'ended' || call.status === 'rejected') {
            cleanupMedia();
            setCallStatus(call.status === 'rejected' ? 'مخاطب تماس را رد کرد.' : 'تماس پایان یافت.');
          }
        },
        (err) => setError(err.message)
      );
      unsubsRef.current.push(stopCall);
    } catch (err) {
      cleanupMedia();
      setError(err instanceof Error ? err.message : 'شروع تماس ناموفق بود.');
    } finally {
      setBusy(false);
    }
  };

  const removeContact = (uid: string) => {
    const next = contacts.filter((item) => item.uid !== uid);
    setContacts(next);
    localStorage.setItem(CONTACTS_KEY, JSON.stringify(next));
    if (trustedUids.includes(uid)) toggleTrusted(uid);
  };

  const uid = identity?.uid || currentVoiceUid();
  const shareInvite = async () => {
    if (!identity) return;
    const text = 'برای تماس صوتی رایگان در هم‌صدا، این کد دعوت من است: ' + identity.inviteCode;
    try {
      if (navigator.share) await navigator.share({title: 'دعوت به هم‌صدا', text});
      else await navigator.clipboard.writeText(text);
      setCallStatus('کد دعوت آماده ارسال است.');
    } catch {
      setCallStatus('کد دعوت شما: ' + identity.inviteCode);
    }
  };

  return (
    <section className={visible ? 'mt-5 rounded-3xl border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-[#101C19] p-4 sm:p-6 space-y-5' : 'hidden'} dir="rtl">
      <audio ref={audioRef} autoPlay playsInline />
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">تماس صوتی اینترنتی هم‌صدا</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">تماس زنده بین دو گوشی که هم‌صدا روی آن‌ها نصب است.</p>
        </div>
        <span className="rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-3 py-1 text-xs font-bold">آزمایشی</span>
      </div>

      {identity ? (
        <div className="rounded-2xl bg-slate-50 dark:bg-slate-900/60 p-4 space-y-2">
          <div className="text-xs text-slate-500 dark:text-slate-400">شناسه دعوت شما</div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-2xl font-black tracking-[0.2em] text-emerald-800 dark:text-emerald-300" dir="ltr">{identity.inviteCode}</div>
            <button type="button" onClick={() => void shareInvite()} className="rounded-xl bg-emerald-700 text-white px-4 py-2 text-xs font-bold">ارسال کد</button>
          </div>
          <div className="flex gap-2">
            <input value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} placeholder="نامی که دیگران ببینند" className="min-w-0 flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm" />
            <button type="button" disabled={busy} onClick={() => void saveName()} className="rounded-xl border border-emerald-700 text-emerald-800 dark:text-emerald-300 px-3 py-2 text-xs font-bold disabled:opacity-50">ذخیره نام</button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-500">در حال ساخت شناسه امن تماس…</p>
      )}

      <div className="space-y-2">
        <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">افزودن مخاطب هم‌صدا</h3>
        <div className="flex gap-2">
          <input value={inviteDraft} onChange={(event) => setInviteDraft(event.target.value.toUpperCase())} maxLength={8} placeholder="کد ۸ رقمی مخاطب" dir="ltr" className="min-w-0 flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-3 text-sm tracking-widest" />
          <button type="button" disabled={busy || inviteDraft.trim().length !== 8} onClick={() => void addContact()} className="rounded-xl bg-slate-900 dark:bg-emerald-700 text-white px-4 py-2 text-sm font-bold disabled:opacity-40">افزودن</button>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">مخاطبان</h3>
        {contacts.length === 0 ? <p className="text-xs text-slate-500">هنوز مخاطبی اضافه نشده؛ کد دعوت دو گوشی را با هم مبادله کنید.</p> : contacts.map((contact) => (
          <div key={contact.uid} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3 flex items-center gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="font-bold text-sm text-slate-900 dark:text-white">{contact.displayName}</div>
              <div className="text-[11px] text-slate-500" dir="ltr">{contact.inviteCode}</div>
              <label className="mt-2 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={trustedUids.includes(contact.uid)} onChange={() => toggleTrusted(contact.uid)} />
                اجازه پاسخ خودکار به تماس این مخاطب
              </label>
            </div>
            <button type="button" disabled={busy || Boolean(activeCall) || !uid} onClick={() => void startOutgoingCall(contact)} className="rounded-xl bg-emerald-700 text-white px-4 py-2 text-xs font-bold disabled:opacity-40">تماس صوتی</button>
            <button type="button" onClick={() => removeContact(contact.uid)} className="text-xs text-rose-600 px-2 py-2">حذف</button>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/20 p-3 space-y-2">
        <label className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
          <input type="checkbox" checked={autoAnswer} onChange={(event) => toggleAutoAnswer(event.target.checked)} />
          پاسخ خودکار به مخاطبان مجاز
        </label>
        <p className="text-xs leading-6 text-slate-600 dark:text-slate-300">فقط مخاطبانی که تیک «اجازه پاسخ خودکار» دارند، در زمان باز بودن هم‌صدا می‌توانند خودکار وصل شوند. برای تماس‌های ناشناس، برنامه پاسخ خودکار نمی‌دهد.</p>
      </div>

      {incomingCalls.filter((call) => call.status === 'ringing').map((call) => (
        <div key={call.id} className="rounded-2xl border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 p-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="font-extrabold text-slate-900 dark:text-white">تماس ورودی از {call.callerName}</div>
            <div className="text-xs text-slate-500 mt-1">تماس صوتی هم‌صدا</div>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={busy || Boolean(activeCall)} onClick={() => void acceptIncoming(call)} className="rounded-xl bg-emerald-700 text-white px-4 py-2 text-sm font-bold disabled:opacity-40">پاسخ</button>
            <button type="button" onClick={() => void updateVoiceCallStatus(call.id, 'rejected', uid || '')} className="rounded-xl bg-rose-600 text-white px-4 py-2 text-sm font-bold">رد تماس</button>
          </div>
        </div>
      ))}

      {activeCall && (
        <div className="rounded-2xl bg-slate-900 text-white p-5 text-center space-y-3">
          <div className="text-xs text-emerald-300">{activeCall.direction === 'incoming' ? 'تماس ورودی' : 'تماس خروجی'}</div>
          <div className="text-xl font-extrabold">{activeCall.otherName}</div>
          <div className="text-sm text-slate-300">{callStatus}</div>
          <div className="flex justify-center gap-3">
            <button type="button" onClick={() => {
              const track = localStreamRef.current?.getAudioTracks()[0];
              if (track) track.enabled = muted;
              setMuted(!muted);
            }} className="rounded-full bg-slate-700 px-5 py-3 text-sm font-bold">{muted ? 'روشن‌کردن میکروفون' : 'بی‌صدا کردن'}</button>
            <button type="button" onClick={() => void finishCall()} className="rounded-full bg-rose-600 px-6 py-3 text-sm font-bold">پایان تماس</button>
          </div>
          <button type="button" onClick={() => void audioRef.current?.play()} className="text-xs text-emerald-200 underline">فعال‌کردن صدای مخاطب</button>
        </div>
      )}

      {error && <div className="rounded-xl bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 p-3 text-xs leading-6">{error}</div>}
      <div className="text-xs text-slate-500 dark:text-slate-400">{callStatus}</div>
      <p className="text-[11px] leading-6 text-slate-500 dark:text-slate-400">نکته: این نسخه برای آزمایش تماس وقتی برنامه روی گوشی باز است طراحی شده. پاسخ خودکار در پس‌زمینه، اعلان تماس هنگام بسته‌بودن برنامه و عبور از شبکه‌هایی که ارتباط مستقیم را مسدود می‌کنند، هنوز به سرویس و تنظیمات تکمیلی نیاز دارد.</p>
    </section>
  );
};
