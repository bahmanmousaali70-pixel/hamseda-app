import {initializeApp} from 'firebase/app';
import {getAuth, signInAnonymously} from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const callApp = initializeApp(firebaseConfig, 'HamsedaVoiceCalls');
const callAuth = getAuth(callApp);
const callDb = getFirestore(callApp);

export interface VoiceIdentity {
  uid: string;
  inviteCode: string;
  displayName: string;
}

export interface VoiceContact {
  uid: string;
  inviteCode: string;
  displayName: string;
}

export interface VoiceCallDocument {
  id: string;
  callerUid: string;
  calleeUid: string;
  callerName: string;
  calleeName: string;
  status: 'ringing' | 'connecting' | 'active' | 'ended' | 'rejected';
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  createdAt?: unknown;
}

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function createInviteCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => INVITE_ALPHABET[value % INVITE_ALPHABET.length]).join('');
}

export async function ensureVoiceIdentity(displayName: string): Promise<VoiceIdentity> {
  let user = callAuth.currentUser;
  if (!user) {
    const credential = await signInAnonymously(callAuth);
    user = credential.user;
  }

  const cleanedName = displayName.trim().slice(0, 48) || 'کاربر هم‌صدا';
  const saved = localStorage.getItem('hamseda_voice_identity_v1');
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as VoiceIdentity;
      if (parsed.uid === user.uid && parsed.inviteCode) {
        await setDoc(
          doc(callDb, 'voiceInvites', parsed.inviteCode),
          {uid: user.uid, displayName: cleanedName, updatedAt: serverTimestamp()},
          {merge: true}
        );
        const identity = {...parsed, displayName: cleanedName};
        localStorage.setItem('hamseda_voice_identity_v1', JSON.stringify(identity));
        return identity;
      }
    } catch {
      // Create a fresh invite below if local identity data is damaged.
    }
  }

  let inviteCode = '';
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = createInviteCode();
    const existing = await getDoc(doc(callDb, 'voiceInvites', candidate));
    if (!existing.exists()) {
      inviteCode = candidate;
      break;
    }
  }
  if (!inviteCode) throw new Error('ساخت کد دعوت ممکن نشد؛ دوباره تلاش کنید.');

  await setDoc(doc(callDb, 'voiceInvites', inviteCode), {
    uid: user.uid,
    displayName: cleanedName,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const identity = {uid: user.uid, inviteCode, displayName: cleanedName};
  localStorage.setItem('hamseda_voice_identity_v1', JSON.stringify(identity));
  return identity;
}

export async function lookupVoiceInvite(rawCode: string): Promise<VoiceContact> {
  const inviteCode = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (inviteCode.length !== 8) throw new Error('کد دعوت باید ۸ حرف یا عدد باشد.');
  const snapshot = await getDoc(doc(callDb, 'voiceInvites', inviteCode));
  if (!snapshot.exists()) throw new Error('این کد دعوت پیدا نشد.');
  const data = snapshot.data();
  if (typeof data.uid !== 'string' || typeof data.displayName !== 'string') {
    throw new Error('اطلاعات این کد دعوت معتبر نیست.');
  }
  if (data.uid === callAuth.currentUser?.uid) throw new Error('این کد متعلق به همین گوشی است.');
  return {uid: data.uid, inviteCode, displayName: data.displayName};
}

export function currentVoiceUid(): string | null {
  return callAuth.currentUser?.uid ?? null;
}

export async function createVoiceCall(input: {
  callerUid: string;
  calleeUid: string;
  callerName: string;
  calleeName: string;
  offer: RTCSessionDescriptionInit;
}): Promise<string> {
  const created = await addDoc(collection(callDb, 'voiceCalls'), {
    ...input,
    status: 'ringing',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return created.id;
}

export function watchIncomingVoiceCalls(
  uid: string,
  callback: (calls: VoiceCallDocument[]) => void,
  onError: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(callDb, 'voiceCalls'), where('calleeUid', '==', uid)),
    (snapshot) => {
      callback(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as VoiceCallDocument))
        .filter((call) => call.status === 'ringing' || call.status === 'connecting'));
    },
    (error) => onError(error)
  );
}

export function watchVoiceCall(
  callId: string,
  callback: (call: VoiceCallDocument | null) => void,
  onError: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(callDb, 'voiceCalls', callId),
    (snapshot) => callback(snapshot.exists() ? ({id: snapshot.id, ...snapshot.data()} as VoiceCallDocument) : null),
    (error) => onError(error)
  );
}

export function watchVoiceIce(
  callId: string,
  uid: string,
  callback: (candidate: RTCIceCandidateInit) => void,
  onError: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(callDb, 'voiceCalls', callId, 'ice'), where('toUid', '==', uid)),
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const candidate = change.doc.data().candidate;
          if (candidate && typeof candidate === 'object') callback(candidate as RTCIceCandidateInit);
        }
      });
    },
    (error) => onError(error)
  );
}

export async function addVoiceIce(
  callId: string,
  fromUid: string,
  toUid: string,
  candidate: RTCIceCandidate
): Promise<void> {
  await addDoc(collection(callDb, 'voiceCalls', callId, 'ice'), {
    fromUid,
    toUid,
    candidate: candidate.toJSON(),
    createdAt: serverTimestamp(),
  });
}

export async function answerVoiceCall(callId: string, answer: RTCSessionDescriptionInit): Promise<void> {
  await updateDoc(doc(callDb, 'voiceCalls', callId), {
    answer,
    status: 'connecting',
    updatedAt: serverTimestamp(),
  });
}

export async function updateVoiceCallStatus(
  callId: string,
  status: 'active' | 'ended' | 'rejected',
  endedByUid: string
): Promise<void> {
  await updateDoc(doc(callDb, 'voiceCalls', callId), {
    status,
    endedByUid,
    updatedAt: serverTimestamp(),
  });
}
