(() => {
  const products = [
    { id: 'tee', name: 'Hot Girls Read Tee', price: 30, sizePrices: { '2XL': 32 }, image: 'images/t-shirt.png', color: 'White', sizes: ['S', 'M', 'L', 'XL', '2XL'], description: 'A white cropped tee with our red "hot girls read books" print. A little book club energy for your everyday wardrobe.' },
    { id: 'hoodie', name: 'Club Logo Sweatshirt', price: 40, sizePrices: { '2XL': 46, '3XL': 46 }, image: 'images/hoodie.png', color: 'Red', sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'], description: 'One more chapter, one more cozy layer. Our red pullover hoodie with the Lex Book & Sip Club logo.' },
  ];
  const key = (item) => JSON.stringify([item.id, item.size]);
  const valid = (item) => products.some((product) => product.id === item?.id && product.sizes.includes(item.size)) && Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 20;
  function changeCart(cart, action) {
    if (action.type === 'clear') return [];
    if (action.type === 'remove') return cart.filter((item) => key(item) !== key(action));
    if (!valid(action)) return cart;
    if (action.type === 'replace') {
      const original = cart.find((item) => key(item) === key(action.previous));
      if (!original) return cart;
      const existing = cart.find((item) => item !== original && key(item) === key(action));
      if (existing && existing.quantity + action.quantity > 20) return cart;
      return changeCart(cart.filter((item) => item !== original), { ...action, type: 'add' });
    }
    if (action.type === 'quantity') return cart.map((item) => key(item) === key(action) ? { ...item, quantity: action.quantity } : item);
    if (action.type !== 'add') return cart;
    const existing = cart.find((item) => key(item) === key(action));
    return existing ? cart.map((item) => item === existing ? { ...item, quantity: Math.min(20, item.quantity + action.quantity) } : item) : [...cart, { id: action.id, size: action.size, quantity: action.quantity }];
  }
  function restoreCart(saved) {
    try {
      const items = JSON.parse(saved || '[]');
      return Array.isArray(items) ? items.filter(valid).reduce((cart, item) => changeCart(cart, { ...item, type: 'add' }), []) : [];
    } catch { return []; }
  }
  const unitPrice = (product, size) => product.sizePrices?.[size] ?? product.price;
  const total = (cart) => cart.reduce((sum, item) => sum + unitPrice(products.find((product) => product.id === item.id), item.size) * item.quantity, 0);
  function formatPhone(value) {
    let digits = String(value).replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
    if (digits.length > 10) return String(value).trim();
    if (!digits) return '';
    if (digits.length <= 3) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  function validateCustomer(customer = {}) {
    const errors = {};
    const value = (field) => typeof customer[field] === 'string' ? customer[field].trim() : '';
    for (const field of ['firstName', 'lastName']) {
      if (!value(field)) errors[field] = 'This field is required.';
      else if (value(field).length > 100) errors[field] = 'Please use 100 characters or fewer.';
    }
    if (!value('email')) errors.email = 'Email is required.';
    else if (value('email').length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value('email'))) errors.email = 'Please enter a valid email address.';
    const phone = formatPhone(value('phone'));
    const digits = phone.replace(/\D/g, '');
    if (!phone) errors.phone = 'Phone number is required.';
    else if (!/^[+\d\s().-]{7,30}$/.test(value('phone')) || digits.length !== 10) errors.phone = 'Please enter a 10-digit phone number.';
    return errors;
  }
  globalThis.LexStore = { products, changeCart, restoreCart, total, unitPrice, validateCustomer, formatPhone };
})();