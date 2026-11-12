// Web Crypto API helper for AES-256-GCM encryption and PBKDF2 key derivation
const CryptoUtils = {
  // Convert ArrayBuffer to Base64
  bufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  },

  // Convert Base64 to ArrayBuffer
  base64ToBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  },

  // Convert string to Uint8Array
  textToBytes(text) {
    return new TextEncoder().encode(text);
  },

  // Convert Uint8Array to string
  bytesToText(bytes) {
    return new TextDecoder().decode(bytes);
  },

  // Generate random hex salt
  generateSalt(length = 16) {
    const randomBytes = new Uint8Array(length);
    crypto.getRandomValues(randomBytes);
    return Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  },

  // SHA-256 hash helper (returns hex)
  async sha256(text, salt = '') {
    const data = this.textToBytes(salt + text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  },

  // Derive AES-GCM key from password and salt
  async deriveKey(password, saltHex, iterations = 100000) {
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      this.textToBytes(password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    // Convert hex salt to buffer
    const saltBytes = new Uint8Array(saltHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBytes,
        iterations: iterations,
        hash: 'SHA-256'
      },
      passwordKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  },

  // Encrypt JSON object with password
  async encrypt(dataObj, password, saltHex = null) {
    const salt = saltHex || this.generateSalt(16);
    const key = await this.deriveKey(password, salt);
    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);

    const plaintext = JSON.stringify(dataObj);
    const encoded = this.textToBytes(plaintext);

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      encoded
    );

    return {
      version: 1,
      salt: salt,
      iv: this.bufferToBase64(iv),
      ciphertext: this.bufferToBase64(ciphertext),
      encryptedAt: new Date().toISOString()
    };
  },

  // Decrypt encrypted payload with password
  async decrypt(payload, password) {
    if (!payload || !payload.ciphertext || !payload.iv || !payload.salt) {
      throw new Error('Invalid encrypted payload structure');
    }

    const key = await this.deriveKey(password, payload.salt);
    const iv = new Uint8Array(this.base64ToBuffer(payload.iv));
    const ciphertext = this.base64ToBuffer(payload.ciphertext);

    try {
      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        ciphertext
      );
      const decryptedText = this.bytesToText(decryptedBuffer);
      return JSON.parse(decryptedText);
    } catch (e) {
      throw new Error('Decryption failed: Incorrect password or corrupted vault data');
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CryptoUtils;
}
