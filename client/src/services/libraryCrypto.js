import { AESEncryptionKey, AESSealedData, aesEncryptAsync, aesDecryptAsync, randomUUID } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { SecurityError } from './securityErrors.js';

const utf8 = (text) => new TextEncoder().encode(text);
export const libraryCrypto = {
  revision: randomUUID,
  generateKey: async () => (await AESEncryptionKey.generate(256)).encoded('hex'),
  // Import the native key once per repository session, rather than once per record.
  createSession(encodedKey) {
    let imported = AESEncryptionKey.import(encodedKey, 'hex');
    let active = true;
    const key = async () => {
      const value = await imported;
      if (!active) throw new SecurityError('SESSION');
      return value;
    };
    return {
      async encrypt(plaintext, recordName) {
        // AES-GCM still generates a fresh random nonce for every write.
        const sealed = await aesEncryptAsync(utf8(plaintext), await key(), { additionalData: utf8(recordName) });
        return sealed.combined('base64');
      },
      async decrypt(sealed, recordName) {
        let data;
        try {
          const bytes = Uint8Array.from(atob(sealed), (character) => character.charCodeAt(0));
          data = AESSealedData.fromCombined(bytes);
        } catch { throw new SecurityError('STORAGE_FORMAT'); }
        const nativeKey = await key();
        try {
          const bytes = await aesDecryptAsync(data, nativeKey, { additionalData: utf8(recordName) });
          return new TextDecoder().decode(bytes);
        } catch { throw new SecurityError('STORAGE_DECRYPT'); }
      },
      dispose() { active = false; imported = null; },
    };
  },
};
export const libraryKeyStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};
