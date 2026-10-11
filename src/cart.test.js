import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext, Script } from 'node:vm';
import './store.js';

const { products, changeCart, restoreCart, total, unitPrice, validateCustomer, formatPhone } = globalThis.LexStore;
const add = { type: 'add', id: 'tee', size: 'M', quantity: 1 };

test('exactly two products; matching sizes merge and different sizes stay separate', () => {
  assert.equal(products.length, 2);
  let cart = changeCart([], add);
  cart = changeCart(cart, add);
  cart = changeCart(cart, { ...add, size: 'L' });
  assert.equal(cart.length, 2);
  assert.equal(cart[0].quantity, 2);
  assert.equal(total(cart), 90);
  cart = changeCart(cart, { ...add, type: 'quantity', size: 'L', quantity: 3 });
  assert.equal(cart[0].quantity, 2);
  assert.equal(cart[1].quantity, 3);
  cart = changeCart(cart, { ...add, type: 'remove', size: 'L' });
  assert.equal(cart.length, 1);
});

test('quantities are bounded and lines can be removed', () => {
  const cart = changeCart([], { ...add, quantity: 20 });
  assert.equal(changeCart(cart, add)[0].quantity, 20);
  assert.deepEqual(changeCart(cart, { ...add, type: 'quantity', quantity: 0 }), cart);
  assert.deepEqual(changeCart(cart, { ...add, type: 'remove' }), []);
  assert.deepEqual(changeCart([], { ...add, quantity: 21 }), []);
});

test('cart survives serialization and rejects corrupted stored data', () => {
  const cart = changeCart([], add);
  assert.deepEqual(restoreCart(JSON.stringify(cart)), cart);
  assert.deepEqual(restoreCart('not json'), []);
  assert.deepEqual(restoreCart('{}'), []);
  assert.deepEqual(restoreCart('[null,{"id":"missing","quantity":2}]'), []);
  assert.deepEqual(changeCart([], { ...add, id: 'Missing' }), []);
  assert.deepEqual(changeCart([], { ...add, size: 'Missing' }), []);
});

test('both products contribute correctly to the total', () => {
  const cart = changeCart(changeCart([], add), { type: 'add', id: 'hoodie', size: '2XL', quantity: 2 });
  assert.equal(total(cart), 122);
  assert.deepEqual(changeCart(cart, { type: 'clear' }), []);
});

test('checkout product and size changes merge matching lines without losing quantities', () => {
  let cart = changeCart(changeCart([], add), { ...add, size: 'L', quantity: 2 });
  cart = changeCart(cart, { type: 'replace', previous: cart[0], id: 'tee', size: 'L', quantity: 1 });
  assert.deepEqual(cart, [{ id: 'tee', size: 'L', quantity: 3 }]);
  cart = changeCart(cart, { type: 'replace', previous: cart[0], id: 'hoodie', size: '2XL', quantity: 3 });
  assert.equal(total(cart), 138);
  assert.deepEqual(cart, [{ id: 'hoodie', size: '2XL', quantity: 3 }]);
  assert.deepEqual(changeCart(cart, { type: 'replace', previous: cart[0], id: 'tee', size: '3XL', quantity: 3 }), cart);
});

test('checkout changes do not silently discard quantities over the per-size limit', () => {
  const cart = changeCart(changeCart([], add), { ...add, size: 'L', quantity: 20 });
  assert.deepEqual(changeCart(cart, { type: 'replace', previous: cart[0], id: 'tee', size: 'L', quantity: 1 }), cart);
});

