import {registerPlugin} from '@capacitor/core';
import {initializeApp} from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  linkWithPopup,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db: Firestore = (() => {
  try {
    return initializeFirestore(
      app,
      {
        experimentalForceLongPolling: true,
        localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()}),
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
})();
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function hasValidFirebaseConfig(): boolean {
  return Boolean(
    firebaseConfig?.projectId &&
      firebaseConfig.projectId !== 'remixed-project-id' &&
      firebaseConfig?.apiKey &&
      firebaseConfig?.firestoreDatabaseId
  );
}

async function testConnection(): Promise<void> {
  if (!hasValidFirebaseConfig()) {
    console.error('Please check your Firebase configuration.');
    return;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return;
  }

  // Fast pre-flight reachability check so an unreachable network/VPN does not trigger
  // Firestore's 10-second WebChannel timeout error and misleading config error on boot.
  if (typeof fetch === 'function') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    try {
      const probeUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
        firebaseConfig.projectId
      )}/databases/${encodeURIComponent(
        firebaseConfig.firestoreDatabaseId
      )}/documents/test/connection?key=${encodeURIComponent(firebaseConfig.apiKey)}`;
      const res = await fetch(probeUrl, {method: 'GET', signal: controller.signal});
      clearTimeout(timer);
      if (res.status === 400 || res.status === 404) {
        console.error('Please check your Firebase configuration.');
        return;
      }
    } catch {
      clearTimeout(timer);
      console.info('Firestore backend unreachable from current network; running in offline-first local mode.');
      return;
    }
  }

  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

testConnection();


interface NativeAuthDiagnosticsPlugin {
  probeAuthEndpoints(options: {apiKey: string}): Promise<{
    identityToolkit: string;
    secureToken: string;
  }>;
}

const NativeAuthDiagnostics = registerPlugin<NativeAuthDiagnosticsPlugin>('NativeAuthDiagnostics');

export interface FirebaseAuthNetworkDiagnostics {
  identityToolkit: string;
  secureToken: string;
  nativeIdentityToolkit: string;
  nativeSecureToken: string;
}

/** Compares WebView fetch with Android's native HTTPS stack; invalid test credentials cannot create an account. */
export async function diagnoseFirebaseAuthNetwork(): Promise<FirebaseAuthNetworkDiagnostics> {
  const request = async (url: string, init: RequestInit): Promise<string> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch(url, {...init, signal: controller.signal});
      let code = `HTTP_${response.status}`;
      try {
        const payload = await response.json() as {error?: {message?: string}};
        if (payload?.error?.message) code += ` ${payload.error.message}`;
      } catch {
        // Preserve status if the response is not JSON.
      }
      return code.slice(0, 110);
    } catch (error) {
      const message = error instanceof Error ? error.name : 'FETCH_FAILED';
      return message === 'AbortError' ? 'WEBVIEW_TIMEOUT' : `WEBVIEW_FETCH_FAILED ${message}`;
    } finally {
      clearTimeout(timer);
    }
  };

  const apiKey = encodeURIComponent(firebaseConfig.apiKey);
  const [webIdentity, webToken, native] = await Promise.all([
    request(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        email: 'diagnostic-invalid-email',
        password: 'diagnostic-only',
        returnSecureToken: true,
      }),
    }),
    request(`https://securetoken.googleapis.com/v1/token?key=${apiKey}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: 'grant_type=refresh_token&refresh_token=diagnostic-invalid-token',
    }),
    NativeAuthDiagnostics.probeAuthEndpoints({apiKey: firebaseConfig.apiKey}).catch((error) => ({
      identityToolkit: `NATIVE_PLUGIN_ERROR ${error instanceof Error ? error.message : String(error)}`.slice(0, 110),
      secureToken: 'NATIVE_PLUGIN_ERROR',
    })),
  ]);

  return {
    identityToolkit: webIdentity,
    secureToken: webToken,
    nativeIdentityToolkit: native.identityToolkit,
    nativeSecureToken: native.secureToken,
  };
}

let anonymousIdentityPromise: Promise<User> | null = null;

export const ADMIN_EMAIL = 'mehdi.secret7@gmail.com';

export function isVerifiedAdminUser(user: User | null): boolean {
  if (!user) return false;
  return Boolean(user.email && user.email.toLowerCase() === ADMIN_EMAIL && user.emailVerified);
}

/** Ensures this installation has an authenticated Firebase user (defaults to anonymous if signed out). */
export async function ensureAnonymousDeviceIdentity(): Promise<User> {
  if (auth.currentUser) return auth.currentUser;
  if (!anonymousIdentityPromise) {
    anonymousIdentityPromise = (async () => {
      if (auth.currentUser) return auth.currentUser;
      const result = await signInAnonymously(auth);
      return result.user;
    })().finally(() => {
      anonymousIdentityPromise = null;
    });
  }
  return anonymousIdentityPromise;
}

/** Signs in the app owner via Google Auth to unlock the Firestore-protected Sponsor Admin Panel. */
export async function signInAdminWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({prompt: 'select_account'});

  let signedUser: User;
  if (auth.currentUser?.isAnonymous) {
    try {
      const linked = await linkWithPopup(auth.currentUser, provider);
      signedUser = linked.user;
    } catch (err) {
      const code = (err as {code?: string})?.code || '';
      if (
        code === 'auth/credential-already-in-use' ||
        code === 'auth/email-already-in-use' ||
        code === 'auth/provider-already-linked'
      ) {
        const res = await signInWithPopup(auth, provider);
        signedUser = res.user;
      } else {
        throw err;
      }
    }
  } else {
    const res = await signInWithPopup(auth, provider);
    signedUser = res.user;
  }

  if (!isVerifiedAdminUser(signedUser)) {
    await signOut(auth);
    await signInAnonymously(auth).catch(() => {});
    throw new Error('این حساب گوگل به‌عنوان مالک اصلی هم‌صدا تایید نشده است.');
  }
  return signedUser;
}

/** Exits admin session and returns cleanly to anonymous device mode. */
export async function signOutAdminToAnonymous(): Promise<User> {
  await signOut(auth);
  const res = await signInAnonymously(auth);
  return res.user;
}

export {onAuthStateChanged};
export type {User};
