import { authenticate, cors, json, readBody } from './copilot-server.ts';
export async function moveInventoryImage(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  try {
    const ctx = await authenticate(req);
    const body = await readBody(req);
    const source = new URL(String(body.imageUrl || ''));
    const prefix = '/storage/v1/object/public/binventory-storage/';
    if (source.origin !== new URL(Deno.env.get('SUPABASE_URL')!).origin || !source.pathname.startsWith(prefix)) return json({ error: 'IMAGE_ACCESS_DENIED' }, 403);
    const path = decodeURIComponent(source.pathname.slice(prefix.length));
    const parts = path.split('/');
    if (parts[0] !== ctx.owner || parts.some(part => !part || part === '.' || part === '..') || body.newFolder !== 'items') return json({ error: 'IMAGE_ACCESS_DENIED' }, 403);
    // Keep the source: one detected image may be attached to several items.
    const destination = `${ctx.owner}/items/${crypto.randomUUID()}-${parts.at(-1)!.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const bucket = ctx.db.storage.from('binventory-storage');
    const { error } = await bucket.copy(path, destination);
    if (error) return json({ error: 'IMAGE_COPY_FAILED' }, 503);
    return json({ newUrl: bucket.getPublicUrl(destination).data.publicUrl, newPath: destination });
  } catch (error) {
    return json({ error: (error as { code?: string })?.code === 'COPILOT_UNAUTHORIZED' ? 'UNAUTHORIZED' : 'IMAGE_COPY_FAILED' }, (error as { code?: string })?.code === 'COPILOT_UNAUTHORIZED' ? 401 : 400);
  }
}
