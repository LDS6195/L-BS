(() => {
  const { products, changeCart, restoreCart, total, unitPrice, validateCustomer, formatPhone } = LexStore;
  const main = document.getElementById('main');
  const dialog = document.getElementById('cart-dialog');
  const content = document.getElementById('cart-content');
  const money = (amount) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  let cart = [];
  let submitting = false;
  let toastTimer;
  let customer = { firstName: '', lastName: '', email: '', phone: '' };
  let attempt = null;
  try { cart = restoreCart(localStorage.getItem('lex-cart')); } catch {}
  try { attempt = JSON.parse(localStorage.getItem('lex-order-attempt') || 'null'); } catch {}
  function notify(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 2500);
  }
  function updateCart(action) {
    const updated = changeCart(cart, action);
    if (action.type === 'replace' && updated === cart) notify('Each product and size can have a maximum quantity of 20.');
    cart = updated;
    try { localStorage.setItem('lex-cart', JSON.stringify(cart)); } catch { notify('Your browser cannot save this cart between visits.'); }
    document.getElementById('cart-count').textContent = cart.reduce((count, item) => count + item.quantity, 0);
  }
  function renderPage() {
    const route = location.hash || '#/';
    const product = products.find((item) => route === `#/product/${item.id}`);
    document.title = product ? `${product.name} | Lex Book & Sip Club` : 'Club Shop | Lex Book & Sip Club';
    if (product) {
      main.innerHTML = `<a class="breadcrumb" href="#/">&larr; Back to the shop</a><div class="product-detail">
        <img class="product-image" src="${product.image}" alt="${product.name}" />
        <section class="product-info"><p class="eyebrow">Lex Book & Sip Club</p><h1>${product.name}</h1><p class="detail-price" id="product-price">${money(unitPrice(product, 'M'))}</p>
          <p class="description">${product.description}</p><p class="color-info">Color: <strong>${product.color}</strong></p>
          <form id="product-form"><fieldset><legend>Size</legend><div class="sizes">${product.sizes.map((size) => `<label class="size-option"><input type="radio" name="size" value="${size}" aria-label="${size}, ${money(unitPrice(product, size))}" ${size === 'M' ? 'checked' : ''} required /><span>${size}</span></label>`).join('')}</div></fieldset>
            <div class="purchase-row"><div class="quantity-input"><label for="quantity">Quantity</label><input id="quantity" name="quantity" type="number" value="1" min="1" max="20" required /></div><button class="button" type="submit">Add to cart</button></div>
          </form></section></div>`;
      document.getElementById('product-form').addEventListener('change', (event) => {
        if (event.target.name === 'size') document.getElementById('product-price').textContent = money(unitPrice(product, event.target.value));
      });
      document.getElementById('product-form').addEventListener('submit', (event) => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        updateCart({ type: 'add', id: product.id, size: fields.get('size'), quantity: Number(fields.get('quantity')) });
        notify('Added to your cart');
      });
    } else if (route === '#/' || route === '#') {
      main.innerHTML = `<div class="collection-heading"><p class="eyebrow">Lex Book & Sip Club</p><h1>The club shop<span style="color:var(--accent)">.</span></h1><p class="muted">For your next chapter.</p></div>
        <div class="product-grid">${products.map((item) => `<article class="product-card"><a class="image-link" href="#/product/${item.id}" aria-label="View ${item.name}"><img class="product-image" src="${item.image}" alt="${item.name}" /></a><div class="product-meta"><h2><a href="#/product/${item.id}">${item.name}</a></h2><p class="price">From ${money(item.price)}</p></div><p class="product-note">${item.color} / ${item.sizes[0]}-${item.sizes.at(-1)}</p><a class="text-link" href="#/product/${item.id}">Shop ${item.id === 'tee' ? 'the tee' : 'the hoodie'} &rarr;</a></article>`).join('')}</div>`;
    } else { main.innerHTML = '<h1>Page not found</h1><a class="text-link" href="#/">Back to the shop</a>'; }
    window.scrollTo(0, 0);
  }
  function rememberCustomer() {
    const form = document.getElementById('order-form');
    if (form) { const fields = new FormData(form); customer = { firstName: fields.get('firstName') || '', lastName: fields.get('lastName') || '', email: fields.get('email') || '', phone: formatPhone(fields.get('phone') || '') }; }
  }
  function renderCart() {
    if (!cart.length) {
      content.innerHTML = '<div class="empty-cart"><h3>A new chapter awaits.</h3><p class="muted">Your cart is empty.</p><button class="button" id="continue-shopping" type="button">Back to the shop</button></div>';
      document.getElementById('continue-shopping').onclick = () => { dialog.close(); location.hash = '#/'; };
      return;
    }
    content.innerHTML = `${cart.map((item, index) => {
      const product = products.find((entry) => entry.id === item.id);
      return `<div class="cart-item"><img src="${product.image}" alt="${product.name}" /><div>
        <label for="cart-product-${index}">Product</label><select id="cart-product-${index}" data-product="${index}" form="order-form" required>${products.map((option) => `<option value="${option.id}" ${option.id === item.id ? 'selected' : ''}>${option.name}</option>`).join('')}</select>
        <div class="cart-options"><div><label for="cart-size-${index}">Size</label><select id="cart-size-${index}" data-size="${index}" form="order-form" required>${product.sizes.map((size) => `<option value="${size}" ${size === item.size ? 'selected' : ''}>${size}</option>`).join('')}</select></div>
        <div><label for="cart-quantity-${index}">Quantity</label><input id="cart-quantity-${index}" type="number" min="1" max="20" value="${item.quantity}" data-quantity="${index}" form="order-form" required aria-label="Quantity for ${product.name}, size ${item.size}" /></div></div>
        <div class="cart-actions"><p class="price">${money(unitPrice(product, item.size) * item.quantity)}</p><button class="remove" type="button" data-remove="${index}">Remove</button></div></div></div>`;
    }).join('')}<div class="cart-total"><span>Total</span><span>${money(total(cart))}</span></div>
      <form id="order-form" class="order-form" novalidate><h3>Order details</h3>
        <div class="form-field"><label for="customer-first-name">First name</label><input id="customer-first-name" name="firstName" autocomplete="given-name" maxlength="100" value="${escapeHtml(customer.firstName)}" required /></div>
        <div class="form-field"><label for="customer-last-name">Last name</label><input id="customer-last-name" name="lastName" autocomplete="family-name" maxlength="100" value="${escapeHtml(customer.lastName)}" required /></div>
        <div class="form-field"><label for="customer-email">Email</label><input id="customer-email" name="email" type="email" autocomplete="email" maxlength="254" value="${escapeHtml(customer.email)}" required /></div>
        <div class="form-field"><label for="customer-phone">Phone number</label><input id="customer-phone" name="phone" type="tel" autocomplete="tel" maxlength="30" placeholder="(555) 123-4567" value="${escapeHtml(formatPhone(customer.phone))}" required /></div>
        <button class="button" type="submit" ${window.SHOP_CONFIG.googleSheetsUrl ? '' : 'disabled'}>Submit order</button>
        <p class="order-note">Make sure to send payment via Venmo to complete your order.</p><p id="order-status" class="form-status" role="status">${window.SHOP_CONFIG.googleSheetsUrl ? '' : 'Order submission is not connected yet.'}</p></form>`;
    content.querySelectorAll('[data-remove]').forEach((button) => button.onclick = () => { rememberCustomer(); updateCart({ ...cart[Number(button.dataset.remove)], type: 'remove' }); renderCart(); });
    content.querySelectorAll('[data-product]').forEach((select) => select.onchange = () => {
      rememberCustomer();
      const previous = cart[Number(select.dataset.product)];
      const product = products.find((item) => item.id === select.value);
      updateCart({ type: 'replace', previous, id: product.id, size: product.sizes.includes(previous.size) ? previous.size : 'M', quantity: previous.quantity });
      renderCart();
    });
    content.querySelectorAll('[data-size]').forEach((select) => select.onchange = () => {
      rememberCustomer();
      const previous = cart[Number(select.dataset.size)];
      updateCart({ ...previous, type: 'replace', previous, size: select.value });
      renderCart();
    });
    content.querySelectorAll('[data-quantity]').forEach((input) => input.onchange = () => {
      if (!input.checkValidity()) { input.setAttribute('aria-invalid', 'true'); input.reportValidity(); return; }
      rememberCustomer(); updateCart({ ...cart[Number(input.dataset.quantity)], type: 'quantity', quantity: Number(input.value) }); renderCart();
    });
    content.querySelectorAll('input, select, textarea').forEach((control) => control.addEventListener('input', () => {
      control.setCustomValidity('');
      control.removeAttribute('aria-invalid');
    }));
    document.getElementById('customer-phone').addEventListener('input', (event) => {
      const input = event.currentTarget;
      const digitPosition = input.value.slice(0, input.selectionStart).replace(/\D/g, '').length;
      const atEnd = input.selectionStart === input.value.length;
      input.value = formatPhone(input.value);
      if (!atEnd) {
        let position = 0;
        let count = 0;
        while (position < input.value.length && count < digitPosition) {
          if (/\d/.test(input.value[position])) count++;
          position++;
        }
        input.setSelectionRange(position, position);
      }
    });
    document.getElementById('order-form').addEventListener('submit', submitOrder);
  }
  async function submitOrder(event) {
    event.preventDefault();
    if (submitting || !cart.length || !window.SHOP_CONFIG.googleSheetsUrl) return;
    rememberCustomer();
    customer = Object.fromEntries(Object.entries(customer).map(([field, value]) => [field, value.trim()]));
    const form = event.currentTarget;
    const status = document.getElementById('order-status');
    const errors = validateCustomer(customer);
    for (const control of form.elements) {
      if (!control.willValidate) continue;
      control.setCustomValidity(errors[control.name] || '');
      control.setAttribute('aria-invalid', String(!control.checkValidity()));
    }
    if (!form.checkValidity()) {
      status.textContent = 'Please complete all required fields and correct the highlighted details.';
      form.reportValidity();
      return;
    }
    const fingerprint = JSON.stringify({ customer, items: cart });
    if (attempt?.fingerprint !== fingerprint) {
      attempt = { fingerprint, id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}` };
      try { localStorage.setItem('lex-order-attempt', JSON.stringify(attempt)); } catch {}
    }
    const button = form.querySelector('button[type="submit"]');
    submitting = true; form.inert = true; button.textContent = 'Submitting...';
    content.querySelectorAll('[data-remove], [data-quantity], [data-product], [data-size]').forEach((control) => control.disabled = true);
    document.getElementById('close-cart').disabled = true;
    status.textContent = '';
    try {
      const response = await fetch(window.SHOP_CONFIG.googleSheetsUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ orderId: attempt.id, customer, items: cart }), signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`The order service returned HTTP ${response.status}. Check the Apps Script deployment and access settings.`);
      let result;
      try { result = await response.json(); }
      catch { throw new Error('Google did not return an order confirmation. Deploy the script as a Web app with access set to Anyone.'); }
      if (result?.ok !== true) throw new Error(result?.error || 'Google Sheets rejected this order. Update and redeploy the current Apps Script.');
      if (result.orderId !== attempt.id) throw new Error('The order confirmation did not match this order. Check the deployed Apps Script version.');
      const amount = Number.isFinite(result.total) ? result.total : total(cart);
      updateCart({ type: 'clear' }); attempt = null; customer = { firstName: '', lastName: '', email: '', phone: '' };
      try { localStorage.removeItem('lex-order-attempt'); } catch {}
      content.innerHTML = `<div class="order-success"><h3>Thanks, your order is in!</h3>
        ${result.orderNumber ? `<p class="order-reference">Order ${escapeHtml(result.orderNumber)}</p>` : ''}
        <p class="payment-instructions">Please send <strong>${money(amount)}</strong> to <strong>@Mary-Arth-2</strong> on Venmo to complete your order.</p>
        <a class="venmo-link" href="https://venmo.com/u/Mary-Arth-2" target="_blank" rel="noopener noreferrer" title="Open Mary-Arth-2 on Venmo"><img src="images/venmo.png" alt="Venmo" width="56" height="56" /><span>Pay on Venmo</span></a>
        <p class="payment-note">Include ${result.orderNumber ? escapeHtml(result.orderNumber) : 'your name'} in the payment note. Your order is awaiting payment.</p>
        <p class="payment-note">You can screenshot this confirmation to save your order number and payment details.</p>
        <button class="button" id="done-order" type="button">Continue shopping</button></div>`;
      document.getElementById('done-order').onclick = () => { dialog.close(); location.hash = '#/'; };
    } catch (error) {
      const detail = error.name === 'TimeoutError' ? 'Google Sheets took too long to respond.' : error instanceof TypeError ? 'The browser could not reach Google Sheets. Check that the deployment allows Anyone and that the URL ends in /exec.' : error.message || 'We could not confirm your order.';
      status.textContent = `${detail} Your cart is kept. Retrying the unchanged order uses the same reference to prevent duplicates.`;
      form.inert = false; button.textContent = 'Retry submission';
      content.querySelectorAll('[data-remove], [data-quantity], [data-product], [data-size]').forEach((control) => control.disabled = false);
    } finally { submitting = false; document.getElementById('close-cart').disabled = false; }
  }
  document.getElementById('open-cart').onclick = () => { if (submitting) return; rememberCustomer(); renderCart(); dialog.showModal(); };
  document.getElementById('close-cart').onclick = () => { rememberCustomer(); dialog.close(); };
  dialog.addEventListener('cancel', (event) => { if (submitting) event.preventDefault(); else rememberCustomer(); });
  window.addEventListener('hashchange', () => { renderPage(); main.focus({ preventScroll: true }); });
  updateCart({ type: 'noop' }); renderPage();
})();