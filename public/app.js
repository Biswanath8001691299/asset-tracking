const $ = (s, el = document) => el.querySelector(s);
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const qty = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 8 });
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');
const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cls = (n) => (n > 0 ? 'gain' : n < 0 ? 'loss' : '');
const signed = (n, f = inr) => (n == null ? '—' : `${n > 0 ? '+' : ''}${f.format(n)}`);
const pct = (n) => (n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`);

const COLORS = { stock: 'var(--stock)', crypto: 'var(--crypto)', gold: 'var(--gold)' };
const LABELS = { stock: 'Indian stocks', crypto: 'Crypto', gold: 'Gold SIP' };

let state = { tab: 'stock', data: null };
try { state.tab = localStorage.getItem('tab') || 'stock'; } catch { /* storage unavailable */ }

async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 204) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

// ---------- rendering ----------
function renderSummary(s) {
  const card = (key, b, extra = '') => `
    <div class="card ${key === 'total' ? 'total' : ''}">
      <div class="label">${key === 'total' ? 'Net worth' : `<span class="dot" style="background:${COLORS[key]}"></span>${LABELS[key]}`}</div>
      <div class="value">${inr0.format(b.value)}</div>
      <div class="sub">Invested ${inr0.format(b.invested)}${extra}</div>
      <div class="sub ${cls(b.pnl)}">${signed(b.pnl, inr0)} (${pct(b.pnlPercent)})</div>
    </div>`;
  $('#summaryCards').innerHTML = card('total', s.total) + ['stock', 'crypto', 'gold'].map((k) => card(k, s[k], ` · ${s[k].count} ${k === 'gold' ? 'SIP' : 'entr'}${k === 'gold' ? (s[k].count === 1 ? '' : 's') : s[k].count === 1 ? 'y' : 'ies'}`)).join('');

  const total = s.total.value || 0;
  $('#allocBar').innerHTML = total
    ? ['stock', 'crypto', 'gold'].filter((k) => s[k].value > 0).map((k) => `<span style="width:${(s[k].value / total) * 100}%;background:${COLORS[k]}" title="${LABELS[k]}"></span>`).join('')
    : '';
  $('#allocLegend').innerHTML = ['stock', 'crypto', 'gold']
    .map((k) => `<span><span class="dot" style="background:${COLORS[k]}"></span> ${LABELS[k]} <b>${total ? ((s[k].value / total) * 100).toFixed(1) : '0.0'}%</b></span>`).join('');
}

function stockTable(rows, type) {
  if (!rows.length) return `<div class="empty-state">No ${type === 'stock' ? 'stocks' : 'crypto'} yet. Click <b>+ Add</b> to record a purchase.</div>`;
  const tot = rows.reduce((t, r) => ({ inv: t.inv + r.investedValue, val: t.val + (r.currentValue ?? r.investedValue) }), { inv: 0, val: 0 });
  return `<table>
    <thead><tr><th>${type === 'stock' ? 'Stock' : 'Coin'}</th><th class="num">Qty</th><th class="num">Buy price</th><th class="num">Invested</th>
      <th class="num">Live price</th><th class="num">Day</th><th class="num">Current value</th><th class="num">P&amp;L</th><th></th></tr></thead>
    <tbody>${rows.map((r) => `
      <tr>
        <td><div class="name">${esc(r.name)}</div>
          <div class="meta">${esc(r.symbol)} · bought ${fmtDate(r.buyDate)}${r.notes ? ` · ${esc(r.notes)}` : ''}</div></td>
        <td class="num">${qty.format(r.quantity)}</td>
        <td class="num">${inr.format(r.buyPrice)}<div class="meta">${r.buyPriceSource === 'manual' ? 'entered' : `close ${fmtDate(r.buyPriceDate)}`}</div></td>
        <td class="num">${inr.format(r.investedValue)}</td>
        <td class="num">${r.currentPrice != null ? inr.format(r.currentPrice) : '—'}</td>
        <td class="num ${cls(r.dayChangePercent)}">${pct(r.dayChangePercent)}</td>
        <td class="num">${r.currentValue != null ? inr.format(r.currentValue) : '—'}</td>
        <td class="num ${cls(r.pnl)}">${signed(r.pnl)}<div class="meta ${cls(r.pnl)}">${pct(r.pnlPercent)}</div></td>
        <td class="actions"><button class="btn small ghost" data-edit="${r._id}">Edit</button> <button class="btn small ghost" data-del="${r._id}">✕</button></td>
      </tr>`).join('')}</tbody>
    <tfoot><tr><td>Total</td><td></td><td></td><td class="num">${inr.format(tot.inv)}</td><td></td><td></td>
      <td class="num">${inr.format(tot.val)}</td><td class="num ${cls(tot.val - tot.inv)}">${signed(tot.val - tot.inv)}</td><td></td></tr></tfoot>
  </table>`;
}

function goldTable(sips) {
  if (!sips.length) return '<div class="empty-state">No gold SIP yet. Click <b>+ Add</b> and enter your SIP amount, GST and frequency.</div>';
  return `<table>
    <thead><tr><th>SIP</th><th class="num">Installments</th><th class="num">Invested (incl. GST)</th><th class="num">Gold held</th>
      <th class="num">Avg cost / g</th><th class="num">Live rate / g</th><th class="num">Current value</th><th class="num">P&amp;L</th><th></th></tr></thead>
    <tbody>${sips.map((s) => `
      <tr class="has-ledger">
        <td><div class="name">${esc(s.name)} ${s.platform ? `<span class="badge">${esc(s.platform)}</span>` : ''}</div>
          <div class="meta">${inr.format(s.sipAmount)} ${s.frequency} · GST ${s.gstPercent}% ${s.gstInclusive ? 'included' : 'extra'} · since ${fmtDate(s.startDate)}${s.endDate ? ` to ${fmtDate(s.endDate)}` : ''}</div>
          <div class="meta">${s.nextInstallmentDate ? `Next debit ${fmtDate(s.nextInstallmentDate)}` : 'Completed'}</div></td>
        <td class="num">${s.installmentCount ?? 0}</td>
        <td class="num">${inr.format(s.totalInvested || 0)}<div class="meta">GST ${inr.format(s.totalGst || 0)}</div></td>
        <td class="num">${(s.totalGrams || 0).toFixed(4)} g</td>
        <td class="num">${inr.format(s.avgCostPerGram || 0)}</td>
        <td class="num">${s.currentPricePerGram ? inr.format(s.currentPricePerGram) : '—'}</td>
        <td class="num">${s.currentValue != null ? inr.format(s.currentValue) : '—'}</td>
        <td class="num ${cls(s.pnl)}">${signed(s.pnl)}<div class="meta ${cls(s.pnl)}">${pct(s.pnlPercent)}</div></td>
        <td class="actions"><button class="btn small ghost" data-edit="${s._id}">Edit</button> <button class="btn small ghost" data-del="${s._id}">✕</button></td>
      </tr>
      <tr class="ledger-row"><td colspan="9"><details class="ledger" data-ledger="${s._id}"><summary>View all ${s.installmentCount ?? 0} installments</summary><div class="scroll">Loading…</div></details></td></tr>`).join('')}</tbody>
  </table>`;
}

function renderTable() {
  const d = state.data;
  if (!d) return;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === state.tab));
  $('#tableWrap').innerHTML = state.tab === 'stock' ? stockTable(d.stocks, 'stock') : state.tab === 'crypto' ? stockTable(d.crypto, 'crypto') : goldTable(d.goldSips);
}

async function renderHistory() {
  const el = $('#historyChart');
  let pts;
  try { pts = await api('/portfolio/history?days=365'); } catch { pts = []; }
  // one point per day (latest of the day) keeps the line readable
  const byDay = new Map();
  for (const p of pts) byDay.set(p.at.slice(0, 10), p);
  pts = [...byDay.values()];
  if (pts.length < 2) {
    el.innerHTML = '<div class="empty">The chart fills in as prices are refreshed over the coming days.</div>';
    return;
  }
  const W = 1000, H = 200, P = { l: 8, r: 8, t: 12, b: 22 };
  const vals = pts.flatMap((p) => [p.total.value, p.total.invested]);
  const min = Math.min(...vals) * 0.98, max = Math.max(...vals) * 1.02;
  const x = (i) => P.l + (i / (pts.length - 1)) * (W - P.l - P.r);
  const y = (v) => P.t + (1 - (v - min) / (max - min || 1)) * (H - P.t - P.b);
  const line = (k) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.total[k]).toFixed(1)}`).join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Portfolio value over time">
      <path d="${line('invested')}" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/>
      <path d="${line('value')}" fill="none" stroke="var(--accent)" stroke-width="2.5" vector-effect="non-scaling-stroke"/>
    </svg>
    <div class="legend"><span><span class="dot" style="background:var(--accent)"></span> Value</span>
      <span><span class="dot" style="background:var(--muted)"></span> Invested</span>
      <span>${fmtDate(pts[0].at)} → ${fmtDate(pts.at(-1).at)}</span></div>`;
}

async function load(refresh = false) {
  const btn = $('#refreshBtn');
  btn.disabled = true;
  try {
    state.data = await api(`/portfolio${refresh ? '?refresh=true' : ''}`);
    const d = state.data;
    renderSummary(d.summary);
    renderTable();
    $('#updated').textContent = d.refreshedAt ? `Live prices as of ${new Date(d.refreshedAt).toLocaleString('en-IN')}` : '';
    $('#goldRate').textContent = d.goldPrice ? `Gold 24K: ${inr.format(d.goldPrice.pricePerGram)}/g (excl. GST)` : '';
    $('#alerts').innerHTML = d.errors?.length ? `<div class="alert">Some prices could not be updated: ${esc(d.errors.join('; '))}</div>` : '';
    renderHistory();
  } catch (e) {
    $('#alerts').innerHTML = `<div class="alert">${esc(e.message)}</div>`;
  } finally {
    btn.disabled = false;
  }
}

// ---------- forms ----------
const dialog = $('#dialog');
let formCtx = null;

const field = (name, label, attrs = '', hint = '') => `
  <div class="field"><label for="f-${name}">${label}</label><input id="f-${name}" name="${name}" ${attrs} />${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;

function openForm(type, existing = null) {
  formCtx = { type, existing, picked: existing ? { symbol: existing.symbol, coinId: existing.coinId, name: existing.name } : null };
  $('#formError').textContent = '';
  $('#preview').textContent = '';
  const v = (k, d = '') => esc(existing?.[k] ?? d);
  const dv = (k) => (existing?.[k] ? existing[k].slice(0, 10) : '');
  let html = '';
  if (type === 'stock' || type === 'crypto') {
    $('#formTitle').textContent = `${existing ? 'Edit' : 'Add'} ${type === 'stock' ? 'stock purchase' : 'crypto purchase'}`;
    html += existing
      ? `<div class="field"><label>${type === 'stock' ? 'Stock' : 'Coin'}</label><input value="${esc(existing.name)} (${esc(existing.symbol)})" disabled /></div>`
      : `<div class="field"><label for="f-search">${type === 'stock' ? 'Stock name or NSE/BSE symbol' : 'Coin name or ticker'}</label>
          <input id="f-search" placeholder="${type === 'stock' ? 'e.g. Reliance, TCS, HDFC Bank' : 'e.g. Bitcoin, ETH, Solana'}" required />
          <div class="suggest" id="suggest" hidden></div></div>`;
    html += `<div class="row">${field('quantity', 'Quantity', `type="number" step="any" min="0" required value="${v('quantity')}"`)}
      ${field('buyDate', 'Bought on', `type="date" max="${today()}" required value="${dv('buyDate') || today()}"`)}</div>
      <div class="row">${field('buyPrice', 'Buy price per unit (₹)', `type="number" step="any" min="0" placeholder="Auto: market close" value="${existing?.buyPriceSource === 'manual' ? v('buyPrice') : ''}"`, 'Leave empty to use that day\'s market price')}
      ${field('fees', 'Charges (₹)', `type="number" step="any" min="0" value="${v('fees', '')}"`, 'Brokerage, taxes — optional')}</div>
      ${field('notes', 'Notes', `value="${v('notes')}" placeholder="optional"`)}`;
  } else {
    $('#formTitle').textContent = `${existing ? 'Edit' : 'Add'} gold SIP`;
    html += `<div class="row">${field('name', 'Name', `value="${v('name', 'Gold SIP')}"`)}${field('platform', 'Platform', `value="${v('platform')}" placeholder="optional"`)}</div>
      <div class="row">${field('sipAmount', 'SIP amount (₹)', `type="number" step="any" min="1" required value="${v('sipAmount')}"`)}
      <div class="field"><label for="f-frequency">Frequency</label><select id="f-frequency" name="frequency">
        ${['daily', 'weekly', 'monthly', 'quarterly'].map((f) => `<option ${(existing?.frequency || 'monthly') === f ? 'selected' : ''}>${f}</option>`).join('')}</select></div></div>
      <div class="row">${field('gstPercent', 'GST %', `type="number" step="any" min="0" max="100" required value="${v('gstPercent', 3)}"`)}
      ${field('premiumPercent', 'Platform spread %', `type="number" step="any" min="0" max="50" value="${v('premiumPercent', 0)}"`, 'Extra over market rate, if your app charges one')}</div>
      <label class="check"><input type="checkbox" name="gstInclusive" ${existing?.gstInclusive === false ? '' : 'checked'} /> SIP amount already includes GST</label>
      <div class="row">${field('startDate', 'First installment', `type="date" max="${today()}" required value="${dv('startDate')}"`)}
      ${field('endDate', 'End date', `type="date" value="${dv('endDate')}"`, 'Leave empty if ongoing')}</div>`;
  }
  $('#formBody').innerHTML = html;
  bindFormHelpers();
  dialog.showModal();
}

let searchTimer;
function bindFormHelpers() {
  const { type } = formCtx;
  const search = $('#f-search');
  if (search) {
    search.addEventListener('input', () => {
      formCtx.picked = null;
      clearTimeout(searchTimer);
      const q = search.value.trim();
      const box = $('#suggest');
      if (q.length < 2) { box.hidden = true; return; }
      searchTimer = setTimeout(async () => {
        try {
          const res = await api(`/search/${type === 'stock' ? 'stocks' : 'crypto'}?q=${encodeURIComponent(q)}`);
          box.innerHTML = res.length
            ? res.map((r, i) => `<button type="button" data-i="${i}"><span>${esc(r.name)}</span><span class="muted">${esc(r.symbol)}${r.exchange ? ` · ${r.exchange}` : ''}</span></button>`).join('')
            : '<div class="hint" style="padding:8px 10px">No matches</div>';
          box.hidden = false;
          box.onclick = (e) => {
            const b = e.target.closest('button[data-i]');
            if (!b) return;
            const r = res[b.dataset.i];
            formCtx.picked = { symbol: r.symbol, coinId: r.id, name: r.name };
            search.value = `${r.name} (${r.symbol})`;
            box.hidden = true;
            updatePreview();
          };
        } catch (err) { box.innerHTML = `<div class="hint" style="padding:8px 10px">${esc(err.message)}</div>`; box.hidden = false; }
      }, 300);
    });
  }
  $('#formBody').addEventListener('change', updatePreview);
  $('#formBody').addEventListener('input', (e) => { if (e.target.name === 'quantity' || e.target.name === 'buyPrice' || e.target.name === 'sipAmount') updatePreview(); });
  updatePreview();
}

let previewSeq = 0;
async function updatePreview() {
  const { type, picked } = formCtx;
  const f = new FormData($('#form'));
  const out = $('#preview');
  const seq = ++previewSeq;
  if (type === 'gold') {
    const amt = Number(f.get('sipAmount')), g = Number(f.get('gstPercent'));
    if (!amt) { out.textContent = ''; return; }
    const incl = f.get('gstInclusive') === 'on';
    const net = incl ? amt / (1 + g / 100) : amt;
    const rate = state.data?.goldPrice?.pricePerGram;
    out.textContent = `Each debit: ₹${(incl ? amt : amt * (1 + g / 100)).toFixed(2)} paid → ₹${net.toFixed(2)} buys gold${rate ? ` ≈ ${(net / rate).toFixed(4)} g at today's rate` : ''}. Past installments are valued at each day's gold rate.`;
    return;
  }
  if (!picked) { out.textContent = ''; return; }
  const q = Number(f.get('quantity'));
  const manual = Number(f.get('buyPrice'));
  const date = f.get('buyDate');
  if (manual) { out.textContent = q ? `Invested: ${inr.format(manual * q + Number(f.get('fees') || 0))}` : ''; return; }
  if (!date) return;
  out.textContent = 'Fetching market price…';
  try {
    const path = type === 'stock'
      ? `/quote/stock/${encodeURIComponent(picked.symbol)}?date=${date}`
      : `/quote/crypto/${encodeURIComponent(picked.coinId)}?date=${date}&symbol=${encodeURIComponent(picked.symbol)}`;
    const r = await api(path);
    if (seq !== previewSeq) return;
    out.textContent = `Price on ${fmtDate(r.onDate.date)}: ${inr.format(r.onDate.price)}${q ? ` → invested ${inr.format(r.onDate.price * q + Number(f.get('fees') || 0))}` : ''} · live ${inr.format(r.price)}`;
  } catch (e) { if (seq === previewSeq) out.textContent = e.message; }
}

$('#form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const { type, existing, picked } = formCtx;
  const f = Object.fromEntries(new FormData(e.target));
  const save = $('#saveBtn');
  $('#formError').textContent = '';
  let path, body;
  if (type === 'gold') {
    body = { ...f, gstInclusive: f.gstInclusive === 'on', endDate: f.endDate || null };
    path = existing ? `/gold-sips/${existing._id}` : '/gold-sips';
  } else {
    if (!existing && !picked) { $('#formError').textContent = 'Pick a result from the search list.'; return; }
    body = { quantity: f.quantity, buyDate: f.buyDate, fees: f.fees || 0, notes: f.notes };
    if (f.buyPrice) body.buyPrice = f.buyPrice; else if (existing) body.useMarketPrice = true;
    if (!existing) Object.assign(body, { assetType: type, symbol: picked.symbol, coinId: picked.coinId, name: picked.name });
    path = existing ? `/holdings/${existing._id}` : '/holdings';
  }
  save.disabled = true; save.textContent = 'Saving…';
  try {
    await api(path, { method: existing ? 'PUT' : 'POST', body });
    dialog.close();
    await load();
  } catch (err) {
    $('#formError').textContent = err.message;
  } finally {
    save.disabled = false; save.textContent = 'Save';
  }
});
$('#cancelBtn').addEventListener('click', () => dialog.close());

// ---------- events ----------
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  state.tab = t.dataset.tab;
  try { localStorage.setItem('tab', state.tab); } catch { /* ignore */ }
  renderTable();
}));
$('#addBtn').addEventListener('click', () => openForm(state.tab));
$('#refreshBtn').addEventListener('click', () => load(true));

$('#tableWrap').addEventListener('click', async (e) => {
  const edit = e.target.closest('[data-edit]');
  const del = e.target.closest('[data-del]');
  const list = state.tab === 'stock' ? state.data.stocks : state.tab === 'crypto' ? state.data.crypto : state.data.goldSips;
  if (edit) openForm(state.tab, list.find((x) => x._id === edit.dataset.edit));
  if (del) {
    const item = list.find((x) => x._id === del.dataset.del);
    if (!confirm(`Delete ${item.name}?`)) return;
    try {
      await api(`/${state.tab === 'gold' ? 'gold-sips' : 'holdings'}/${item._id}`, { method: 'DELETE' });
      await load();
    } catch (err) { alert(err.message); }
  }
});

$('#tableWrap').addEventListener('toggle', async (e) => {
  const d = e.target;
  if (!d.matches?.('details.ledger') || !d.open || d.dataset.loaded) return;
  try {
    const sip = await api(`/gold-sips/${d.dataset.ledger}`);
    d.dataset.loaded = '1';
    d.querySelector('.scroll').innerHTML = `<table><thead><tr><th>Date</th><th class="num">Paid</th><th class="num">GST</th><th class="num">Rate / g</th><th class="num">Grams</th></tr></thead>
      <tbody>${[...sip.installments].reverse().map((i) => `<tr><td>${fmtDate(i.date)}</td><td class="num">${inr.format(i.amountPaid)}</td><td class="num">${inr.format(i.gst)}</td><td class="num">${inr.format(i.pricePerGram)}</td><td class="num">${i.grams.toFixed(4)}</td></tr>`).join('')}</tbody></table>`;
  } catch (err) { d.querySelector('.scroll').textContent = err.message; }
}, true);

load();
setInterval(() => { if (!dialog.open && document.visibilityState === 'visible') load(); }, 60000);
