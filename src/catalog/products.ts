import type { Product } from '../types'
import { getEntry, setUserEntries, type CatalogEntry } from './catalog'

export const productCatalogId = (p: Pick<Product, 'id'>) => `p:${p.id}`

export const STORES = ['IKEA', 'JYSK', 'Maisons du Monde', 'Westwing', 'Wayfair', 'H&M Home', 'Zara Home', 'Kave Home', 'Mobexpert', 'Dedeman', 'Other']

export const CURRENCIES = ['EUR', 'RON', 'USD', 'GBP', 'CHF', 'SEK', 'PLN']

/** Turn a user's product into a catalog entry that renders with its real size and look. */
export function productEntry(p: Product): CatalogEntry {
  const base = getEntry(p.shape)
  return {
    id: productCatalogId(p),
    name: p.name,
    category: 'My products',
    w: p.w,
    d: p.d,
    h: p.h,
    colorRole: 'custom',
    color: p.color,
    symbol: base.symbol,
    builder: base.id,
    plain: !p.woodFinish,
    mount: base.mount,
    defaultElevation: base.defaultElevation,
    surface: base.surface !== undefined ? (base.surface / base.h) * p.h : undefined,
    product: { store: p.store, url: p.url, price: p.price, currency: p.currency, photo: p.photo },
    userModel: p.model ? { key: p.model.key, format: p.model.format, upAxis: p.model.upAxis, rotation: p.model.rotation } : undefined,
  }
}

export function syncProducts(products: Product[]) {
  setUserEntries(products.map(productEntry))
}

export function formatPrice(price: number | undefined, currency: string) {
  if (price === undefined || Number.isNaN(price)) return ''
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(price)
  } catch {
    return `${price.toFixed(2)} ${currency}`
  }
}
