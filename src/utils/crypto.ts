/**
 * Hashes a plaintext password string using SHA-256.
 * It uses the Web Crypto API, which is standard in modern browsers.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = 'fuel_tracker_secure_salt_789324_';
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + password);
  
  // Use SubtleCrypto to calculate SHA-256 digest
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  
  // Convert buffer to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');
  
  return hashHex;
}
