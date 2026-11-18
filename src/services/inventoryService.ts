import { v4 as uuid } from 'uuid';
import { supabase } from '@/lib/supabase';
import i18n from 'i18next';

type InventoryTable = 'bins' | 'items' | 'locations';
type Fields = Record<string, unknown>;

function requireOwner(owner: string | undefined): asserts owner is string {
  if (!owner) throw new Error(String(i18n.t('inventory.sessionRequired')));
}

// IDs are supplied explicitly: imported inventory tables may have no ID default.
export async function createInventoryRecord(table: InventoryTable, owner: string | undefined, fields: Fields) {
  requireOwner(owner);
  const { data, error } = await supabase.from(table)
    .insert({ ...fields, id: uuid(), userId: owner, createdAt: new Date().toISOString() })
    .select().single();
  if (error) throw error;
  if (!data?.id) throw new Error(String(i18n.t('inventory.recordUnavailable')));
  return data;
}

export async function updateInventoryRecord(table: InventoryTable, owner: string | undefined, id: string, fields: Fields) {
  requireOwner(owner);
  // Do not let a form move a record to another account or replace its identity.
  const { id: _id, userId: _owner, createdAt: _createdAt, ...patch } = fields;
  const { data, error } = await supabase.from(table).update({ ...patch, updatedAt: new Date().toISOString() })
    .eq('id', id).eq('userId', owner).select().single();
  if (error) throw error;
  if (!data?.id) throw new Error(String(i18n.t('inventory.recordUnavailable')));
  return data;
}

export async function deleteInventoryRecord(table: InventoryTable, owner: string | undefined, id: string) {
  requireOwner(owner);
  // Database triggers handle related records in the same transaction. Never
  // delete children first in the browser: failure could leave a half-empty bin.
  const { data, error } = table === 'items'
    ? await supabase.from(table).delete().eq('id', id).eq('userId', owner).select('id').single()
    : await supabase.rpc('inventory_delete_record', { p_table: table, p_owner: owner, p_id: id });
  if (error) throw error;
  if (!data?.id) throw new Error(String(i18n.t('inventory.recordUnavailable')));
}

export function inventoryError(error: unknown, fallback: string): string {
  const message = error && typeof error === 'object' && 'message' in error ? error.message : null;
  return typeof message === 'string' && message ? `${fallback}: ${message}` : fallback;
}
