import { AESEncryptionKey, AESSealedData, aesEncryptAsync, aesDecryptAsync } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { SecurityError } from './securityErrors.js';

const utf8 = (text) => new TextEncoder().encode(text);

export const libraryCrypto = {
  generateKey: async () => (await AESEncryptionKey.generate(256)).encoded('hex'),
  async encrypt(key, plaintext, recordName) {
    const imported = await AESEncryptionKey.import(key, 'hex');
    // Native AES-GCM generates a fresh random 12-byte nonce for every write.
    const sealed = await aesEncryptAsync(utf8(plaintext), imported, { additionalData: utf8(recordName) });
    return sealed.combined('base64');
  },
  async decrypt(key, sealed, recordName) {
    let data;
    try {
      // Android's native fromCombined requires bytes despite the JS string overload.
      // Keep Base64 on disk so existing libraries remain readable without migration.
      const combined = Uint8Array.from(atob(sealed), (character) => character.charCodeAt(0));
      data = AESSealedData.fromCombined(combined);
    } catch {
      throw new SecurityError('STORAGE_FORMAT');
    }

    try {
      const imported = await AESEncryptionKey.import(key, 'hex');
      const bytes = await aesDecryptAsync(data, imported, { additionalData: utf8(recordName) });
      return new TextDecoder().decode(bytes);
    } catch {
      throw new SecurityError('STORAGE_DECRYPT');
    }
  },
};

export const libraryKeyStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};
