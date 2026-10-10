// Deterministic parsing of copied Excel cells and labelled supplier text.
// No inferred prices, stock, taxonomy, product identity or garment measurements.
const labels = new Map(Object.entries({
  'product name': 'name', 'name': 'name', 'sku / style code': 'style', 'sku/style code': 'style', 'style code': 'style', 'sku': 'style',
  'category': 'category', 'subcategory': 'subcategory', 'sub category': 'subcategory', 'colour': 'color', 'color': 'color',
  'occasion': 'occasion', 'number of pieces': 'pieces', 'included components': 'components', 'included pieces': 'components', 'includes': 'components',
  'fabric': 'fabric', 'wash care': 'care', 'care': 'care', 'care instructions': 'care',
  'size': 'sizes', 'sizes': 'sizes', 'available sizes': 'sizes',
}));
const normalize = v => v.toLowerCase().trim().replace(/\s+/g, ' ');
const sectionPattern = /^(?:top\s*\/\s*kurta|bottom\s*\/\s*pants|dupatta\s*\/\s*chunni|kurta|bottom|pants|dupatta|top)$/i;
export function parseSheet(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Paste the product details first.');
  if (text.length > 20000) throw new Error('Paste one product at a time (up to 20,000 characters).');
  const values = {}, warnings = [], description = [], fabrics = [];
  let section = '';
  const assign = (key, value) => {
    if (!value) return;
    if (values[key] && values[key] !== value) warnings.push('Multiple '+key+' values found; review the first value.');
    else values[key] = value;
  };
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const cells = raw.split('\t').map(v => v.trim()).filter(Boolean);
    if (!cells.length) continue;
    // A care note in the image column can share a row with a different field.
    if (cells.length > 1 && /(?:wash|dry clean)/i.test(cells[0]) && !labels.has(normalize(cells[0]))) {
      assign('care', cells.shift());
    }
    const line = cells.join(' ').trim();
    if (sectionPattern.test(line)) { section = line; description.push('', line); continue; }
    let label = cells[0], value = cells.length > 1 ? cells.slice(1).join(' ') : '';
    if (!value) {
      const match = line.match(/^([^:]+?)\s*:\s*(.+)$/) || line.match(/^(size|sizes|available sizes)\s*-\s*(.+)$/i);
      if (match) { label = match[1]; value = match[2]; }
    }
    const key = labels.get(normalize(label));
    if (normalize(label) === 'fit' && value && section) {
      if (!/bottom|pants|dupatta|chunni/i.test(section) && !values.fit) values.fit = value;
      description.push(section+': Fit: '+value);
      continue;
    }
    if (!key || !value) {
      if (/(?:wash|dry clean)/i.test(line) && !line.includes(':')) assign('care', line);
      description.push(line);
      continue;
    }
    if (key === 'fabric') {
      fabrics.push({ section, value });
      if (!values.fabric) values.fabric = value;
    } else if ((key === 'color' || key === 'sizes') && section) {
      if (!values[key] && !/bottom|pants|dupatta|chunni/i.test(section)) assign(key, value);
    } else if (!section || key === 'care') assign(key, value);
    // All section detail, supplier code and extra metadata remain in the description.
    if (key !== 'name') description.push((key === 'components' ? 'Includes' : label.trim())+': '+value);
  }
  if (fabrics.some(f => f.value !== fabrics[0].value)) {
    values.fabric = fabrics.map(f => (f.section ? f.section+': ' : '')+f.value).join('; ');
  }
  const sizes = values.sizes ? [...new Set(values.sizes.split(/[,;/|\n]+/).map(v => v.trim().toUpperCase()).filter(Boolean))] : [];
  if (values.fit) description.unshift('Fit: '+values.fit);
  const shortDescription = [values.subcategory, values.pieces, values.components, values.occasion].filter(Boolean).join(' · ');
  const result = { fields: {}, category: values.category || '', color: values.color || '', sizes, style: values.style || '', warnings };
  for (const key of ['name', 'fabric', 'care']) if (values[key]) result.fields[key] = values[key];
  if (shortDescription) result.fields.shortDescription = shortDescription;
  result.fields.description = description.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!values.name) warnings.push('Product name was not found. Add it in the review.');
  if (values.style) warnings.push('Supplier style '+values.style+' is retained in the description. HIDI generates its own size-specific SKUs.');
  return result;
}
export function detailsPayload(record, fields, selected) {
  const result = {};
  for (const key of ['name', 'shortDescription', 'description', 'fabric', 'care', 'categoryId']) {
    result[key] = selected.has(key) ? (fields[key] || null) : (record?.[key] ?? null);
  }
  result.collectionIds = (record?.collections || []).map(c => c.collectionId);
  if (record) result.expectedUpdatedAt = record.updatedAt;
  return result;
}
export function pricePaise(raw) {
  const value = String(raw).trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) throw new Error('Enter a price in rupees with up to two decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const result = Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if (!Number.isSafeInteger(result) || result < 1 || result > 100000000) throw new Error('Price must be between ₹0.01 and ₹10,00,000.');
  return result;
}
