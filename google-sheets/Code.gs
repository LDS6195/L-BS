const SPREADSHEET_ID = '15YX0u84Z0YzZTfmONJ8NqET17UVZd9-FliBZrp_5Ov0';
const CATALOG = {
  tee: { name: 't-shirt', price: 30, sizePrices: { '2XL': 32 }, sizes: ['S', 'M', 'L', 'XL', '2XL'] },
  hoodie: { name: 'hoodie', price: 40, sizePrices: { '2XL': 46, '3XL': 46 }, sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'] },
};
const ORDER_HEADERS = ['Order ID', 'Order Date', 'First name', 'Last name', 'Email', 'Phone number', 'Product', 'Size', 'Quantity', 'Unit price', 'Line total', 'Order total', 'Request ID'];
const SUMMARY_HEADERS = ['Order ID', 'Order Date', 'First name', 'Last name', 'Email', 'Phone number', 'Items', 'Order total'];
const VENMO_URL = 'https://venmo.com/u/Mary-Arth-2';

function doPost(event) {
  let lock;
  let stage = 'validating order details';
  try {
    if (!event?.postData?.contents || event.postData.contents.length > 10000) throw new Error('Invalid request');
    const order = JSON.parse(event.postData.contents);
    if (typeof order.orderId !== 'string' || !/^[a-z0-9-]{16,80}$/i.test(order.orderId)) throw new Error('Invalid order reference');
    const customer = order.customer;
    if (typeof customer?.firstName !== 'string' || !customer.firstName.trim() || customer.firstName.length > 100) throw new Error('Invalid first name');
    if (typeof customer.lastName !== 'string' || !customer.lastName.trim() || customer.lastName.length > 100) throw new Error('Invalid last name');
    if (typeof customer.email !== 'string' || customer.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) throw new Error('Invalid email');
    if (typeof customer.phone !== 'string' || !/^[+\d\s().-]{7,30}$/.test(customer.phone)) throw new Error('Invalid phone number');
    const phone = phoneNumber(customer.phone);
    if (!/^\(\d{3}\) \d{3}-\d{4}$/.test(phone)) throw new Error('Invalid phone number');
    const maxLines = Object.values(CATALOG).reduce((count, product) => count + product.sizes.length, 0);
    if (!Array.isArray(order.items) || !order.items.length || order.items.length > maxLines) throw new Error('Invalid items');
    const lines = order.items.map((item) => {
      const product = Object.prototype.hasOwnProperty.call(CATALOG, item?.id) ? CATALOG[item.id] : null;
      if (!product || !product.sizes.includes(item.size) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) throw new Error('Invalid product');
      return { product, size: item.size, quantity: item.quantity, unitPrice: product.sizePrices?.[item.size] ?? product.price };
    });
    stage = 'waiting for the order lock';
    lock = LockService.getScriptLock();
    lock.waitLock(10000);
    stage = 'opening the spreadsheet';
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    stage = 'checking the Orders tab';
    const sheet = spreadsheet.getSheetByName('Orders') || spreadsheet.insertSheet('Orders');
    const existingRows = prepareOrders(sheet);
    const previous = existingRows.find((row) => row[12] === order.orderId);
    if (previous) {
      stage = 'updating the Order Summary tab';
      updateSummary(spreadsheet, existingRows);
      SpreadsheetApp.flush();
      stage = 'preparing the confirmation';
      return reply(orderConfirmation(existingRows.filter((row) => row[12] === order.orderId), order.orderId));
    }
    stage = 'assigning the order number';
    const orderNumber = nextOrderNumber(existingRows);
    const total = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
    const submittedAt = new Date();
    const rows = lines.map((line, index) => [orderNumber, submittedAt, safeCell(customer.firstName), safeCell(customer.lastName), safeCell(customer.email), phone, line.product.name, line.size, line.quantity, line.unitPrice, line.unitPrice * line.quantity, index === 0 ? total : '', order.orderId]);
    const start = sheet.getLastRow() + 1;
    stage = 'saving order rows';
    sheet.getRange(start, 1, rows.length, ORDER_HEADERS.length).setValues(rows);
    stage = 'formatting order rows';
    styleOrder(sheet, start, rows.length, orderNumber);
    stage = 'updating the Order Summary tab';
    updateSummary(spreadsheet, [...existingRows, ...rows]);
    stage = 'committing spreadsheet changes';
    SpreadsheetApp.flush();
    stage = 'preparing the confirmation';
    return reply(orderConfirmation(rows, order.orderId));
  } catch (error) {
    const message = String(error.message || error);
    console.error('Order submission failed while ' + stage + ': ' + message);
    const safeMessage = /^(Orders|Order Summary) column \d+ must be "/.test(message) || /^Invalid (request|order reference|first name|last name|email|phone number|items|product)$/.test(message);
    return reply({ ok: false, error: safeMessage ? message : 'The order service failed while ' + stage + '. Check the latest Apps Script execution log for the exact error.' });
  } finally { if (lock?.hasLock()) lock.releaseLock(); }
}

function orderConfirmation(rows, requestId) {
  const first = rows[0];
  const orderNumber = first[0];
  const total = rows.reduce((sum, row) => sum + Number(row[10]), 0);
  return { ok: true, orderId: requestId, orderNumber, total, venmoUrl: VENMO_URL };
}

function nextOrderNumber(rows) {
  const properties = PropertiesService.getScriptProperties();
  const key = 'ORDER_SEQUENCE_' + SPREADSHEET_ID;
  const highest = rows.reduce((max, row) => Math.max(max, /^ORD-\d+$/.test(row[0]) ? Number(row[0].slice(4)) : 0), 0);
  const number = Math.max(Number(properties.getProperty(key)) || 0, highest) + 1;
  properties.setProperty(key, String(number));
  return 'ORD-' + String(number).padStart(4, '0');
}

function organizeOrders() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName('Orders') || spreadsheet.insertSheet('Orders');
    updateSummary(spreadsheet, prepareOrders(sheet));
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
}

