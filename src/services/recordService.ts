import { v4 as uuid } from 'uuid';
import { supabase } from '@/lib/supabase';
import i18n from 'i18next';

export async function createQrLabels(owner: string | undefined, count: number, requestId?: string) {
  if (!owner) throw new Error(String(i18n.t('inventory.sessionRequired')));
  if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error(String(i18n.t('records.invalidQuantity')));
  const rows = Array.from({ length: count }, () => ({
    id: uuid(), guid: uuid(), qrcodeId: uuid().replace(/-/g, '').slice(0, 8).toUpperCase(),
    dateCreated: new Date().toISOString(), field: '', isUsed: false,
    order_key: requestId || '', userId: owner,
    ...(requestId ? { requestId } : {}),
  }));
  const { data, error } = await supabase.from('qrcodes').insert(rows).select('id,guid');
  if (error) throw error;
  if (!data || data.length !== count) throw new Error(String(i18n.t('inventory.recordUnavailable')));
  return data;
}

export async function grantAccess(username: string) {
  const { data, error } = await supabase.rpc('app_grant_access', { p_username: username.trim() });
  if (error) throw error;
  if (!data?.id) throw new Error(String(i18n.t('inventory.recordUnavailable')));
  return data;
}

export async function revokeAccess(owner: string | undefined, id: string) {
  if (!owner) throw new Error(String(i18n.t('inventory.sessionRequired')));
  const { error } = await supabase.from('shared_access').delete()
    .eq('id', id).eq('ownerUserId', owner).select('id').single();
  if (error) throw error;
}

export async function loadQrLabels(owner: string) {
  const rows: Record<string, any>[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from('qrcodes').select('*').eq('userId', owner).order('id').range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

export async function readTokenBalance() {
  const { data, error } = await supabase.rpc('app_token_balance');
  if (error) throw error;
  const balance = Number(data);
  if (!Number.isFinite(balance) || balance < 0) throw new Error(String(i18n.t('records.loadFailed')));
  return balance;
}
