import { useEffect } from 'react'
import { getEntry } from '../catalog/catalog'
import { formatPrice } from '../catalog/products'
import { download, safeName } from '../lib/export'
import { useStore } from '../state/store'
import type { Design } from '../types'

interface Row {
  catalogId: string
  name: string
  store: string
  url?: string
  photo?: string
  qty: number
  price?: number
  currency: string
}

export function shoppingRows(design: Design): { rows: Row[]; unlinked: number } {
  const map = new Map<string, Row>()
  let unlinked = 0
  for (const it of design.items) {
    const e = getEntry(it.catalogId)
    if (!e.product) {
      unlinked++
      continue
    }
    const row = map.get(e.id)
    if (row) row.qty++
    else map.set(e.id, { catalogId: e.id, name: e.name, store: e.product.store, url: e.product.url, photo: e.product.photo, qty: 1, price: e.product.price, currency: e.product.currency })
  }
  const rows = [...map.values()].sort((a, b) => a.store.localeCompare(b.store) || a.name.localeCompare(b.name))
  return { rows, unlinked }
}

function totals(rows: Row[]): [string, number][] {
  const t = new Map<string, number>()
  for (const r of rows) if (r.price !== undefined) t.set(r.currency, (t.get(r.currency) ?? 0) + r.price * r.qty)
  return [...t.entries()]
}

function csv(rows: Row[]): string {
  const esc = (v: string | number | undefined) => {
    const s = v === undefined ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [['Product', 'Store', 'Quantity', 'Unit price', 'Currency', 'Subtotal', 'Link']]
  for (const r of rows) lines.push([r.name, r.store, String(r.qty), r.price?.toFixed(2) ?? '', r.currency, r.price !== undefined ? (r.price * r.qty).toFixed(2) : '', r.url ?? ''])
  return lines.map((l) => l.map(esc).join(',')).join('\n')
}

export function ShoppingList({ design, title, onClose }: { design: Design; title: string; onClose: () => void }) {
  useStore((s) => s.products) // refresh if prices are edited while open
  const { rows, unlinked } = shoppingRows(design)
  const sums = totals(rows)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide" role="dialog" aria-modal="true" aria-labelledby="shop-title">
        <header className="modal-head">
          <h2 id="shop-title">Shopping list · {title}</h2>
          <button className="btn ghost icon" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal-body">
          {!rows.length ? (
            <p className="muted">
              No shop products in this design yet. Add real products under <b>Furnish → My products</b>, and they'll be listed here with prices and links.
            </p>
          ) : (
            <table className="shop-table">
              <thead>
                <tr>
                  <th />
                  <th>Product</th>
                  <th>Store</th>
                  <th className="num">Qty</th>
                  <th className="num">Price</th>
                  <th className="num">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.catalogId}>
                    <td>{r.photo ? <img src={r.photo} alt="" className="shop-thumb" /> : <span className="shop-thumb empty" />}</td>
                    <td>
                      {r.url ? (
                        <a href={r.url} target="_blank" rel="noreferrer noopener">
                          {r.name}
                        </a>
                      ) : (
                        r.name
                      )}
                    </td>
                    <td>{r.store}</td>
                    <td className="num">{r.qty}</td>
                    <td className="num">{formatPrice(r.price, r.currency) || '—'}</td>
                    <td className="num">{r.price !== undefined ? formatPrice(r.price * r.qty, r.currency) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {sums.map(([cur, sum]) => (
                  <tr key={cur}>
                    <td colSpan={5} className="num">
                      Total ({cur})
                    </td>
                    <td className="num">
                      <strong>{formatPrice(sum, cur)}</strong>
                    </td>
                  </tr>
                ))}
              </tfoot>
            </table>
          )}
          {unlinked > 0 && (
            <p className="muted small">
              {unlinked} other {unlinked === 1 ? 'item uses' : 'items use'} the built-in catalog and {unlinked === 1 ? 'has' : 'have'} no price. Swap them for your own
              products to complete the budget.
            </p>
          )}
          <p className="muted small">Prices are the ones you entered; check the store for current prices and availability.</p>
        </div>
        <footer className="modal-foot">
          <span className="spacer" />
          <button
            className="btn"
            disabled={!rows.length}
            onClick={() => {
              const url = URL.createObjectURL(new Blob([csv(rows)], { type: 'text/csv' }))
              download(`${safeName(title)}-shopping-list.csv`, url)
              setTimeout(() => URL.revokeObjectURL(url), 1000)
            }}
          >
            Export CSV
          </button>
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  )
}
