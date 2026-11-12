/*
 * Adventure Escape SA / XHAW5112 — vanilla JavaScript.
 * Every page is its own HTML file (index.html, about.html, packages.html ...).
 * This script adds the interactive parts: mobile menu, package filtering/search,
 * the booking cart, discount + VAT calculator, sample quote and contact preview.
 * No framework, backend, real bookings or payment gateway are required.
 * Booking selections are stored locally on this browser. Contact details are not sent.
 */
(() => {
  'use strict';

  const DATA = window.ADVENTURE_DATA;
  const PRODUCTS = [...DATA.packages, ...DATA.activities];
  const STORAGE_KEY = 'adventureEscapeSA-demo-cart-v1';
  const VAT_RATE = 0.15;
  const CURRENCY = new Intl.NumberFormat('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const page = document.body.dataset.page;

  let activeFilter = 'all';
  let searchTerm = '';
  let lastQuote = null;
  let toastTimer;

  /* ---------- helpers ---------- */
  const safe = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => `R${CURRENCY.format(Number(n) || 0)}`;
  const findProduct = id => PRODUCTS.find(p => p.id === id);
  const pageFor = p => `${p.type === 'package' ? 'package' : 'activity'}-${p.id}.html`;
  const $ = (sel) => document.querySelector(sel);

  /* ---------- cart (saved in localStorage) ---------- */
  function loadCart() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(saved)) return [];
      return saved
        .filter(item => item && findProduct(item.id) && Number.isInteger(item.quantity) && item.quantity > 0)
        .map(item => ({ id: item.id, quantity: Math.min(25, item.quantity) }));
    } catch (_) { return []; }
  }
  let cart = loadCart();

  function saveCart() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cart)); } catch (_) { /* storage unavailable */ }
    updateCartCount();
  }
  function updateCartCount() {
    const total = cart.reduce((sum, item) => sum + item.quantity, 0);
    document.querySelectorAll('[data-cart-count]').forEach(el => { el.textContent = total; });
  }
  function changeQuantity(id, delta) {
    if (!findProduct(id)) return;
    const existing = cart.find(item => item.id === id);
    if (existing) {
      existing.quantity = Math.max(0, Math.min(25, existing.quantity + delta));
      cart = cart.filter(item => item.quantity > 0);
    } else if (delta > 0) {
      cart.push({ id, quantity: 1 });
    }
    lastQuote = null;
    saveCart();
  }

  /* ---------- discount + VAT ---------- */
  // 2 selections = 5%, 3 = 10%, 4 or more = 15%; 15% VAT is added AFTER the discount.
  function totals() {
    const lines = cart.map(item => ({ product: findProduct(item.id), quantity: item.quantity })).filter(x => x.product);
    const subtotal = lines.reduce((sum, row) => sum + row.product.price * row.quantity, 0);
    const count = lines.reduce((sum, row) => sum + row.quantity, 0);
    const discountRate = count >= 4 ? 0.15 : count === 3 ? 0.10 : count === 2 ? 0.05 : 0;
    const discount = subtotal * discountRate;
    const beforeVat = subtotal - discount;
    const vat = beforeVat * VAT_RATE;
    return { lines, subtotal, count, discountRate, discount, beforeVat, vat, total: beforeVat + vat };
  }

  /* ---------- toast ---------- */
  function toast(message) {
    const container = document.getElementById('toast-region');
    if (!container) return;
    container.innerHTML = `<div class="toast">✓ ${safe(message)}</div>`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { container.innerHTML = ''; }, 3400);
  }

  /* ---------- mobile menu ---------- */
  function initMenu() {
    const menu = document.getElementById('mobile-menu');
    const toggle = document.getElementById('menu-toggle');
    if (!menu || !toggle) return;
    toggle.addEventListener('click', () => {
      const opening = menu.hidden;
      menu.hidden = !opening;
      toggle.setAttribute('aria-expanded', String(opening));
      toggle.setAttribute('aria-label', opening ? 'Close menu' : 'Open menu');
    });
  }

  /* ---------- packages / activities: filter + search ---------- */
  function filterCatalogue() {
    const cards = [...document.querySelectorAll('#catalogue-cards .adventure-card')];
    let shown = 0;
    cards.forEach(el => {
      const matches = (activeFilter === 'all' || el.dataset.cardCategory === activeFilter) && el.dataset.cardName.includes(searchTerm);
      el.hidden = !matches;
      if (matches) shown++;
    });
    const count = document.getElementById('results-count');
    if (count) count.textContent = `Showing ${shown} of ${cards.length} experiences`;
    const empty = document.getElementById('empty-results');
    if (empty) empty.hidden = shown !== 0;
    document.querySelectorAll('[data-filter]').forEach(btn => {
      const selected = btn.dataset.filter === activeFilter;
      btn.classList.toggle('active', selected);
      btn.setAttribute('aria-pressed', String(selected));
    });
  }

  /* ---------- booking page ---------- */
  function cartRowHtml(row) {
    const p = row.product;
    return `<div class="cart-row"><img src="${p.image}" alt=""/><div class="cart-row-main"><h3><a href="${pageFor(p)}">${safe(p.name)}</a></h3><small>${money(p.price)} per selection</small><div><div class="qty-widget" aria-label="Quantity controls for ${safe(p.name)}"><button type="button" data-qty="${p.id}" data-delta="-1" aria-label="Decrease ${safe(p.name)} quantity">−</button><output>${row.quantity}</output><button type="button" data-qty="${p.id}" data-delta="1" aria-label="Increase ${safe(p.name)} quantity">+</button></div><button class="remove-item" type="button" data-remove="${p.id}">Remove</button></div></div><span class="cart-row-total">${money(p.price * row.quantity)}</span></div>`;
  }
  function renderBooking() {
    const t = totals();
    const lines = $('#cart-lines');
    if (!lines) return;
    lines.innerHTML = t.lines.length
      ? t.lines.map(cartRowHtml).join('')
      : `<div class="booking-empty"><div class="icon-big">♧</div><h3>Your adventure list is empty</h3><p>Browse our packages and add something to see your fee estimate.</p><a class="button button-forest button-small" href="packages.html">Explore packages ↗</a></div>`;

    const set = (key, value) => { const el = document.querySelector(`[data-total="${key}"]`); if (el) el.textContent = value; };
    set('count', t.count);
    set('subtotal', money(t.subtotal));
    set('rate', Math.round(t.discountRate * 100));
    set('discount', `−${money(t.discount)}`);
    set('beforeVat', money(t.beforeVat));
    set('vat', money(t.vat));
    set('total', money(t.total));

    const tip = $('#discount-tip');
    if (tip) {
      tip.textContent =
        t.count === 0 ? 'Add two or more selections to unlock a discount.' :
        t.discountRate === 0 ? 'Add one more selection to get 5% off.' :
        t.discountRate === 0.05 ? 'Nice! You unlocked 5% off. Add one more for 10%.' :
        t.discountRate === 0.10 ? 'Great! You unlocked 10% off. Add one more for 15%.' :
        'You unlocked the maximum 15% discount!';
    }
    const btn = $('#generate-quote');
    if (btn) btn.disabled = t.count === 0;
    const out = $('#quote-output');
    if (out && !lastQuote) out.innerHTML = '';
  }
  function quoteContent(quote) {
    const t = quote.totals;
    return `<div class="quote-output"><h3>✓ Your sample quote is ready</h3><p><strong>Demo reference:</strong> ${safe(quote.reference)}</p><p><strong>Prepared for:</strong> ${safe(quote.name)}</p><p><strong>Selected:</strong> ${t.count} experience${t.count === 1 ? '' : 's'} · ${Math.round(t.discountRate * 100)}% discount</p><p><strong>Estimated total (incl. VAT):</strong> ${money(t.total)}</p><button class="button button-forest button-small" type="button" data-download>Download estimate (.txt) ↓</button><p style="margin-top:13px;font-size:.73rem">This preview is generated locally. It has not been emailed or submitted.</p></div>`;
  }
  function createQuote(e) {
    e.preventDefault();
    const form = e.target;
    if (!form.reportValidity()) return;
    const t = totals();
    if (!t.count) return toast('Select an experience before generating a quote.');
    lastQuote = {
      name: form.elements.name.value.trim(),
      reference: `AES-DEMO-${String(Date.now()).slice(-6)}`,
      totals: t,
      date: new Date().toLocaleDateString('en-ZA')
    };
    const out = $('#quote-output');
    out.innerHTML = quoteContent(lastQuote);
    toast('Your sample quotation is ready.');
    out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function downloadQuote() {
    if (!lastQuote) return;
    const t = lastQuote.totals;
    const lines = [
      'ADVENTURE ESCAPE SA — CLASSROOM DEMO ESTIMATE',
      `Reference: ${lastQuote.reference}`,
      `Date: ${lastQuote.date}`,
      `Prepared for: ${lastQuote.name}`,
      '----------------------------------------',
      ...t.lines.map(row => `${row.product.name} | Quantity ${row.quantity} | ${money(row.product.price * row.quantity)}`),
      '----------------------------------------',
      `Subtotal: ${money(t.subtotal)}`,
      `Discount (${Math.round(t.discountRate * 100)}%): -${money(t.discount)}`,
      `After discount: ${money(t.beforeVat)}`,
      `VAT (15%): ${money(t.vat)}`,
      `ESTIMATED TOTAL: ${money(t.total)}`,
      '',
      'NOT A FINAL INVOICE OR CONFIRMED RESERVATION.',
      'This is a student project demonstration. No booking is transmitted or placed.'
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Adventure-Escape-SA-${lastQuote.reference}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Estimate downloaded to your device.');
  }

  /* ---------- contact page ---------- */
  function previewContact(e) {
    e.preventDefault();
    if (!e.target.reportValidity()) return;
    const data = new FormData(e.target);
    $('#contact-output').innerHTML = `<div class="quote-output"><h3>✓ Message preview created</h3><p>Thank you, <strong>${safe(data.get('contactName'))}</strong>.</p><p>Your message about <strong>${safe(data.get('contactTopic'))}</strong> is displayed as a demonstration only.</p><p><strong>No email was sent.</strong> A real website would need a secure server or form provider to deliver enquiries.</p></div>`;
    toast('Message preview created (not sent).');
  }

  /* ---------- events ---------- */
  document.addEventListener('click', e => {
    const addBtn = e.target.closest('[data-add]');
    if (addBtn) {
      const id = addBtn.dataset.add;
      changeQuantity(id, 1);
      if (addBtn.hasAttribute('data-goto-booking')) { location.href = 'booking.html'; return; }
      toast(`${findProduct(id).name} added to your booking.`);
      return;
    }
    const qty = e.target.closest('[data-qty]');
    if (qty) { changeQuantity(qty.dataset.qty, Number(qty.dataset.delta)); renderBooking(); return; }
    const remove = e.target.closest('[data-remove]');
    if (remove) { cart = cart.filter(item => item.id !== remove.dataset.remove); lastQuote = null; saveCart(); renderBooking(); return; }
    const filter = e.target.closest('[data-filter]');
    if (filter) { activeFilter = filter.dataset.filter; filterCatalogue(); return; }
    if (e.target.closest('[data-reset-filter]')) {
      activeFilter = 'all'; searchTerm = '';
      const el = $('[data-search]'); if (el) el.value = '';
      filterCatalogue();
      return;
    }
    if (e.target.closest('[data-download]')) downloadQuote();
  });
  document.addEventListener('input', e => {
    if (e.target.matches('[data-search]')) { searchTerm = e.target.value.toLowerCase().trim(); filterCatalogue(); }
  });
  document.addEventListener('submit', e => {
    if (e.target.id === 'quote-form') createQuote(e);
    if (e.target.id === 'contact-form') previewContact(e);
  });

  /* ---------- start-up ---------- */
  initMenu();
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
  if (page === 'booking') renderBooking();
  saveCart();
})();
