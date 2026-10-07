import { hashPassword } from './crypto';

// Keys for permanent storage or session storage
const LOCAL_CREDENTIALS_KEY = 'fuel_tracker_local_admin_creds';
const MULTI_USERS_KEY = 'fuel_tracker_multi_users';
const SESSION_AUTH_KEY = 'admin_fuel_tracker_session_state';
const SESSION_TIMESTAMP_KEY = 'admin_fuel_tracker_last_activity';

export interface AdminCredentials {
  username: string;
  passwordHash: string;
}

export interface UserAccount {
  username: string;
  passwordHash: string;
}

export const DEFAULT_ADMIN_USERNAME = 'admin';
export const DEFAULT_ADMIN_PASSWORD_HASH = 'd3a7fb2b836e947dd84605cc0fe6142a6163eede8a909e38c2b516f670319090';

/**
 * Returns the primary Super Admin account configuration
 */
export function getAllUsers(): UserAccount[] {
  // Check if admin changed password locally
  const storedCreds = localStorage.getItem(LOCAL_CREDENTIALS_KEY);
  if (storedCreds) {
    try {
      const config = JSON.parse(storedCreds) as AdminCredentials;
      if (config && config.username) {
        return [{
          username: config.username,
          passwordHash: config.passwordHash,
        }];
      }
    } catch {}
  }

  // Fallback to environment variables or default admin / Asdfghjkl
  const envUsername = ((import.meta as any).env.VITE_ADMIN_USERNAME as string) || DEFAULT_ADMIN_USERNAME;
  const envPasswordHash = ((import.meta as any).env.VITE_ADMIN_PASSWORD_HASH as string) || DEFAULT_ADMIN_PASSWORD_HASH;

  return [{
    username: envUsername,
    passwordHash: envPasswordHash,
  }];
}

/**
 * Checks if admin accounts are configured anywhere.
 */
export function getAdminConfig(): AdminCredentials | null {
  const users = getAllUsers();
  return users.length > 0 ? users[0] : null;
}

/**
 * Saves initial setup configuration locally
 */
export function saveLocalAdminConfig(username: string, passwordHash: string): void {
  const creds: AdminCredentials = { username, passwordHash };
  localStorage.setItem(LOCAL_CREDENTIALS_KEY, JSON.stringify(creds));
  
  // Register in multi-user slot also to guarantee seamless listing
  registerUser(username, passwordHash);
}

/**
 * Registers a new user account dynamically
 */
export function registerUser(username: string, passwordHash: string): boolean {
  const normalized = username.trim();
  if (!normalized) return false;

  const users = getAllUsers();
  if (users.some(u => u.username.toLowerCase() === normalized.toLowerCase())) {
    return false; // Already exists
  }

  let multiList: UserAccount[] = [];
  const storedMulti = localStorage.getItem(MULTI_USERS_KEY);
  if (storedMulti) {
    try {
      multiList = JSON.parse(storedMulti);
    } catch {}
  }

  multiList.push({ username: normalized, passwordHash });
  localStorage.setItem(MULTI_USERS_KEY, JSON.stringify(multiList));
  return true;
}

/**
 * Removes a user account dynamically when they factory reset their profile
 */
export function removeUserAccount(username: string): void {
  const normalized = username.trim().toLowerCase();
  
  let multiList: UserAccount[] = [];
  const storedMulti = localStorage.getItem(MULTI_USERS_KEY);
  if (storedMulti) {
    try {
      multiList = JSON.parse(storedMulti);
    } catch {}
  }
  
  const filtered = multiList.filter(u => u.username.toLowerCase() !== normalized);
  localStorage.setItem(MULTI_USERS_KEY, JSON.stringify(filtered));

  const localConfig = localStorage.getItem('fuel_tracker_local_admin_creds');
  if (localConfig) {
    try {
      const config = JSON.parse(localConfig);
      if (config.username && config.username.toLowerCase() === normalized) {
        localStorage.removeItem('fuel_tracker_local_admin_creds');
      }
    } catch {}
  }
}

export async function verifyCredentials(username: string, inputPassword: string): Promise<boolean> {
  const normalizedInput = username.trim().toLowerCase();
  const candidateHash = await hashPassword(inputPassword);

  // Unsalted legacy SHA-256 calculation for backward compatibility
  const encoder = new TextEncoder();
  const rawData = encoder.encode(inputPassword);
  const hashBuffer = await crypto.subtle.digest('SHA-256', rawData);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const legacyHash = hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');

  // Primary check for default Super Admin credentials (admin / Asdfghjkl)
  if (normalizedInput === 'admin' || normalizedInput === DEFAULT_ADMIN_USERNAME.toLowerCase()) {
    if (
      candidateHash === DEFAULT_ADMIN_PASSWORD_HASH ||
      legacyHash === DEFAULT_ADMIN_PASSWORD_HASH
    ) {
      saveLocalAdminConfig('admin', candidateHash);
      return true;
    }
  }

  const users = getAllUsers();
  const matchedUser = users.find(u => u.username.trim().toLowerCase() === normalizedInput);
  if (!matchedUser) return false;

  if (candidateHash === matchedUser.passwordHash || legacyHash === matchedUser.passwordHash) {
    return true;
  }

  return false;
}

/**
 * Logs in current session
 */
export function setSessionAuthenticated(username: string): void {
  sessionStorage.setItem(SESSION_AUTH_KEY, JSON.stringify({
    authenticated: true,
    username,
    loginTime: Date.now()
  }));
  updateActivityTimestamp();
}

/**
 * Checks if current session is active/valid
 */
export function isSessionAuthenticated(): boolean {
  const stored = sessionStorage.getItem(SESSION_AUTH_KEY);
  if (!stored) return false;

  try {
    const session = JSON.parse(stored);
    if (!session.authenticated) return false;

    // Verify inactivity timeout (30 minutes)
    const lastActive = Number(sessionStorage.getItem(SESSION_TIMESTAMP_KEY)) || 0;
    const now = Date.now();
    const thirtyMinutesMs = 30 * 60 * 1000;

    if (now - lastActive > thirtyMinutesMs) {
      // Automatic logout
      clearAuthSession();
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the currently authenticated workspace username from dynamic session
 */
export function getSessionUsername(): string | null {
  const stored = sessionStorage.getItem(SESSION_AUTH_KEY);
  if (!stored) return null;
  try {
    const session = JSON.parse(stored);
    return session.username || null;
  } catch {
    return null;
  }
}

/**
 * Updates the inactivity watchdog timestamp
 */
export function updateActivityTimestamp(): void {
  sessionStorage.setItem(SESSION_TIMESTAMP_KEY, Date.now().toString());
}

/**
 * Deletes current login session token
 */
export function clearAuthSession(): void {
  sessionStorage.removeItem(SESSION_AUTH_KEY);
  sessionStorage.removeItem(SESSION_TIMESTAMP_KEY);
}
