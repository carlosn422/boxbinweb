export interface MarketOffer {
  marketplace: 'amazon' | 'ebay';
  url: string;
  title: string;
  price: number;
  currency: 'USD';
  condition: 'new' | 'used' | 'refurbished' | 'unknown';
  match: 'similar';
  sourceType?: 'listing' | 'results';
}
export interface MarketResearch {
  version: 1;
  market: 'US';
  currency: 'USD';
  query: string;
  checkedAt: string;
  status: 'found' | 'not_found' | 'unavailable' | 'not_checked';
  offers: MarketOffer[];
  searchSuggestions?: string;
}

export function readMarketResearch(value: unknown): MarketResearch | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as MarketResearch;
  if (data.version !== 1 || data.market !== 'US' || data.currency !== 'USD') return null;
  const offers = (Array.isArray(data.offers) ? data.offers : []).filter(offer => {
    try {
      const url = new URL(offer.url);
      const listingPath = offer.marketplace === 'amazon'
        ? url.hostname === 'www.amazon.com' && /^\/dp\/[A-Z0-9]{10}$/.test(url.pathname)
        : offer.marketplace === 'ebay' && url.hostname === 'www.ebay.com' && /^\/itm\/\d{9,15}$/.test(url.pathname);
      const resultsPath = offer.sourceType === 'results' && (
        (offer.marketplace === 'amazon' && url.hostname === 'www.amazon.com' && url.pathname === '/s' && url.searchParams.has('k')) ||
        (offer.marketplace === 'ebay' && url.hostname === 'www.ebay.com' && (/^\/b\/[A-Za-z0-9%_/-]+$/.test(url.pathname) || (url.pathname === '/sch/i.html' && url.searchParams.has('_nkw')))));
      return (listingPath || resultsPath) && url.protocol === 'https:' && !url.username && !url.password && !url.port &&
        Number.isFinite(offer.price) && offer.price > 0 && offer.currency === 'USD';
    } catch { return false; }
  }).slice(0, 4).map(offer => ({ ...offer, title: typeof offer.title === 'string' ? offer.title.slice(0, 200) : offer.marketplace,
    match: 'similar' as const, sourceType: offer.sourceType === 'results' ? 'results' as const : 'listing' as const,
    condition: ['new', 'used', 'refurbished'].includes(offer.condition) ? offer.condition : 'unknown' as const }));
  return { version: 1, market: 'US', currency: 'USD', query: typeof data.query === 'string' ? data.query.slice(0, 240) : '',
    checkedAt: typeof data.checkedAt === 'string' && Number.isFinite(Date.parse(data.checkedAt)) ? data.checkedAt : '',
    status: offers.length ? 'found' : ['unavailable', 'not_checked'].includes(data.status) ? data.status : 'not_found', offers,
    ...(typeof data.searchSuggestions === 'string' && data.searchSuggestions.length <= 50000 ? { searchSuggestions: data.searchSuggestions } : {}) };
}
