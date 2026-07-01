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

/**
 * Returns all registered users from environment variables, local admin config, and custom registers
 */
export function getAllUsers(): UserAccount[] {
  const users: UserAccount[] = [];

  // 1. Try to read from Vite environment variables first
  const bypassEnv = localStorage.getItem('fuel_tracker_bypass_env_creds') === 'true';
  if (!bypassEnv) {
    const envUsername = (import.meta as any).env.VITE_ADMIN_USERNAME as string;
    const envPasswordHash = (import.meta as any).env.VITE_ADMIN_PASSWORD_HASH as string;

    if (envUsername && envPasswordHash) {
      users.push({
        username: envUsername,
        passwordHash: envPasswordHash,
      });
    }
  }

  // 2. Try to read from primary local admin setup
  const storedCreds = localStorage.getItem(LOCAL_CREDENTIALS_KEY);
  if (storedCreds) {
    try {
      const config = JSON.parse(storedCreds) as AdminCredentials;
      if (config && config.username && !users.some(u => u.username.toLowerCase() === config.username.toLowerCase())) {
        users.push({
          username: config.username,
          passwordHash: config.passwordHash,
        });
      }
    } catch {}
  }

  // 3. Try to read from multi-user array
  const storedMulti = localStorage.getItem(MULTI_USERS_KEY);
  if (storedMulti) {
    try {
      const list = JSON.parse(storedMulti) as UserAccount[];
      if (Array.isArray(list)) {
        list.forEach(u => {
          if (u && u.username && !users.some(existing => existing.username.toLowerCase() === u.username.toLowerCase())) {
            users.push(u);
          }
        });
      }
    } catch {}
  }

  return users;
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

/**
 * Verifies if user matched credentials securely across any of the available accounts
 */
export async function verifyCredentials(username: string, inputPassword: string): Promise<boolean> {
  const users = getAllUsers();
  if (users.length === 0) return false;

  const candidateHash = await hashPassword(inputPassword);
  const normalizedInput = username.trim().toLowerCase();

  const matchedUser = users.find(u => u.username.trim().toLowerCase() === normalizedInput);
  if (!matchedUser) return false;

  if (candidateHash === matchedUser.passwordHash) {
    return true;
  }

  // Fallback check for legacy unsalted SHA-256 hash to support existing users
  const encoder = new TextEncoder();
  const rawData = encoder.encode(inputPassword);
  const hashBuffer = await crypto.subtle.digest('SHA-256', rawData);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const legacyHash = hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');

  if (legacyHash === matchedUser.passwordHash) {
    // Automatically migrate user to the upgraded salted hash format
    matchedUser.passwordHash = candidateHash;

    const localConfig = localStorage.getItem('fuel_tracker_local_admin_creds');
    if (localConfig) {
      try {
        const config = JSON.parse(localConfig);
        if (config.username && config.username.toLowerCase() === normalizedInput) {
          config.passwordHash = candidateHash;
          localStorage.setItem('fuel_tracker_local_admin_creds', JSON.stringify(config));
        }
      } catch {}
    }

    let multiList: UserAccount[] = [];
    const storedMulti = localStorage.getItem(MULTI_USERS_KEY);
    if (storedMulti) {
      try {
        multiList = JSON.parse(storedMulti);
        const idx = multiList.findIndex(u => u.username.toLowerCase() === normalizedInput);
        if (idx !== -1) {
          multiList[idx].passwordHash = candidateHash;
          localStorage.setItem(MULTI_USERS_KEY, JSON.stringify(multiList));
        }
      } catch {}
    }

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
