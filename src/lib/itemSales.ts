export type ItemSaleStatus = 'not_for_sale' | 'for_sale' | 'sold';

export interface ItemSaleFields {
  sale_status?: ItemSaleStatus | null;
  sale_price?: string | number | null;
  sale_url?: string | null;
  sold_at?: string | null;
}

export function normalizeSaleStatus(status: unknown): ItemSaleStatus {
  if (status === 'for_sale' || status === 'sold') return status;
  return 'not_for_sale';
}

export function isItemInSalesList(status: unknown): boolean {
  return status === 'for_sale' || status === 'sold';
}

export function normalizeSaleUrl(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

export function getSaleStoreLabel(url: string | null | undefined): string {
  if (!url) return '';
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    if (host.includes('ebay.')) return 'eBay';
    if (host.includes('amazon.')) return 'Amazon';
    if (host.includes('facebook.') || host.includes('fb.')) return 'Facebook';
    if (host.includes('mercari.')) return 'Mercari';
    if (host.includes('poshmark.')) return 'Poshmark';
    if (host.includes('etsy.')) return 'Etsy';
    if (host.includes('mercadolibre.')) return 'Mercado Libre';
    return host.split('.')[0] || 'Link';
  } catch {
    return 'Link';
  }
}

export function parseSalePrice(price: unknown, fallbackValue?: unknown): number {
  const raw =
    price !== undefined && price !== null && String(price).trim() !== ''
      ? price
      : fallbackValue;
  const num = Number(String(raw ?? '0').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(num) && num >= 0 ? num : 0;
}

export function buildSalePayload(input: {
  enabled: boolean;
  status?: ItemSaleStatus;
  salePrice?: string | number | null;
  saleUrl?: string | null;
  fallbackValue?: string | number | null;
  previousSoldAt?: string | null;
}): {
  sale_status: ItemSaleStatus;
  sale_price: string | null;
  sale_url: string | null;
  sold_at: string | null;
} {
  if (!input.enabled || input.status === 'not_for_sale') {
    return {
      sale_status: 'not_for_sale',
      sale_price: null,
      sale_url: null,
      sold_at: null,
    };
  }
  const nextStatus: ItemSaleStatus = input.status === 'sold' ? 'sold' : 'for_sale';
  const cleanPriceStr = String(input.salePrice ?? '').trim();
  const cleanFallbackStr = String(input.fallbackValue ?? '').trim();
  const effectivePrice = cleanPriceStr || cleanFallbackStr || '0';
  const normalizedUrl = normalizeSaleUrl(input.saleUrl);

  return {
    sale_status: nextStatus,
    sale_price: effectivePrice,
    sale_url: normalizedUrl || null,
    sold_at:
      nextStatus === 'sold'
        ? input.previousSoldAt || new Date().toISOString()
        : null,
  };
}
