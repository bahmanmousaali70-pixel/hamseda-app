import {useEffect, useState} from 'react';
import {apiUrl, getCloudApiBaseUrl, safeReadJsonResponse} from '../services/apiConfig';
import {checkConnectivityNative, isNativeAndroid} from '../services/nativeAndroidBridge';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{outcome: 'accepted' | 'dismissed'; platform: string}>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as {standalone?: boolean}).standalone === true;
    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const {outcome} = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    install,
  };
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    let disposed = false;
    let activeCheck: AbortController | null = null;

    // On Android APK, navigator.onLine in WebView can lag and /api/health may
    // return 404/302 if the AI Studio server isn't published publicly. Check
    // native ConnectivityManager so APK accurately reflects phone Wi-Fi/Cellular/VPN.
    const verifyCloudConnection = async () => {
      if (isNativeAndroid()) {
        const probe = await checkConnectivityNative(getCloudApiBaseUrl());
        if (!disposed) {
          setIsOnline(probe.deviceOnline || (typeof navigator !== 'undefined' && navigator.onLine));
        }
        return;
      }

      activeCheck?.abort();
      const controller = new AbortController();
      activeCheck = controller;
      const timeout = window.setTimeout(() => controller.abort(), 6500);
      try {
        const response = await fetch(apiUrl('/api/health'), {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        });
        const parsed = await safeReadJsonResponse<{ok?: boolean}>(response);
        if (!disposed) {
          setIsOnline(
            (response.ok && Boolean(parsed.data?.ok)) ||
              (typeof navigator !== 'undefined' ? navigator.onLine : true)
          );
        }
      } catch {
        if (!disposed) {
          setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : false);
        }
      } finally {
        window.clearTimeout(timeout);
        if (activeCheck === controller) activeCheck = null;
      }
    };

    const onOnline = () => {
      setIsOnline(true);
      void verifyCloudConnection();
    };
    const onOffline = () => {
      if (isNativeAndroid()) {
        void verifyCloudConnection();
      } else {
        setIsOnline(false);
      }
    };
    void verifyCloudConnection();
    const interval = window.setInterval(() => {
      void verifyCloudConnection();
    }, 20000);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      disposed = true;
      activeCheck?.abort();
      window.clearInterval(interval);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return isOnline;
}
