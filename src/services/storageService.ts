import { v4 as uuid } from 'uuid';
import { supabase } from '@/lib/supabase';
import i18n from 'i18next';

export async function uploadInventoryImage(file: File, owner: string | undefined) {
  if (!owner || !/^[A-Za-z0-9_-]+$/.test(owner)) throw new Error(String(i18n.t('inventory.sessionRequired')));
  const filename = `${owner}/items/${uuid()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const { error } = await supabase.storage.from('binventory-storage').upload(filename, file, { upsert: false });
  if (error) throw error;
  return supabase.storage.from('binventory-storage').getPublicUrl(filename).data.publicUrl;
}
