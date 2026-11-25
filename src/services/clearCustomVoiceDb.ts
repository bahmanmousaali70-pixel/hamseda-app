const DB_NAME = 'hamseda-pocket-voice-v1';
const STORE_NAME = 'embeddings';

/** Clears the user-provided voice-clone embedding stored by the local Pocket TTS engine. */
export async function clearCustomVoiceDb(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  await new Promise<void>((resolve) => {
    const openRequest = indexedDB.open(DB_NAME, 1);
    openRequest.onupgradeneeded = () => {
      if (!openRequest.result.objectStoreNames.contains(STORE_NAME)) {
        openRequest.result.createObjectStore(STORE_NAME);
      }
    };
    openRequest.onerror = () => resolve();
    openRequest.onsuccess = () => {
      const connection = openRequest.result;
      try {
        const transaction = connection.transaction(STORE_NAME, 'readwrite');
        transaction.objectStore(STORE_NAME).clear();
        transaction.oncomplete = () => {
          connection.close();
          resolve();
        };
        transaction.onerror = () => {
          connection.close();
          resolve();
        };
        transaction.onabort = () => {
          connection.close();
          resolve();
        };
      } catch {
        connection.close();
        resolve();
      }
    };
  });
}
