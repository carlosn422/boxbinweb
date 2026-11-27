import { CopilotError, type CopilotLanguage } from './copilot-contract.ts';
import type { Context } from './copilot-server.ts';

// Only supported factual clauses bypass the model; filters and detail requests do not.
export function directFact(query: string): 'value' | 'latest' | 'latest_bin' | 'list' | null {
  const q = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[¿?¡!.,]/g, '').trim().replace(/^y\s+/, '').replace(/\s+/g, ' ');
  if (/^(?:(?:dime|lista|muestrame|dame|ensename|ver) )?(?:todos (?:los |mis )?|mis |los )?(?:items|articulos|productos)(?: (?:de mi inventario|registrados))?$/.test(q) || /^(?:list|show|show me) (?:all |my |all my )?items$/.test(q)) return 'list';
  if (/^(?:(?:cual es|cuanto es|dime) )?(?:el )?valor(?: total)? de (?:mi|el) inventario$/.test(q) || /^(?:what is |what's )?(?:the )?(?:total )?value of my inventory$/.test(q)) return 'value';
  if (/^(?:(?:cual (?:es|fue)|dime|muestrame) )?(?:mi|el) ultimo (?:item|articulo|producto)(?: (?:registrado|agregado|creado))?$/.test(q) || /^(?:what (?:is|was) |what's )?my (?:last|latest|most recent) item$/.test(q)) return 'latest';
  if (/^(?:(?:cual (?:es|fue)|dime|muestrame) )?(?:mi|el|la) (?:ultimo|ultima|mas reciente) (?:bin|caja|contenedor)(?: (?:registrado|registrada|agregado|agregada|creado|creada))?$/.test(q) || /^(?:what (?:is|was) |what's )?my (?:last|latest|most recent) (?:bin|box|container)$/.test(q)) return 'latest_bin';
  return null;
}

export function directFacts(query: string): NonNullable<ReturnType<typeof directFact>>[] {
  const single = directFact(query);
  if (single) return [single];
  const parts = query.trim().replace(/^[¿¡]/, '').replace(/^(?:y|and)\s+/i, '').split(/\s+(?:y|and)\s+/i);
  if (parts.length !== 2) return [];
  const facts = parts.map(directFact);
  return facts.every(Boolean) ? [...new Set(facts)] as NonNullable<ReturnType<typeof directFact>>[] : [];
}

// Uses the same authorized SQL snapshot as totals and model evidence.
export function latestSnapshotReply(snapshot: Record<string, any>, language: CopilotLanguage): string {
  const es = language === 'es';
  if (snapshot.inventoryMetrics.totalItems === 0) return es ? 'No hay ítems registrados en este alcance.' : 'There are no items in this scope.';
  if (snapshot.itemsWithoutCreationDate > 0) return es ? 'No puedo confirmar cuál fue el último ítem: algunos registros no tienen una fecha de creación válida.' : 'I cannot confirm the latest item: some records have no valid creation date.';
  const [first, second] = snapshot.latestItems;
  const firstTime = creationTime(first?.createdAtNormalized);
  if (!first || firstTime === null) throw new CopilotError('COPILOT_UNAVAILABLE', 503);
  if (second && creationTime(second.createdAtNormalized) === firstTime) return es ? 'Varios ítems comparten la fecha más reciente; no puedo distinguir un único último ítem.' : 'Several items share the latest timestamp; I cannot identify a single latest item.';
  const name = String(first.name ?? '').replace(/[\\`*_{}\[\]<>]/g, '').slice(0, 200);
  return es ? `Claro, el último ítem que registraste${snapshot.activeBin ? ' en esta caja' : ''} es **${name}**.` : `Sure, the latest item you added${snapshot.activeBin ? ' in this bin' : ''} is **${name}**.`;
}

export function latestBinSnapshotReply(snapshot: Record<string, any>, language: CopilotLanguage): string {
  const es = language === 'es';
  if (snapshot.activeBin) return es ? 'Para consultar tu última caja, cambia al inventario general; esta conversación está limitada a la caja actual.' : 'Switch to the full inventory to find your latest bin; this conversation is limited to the current bin.';
  if (snapshot.inventoryMetrics.totalBins === 0) return es ? 'Aún no tienes cajas registradas.' : 'You have no bins yet.';
  if (!Number.isSafeInteger(snapshot.binsWithoutCreationDate) || !Array.isArray(snapshot.latestBins)) throw new CopilotError('COPILOT_UNAVAILABLE', 503);
  if (snapshot.binsWithoutCreationDate > 0) return es ? 'No puedo confirmar cuál fue tu última caja: algunas no tienen una fecha de creación válida.' : 'I cannot confirm your latest bin: some bins have no valid creation date.';
  const [first, second] = snapshot.latestBins;
  const date = creationTime(first?.createdAtNormalized);
  if (!first || date === null) throw new CopilotError('COPILOT_UNAVAILABLE', 503);
  if (second && creationTime(second.createdAtNormalized) === date) return es ? 'Varias cajas comparten la fecha más reciente; no puedo distinguir una única última caja.' : 'Several bins share the latest timestamp; I cannot identify a single latest bin.';
  const name = String(first.name ?? '').replace(/[\\`*_{}\[\]<>]/g, '').slice(0, 200);
  return es ? `Tu última caja registrada es **${name}**.` : `Your latest bin is **${name}**.`;
}

export function creationTime(value: unknown): number | null {
  if (typeof value === 'string') {
    // Only ISO dates with an explicit timezone; never let the host guess a locale.
    if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return null;
    const date = Date.parse(value);
    return Number.isFinite(date) ? date : null;
  }
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    const seconds = v.seconds ?? v._seconds;
    const nanos = v.nanoseconds ?? v._nanoseconds ?? 0;
    if (typeof seconds === 'number' && Number.isFinite(seconds) && typeof nanos === 'number' && Number.isFinite(nanos) && nanos >= 0 && nanos < 1e9) return seconds * 1000 + nanos / 1e6;
  }
  return null;
}

export async function latestItemReply(ctx: Context, binId: string | null, language: CopilotLanguage): Promise<string> {
  // Legacy imports contain both ISO dates and Firestore timestamps. Ordering raw
  // JSON/text in Postgres is not chronological; inspect the dates, never the IDs.
  let latest: { name: string; time: number } | null = null;
  let unknown = false, tied = false, total = 0;
  const es = language === 'es';
  for (let offset = 0; offset < 10000; offset += 500) {
    let query = ctx.db.from('items').select('id,name,createdAt').eq('userId', ctx.owner);
    if (binId) query = query.eq('binId', binId);
    const { data, error } = await query.order('id').range(offset, offset + 499);
    if (error || !Array.isArray(data)) throw new CopilotError('COPILOT_UNAVAILABLE', 503);
    for (const row of data) {
      total++;
      const time = creationTime(row.createdAt);
      if (time === null) { unknown = true; continue; }
      if (!latest || time > latest.time) { latest = { name: String(row.name || '').slice(0, 200), time }; tied = false; }
      else if (time === latest.time) tied = true;
    }
    if (data.length < 500) {
      if (!total) return es ? 'No hay ítems registrados en este alcance.' : 'There are no items in this scope.';
      if (!latest || unknown) return es ? 'No puedo confirmar cuál fue el último ítem: hay registros sin una fecha de creación válida. No se puede deducir por su identificador ni por el orden de la lista.' : 'I cannot confirm the latest item: some records have no valid creation date. IDs and list order do not establish chronology.';
      if (tied) return es ? 'Varios ítems comparten la fecha de creación más reciente; no puedo distinguir un único último ítem.' : 'Several items share the latest creation timestamp; I cannot identify a single latest item.';
      const name = latest.name.replace(/[\\`*_{}\[\]<>]/g, '');
      return es ? `Claro, el último ítem que registraste${binId ? ' en esta caja' : ''} es **${name}**.` : `Sure, the latest item you added${binId ? ' in this bin' : ''} is **${name}**.`;
    }
  }
  return es ? 'No pude revisar todas las fechas del inventario. Abre una caja para consultar su último ítem; no puedo confirmar el último global con una revisión parcial.' : 'I could not review all inventory dates. Open a bin to check its latest item; a partial review cannot establish the latest global item.';
}

export function inventoryValueReply(metrics: Record<string, unknown>, language: CopilotLanguage): string | null {
  const value = Number(metrics.totalEstimatedValue), missing = Number(metrics.unvaluedItems);
  if (metrics.totalEstimatedValue == null || !Number.isFinite(value) || value < 0 || !Number.isFinite(missing)) return null;
  const amount = value.toLocaleString(language === 'es' ? 'es-MX' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const es = language === 'es';
  const scope = metrics.scope === 'bin' ? (es ? 'esta caja' : 'this bin') : (es ? 'tu inventario' : 'your inventory');
  return (es ? `Claro, el valor total registrado de ${scope} es **$${amount} USD**.` : `Sure, the total recorded value of ${scope} is **$${amount} USD**.`) + (missing > 0 ? (es ? ` Hay ${missing} ítems sin valor o cantidad válidos; el total puede estar incompleto.` : ` ${missing} items lack a valid value or quantity; the total may be incomplete.`) : '');
}


export function inventoryListReply(snapshot: Record<string, any>, language: CopilotLanguage): string | null {
  // Never turn a partial page into a purportedly complete list.
  if (snapshot.hasMore !== false || !Array.isArray(snapshot.itemsSample)) return null;
  const es = language === 'es';
  const items = snapshot.itemsSample;
  if (!items.length) return es ? 'Aún no tienes ítems registrados en este alcance.' : 'You have no items registered in this scope yet.';
  const clean = (v: unknown) => String(v ?? '').replace(/[\\`*_{}\[\]<>#]/g, '').replace(/[\r\n]+/g, ' ').slice(0, 200);
  const groups = new Map<string, { label: string; rows: string[] }>();
  for (const item of items) {
    const key = String(item.binId ?? '');
    let group = groups.get(key);
    if (!group) {
      group = { label: clean(item.binName) || (es ? 'Sin caja' : 'No bin'), rows: [] };
      const location = clean(item.locationName);
      if (location) group.label += ` — ${location}`;
      groups.set(key, group);
    }
    const quantity = String(item.cuantity ?? '').trim();
    const validQuantity = /^(?:\d+)(?:\.\d+)?$/.test(quantity);
    group.rows.push(`- ${clean(item.name)} (${validQuantity ? quantity + (es ? ' uds.' : ' units') : (es ? 'cantidad no registrada' : 'quantity not recorded')})`);
  }
  const reply = (es ? `Claro, estos son tus **${items.length} ítems**` : `Sure, here are your **${items.length} items**`) + (snapshot.activeBin ? (es ? ' en esta caja:' : ' in this bin:') : ':') + '\n\n' + [...groups.values()].map(g => `**${g.label}**\n${g.rows.join('\n')}`).join('\n\n');
  return reply.length <= 16000 ? reply : null;
}
