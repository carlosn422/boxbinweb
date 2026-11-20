import { useTranslation } from 'react-i18next';
import { readMarketResearch } from '@/lib/marketResearch';
import { SearchSuggestions } from './SafeMarkdown';

export function MarketReferences({ research, expanded = false }: { research: unknown; expanded?: boolean }) {
  const { t, i18n } = useTranslation();
  const data = readMarketResearch(research);
  if (!data) return null;
  return <details open={expanded || undefined} className="mt-2 min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs" onClick={e => e.stopPropagation()}>
    <summary className="cursor-pointer font-semibold text-slate-700">{t('market.references')} · {data.offers.length ? `${data.offers.length} · USD` : t(`market.${data.status}`)}</summary>
    <div className="mt-2 space-y-2">
      <p className="text-slate-500">{t('market.disclaimer')}</p>
      {data.checkedAt && <p className="text-slate-500">{t('market.checkedAt', { date: new Date(data.checkedAt).toLocaleString(i18n.language) })}</p>}
      {data.offers.map(offer => <a key={offer.url} href={offer.url} target="_blank" rel="noopener noreferrer" className="block rounded border border-slate-200 bg-white p-2 text-slate-700 hover:border-blue-400">
        <span className="flex flex-wrap justify-between gap-1 font-semibold"><span>{offer.marketplace === 'amazon' ? 'Amazon' : 'eBay'} ↗</span><span>{new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'USD' }).format(offer.price)} USD</span></span>
        <span className="mt-1 block break-words">{offer.title}</span>
        <span className="mt-1 block text-slate-500">{t(`market.condition.${offer.condition}`)} · {t('market.similar')}</span>
        {offer.sourceType === 'results' && <span className="mt-1 block text-amber-800">{t('market.resultsSource')}</span>}
      </a>)}
      {data.query && <div className="flex flex-wrap gap-3">
        <a className="text-blue-700 underline" href={`https://www.amazon.com/s?k=${encodeURIComponent(data.query)}`} target="_blank" rel="noopener noreferrer">{t('market.search', { store: 'Amazon' })}</a>
        <a className="text-blue-700 underline" href={`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(data.query)}`} target="_blank" rel="noopener noreferrer">{t('market.search', { store: 'eBay' })}</a>
      </div>}
      {data.searchSuggestions && <SearchSuggestions html={data.searchSuggestions} />}
    </div>
  </details>;
}
