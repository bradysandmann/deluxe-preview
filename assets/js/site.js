/* Deluxe shared behaviour: page chrome, product data, forms.
   Static layout build. In Shopify these become theme sections and the
   forms become the native customer / contact forms. */
(() => {
  'use strict';

  // Ignite: every figure below is copied from "Deluxe Package Review - Ignite.pdf"
  // (30 Pack back panel). The label is pre-print, so re-check against final art before launch.
  const IGNITE = {
    name: 'Ignite',
    type: 'Electrolyte drink mix',
    tagline: 'Electrolytes + Energy + Vitamins',
    badges: ['Natural energy', 'Zero sugar', 'Essential vitamins'],
    serving: '1 stick pack (approx. 4g)',
    facts: [ // [nutrient, amount per serving, % daily value]
      ['Sodium', '750mg', '33%'],
      ['Potassium', '250mg', '5%'],
      ['Magnesium (as magnesium malate)', '60mg', '14%'],
      ['Vitamin C (as ascorbic acid)', '90mg', '100%'],
      ['Niacin (as niacinamide)', '16mg', '100%'],
      ['Vitamin B6 (as pyridoxine HCl)', '1.7mg', '100%'],
      ['Vitamin B12 (as cyanocobalamin)', '2.4mg', '100%'],
      ['Pantothenic acid (as calcium pantothenate)', '5mg', '100%'],
      ['Caffeine (from green tea extract)', '125mg', '**'],
      ['L-Theanine', '250mg', '**'],
    ],
    factNotes: ['*Percent Daily Values are based on a 2,000 calorie diet.', '**Daily Value not established.'],
    other: 'Citric acid, natural flavors, stevia leaf extract',
    free: ['No artificial sweeteners', 'No artificial colors', 'No artificial flavors', 'No proprietary blends, every dose listed'],
    directions: 'Empty one stick pack into 16 to 20 oz of water. Stir or shake until dissolved.',
    caffeine: 'Contains 125mg of caffeine per serving (about one cup of coffee). Not recommended for children or individuals sensitive to caffeine, pregnant, or nursing. Healthy adults should limit total daily caffeine intake to 400mg.',
  };

  // front/back are transparent cutouts of the client's real pack renders (assets/img/cut/)
  const PRODUCTS = [
    { id: 'deluxe-30', name: 'Deluxe 30 Pack', type: 'Ignite electrolyte drink mix', group: 'packs', servings: 30,
      front: 'cut/pack-30-front.webp', back: 'cut/pack-30-back.webp',
      alt: 'Deluxe 30 Pack pouch',
      line: 'Ignite electrolyte drink mix. 30 single-serve stick packs.', tags: ['30 servings', 'Zero sugar'] },
    { id: 'deluxe-12', name: 'Deluxe 12 Pack', type: 'Ignite electrolyte drink mix', group: 'packs', servings: 12,
      front: 'cut/pack-12-front.webp', back: 'cut/pack-12-back.webp',
      alt: 'Deluxe 12 Pack pouch',
      line: 'Ignite electrolyte drink mix. 12 single-serve stick packs.', tags: ['12 servings', 'Zero sugar'] },
  ];
  const STICK = { name: 'Deluxe stick pack', front: 'cut/stick-front.webp', back: 'cut/stick-back.webp' };

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const productCard = (p) => `
    <article class="product-card" data-group="${p.group}" data-name="${esc((p.name + ' ' + p.type).toLowerCase())}">
      <div class="product-card__media"><div class="showroom" data-showroom data-shape="pouch" data-layout="card" data-front="assets/img/${p.front}" data-back="assets/img/${p.back}" data-label="${esc(p.name)}"></div></div>
      <div class="product-card__body">
        <h3 class="product-card__name"><a href="products.html?pack=${p.id}">${esc(p.name)}</a></h3>
        <p class="product-card__line">${esc(p.line)}</p>
        <ul class="chips">${p.tags.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
        <div class="product-card__foot">
          <span class="status">Launching soon</span>
          <a class="btn btn--dark btn--sm" href="#early-access" data-notify="${esc(p.name)}">Notify me</a>
        </div>
      </div>
    </article>`;

  window.DELUXE = { ignite: IGNITE, products: PRODUCTS, stick: STICK, productCard, esc };

  const page = document.body.dataset.page || '';
  const NAV = [['home', 'Home', 'home.html'], ['products', 'Products', 'products.html'],
               ['catalog', 'Catalog', 'catalog.html'], ['contact', 'Contact', 'contact.html']];
  const navLinks = (cls) => NAV.map(([id, label, href]) =>
    `<a${cls ? ` class="${cls}"` : ''} href="${href}"${id === page ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  const marqueeItems = Array(8).fill('<span>Launching soon</span><span>Feel Deluxe. Live Deluxe.</span>').join('');

  const PARTIALS = {
    header: `
      <a class="skip-link" href="#main">Skip to content</a>
      <div class="topbar" data-topbar>
        <div class="announce" aria-hidden="true"><div class="marquee">${marqueeItems}</div></div>
        <header class="site-header">
          <div class="site-header__bar">
            <button class="icon-btn nav-toggle" type="button" aria-label="Open menu" aria-expanded="false" data-open-drawer>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18M3 12h18M3 17h12"/></svg>
            </button>
            <nav class="nav" aria-label="Main">${navLinks('')}</nav>
            <a class="brand" href="home.html" aria-label="Deluxe home">
              <img src="assets/img/logo-wordmark.png" alt="Deluxe" width="640" height="137">
            </a>
            <div class="site-header__tools">
              <a class="btn btn--sm" href="#early-access">Get early access</a>
              <button class="icon-btn" type="button" aria-label="Cart, 0 items" aria-expanded="false" data-toggle-cart>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1.2 12H6.2L5 8zM9 8V6a3 3 0 0 1 6 0v2"/></svg>
                <span class="cart-count" aria-hidden="true">0</span>
              </button>
              <div class="cart-panel" data-cart hidden>
                <h3>Your cart is empty</h3>
                <p>Deluxe has not launched yet. The first drop goes to the early access list.</p>
                <a class="btn btn--sm" href="#early-access" data-close-cart>Get early access</a>
              </div>
            </div>
          </div>
        </header>
      </div>
      <div class="drawer" data-drawer hidden>
        <button class="icon-btn drawer__close" type="button" aria-label="Close menu" data-close-drawer>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5 5 19"/></svg>
        </button>
        ${navLinks('drawer__link')}
        <a class="btn" href="#early-access" data-close-drawer>Get early access</a>
      </div>`,

    signup: `
      <section class="section section--light" id="early-access" aria-labelledby="signup-title">
        <div class="wrap signup">
          <div class="signup__media cut">
            <img src="assets/img/scene-morning.jpg" alt="The Deluxe pouch and a torn stick pack on a kitchen counter in morning sun" width="1024" height="1280" loading="lazy">
          </div>
          <div>
            <h2 id="signup-title">Get early access</h2>
            <p class="lede" data-signup-context></p>
            <form class="signup__form" data-form="signup" novalidate>
              <div class="field-row">
                <label class="visually-hidden" for="signup-email">Email address</label>
                <input id="signup-email" type="email" name="contact[email]" placeholder="Email address" autocomplete="email" required>
                <button class="btn btn--dark" type="submit">Join the list</button>
              </div>
              <p class="form-status" data-status role="status" aria-live="polite"></p>
            </form>
            <ul class="signup__perks">
              <li>Early access to all things Deluxe</li>
              <li>First to know the launch date</li>
              <li>Unsubscribe any time</li>
            </ul>
          </div>
        </div>
      </section>`,

    footer: `
      <footer class="site-footer">
        <div class="wrap">
          <div class="site-footer__top">
            <div class="site-footer__brand">
              <img src="assets/img/logo-wordmark.png" alt="Deluxe" width="640" height="137" loading="lazy">
              <p>Feel Deluxe. Live Deluxe.</p>
            </div>
            <div>
              <h3>Shop</h3>
              <ul><li><a href="products.html">Products</a></li><li><a href="catalog.html">Catalog</a></li><li><a href="#early-access">Early access</a></li></ul>
            </div>
            <div>
              <h3>Help</h3>
              <ul><li><a href="contact.html">Contact</a></li><li><a href="home.html#faq">Questions</a></li><li><a href="https://deluxe-hq.com/policies/privacy-policy">Terms and policies</a></li></ul>
            </div>
            <div>
              <h3>Follow</h3>
              <ul><li><a href="https://www.instagram.com/deluxe.hq/" rel="noopener">Instagram</a></li></ul>
            </div>
          </div>
          <div class="site-footer__base"><span>&copy; 2026 Deluxe</span><span>deluxe-hq.com</span></div>
        </div>
      </footer>`,
  };

  document.querySelectorAll('[data-include]').forEach((slot) => {
    const html = PARTIALS[slot.dataset.include];
    if (html) slot.outerHTML = html;
  });
  document.querySelectorAll('[data-products]').forEach((slot) => {
    const ids = slot.dataset.products.split(',').map((s) => s.trim()).filter(Boolean);
    const list = ids.length ? ids.map((id) => PRODUCTS.find((p) => p.id === id)).filter(Boolean) : PRODUCTS;
    slot.insertAdjacentHTML('afterbegin', list.map(productCard).join('')); // keeps any static tiles after the cards
  });

  // header: collapse the announcement and float the bar once the page scrolls
  const topbar = document.querySelector('[data-topbar]');
  const onScroll = () => topbar.classList.toggle('is-stuck', window.scrollY > 24);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // cart panel + mobile drawer
  const cart = document.querySelector('[data-cart]');
  const cartBtn = document.querySelector('[data-toggle-cart]');
  const drawer = document.querySelector('[data-drawer]');
  const drawerBtn = document.querySelector('[data-open-drawer]');
  const setCart = (open) => { cart.hidden = !open; cartBtn.setAttribute('aria-expanded', String(open)); };
  const setDrawer = (open) => {
    drawer.hidden = !open; drawerBtn.setAttribute('aria-expanded', String(open));
    document.documentElement.style.overflow = open ? 'hidden' : '';
    if (open) drawer.querySelector('[data-close-drawer]').focus(); else drawerBtn.focus({ preventScroll: true });
  };
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-toggle-cart]')) return setCart(cart.hidden);
    if (t.closest('[data-open-drawer]')) return setDrawer(true);
    if (t.closest('[data-close-drawer]') || t.closest('.drawer__link')) setDrawer(false);
    if (!t.closest('[data-cart]') || t.closest('[data-close-cart]')) setCart(false);

    // "Notify me" carries the product name into the signup copy
    const notify = t.closest('[data-notify]');
    if (notify) {
      const ctx = document.querySelector('[data-signup-context]');
      ctx.textContent = `Leave your email and we will tell you the moment ${notify.dataset.notify} launches.`;
      setTimeout(() => document.getElementById('signup-email').focus({ preventScroll: true }), 600);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!cart.hidden) { setCart(false); cartBtn.focus(); }
    if (!drawer.hidden) setDrawer(false);
  });

  // Forms. PREVIEW BUILD: nothing is sent anywhere yet, and the status line says so.
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  document.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-form]');
    if (!form) return;
    const status = form.querySelector('[data-status]');
    const live = form.dataset.form === 'waitlist';   // the gate's real waitlist: validate here, then let the browser post it
    if (!live) e.preventDefault();
    const fail = (field, msg) => {
      field.setAttribute('aria-invalid', 'true'); field.focus();
      status.dataset.state = 'error'; status.textContent = msg;
    };
    form.querySelectorAll('[aria-invalid]').forEach((f) => f.removeAttribute('aria-invalid'));
    const email = form.querySelector('input[type="email"]');
    if (!EMAIL.test(email.value.trim())) { e.preventDefault(); return fail(email, 'Enter a valid email address, like name@example.com.'); }
    if (live) {
      status.dataset.state = 'ok'; status.textContent = 'You are on the list. We will email you when Season 01 drops.';
      setTimeout(() => form.reset(), 0);          // after the browser has read the fields
      return;
    }
    const message = form.querySelector('textarea[required]');
    if (message && !message.value.trim()) return fail(message, 'Write a message before sending.');
    status.dataset.state = 'ok';
    status.textContent = form.dataset.form === 'signup'
      ? 'You are on the list. (Preview build: nothing is saved until this form is connected to the store.)'
      : 'Message received. (Preview build: nothing is sent until this form is connected to the store.)';
    form.reset();
  });

  // hero: the holographic mark leans toward the pointer
  const hero = document.querySelector('[data-hero]');
  const mark = hero && hero.querySelector('.holo__mark');
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (mark && !calm) {
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      mark.style.setProperty('--ry', `${(x * 14).toFixed(2)}deg`);
      mark.style.setProperty('--rx', `${(-y * 10).toFixed(2)}deg`);
      mark.style.setProperty('--gx', `${(-x * 18).toFixed(1)}px`);
      mark.style.setProperty('--gy', `${(-y * 12).toFixed(1)}px`);
    });
    hero.addEventListener('pointerleave', () => ['--rx', '--ry', '--gx', '--gy'].forEach((p) => mark.style.removeProperty(p)));
  }
  if (calm) document.querySelectorAll('video[autoplay]').forEach((v) => { v.removeAttribute('autoplay'); v.pause(); });
})();
