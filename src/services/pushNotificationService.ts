import {Capacitor, registerPlugin} from '@capacitor/core';
import {doc, serverTimestamp, setDoc} from 'firebase/firestore';
import type {User} from 'firebase/auth';
import {db} from './firebaseClient';

interface RefighoPushPlugin {
  getToken(): Promise<{token: string}>;
}

const RefighoPush = registerPlugin<RefighoPushPlugin>('RefighoPush');

/** Associates this Android installation's current FCM token with its authenticated Firebase user. */
export async function registerRefighoPushToken(user: User): Promise<void> {
  if (!Capacitor.isNativePlatform() || !user?.uid) return;
  const result = await RefighoPush.getToken();
  const token = result?.token?.trim();
  if (!token) throw new Error('توکن اعلان رفیقو دریافت نشد.');
  const tokenId = encodeURIComponent(token);
  await setDoc(doc(db, 'users', user.uid, 'pushTokens', tokenId), {
    token,
    platform: 'android',
    updatedAt: serverTimestamp(),
  }, {merge: true});
}
