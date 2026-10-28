import { useEffect, useState } from 'react';
import { copilotText as ct } from '@/lib/copilotI18n';
import { Input } from '@/components/ui/input';
import { searchInventoryOptions, type ActionProposal } from '@/services/boxbinCopilotService';
const errorText = (e: unknown) => e instanceof Error ? e.message : ct('operationFailed');
function InventorySelect({
  kind,
  value,
  label,
  disabled,
  onChange
}: {
  kind: 'bins' | 'locations';
  value: string;
  label?: string;
  disabled: boolean;
  onChange: (id: string, name: string) => void;
}) {
  const [query, setQuery] = useState(''),
    [rows, setRows] = useState<any[]>([]),
    [busy, setBusy] = useState(false),
    [offset, setOffset] = useState(0),
    [more, setMore] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setBusy(true);
    const timer = setTimeout(() => {
      searchInventoryOptions(query, offset).then(ctx => {
        if (!live) return;
        setRows(kind === 'bins' ? ctx.binsSummary : ctx.locationsSummary);
        setMore(offset + 100 < ctx.matches[kind]);
        setError('');
      }).catch(e => {
        if (live) setError(errorText(e));
      }).finally(() => {
        if (live) setBusy(false);
      });
    }, query ? 300 : 0);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, offset, kind]);
  return <div className="space-y-1">
    <Input aria-label={ct(kind === 'bins' ? 'searchBins' : 'searchLocations')} placeholder={ct('searchByName')} value={query} disabled={disabled} onChange={e => {
      setQuery(e.target.value);
      setOffset(0);
    }} className="h-11 text-base sm:text-sm" />
    <select aria-label={kind === 'bins' ? ct('destinationBin') : ct('location')} className="w-full min-w-0 h-11 border border-slate-200 rounded-lg px-3 text-base sm:text-sm bg-white" value={value || ''} disabled={disabled || busy} onChange={e => onChange(e.target.value, rows.find(r => String(r.id) === e.target.value)?.name || '')}>
      <option value="">{ct(kind === 'bins' ? 'chooseBin' : 'chooseLocation')}</option>
      {value && !rows.some(r => String(r.id) === String(value)) && <option value={value}>{label || value}</option>}
      {rows.map(r => <option key={r.id} value={String(r.id)}>{r.name}</option>)}
    </select>
    {error && <p className="text-xs text-red-700">{error}</p>}
    {(more || offset > 0) && <div className="flex gap-2 text-xs">
        <button type="button" disabled={offset === 0 || busy || disabled} onClick={() => setOffset(n => Math.max(0, n - 100))}>{ct('previous')}</button>
        <button type="button" disabled={!more || busy || disabled} onClick={() => setOffset(n => n + 100)}>{ct('next')}</button>
        </div>}
  </div>;
}
export function CopilotProposalFields({
  proposal,
  disabled,
  update
}: {
  proposal: ActionProposal;
  disabled: boolean;
  update: (d: Record<string, any>) => void;
}) {
  const d = proposal.data,
    t = proposal.type;
  const field = (key: string, label: string) => <label key={key} className="block text-xs space-y-1">
    <span>{label}</span>
    <Input value={String(d[key] ?? '')} disabled={disabled} onChange={e => update({
      [key]: e.target.value
    })} className="h-11 text-base sm:text-sm" />
    </label>;
  if (t.startsWith('update_')) {
    const fields = t === 'update_item' ? ['name','description','cuantity','value','tags'] : t === 'update_location' ? ['name','description','address'] : ['name','description'];
    const labels: Record<string,string> = { name:ct('name'),description:ct('description'),cuantity:ct('quantity'),value:ct('unitValue'),tags:ct('tags'),address:ct('address') };
    const display = (v: unknown) => Array.isArray(v) ? v.join(', ') : v == null || v === '' ? ct('emptyValue') : String(v);
    return <div className="space-y-3">
      <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm break-words"><strong>{d.targetName || d.itemId || d.binId || d.locationId}</strong><p className="mt-1 text-xs text-slate-500">{ct('onlyListedFields')}</p></div>
      {fields.filter(key => Object.prototype.hasOwnProperty.call(d,key)).map(key => <label key={key} className="block min-w-0 space-y-1.5 text-sm">
        <span className="font-medium text-slate-700">{labels[key]}</span>
        <Input aria-label={labels[key]} className="h-11 min-w-0 text-base sm:text-sm" disabled={disabled} value={key==='tags' ? (d.tags || []).join(', ') : String(d[key] ?? '')} inputMode={['cuantity','value'].includes(key) ? 'decimal' : undefined}
          onChange={e => update({[key]:key==='tags' ? e.target.value.split(',').map(x=>x.trim()).filter(Boolean) : e.target.value})} />
        <span className="block break-words text-xs text-slate-500">{ct('currentValue',{value:display(d.before?.[key])})}</span>
      </label>)}
    </div>;
  }
  return <div className="space-y-2">
    {['create_item', 'create_bin', 'create_location'].includes(t) && <>{field('name', ct('name'))}{field('description', ct('description'))}</>}
    {t === 'create_location' && field('address', ct('address'))}
    {t === 'create_item' && <>
        <div className="grid grid-cols-2 gap-2">{field('cuantity', ct('quantity'))}{field('value', ct('unitValue'))}</div>
        <label className="text-xs block">{ct('tags')}<Input className="h-11 text-base sm:text-sm" disabled={disabled} value={(d.tags || []).join(', ')} onChange={e => update({
          tags: e.target.value.split(',').map(x => x.trim()).filter(Boolean)
        })} />
        </label>
        </>}
    {t === 'move_item' && <p className="text-xs">{ct('itemLabel')} <strong>{d.itemName}</strong>
        </p>}
    {['create_item', 'move_item'].includes(t) && <InventorySelect kind="bins" disabled={disabled} value={t === 'move_item' ? d.destinationBinId : d.binId} label={t === 'move_item' ? d.destinationBinName : d.binName} onChange={(id, name) => update(t === 'move_item' ? {
      destinationBinId: id,
      destinationBinName: name
    } : {
      binId: id,
      binName: name
    })} />}
    {['create_bin', 'assign_location'].includes(t) && <>
        <p className="text-xs">{t === 'assign_location' ? ct('binLabel', { name: d.binName }) : ct('optionalLocation')}</p>
        <InventorySelect kind="locations" disabled={disabled} value={d.locationId} label={d.locationName} onChange={(id, name) => update({
        locationId: id,
        locationName: name
      })} />
        </>}
    {t === 'focus_bin_chat' && <p>{d.binName}</p>}
    {['generate_inventory_pdf', 'generate_image'].includes(t) && <p className="text-xs">{d.title}. {ct('reviewBeforeDownload')}</p>}
  </div>;
}