function sheetsReceiver(initialRows = [], options = {}) {
  const rows = initialRows.map((row) => [...row]);
  const summary = [];
  const styles = [];
  const properties = new Map();
  const logs = [];
  function makeSheet(name, data) {
    return {
      getLastRow: () => data.length,
      appendRow: (row) => data.push([...row]),
      setFrozenRows() {},
      hideColumns: (column) => styles.push({ name, hidden: column }),
      getRange: (start, column, count, width = 1) => {
        const range = {
          getValues: () => data.slice(start - 1, start - 1 + count).map((row) => row.slice(column - 1, column - 1 + width)),
          setValues: (values) => values.forEach((row, index) => {
            if (!data[start - 1 + index]) data[start - 1 + index] = [];
            row.forEach((value, offset) => data[start - 1 + index][column - 1 + offset] = value);
          }),
        };
        for (const method of ['setFontWeight', 'setBackground', 'setFontColor', 'setBorder', 'setNumberFormat', 'setWrap']) range[method] = (...args) => { styles.push({ name, method, start, count, args }); return range; };
        return range;
      },
    };
  }
  const sheets = { Orders: makeSheet('Orders', rows), 'Order Summary': makeSheet('Order Summary', summary) };
  const context = {
    console: { error: (message) => logs.push(message) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (text) => ({ setMimeType: () => JSON.parse(text) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, hasLock: () => true, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => properties.get(key), setProperty: (key, value) => properties.set(key, value) }) },
    SpreadsheetApp: { openById: () => { if (options.failOpen) throw new Error('Permission denied for private spreadsheet'); return { getSheetByName: (name) => sheets[name] }; }, flush() {}, BorderStyle: { SOLID_MEDIUM: 'medium' } },
  };
  runInNewContext(readFileSync(new URL('../google-sheets/Code.gs', import.meta.url), 'utf8'), context);
  return { rows, summary, styles, logs, organize: () => context.organizeOrders(), submit: (order) => context.doPost({ postData: { contents: JSON.stringify(order) } }) };
}

const order = {
  orderId: 'checkout-test-reference-1234',
  customer: { firstName: 'Alex', lastName: 'Reader', email: 'alex@example.com', phone: '+1 (555) 123-4567' },
  items: [{ id: 'tee', size: 'M', quantity: 2 }, { id: 'tee', size: 'L', quantity: 1 }, { id: 'hoodie', size: 'XL', quantity: 1 }],
};

test('Sheets records customer contact fields and a row for each product and size', () => {
  const receiver = sheetsReceiver();
  assert.equal(receiver.submit(order).ok, true);
  assert.equal(receiver.rows.length, 4);
  assert.deepEqual(Array.from(receiver.rows[1].slice(2, 9)), ['Alex', 'Reader', 'alex@example.com', '(555) 123-4567', 't-shirt', 'M', 2]);
  assert.equal(receiver.rows[2][7], 'L');
  assert.equal(receiver.rows[3][6], 'hoodie');
  assert.equal(receiver.rows[1][11], 130);
  assert.equal(receiver.submit(order).ok, true);
  assert.equal(receiver.rows.length, 4);
});

test('Sheets rejects missing names, invalid contact information, and invalid sizes', () => {
  for (const changes of [{ firstName: '' }, { lastName: ' ' }, { phone: '' }, { phone: 'abcdefg' }, { email: 'bad' }]) {
    const receiver = sheetsReceiver();
    assert.equal(receiver.submit({ ...order, customer: { ...order.customer, ...changes } }).ok, false);
    assert.equal(receiver.rows.length, 0);
  }
  assert.equal(sheetsReceiver().submit({ ...order, items: [{ id: 'tee', size: 'invalid', quantity: 1 }] }).ok, false);
});

test('Sheets refuses to write new contact fields under outdated column headers', () => {
  const receiver = sheetsReceiver([['Order ID', 'Submitted at', 'Name', 'Email']]);
  const result = receiver.submit(order);
  assert.equal(result.ok, false);
  assert.ok(result.error.includes('Orders column 2 must be "Order Date"'));
  assert.equal(receiver.rows.length, 1);
});

test('service failures identify the operation without exposing private Google errors', () => {
  const receiver = sheetsReceiver([], { failOpen: true });
  const result = receiver.submit(order);
  assert.equal(result.ok, false);
  assert.ok(result.error.includes('opening the spreadsheet'));
  assert.equal(result.error.includes('private spreadsheet'), false);
  assert.ok(receiver.logs[0].includes('Permission denied'));
  assert.equal(receiver.rows.length, 0);
});

test('checkout script parses and exposes all requested fields', () => {
  const source = readFileSync(new URL('./main.js', import.meta.url), 'utf8');
  new Script(source);
  for (const field of ['firstName', 'lastName', 'email', 'phone']) assert.ok(source.includes(`name="${field}"`));
  for (const field of ['data-product', 'data-size', 'data-quantity']) assert.ok(source.includes(field));
  assert.equal((source.match(/form="order-form" required/g) || []).length, 3);
  assert.ok(source.indexOf('if (!form.checkValidity())') < source.indexOf('await fetch('));
  assert.ok(source.includes('unitPrice(product, item.size) * item.quantity'));
  assert.ok(source.includes('unitPrice(product, event.target.value)'));
});