function prepareOrders(sheet) {
  if (!sheet.getLastRow()) sheet.appendRow(ORDER_HEADERS);
  const headers = sheet.getRange(1, 1, 1, ORDER_HEADERS.length).getValues()[0];
  const legacy = headers[12] === 'Notes' && ['Submitted at', 'Order Date'].includes(headers[1]);
  const mismatch = ORDER_HEADERS.findIndex((header, index) => headers[index] !== header && !(legacy && [1, 12].includes(index)));
  if (mismatch !== -1) throw new Error('Orders column ' + (mismatch + 1) + ' must be "' + ORDER_HEADERS[mismatch] + '". Check the header row without deleting existing orders.');
  const rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, ORDER_HEADERS.length).getValues() : [];
  if (legacy) {
    const numbers = new Map();
    for (const row of rows) {
      const requestId = row[0];
      if (!numbers.has(requestId)) numbers.set(requestId, nextOrderNumber(rows));
      row[0] = numbers.get(requestId);
      row[12] = requestId;
      row[5] = phoneNumber(String(row[5]));
      const label = String(row[6]).toLowerCase();
      const product = label.includes('tee') || label === 't-shirt' ? CATALOG.tee : label.includes('hoodie') || label.includes('sweatshirt') ? CATALOG.hoodie : null;
      if (product) {
        row[6] = product.name;
        if (product.sizes.includes(row[7])) row[9] = product.sizePrices?.[row[7]] ?? product.price;
      }
      row[10] = Number(row[8]) * Number(row[9]);
    }
    const totals = new Map();
    for (const row of rows) totals.set(row[0], (totals.get(row[0]) || 0) + Number(row[10]));
    const seen = new Set();
    for (const row of rows) {
      row[11] = seen.has(row[0]) ? '' : totals.get(row[0]);
      seen.add(row[0]);
    }
    if (rows.length) sheet.getRange(2, 1, rows.length, ORDER_HEADERS.length).setValues(rows);
    sheet.getRange(1, 1, 1, ORDER_HEADERS.length).setValues([ORDER_HEADERS]);
    for (let index = 0; index < rows.length;) {
      let end = index + 1;
      while (end < rows.length && rows[end][0] === rows[index][0]) end++;
      styleOrder(sheet, index + 2, end - index, rows[index][0]);
      index = end;
    }
  }
  sheet.setFrozenRows(1);
  sheet.hideColumns(13);
  sheet.getRange(1, 1, 1, 12).setFontWeight('bold').setBackground('#0b3954').setFontColor('#fff8f1');
  return rows;
}

function styleOrder(sheet, start, count, number) {
  const color = Number(number.slice(4)) % 2 ? '#fff8f1' : '#ffedf6';
  sheet.getRange(start, 1, count, 12).setBackground(color);
  sheet.getRange(start, 1, 1, 12).setBorder(true, null, null, null, null, null, '#0b3954', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sheet.getRange(start, 2, count, 1).setNumberFormat('mm/dd/yyyy hh:mm');
  sheet.getRange(start, 10, count, 3).setNumberFormat('$0.00');
}

function updateSummary(spreadsheet, rows) {
  const sheet = spreadsheet.getSheetByName('Order Summary') || spreadsheet.insertSheet('Order Summary');
  if (!sheet.getLastRow()) sheet.appendRow(SUMMARY_HEADERS);
  const headers = sheet.getRange(1, 1, 1, SUMMARY_HEADERS.length).getValues()[0];
  const mismatch = SUMMARY_HEADERS.findIndex((header, index) => headers[index] !== header);
  if (mismatch !== -1) throw new Error('Order Summary column ' + (mismatch + 1) + ' must be "' + SUMMARY_HEADERS[mismatch] + '". Check the header row without deleting existing orders.');
  const saved = new Set(sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().map((row) => row[0]) : []);
  const orders = new Map();
  for (const row of rows) {
    if (!orders.has(row[0])) orders.set(row[0], { first: row, items: [], total: 0 });
    const entry = orders.get(row[0]);
    entry.items.push(row[6] + ' (' + row[7] + ') x ' + row[8]);
    entry.total += Number(row[10]);
  }
  for (const [number, entry] of orders) {
    if (saved.has(number)) continue;
    const row = entry.first;
    sheet.appendRow([number, row[1], row[2], row[3], row[4], row[5], entry.items.join('\n'), entry.total]);
  }
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#0b3954').setFontColor('#fff8f1');
  if (sheet.getLastRow() > 1) {
    const count = sheet.getLastRow() - 1;
    sheet.getRange(2, 2, count, 1).setNumberFormat('mm/dd/yyyy hh:mm');
    sheet.getRange(2, 7, count, 1).setWrap(true);
    sheet.getRange(2, 8, count, 1).setNumberFormat('$0.00');
  }
}

function phoneNumber(value) {
  let digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  return digits.length === 10 ? '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6) : value;
}

function safeCell(value) {
  const text = value.trim();
  return /^[=+@-]/.test(text) ? "'" + text : text;
}

function reply(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}