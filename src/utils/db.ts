import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { FuelEntry, DailyRunLog, SavedRoute } from '../types';

// Read configuration from Vite environment variables
const supabaseUrl = ((import.meta as any).env.VITE_SUPABASE_URL as string) || '';
const supabaseAnonKey = ((import.meta as any).env.VITE_SUPABASE_ANON_KEY as string) || '';

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

// Log configuration status
if (isSupabaseConfigured) {
  console.log('🔌 Fuel Tracker: Connecting to Supabase Cloud...');
} else {
  console.log('💾 Fuel Tracker: Using LocalStorage for storage (standalone offline mode).');
}

// Lazy initialization of Supabase client to prevent startup crash if keys are missing
let supabaseInstance: SupabaseClient | null = null;
function getSupabase(): SupabaseClient | null {
  if (!supabaseInstance && isSupabaseConfigured) {
    try {
      supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
    } catch (error) {
      console.error('Failed to initialize Supabase client:', error);
    }
  }
  return supabaseInstance;
}

// LocalStorage Helper Keys
const LOCAL_STORAGE_KEY = 'fuel_expense_entries';

// Helper to generate UUIDs client-side for LocalStorage entries
export function generateUUID(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

/**
 * Loads entries from LocalStorage, scoped with username prefix
 */
export function getLocalEntries(username: string): FuelEntry[] {
  const normUser = username.trim().toLowerCase();
  const userKey = `fuel_expense_entries_${normUser}`;
  const data = localStorage.getItem(userKey);
  
  if (data === null) {
    // Migration check: If the user-prefixed storage is empty, check legacy global key
    const legacyData = localStorage.getItem('fuel_expense_entries');
    if (legacyData) {
      try {
        const parsed = JSON.parse(legacyData) as FuelEntry[];
        // Filter those belonging to this user or unassigned, and migrate them
        const userScope = parsed.map(entry => {
          const rawNotes = entry.notes || '';
          const vMatch = rawNotes.match(/\[v:([\w-]+)\]/);
          const uMatch = rawNotes.match(/\[u:([\w-]+)\]/);
          const vehicle_id = entry.vehicle_id || (vMatch ? vMatch[1] : 'vehicle_1');
          const entryUser = uMatch ? uMatch[1] : (entry as any).username || '';
          const cleanNotes = rawNotes
            .replace(/\[v:([\w-]+)\]/g, '')
            .replace(/\[u:([\w-]+)\]/g, '')
            .trim();
          return {
            ...entry,
            vehicle_id,
            notes: cleanNotes,
            price_per_liter: Number((entry.amount_paid / entry.liters).toFixed(3)),
            username: entryUser || username
          } as any;
        }).filter(e => !e.username || e.username.toLowerCase() === normUser);

        // Save migrated copy under user-prefixed key
        localStorage.setItem(userKey, JSON.stringify(userScope));
        return userScope;
      } catch (e) {
        console.error('Error migrating legacy fuel entries', e);
      }
    }
    return [];
  }

  try {
    const parsed = JSON.parse(data) as FuelEntry[];
    return parsed.map(entry => {
      const rawNotes = entry.notes || '';
      const vMatch = rawNotes.match(/\[v:([\w-]+)\]/);
      const vehicle_id = entry.vehicle_id || (vMatch ? vMatch[1] : 'vehicle_1');
      const cleanNotes = rawNotes
        .replace(/\[v:([\w-]+)\]/g, '')
        .replace(/\[u:([\w-]+)\]/g, '')
        .trim();
      return {
        ...entry,
        vehicle_id,
        notes: cleanNotes,
        price_per_liter: Number((entry.amount_paid / entry.liters).toFixed(3)),
        username
      } as any;
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  } catch (e) {
    console.error('Error parsing local fuel entries', e);
    return [];
  }
}

/**
 * Saves all entries to LocalStorage under user-prefixed key
 */
export function saveLocalEntries(entries: FuelEntry[], username: string): void {
  const normUser = username.trim().toLowerCase();
  const userKey = `fuel_expense_entries_${normUser}`;
  localStorage.setItem(userKey, JSON.stringify(entries));
}

/**
 * Loads vehicles from LocalStorage, scoped with username prefix
 */
export function getLocalVehicles(username: string): any[] {
  const normUser = username.trim().toLowerCase();
  const userKey = `fuel_tracker_vehicles_${normUser}`;
  const saved = localStorage.getItem(userKey);
  
  if (saved === null) {
    // Migration check: If empty, check legacy global key
    const legacySaved = localStorage.getItem('fuel_tracker_vehicles');
    if (legacySaved) {
      try {
        const list = JSON.parse(legacySaved) as any[];
        const userScope = list.map(item => {
          const rawModel = item.model || '';
          const uMatch = rawModel.match(/\[u:([\w-]+)\]/);
          const entryUser = uMatch ? uMatch[1] : item.username || '';
          const cleanModel = rawModel.replace(/\[u:([\w-]+)\]/g, '').trim();
          return {
            ...item,
            model: cleanModel,
            username: entryUser || username
          };
        }).filter(v => v.username.toLowerCase() === normUser);

        localStorage.setItem(userKey, JSON.stringify(userScope));
        return userScope;
      } catch {}
    }
    return [];
  }

  try {
    const list = JSON.parse(saved) as any[];
    return list.map(item => {
      const rawModel = item.model || '';
      const cleanModel = rawModel.replace(/\[u:([\w-]+)\]/g, '').trim();
      return {
        ...item,
        model: cleanModel,
        username
      };
    });
  } catch {}
  return [];
}

/**
 * Unified Database API supporting either Supabase or LocalStorage fallback
 */
export const DbService = {
  /**
   * Fetches all fuel records (sorted chronologically) matching specific username
   */
  async getEntries(username: string): Promise<FuelEntry[]> {
    const client = getSupabase();
    let allEntries: FuelEntry[] = [];
    if (client) {
      try {
        const { data, error } = await client
          .from('fuel_entries')
          .select('*')
          .order('date', { ascending: true })
          .order('odometer', { ascending: true });

        if (error) throw error;
        
        if (data) {
          allEntries = data.map((item: any) => {
            const rawNotes = item.notes || '';
            const vMatch = rawNotes.match(/\[v:([\w-]+)\]/);
            const uMatch = rawNotes.match(/\[u:([\w-]+)\]/);
            const entryUser = uMatch ? uMatch[1] : '';
            const vehicle_id = vMatch ? vMatch[1] : 'vehicle_1';
            const cleanNotes = rawNotes
              .replace(/\[v:([\w-]+)\]/g, '')
              .replace(/\[u:([\w-]+)\]/g, '')
              .trim();
            return {
              id: item.id,
              date: item.date,
              odometer: Number(item.odometer),
              liters: Number(item.liters),
              amount_paid: Number(item.amount_paid),
              price_per_liter: Number((Number(item.amount_paid) / Number(item.liters)).toFixed(3)),
              notes: cleanNotes,
              vehicle_id,
              created_at: item.created_at,
              username: entryUser
            };
          });
        }
      } catch (err) {
        console.warn('Supabase fetch failed, falling back to local records:', err);
        allEntries = getLocalEntries(username);
      }
    } else {
      allEntries = getLocalEntries(username);
    }

    const normalizedUsername = username.trim().toLowerCase();
    return allEntries.filter(entry => {
      const entryUser = (entry as any).username || '';
      if (!entryUser) {
        // Keep unassigned entries as shared or associate with primary user
        return true;
      }
      return entryUser.toLowerCase() === normalizedUsername;
    });
  },

  /**
   * Adds a new entry and links to username
   */
  async addEntry(entryData: Omit<FuelEntry, 'id' | 'price_per_liter' | 'created_at'>, username: string): Promise<FuelEntry> {
    const calculatedPrice = Number((entryData.amount_paid / entryData.liters).toFixed(3));
    const vId = entryData.vehicle_id || 'vehicle_1';
    
    const rawNotes = entryData.notes ? entryData.notes.trim() : '';
    const cleanNotes = rawNotes.replace(/\[v:([\w-]+)\]/g, '').replace(/\[u:([\w-]+)\]/g, '').trim();
    const dbNotes = cleanNotes 
      ? `${cleanNotes} [v:${vId}] [u:${username}]` 
      : `[v:${vId}] [u:${username}]`;

    const newEntry: FuelEntry = {
      ...entryData,
      id: generateUUID(),
      price_per_liter: calculatedPrice,
      notes: cleanNotes,
      vehicle_id: vId,
      created_at: new Date().toISOString(),
    };
    (newEntry as any).username = username;

    const client = getSupabase();
    if (client) {
      try {
        const { data, error } = await client
          .from('fuel_entries')
          .insert([{
            id: newEntry.id,
            date: newEntry.date,
            odometer: newEntry.odometer,
            liters: newEntry.liters,
            amount_paid: newEntry.amount_paid,
            price_per_liter: calculatedPrice,
            notes: dbNotes,
          }])
          .select()
          .single();

        if (error) throw error;
        if (data) return { ...newEntry, created_at: data.created_at };
      } catch (err) {
        console.warn('Supabase add failed, storing locally instead:', err);
      }
    }

    // Fallback: LocalStorage
    const entries = getLocalEntries(username);
    const localToSave = {
      ...newEntry,
      notes: dbNotes
    };
    entries.push(localToSave);
    saveLocalEntries(entries, username);
    return newEntry;
  },

  /**
   * Updates an existing entry
   */
  async updateEntry(updatedEntry: FuelEntry, username: string): Promise<FuelEntry> {
    const calculatedPrice = Number((updatedEntry.amount_paid / updatedEntry.liters).toFixed(3));
    const vId = updatedEntry.vehicle_id || 'vehicle_1';

    const rawNotes = updatedEntry.notes ? updatedEntry.notes.trim() : '';
    const cleanNotes = rawNotes.replace(/\[v:([\w-]+)\]/g, '').replace(/\[u:([\w-]+)\]/g, '').trim();
    const dbNotes = cleanNotes 
      ? `${cleanNotes} [v:${vId}] [u:${username}]` 
      : `[v:${vId}] [u:${username}]`;

    const finalEntry = {
      ...updatedEntry,
      notes: cleanNotes,
      vehicle_id: vId,
      price_per_liter: calculatedPrice,
    };
    (finalEntry as any).username = username;

    const client = getSupabase();
    if (client) {
      try {
        const { error } = await client
          .from('fuel_entries')
          .update({
            date: finalEntry.date,
            odometer: finalEntry.odometer,
            liters: finalEntry.liters,
            amount_paid: finalEntry.amount_paid,
            price_per_liter: calculatedPrice,
            notes: dbNotes,
          })
          .eq('id', finalEntry.id);

        if (error) throw error;
        return finalEntry;
      } catch (err) {
        console.warn('Supabase update failed, updating locally instead:', err);
      }
    }

    // Fallback: LocalStorage
    const entries = getLocalEntries(username);
    const index = entries.findIndex(e => e.id === finalEntry.id);
    if (index !== -1) {
      entries[index] = {
        ...finalEntry,
        notes: dbNotes
      };
      saveLocalEntries(entries, username);
    }
    return finalEntry;
  },

  /**
   * Deletes an entry
   */
  async deleteEntry(id: string, username: string): Promise<void> {
    const client = getSupabase();
    if (client) {
      try {
        const { error } = await client
          .from('fuel_entries')
          .delete()
          .eq('id', id);

        if (error) throw error;
        return;
      } catch (err) {
        console.warn('Supabase delete failed, deleting locally instead:', err);
      }
    }

    // Fallback: LocalStorage
    const entries = getLocalEntries(username);
    const filtered = entries.filter(e => e.id !== id);
    saveLocalEntries(filtered, username);
  },

  /**
   * Restores multiple entries (JSON bulk import) and scopes to username
   */
  async importBackup(entriesToImport: FuelEntry[], username: string): Promise<void> {
    // Validate each entry basic schema
    const sanitizedEntries: FuelEntry[] = entriesToImport.map(entry => {
      const liters = Number(entry.liters) || 1;
      const amount_paid = Number(entry.amount_paid) || 0;
      const vId = entry.vehicle_id || 'vehicle_1';
      
      const rawNotes = entry.notes ? entry.notes.trim() : '';
      const cleanNotes = rawNotes.replace(/\[v:([\w-]+)\]/g, '').replace(/\[u:([\w-]+)\]/g, '').trim();
      const dbNotes = cleanNotes 
        ? `${cleanNotes} [v:${vId}] [u:${username}]` 
        : `[v:${vId}] [u:${username}]`;

      const finalEntry = {
        id: entry.id || generateUUID(),
        date: entry.date || new Date().toISOString().split('T')[0],
        odometer: Number(entry.odometer) || 0,
        liters: liters,
        amount_paid: amount_paid,
        price_per_liter: Number((amount_paid / liters).toFixed(3)),
        notes: cleanNotes,
        vehicle_id: vId,
        created_at: entry.created_at || new Date().toISOString(),
      };
      (finalEntry as any).notes_with_tags = dbNotes;
      (finalEntry as any).username = username;
      return finalEntry;
    });

    const client = getSupabase();
    if (client) {
      try {
        // Bulk upsert logic for Supabase
        const { error } = await client
          .from('fuel_entries')
          .upsert(sanitizedEntries.map(e => ({
            id: e.id,
            date: e.date,
            odometer: e.odometer,
            liters: e.liters,
            amount_paid: e.amount_paid,
            price_per_liter: e.price_per_liter,
            notes: (e as any).notes_with_tags,
          })));

        if (error) throw error;
      } catch (err) {
        console.warn('Supabase bulk upsert failed, importing locally instead:', err);
      }
    }

    // Always keep LocalStorage clean and fully updated
    const localEntries = getLocalEntries(username);
    
    // Merge logic: overwrite existing matching IDs, add new ones
    const mergedMap = new Map<string, FuelEntry>();
    localEntries.forEach(e => {
      const vId = e.vehicle_id || 'vehicle_1';
      const uTag = (e as any).username ? ` [u:${(e as any).username}]` : '';
      const formattedNotes = e.notes.includes('[v:') ? e.notes : `${e.notes} [v:${vId}]${uTag}`.trim();
      mergedMap.set(e.id, {
        ...e,
        notes: formattedNotes
      });
    });
    
    sanitizedEntries.forEach(e => {
      mergedMap.set(e.id, {
        ...e,
        notes: (e as any).notes_with_tags
      });
    });
    
    const sortedMerged = Array.from(mergedMap.values())
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.odometer - b.odometer);
    
    saveLocalEntries(sortedMerged, username);
  },

  /**
   * Fetches all vehicle profiles from Supabase, or falls back to local storage, filtered by username
   */
  async getVehicles(username: string): Promise<any[]> {
    const client = getSupabase();
    let allVehicles: any[] = [];
    if (client) {
      try {
        const { data, error } = await client
          .from('vehicles')
          .select('*')
          .order('id', { ascending: true });

        if (error) {
          if (error.code === 'PGRST116' || error.message.includes('relation "vehicles" does not exist')) {
            console.warn('Vehicles table does not exist in Supabase yet. Standard fallback used.');
          } else {
            throw error;
          }
        } else if (data && data.length > 0) {
          allVehicles = data.map((item: any) => {
            const rawModel = item.model || '';
            const uMatch = rawModel.match(/\[u:([\w-]+)\]/);
            const entryUser = uMatch ? uMatch[1] : '';
            const cleanModel = rawModel.replace(/\[u:([\w-]+)\]/g, '').trim();
            return {
              id: item.id,
              name: item.name,
              model: cleanModel,
              capacity: Number(item.capacity),
              fuelType: item.fuel_type || item.fuelType || 'Petrol',
              username: entryUser
            };
          });
        }
      } catch (err) {
        console.warn('Supabase vehicles fetch failed, falling back to local vehicles:', err);
        allVehicles = getLocalVehicles(username);
      }
    } else {
      allVehicles = getLocalVehicles(username);
    }

    const normalizedUsername = username.trim().toLowerCase();
    const filteredVehicles = allVehicles.filter(v => {
      const vUser = (v.username || '').toLowerCase();
      if (!vUser) return true; // Keep default unassigned vehicles as shared / fallback template
      return vUser === normalizedUsername;
    });

    if (filteredVehicles.length === 0) {
      // Return default starter set specifically tagged and scoped for this user!
      return [
        { id: `vehicle_1_${username}`, name: 'Honda Civic', model: 'Sedan', capacity: 50, fuelType: 'Petrol', username },
        { id: `vehicle_2_${username}`, name: 'Yamaha MT-15', model: 'Bike', capacity: 10, fuelType: 'Petrol', username },
        { id: `vehicle_3_${username}`, name: 'Tata Nexon', model: 'CNG SUV', capacity: 60, fuelType: 'CNG', username },
      ];
    }

    return filteredVehicles;
  },

  /**
   * Saves/Updates all vehicles in Supabase & LocalStorage for a specific user
   */
  async saveVehicles(vehiclesList: any[], username: string): Promise<void> {
    const processedList = vehiclesList.map(v => {
      const cleanModel = (v.model || '').replace(/\[u:([\w-]+)\]/g, '').trim();
      return {
        ...v,
        model: `${cleanModel} [u:${username}]`,
        username
      };
    });

    // Write to isolated user-prefixed key
    const normUser = username.trim().toLowerCase();
    const userKey = `fuel_tracker_vehicles_${normUser}`;
    localStorage.setItem(userKey, JSON.stringify(processedList));

    const client = getSupabase();
    if (client) {
      try {
        // Fetch all vehicles first to find user-specific ones
        const { data, error: fetchErr } = await client
          .from('vehicles')
          .select('id, model');
          
        if (!fetchErr && data) {
          const userVehicleIds = data
            .filter((item: any) => {
              const model = item.model || '';
              const match = model.match(/\[u:([\w-]+)\]/);
              return match && match[1].toLowerCase() === normUser;
            })
            .map((item: any) => item.id);

          // Find those that are in Supabase but NOT in the new list to be saved
          const newIds = new Set(processedList.map(v => v.id));
          const idsToDelete = userVehicleIds.filter(id => !newIds.has(id));

          if (idsToDelete.length > 0) {
            await client
              .from('vehicles')
              .delete()
              .in('id', idsToDelete);
          }
        }

        const dbItems = processedList.map(v => ({
          id: v.id,
          name: v.name,
          model: v.model,
          capacity: v.capacity,
          fuel_type: v.fuelType,
        }));

        const { error } = await client
          .from('vehicles')
          .upsert(dbItems);

        if (error) throw error;
      } catch (err: any) {
        console.warn('Supabase vehicles sync is optional. Saved locally. Code:', err.message);
      }
    }
  },

  /**
   * Deletes all fuel entries FOR A SPECIFIC USER
   */
  async deleteUserEntries(username: string): Promise<void> {
    const client = getSupabase();
    const normalizedUsername = username.trim().toLowerCase();
    
    // Clear user specific entries key
    localStorage.removeItem(`fuel_expense_entries_${normalizedUsername}`);

    // Clean up legacy entries with this user's tag from global unisolated storage to prevent leak/re-import
    const legacyData = localStorage.getItem('fuel_expense_entries');
    if (legacyData) {
      try {
        const parsed = JSON.parse(legacyData) as FuelEntry[];
        const filtered = parsed.filter(e => {
          const notes = e.notes || '';
          const match = notes.match(/\[u:([\w-]+)\]/);
          const u = match ? match[1] : (e as any).username || '';
          return u.toLowerCase() !== normalizedUsername;
        });
        localStorage.setItem('fuel_expense_entries', JSON.stringify(filtered));
      } catch {}
    }

    if (client) {
      try {
        const { data, error } = await client
          .from('fuel_entries')
          .select('id, notes');
          
        if (error) throw error;
        
        if (data) {
          const idsToDelete = data
            .filter((item: any) => {
              const notes = item.notes || '';
              const match = notes.match(/\[u:([\w-]+)\]/);
              return match && match[1].toLowerCase() === normalizedUsername;
            })
            .map((item: any) => item.id);
            
          if (idsToDelete.length > 0) {
            await client
              .from('fuel_entries')
              .delete()
              .in('id', idsToDelete);
          }
        }
      } catch (err) {
        console.error('Supabase delete user entries failed:', err);
      }
    }
  },

  /**
   * Deletes all vehicles FOR A SPECIFIC USER
   */
  async deleteUserVehicles(username: string): Promise<void> {
    const client = getSupabase();
    const normalizedUsername = username.trim().toLowerCase();

    // Clear user specific vehicles key
    localStorage.removeItem(`fuel_tracker_vehicles_${normalizedUsername}`);

    // Filter legacy global
    const legacySaved = localStorage.getItem('fuel_tracker_vehicles');
    if (legacySaved) {
      try {
        const list = JSON.parse(legacySaved) as any[];
        const filtered = list.filter(v => {
          const m = v.model || '';
          const match = m.match(/\[u:([\w-]+)\]/);
          const u = match ? match[1] : v.username || '';
          return u.toLowerCase() !== normalizedUsername;
        });
        localStorage.setItem('fuel_tracker_vehicles', JSON.stringify(filtered));
      } catch {}
    }

    if (client) {
      try {
        const { data, error } = await client
          .from('vehicles')
          .select('id, model');
          
        if (error) throw error;
        
        if (data) {
          const idsToDelete = data
            .filter((item: any) => {
              const model = item.model || '';
              const match = model.match(/\[u:([\w-]+)\]/);
              return match && match[1].toLowerCase() === normalizedUsername;
            })
            .map((item: any) => item.id);
            
          if (idsToDelete.length > 0) {
            await client
              .from('vehicles')
              .delete()
              .in('id', idsToDelete);
          }
        }
      } catch (err) {
        console.error('Supabase delete user vehicles failed:', err);
      }
    }
  },

  /**
   * Fetches all daily run logs filtered by username
   */
  async getDailyLogs(username: string): Promise<DailyRunLog[]> {
    const client = getSupabase();
    let allLogs: DailyRunLog[] = [];
    
    if (client) {
      try {
        const { data, error } = await client
          .from('daily_runs')
          .select('*')
          .order('date', { ascending: false });

        if (error) {
          if (error.code === 'PGRST116' || error.message.includes('relation "daily_runs" does not exist')) {
            console.warn('daily_runs table does not exist in Supabase yet. Fallback used.');
          } else {
            throw error;
          }
        } else if (data) {
          allLogs = data.map((item: any) => {
            const rawNotes = item.notes || '';
            const uMatch = rawNotes.match(/\[u:([\w-]+)\]/);
            const entryUser = uMatch ? uMatch[1] : '';
            const cleanNotes = rawNotes.replace(/\[u:([\w-]+)\]/g, '').trim();
            return {
              id: item.id,
              date: item.date,
              vehicle_id: item.vehicle_id,
              mode: item.mode,
              distance: Number(item.distance),
              estimatedLiters: Number(item.estimated_liters),
              estimatedCost: Number(item.estimated_cost),
              notes: cleanNotes,
              category: item.category,
              created_at: item.created_at,
              username: entryUser
            } as any;
          });
        }
      } catch (err) {
        console.warn('Supabase daily runs fetch failed, falling back to local storage:', err);
        allLogs = this.getLocalDailyLogs(username);
      }
    } else {
      allLogs = this.getLocalDailyLogs(username);
    }

    const normalizedUsername = username.trim().toLowerCase();
    const filtered = allLogs.filter(log => {
      const logUser = (log as any).username || '';
      if (!logUser) return true;
      return logUser.toLowerCase() === normalizedUsername;
    });

    if (filtered.length === 0 && allLogs.length === 0) {
      const saved = localStorage.getItem(`fuel_tracker_daily_runs_${username}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as DailyRunLog[];
          this.saveDailyLogs(parsed, username);
          return parsed;
        } catch {}
      }
    }

    return filtered;
  },

  getLocalDailyLogs(username: string): DailyRunLog[] {
    const saved = localStorage.getItem(`fuel_tracker_daily_runs_${username}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    return [];
  },

  /**
   * Saves/Updates all daily runs in Supabase
   */
  async saveDailyLogs(logsList: DailyRunLog[], username: string): Promise<void> {
    localStorage.setItem(`fuel_tracker_daily_runs_${username}`, JSON.stringify(logsList));

    const client = getSupabase();
    if (client) {
      try {
        const dbItems = logsList.map(log => {
          const cleanNotes = (log.notes || '').replace(/\[u:([\w-]+)\]/g, '').trim();
          return {
            id: log.id,
            date: log.date,
            vehicle_id: log.vehicle_id,
            mode: log.mode,
            distance: log.distance,
            estimated_liters: log.estimatedLiters,
            estimated_cost: log.estimatedCost,
            notes: `${cleanNotes} [u:${username}]`,
            category: log.category || '',
            created_at: log.created_at || new Date().toISOString()
          };
        });

        const { error } = await client
          .from('daily_runs')
          .upsert(dbItems);

        if (error) throw error;
      } catch (err: any) {
        console.warn('Supabase daily runs sync is optional. Saved locally. Message:', err.message);
      }
    }
  },

  /**
   * Fetches all saved routes filtered by username
   */
  async getSavedRoutes(username: string): Promise<SavedRoute[]> {
    const client = getSupabase();
    let allRoutes: SavedRoute[] = [];

    if (client) {
      try {
        const { data, error } = await client
          .from('saved_routes')
          .select('*')
          .order('created_at', { ascending: true });

        if (error) {
          if (error.code === 'PGRST116' || error.message.includes('relation "saved_routes" does not exist')) {
            console.warn('saved_routes table does not exist in Supabase yet. Fallback used.');
          } else {
            throw error;
          }
        } else if (data) {
          allRoutes = data.map((item: any) => {
            const rawName = item.name || '';
            const uMatch = rawName.match(/\[u:([\w-]+)\]/);
            const entryUser = uMatch ? uMatch[1] : '';
            const cleanName = rawName.replace(/\[u:([\w-]+)\]/g, '').trim();
            return {
              id: item.id,
              name: cleanName,
              distance: Number(item.distance),
              isRoundTrip: item.is_round_trip,
              vehicle_id: item.vehicle_id,
              category: item.category,
              username: entryUser
            } as any;
          });
        }
      } catch (err) {
        console.warn('Supabase saved routes fetch failed, falling back to local storage:', err);
        allRoutes = this.getLocalSavedRoutes(username);
      }
    } else {
      allRoutes = this.getLocalSavedRoutes(username);
    }

    const normalizedUsername = username.trim().toLowerCase();
    const filtered = allRoutes.filter(r => {
      const rUser = (r as any).username || '';
      if (!rUser) return true;
      return rUser.toLowerCase() === normalizedUsername;
    });

    if (filtered.length === 0 && allRoutes.length === 0) {
      const saved = localStorage.getItem(`fuel_tracker_saved_routes_${username}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as SavedRoute[];
          this.saveSavedRoutes(parsed, username);
          return parsed;
        } catch {}
      }
    }

    return filtered;
  },

  getLocalSavedRoutes(username: string): SavedRoute[] {
    const saved = localStorage.getItem(`fuel_tracker_saved_routes_${username}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    return [];
  },

  /**
   * Saves/Updates all routes in Supabase
   */
  async saveSavedRoutes(routesList: SavedRoute[], username: string): Promise<void> {
    localStorage.setItem(`fuel_tracker_saved_routes_${username}`, JSON.stringify(routesList));

    const client = getSupabase();
    if (client) {
      try {
        const dbItems = routesList.map(r => {
          const cleanName = (r.name || '').replace(/\[u:([\w-]+)\]/g, '').trim();
          return {
            id: r.id,
            name: `${cleanName} [u:${username}]`,
            distance: r.distance,
            is_round_trip: r.isRoundTrip,
            vehicle_id: r.vehicle_id,
            category: r.category || ''
          };
        });

        const { error } = await client
          .from('saved_routes')
          .upsert(dbItems);

        if (error) throw error;
      } catch (err: any) {
        console.warn('Supabase saved routes sync is optional. Saved locally. Message:', err.message);
      }
    }
  },

  /**
   * Deletes all fuel entries from Supabase and LocalStorage
   */
  async deleteAllEntries(): Promise<void> {
    const client = getSupabase();
    if (client) {
      try {
        const { error } = await client
          .from('fuel_entries')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');
        if (error) throw error;
      } catch (err) {
        console.error('Supabase delete all entries failed:', err);
      }
    }
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  },

  /**
   * Deletes all vehicles from Supabase and LocalStorage
   */
  async deleteAllVehicles(): Promise<void> {
    const client = getSupabase();
    if (client) {
      try {
        const { error } = await client
          .from('vehicles')
          .delete()
          .neq('id', 'none_matching_id_value_to_wipe_all_vehicles');
        if (error) throw error;
      } catch (err) {
        console.error('Supabase delete all vehicles failed:', err);
      }
    }
    localStorage.removeItem('fuel_tracker_vehicles');
  },

  /**
   * Helper to retrieve the Supabase SQL schema to display in help files
   */
  getSQLSchema(): string {
    return `-- SQL Schema script for Supabase Database

-- 1. Create the vehicles table
CREATE TABLE IF NOT EXISTS public.vehicles (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    capacity NUMERIC(10,2) NOT NULL DEFAULT 45,
    fuel_type VARCHAR(50) NOT NULL DEFAULT 'Petrol',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create the fuel_entries table
CREATE TABLE IF NOT EXISTS public.fuel_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    odometer INTEGER NOT NULL,
    liters NUMERIC(10,2) NOT NULL CHECK (liters > 0),
    amount_paid NUMERIC(10,2) NOT NULL CHECK (amount_paid > 0),
    price_per_liter NUMERIC(10,3) GENERATED ALWAYS AS (amount_paid / liters) STORED,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Create the daily_runs table
CREATE TABLE IF NOT EXISTS public.daily_runs (
    id VARCHAR(50) PRIMARY KEY,
    date DATE NOT NULL,
    vehicle_id VARCHAR(50) NOT NULL,
    mode VARCHAR(50) NOT NULL,
    distance NUMERIC(10,2) NOT NULL,
    estimated_liters NUMERIC(10,2) NOT NULL,
    estimated_cost NUMERIC(10,2) NOT NULL,
    notes TEXT,
    category VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Create the saved_routes table
CREATE TABLE IF NOT EXISTS public.saved_routes (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    distance NUMERIC(10,2) NOT NULL,
    is_round_trip BOOLEAN NOT NULL DEFAULT false,
    vehicle_id VARCHAR(50) NOT NULL,
    category VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row-Level Security (RLS) on all tables
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_routes ENABLE ROW LEVEL SECURITY;

-- Create simple all-access policies (or authenticate with your project auth roles)
CREATE POLICY "Enable read/write for all on vehicles" ON public.vehicles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable read/write for all on fuel_entries" ON public.fuel_entries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable read/write for all on daily_runs" ON public.daily_runs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable read/write for all on saved_routes" ON public.saved_routes FOR ALL USING (true) WITH CHECK (true);
`;
  }
};
