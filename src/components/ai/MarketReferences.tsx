import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import { readMarketResearch } from '@/lib/marketResearch';
import { SearchSuggestions } from './SafeMarkdown';
import './market-references.css';

export function MarketReferences({ research, expanded = false }: { research: unknown; expanded?: boolean }) {
  const { t, i18n } = useTranslation();
  const data = readMarketResearch(research);
  if (!data) return null;
  return <details open={expanded || undefined} className="market-references" onClick={event => event.stopPropagation()}>
    <summary><span>{t('market.references')} · {data.offers.length ? `${data.offers.length} · USD` : t(`market.${data.status}`)}</span></summary>
    <div className="market-references-content">
      <p className="market-explanation">{t('market.disclaimer')}</p>
      <div className="market-store-grid">
        {(['amazon', 'ebay'] as const).map(marketplace => {
          const name = marketplace === 'amazon' ? 'Amazon' : 'eBay';
          const offers = data.offers.filter(offer => offer.marketplace === marketplace);
          const store = data.stores?.[marketplace];
          const searchUrl = marketplace === 'amazon' ? `https://www.amazon.com/s?k=${encodeURIComponent(data.query)}`
            : `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(data.query)}`;
          return <section key={marketplace} aria-label={name} className={`market-store market-store-${marketplace}`}>
            <header><h5>{name}</h5><span>{t('market.priceCount', { count: offers.length })}</span></header>
            <div className="market-store-offers">
              {offers.length ? offers.map(offer => <a key={`${offer.url}:${offer.price}`} href={offer.url} target="_blank" rel="noopener noreferrer" className="market-offer">
                <span className="market-offer-price">{new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'USD' }).format(offer.price)} <small>USD</small><ExternalLink aria-hidden="true" /></span>
                <span className="market-offer-title" title={offer.title}>{offer.title}</span>
                <span className="market-offer-labels"><span>{t(`market.condition.${offer.condition}`)}</span><span>{t('market.similar')}</span></span>
                <span className="market-offer-source">{t(offer.sourceType === 'results' ? 'market.resultsSource' : 'market.directSource')}</span>
              </a>) : <p className="market-store-empty">{t(store?.status === 'unavailable' ? 'market.storeUnavailable' : store?.status === 'not_checked' ? 'market.storePending' : 'market.storeEmpty', { store: name })}</p>}
            </div>
            {data.query && <a className="market-store-search" href={searchUrl} target="_blank" rel="noopener noreferrer">{t('market.search', { store: name })}<ExternalLink aria-hidden="true" /></a>}
            {store?.searchSuggestions && <SearchSuggestions html={store.searchSuggestions} compact />}
          </section>;
        })}
      </div>
      {data.offers.some(offer => offer.sourceType === 'results') && <p className="market-source-hint">{t('market.sourceHint')}</p>}
      {data.checkedAt && <p className="market-checked-at" title={new Date(data.checkedAt).toLocaleString(i18n.language)}>{t('market.checkedAt', { date: new Date(data.checkedAt).toLocaleDateString(i18n.language) })}</p>}
      {data.searchSuggestions && <SearchSuggestions html={data.searchSuggestions} compact />}
    </div>
  </details>;
}