test('each available size has the requested price', () => {
  const [tee, hoodie] = products;
  assert.deepEqual(tee.sizes, ['S', 'M', 'L', 'XL', '2XL']);
  assert.deepEqual(hoodie.sizes, ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL']);
  for (const size of tee.sizes) assert.equal(unitPrice(tee, size), size === '2XL' ? 32 : 30);
  for (const size of hoodie.sizes) assert.equal(unitPrice(hoodie, size), ['2XL', '3XL'].includes(size) ? 46 : 40);
  assert.deepEqual(restoreCart('[{"id":"tee","size":"XS","quantity":1}]'), []);
});

test('Sheets uses size prices for every combination and ignores client prices', () => {
  const receiver = sheetsReceiver();
  const items = products.flatMap((product) => product.sizes.map((size) => ({ id: product.id, size, quantity: 1, price: 1 })));
  assert.equal(receiver.submit({ ...order, items }).ok, true);
  assert.equal(receiver.rows.length, items.length + 1);
  for (const [index, item] of items.entries()) {
    const price = unitPrice(products.find((product) => product.id === item.id), item.size);
    assert.equal(receiver.rows[index + 1][9], price);
    assert.equal(receiver.rows[index + 1][10], price);
    assert.equal(receiver.rows[index + 1][11], index === 0 ? 444 : '');
  }
  assert.equal(total(items), 444);
});

test('checkout reports every missing contact field and rejects whitespace-only values', () => {
  assert.deepEqual(Object.keys(validateCustomer({})), ['firstName', 'lastName', 'email', 'phone']);
  assert.deepEqual(Object.keys(validateCustomer({ firstName: ' ', lastName: '\t', email: ' ', phone: ' ' })), ['firstName', 'lastName', 'email', 'phone']);
});

test('checkout requires valid email and a 10-digit phone number', () => {
  assert.deepEqual(validateCustomer(order.customer), {});
  const errors = validateCustomer({ ...order.customer, email: 'reader@', phone: '123' });
  assert.ok(errors.email);
  assert.ok(errors.phone);
  assert.equal(errors.firstName, undefined);
  assert.ok(validateCustomer({ ...order.customer, phone: '5551234' }).phone);
});

test('phone numbers format automatically, including pasted US country codes', () => {
  assert.equal(formatPhone('5551234567'), '(555) 123-4567');
  assert.equal(formatPhone('+1 (555) 123-4567'), '(555) 123-4567');
  assert.equal(formatPhone(''), '');
  assert.equal(formatPhone('5551'), '(555) 1');
  assert.equal(formatPhone('555123'), '(555) 123');
  assert.equal(formatPhone('555123456789'), '555123456789');
});

test('orders get simple sequential numbers and one summary per purchase', () => {
  const receiver = sheetsReceiver();
  const first = receiver.submit(order);
  assert.equal(first.orderNumber, 'ORD-0001');
  assert.equal(first.orderId, order.orderId);
  assert.equal(receiver.rows[1][0], 'ORD-0001');
  assert.equal(receiver.rows[2][0], 'ORD-0001');
  assert.equal(receiver.rows[2][11], '');
  assert.equal(receiver.rows[1][12], order.orderId);
  assert.equal(receiver.rows[0][1], 'Order Date');
  assert.equal(receiver.rows[0].includes('Notes'), false);
  assert.equal(receiver.summary.length, 2);
  assert.equal(receiver.summary[1][6], 't-shirt (M) x 2\nt-shirt (L) x 1\nhoodie (XL) x 1');
  assert.equal(receiver.summary[1][7], 130);
  assert.equal(receiver.submit(order).orderNumber, 'ORD-0001');
  assert.equal(receiver.summary.length, 2);
  const second = receiver.submit({ ...order, orderId: 'second-order-reference-1234', items: [{ id: 'hoodie', size: 'M', quantity: 1 }] });
  assert.equal(second.orderNumber, 'ORD-0002');
  assert.equal(receiver.summary.length, 3);
  assert.equal(receiver.summary[2][7], 40);
  assert.ok(receiver.styles.some((style) => style.name === 'Orders' && style.hidden === 13));
  const colors = receiver.styles.filter((style) => style.name === 'Orders' && style.method === 'setBackground' && style.start > 1);
  assert.equal(colors[0].args[0], '#fff8f1');
  assert.equal(colors.at(-1).args[0], '#ffedf6');
});

test('existing orders migrate safely, correct old hoodie prices, and preserve retry matching', () => {
  const legacyHeaders = ['Order ID', 'Submitted at', 'First name', 'Last name', 'Email', 'Phone number', 'Product', 'Size', 'Quantity', 'Unit price', 'Line total', 'Order total', 'Notes'];
  const date = new Date('2026-10-11T12:00:00Z');
  const receiver = sheetsReceiver([
    legacyHeaders,
    ['old-order-reference-0001', date, 'Alex', 'Reader', 'alex@example.com', '5551234567', 'Club Logo Sweatshirt', 'M', 1, 64, 64, 120, 'old note'],
    ['old-order-reference-0001', date, 'Alex', 'Reader', 'alex@example.com', '5551234567', 'Hot Girls Read Tee', 'S', 2, 28, 56, 120, 'old note'],
    ['old-order-reference-0002', date, 'Sam', 'Reader', 'sam@example.com', '5551234567', 'Club Logo Sweatshirt', '3XL', 1, 64, 64, 64, ''],
  ]);
  receiver.organize();
  assert.equal(receiver.rows.length, 4);
  assert.equal(receiver.rows[1][0], 'ORD-0001');
  assert.equal(receiver.rows[2][0], 'ORD-0001');
  assert.equal(receiver.rows[3][0], 'ORD-0002');
  assert.equal(receiver.rows[1][9], 40);
  assert.equal(receiver.rows[2][9], 30);
  assert.equal(receiver.rows[3][9], 46);
  assert.equal(receiver.rows[1][11], 100);
  assert.equal(receiver.rows[2][11], '');
  assert.equal(receiver.rows[1][12], 'old-order-reference-0001');
  assert.equal(receiver.rows[1][5], '(555) 123-4567');
  assert.equal(receiver.summary.length, 3);
  assert.equal(receiver.summary[1][7], 100);
  receiver.organize();
  assert.equal(receiver.summary.length, 3);
  assert.equal(receiver.submit({ ...order, orderId: 'old-order-reference-0001' }).orderNumber, 'ORD-0001');
  assert.equal(receiver.rows.length, 4);
  assert.equal(receiver.submit(order).orderNumber, 'ORD-0003');
});

test('checkout has no notes field and displays the public order number', () => {
  const source = readFileSync(new URL('./main.js', import.meta.url), 'utf8');
  assert.equal(source.includes('name="notes"'), false);
  assert.equal(source.includes('customer.notes'), false);
  assert.ok(source.includes('formatPhone(input.value)'));
  assert.ok(source.includes('escapeHtml(result.orderNumber)'));
});

test('order confirmation returns the saved total and Venmo link without email sending', () => {
  const receiver = sheetsReceiver();
  const result = receiver.submit(order);
  assert.equal(result.total, 130);
  assert.equal(result.venmoUrl, 'https://venmo.com/u/Mary-Arth-2');
  assert.equal(result.confirmationEmailSent, undefined);
  const script = readFileSync(new URL('../google-sheets/Code.gs', import.meta.url), 'utf8');
  assert.equal(script.includes('MailApp'), false);
  const source = readFileSync(new URL('./main.js', import.meta.url), 'utf8');
  assert.equal(source.includes('confirmationEmailSent'), false);
  assert.equal(source.includes('confirmation email'), false);
});

test('payment confirmation uses the saved server total, a local Venmo logo, and pending-payment copy', () => {
  const source = readFileSync(new URL('./main.js', import.meta.url), 'utf8');
  new Script(source);
  assert.ok(source.includes('Number.isFinite(result.total) ? result.total : total(cart)'));
  assert.ok(source.includes('href="https://venmo.com/u/Mary-Arth-2"'));
  assert.ok(source.includes('src="images/venmo.png"'));
  assert.ok(source.includes('Your order is awaiting payment.'));
  assert.ok(source.includes('Please send <strong>${money(amount)}</strong>'));
  const image = readFileSync(new URL('../images/venmo.png', import.meta.url));
  assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
});

test('retry confirmations use the saved order total without creating another order', () => {
  const receiver = sheetsReceiver();
  assert.equal(receiver.submit(order).ok, true);
  const retry = receiver.submit({ ...order, customer: { ...order.customer, email: 'other@example.com' }, items: [{ id: 'tee', size: 'S', quantity: 1 }] });
  assert.equal(retry.total, 130);
  assert.equal(receiver.rows.length, 4);
  assert.equal(receiver.summary.length, 2);
});