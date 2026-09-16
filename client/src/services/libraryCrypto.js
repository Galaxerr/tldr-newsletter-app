import { AESEncryptionKey, AESSealedData, aesEncryptAsync, aesDecryptAsync } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

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
    const imported = await AESEncryptionKey.import(key, 'hex');
    const bytes = await aesDecryptAsync(AESSealedData.fromCombined(sealed), imported, { additionalData: utf8(recordName) });
    return new TextDecoder().decode(bytes);
  },
};

export const libraryKeyStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};
