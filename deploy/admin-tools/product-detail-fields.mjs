// Optional catalogue facts shared by the editor and storefront. Suggestions
// are choices, never product defaults or claims inferred from photography.
const field = (key, label, group, choices = [], placeholder = '', stored = label) => ({ key, label, stored, group, choices, placeholder });
export const DETAIL_FIELDS = [
  field('includes', 'Included pieces / set contents', 'Set & fabrics', ['Kurta only', 'Kurta + pants', 'Kurta + pants + dupatta', 'Top + bottom', 'Dress only'], 'List the pieces supplied', 'Includes'),
  field('pieceCount', 'Number of pieces', 'Set & fabrics', ['1', '2', '3', '4']),
  field('topType', 'Top type', 'Set & fabrics', ['Kurta', 'Kurti', 'Tunic', 'Top', 'Dress', 'Kaftan', 'Blouse']),
  field('topFabric', 'Top fabric', 'Set & fabrics', ['Cotton', 'Cotton blend', 'Rayon', 'Viscose', 'Silk', 'Silk blend', 'Chanderi', 'Muslin', 'Georgette', 'Chiffon', 'Organza', 'Linen', 'Crepe', 'Velvet', 'Chinon']),
  field('bottomFabric', 'Bottom fabric', 'Set & fabrics', ['Cotton', 'Cotton blend', 'Rayon', 'Viscose', 'Silk blend', 'Shantoon', 'Linen', 'Crepe']),
  field('dupattaFabric', 'Dupatta fabric', 'Set & fabrics', ['Cotton', 'Chiffon', 'Georgette', 'Organza', 'Chanderi', 'Silk blend', 'Net', 'Muslin']),
  field('fit', 'Fit', 'Shape & fit', ['Regular', 'Relaxed', 'Straight', 'Slim', 'Loose', 'Oversized'], 'Describe the verified fit', 'Fit'),
  field('shape', 'Shape / silhouette', 'Shape & fit', ['Straight', 'A-line', 'Anarkali', 'Flared', 'Empire', 'Angrakha', 'Asymmetric', 'Peplum']),
  field('neckline', 'Neckline', 'Shape & fit', ['Round neck', 'V-neck', 'Mandarin collar', 'Shirt collar', 'Boat neck', 'Square neck', 'Sweetheart neck', 'Keyhole neck', 'Notched neck', 'Scoop neck', 'Halter neck']),
  field('sleeveLength', 'Sleeve length', 'Shape & fit', ['Sleeveless', 'Cap sleeves', 'Short sleeves', 'Elbow length', 'Three-quarter sleeves', 'Long sleeves']),
  field('sleeveStyle', 'Sleeve style', 'Shape & fit', ['Regular', 'Roll-up', 'Puff', 'Bell', 'Flared', 'Bishop', 'Flutter', 'Raglan', 'Kimono']),
  field('topLength', 'Top length', 'Shape & fit', ['Cropped', 'Hip length', 'Thigh length', 'Knee length', 'Calf length', 'Ankle length', 'Floor length']),
  field('pattern', 'Pattern', 'Design & construction', ['Solid', 'Printed', 'Embroidered', 'Woven design', 'Self-design', 'Colourblocked', 'Striped', 'Checked', 'Ombre']),
  field('motif', 'Print / motif', 'Design & construction', ['Floral', 'Ethnic motifs', 'Geometric', 'Paisley', 'Abstract', 'Polka dots', 'Animal', 'Botanical', 'Bandhani', 'Ikat']),
  field('technique', 'Print / craft technique', 'Design & construction', ['Block print', 'Screen print', 'Digital print', 'Tie-dye', 'Bandhani', 'Ajrakh', 'Kalamkari', 'Chikankari', 'Jacquard']),
  field('ornamentation', 'Embellishment / ornamentation', 'Design & construction', ['None', 'Thread embroidery', 'Zari', 'Gota patti', 'Mirror work', 'Sequins', 'Beads', 'Lace', 'Tassels', 'Applique']),
  field('occasion', 'Occasion', 'Design & construction', ['Everyday', 'Work', 'Casual', 'Festive', 'Wedding', 'Party', 'Evening', 'Travel']),
  field('closure', 'Top closure', 'Design & construction', ['Pull-on', 'Buttons', 'Zip', 'Hook and eye', 'Tie-up', 'Drawstring']),
  field('frontDetail', 'Front detail', 'Design & construction', [], 'Verified placket, panels or front detailing'),
  field('sideDetail', 'Side detail', 'Design & construction', [], 'Verified side construction or detailing'),
  field('hemline', 'Hemline', 'Design & construction', ['Straight', 'Curved', 'Flared', 'Asymmetric', 'High-low', 'Scalloped']),
  field('slits', 'Slit details', 'Design & construction', ['No slits', 'Side slits', 'Front slit', 'Multiple slits']),
  field('pockets', 'Pockets', 'Design & construction', ['No pockets', '1 pocket', '2 pockets', 'Side pockets', 'Patch pockets']),
  field('lining', 'Lining', 'Design & construction', ['Unlined', 'Fully lined', 'Partially lined', 'Cotton lining', 'Shantoon lining'], 'Describe the actual lining', 'Lining'),
  field('transparency', 'Transparency', 'Design & construction', ['Opaque', 'Semi-sheer', 'Sheer']),
  field('stretch', 'Stretch', 'Design & construction', ['Non-stretch', 'Slight stretch', 'Stretch']),
  field('weave', 'Weave / construction', 'Design & construction', ['Woven', 'Knitted', 'Handloom', 'Jacquard', 'Dobby']),
  field('bottomType', 'Bottom type', 'Bottom details', ['Trousers', 'Straight pants', 'Palazzo', 'Churidar', 'Salwar', 'Sharara', 'Gharara', 'Leggings', 'Skirt']),
  field('bottomPattern', 'Bottom pattern', 'Bottom details', ['Solid', 'Printed', 'Embroidered', 'Striped', 'Woven design']),
  field('bottomLength', 'Bottom length', 'Bottom details', ['Full length', 'Ankle length', 'Cropped', 'Calf length']),
  field('waistband', 'Waistband', 'Bottom details', ['Elasticated', 'Partially elasticated', 'Fixed waistband', 'Drawstring']),
  field('bottomClosure', 'Bottom closure', 'Bottom details', ['Pull-on', 'Drawstring', 'Zip and button', 'Hook and zip', 'Side zip']),
  field('dupattaIncluded', 'Dupatta included', 'Dupatta details', ['Yes', 'No']),
  field('dupattaPattern', 'Dupatta pattern', 'Dupatta details', ['Solid', 'Printed', 'Embroidered', 'Woven design', 'Ombre']),
  field('dupattaBorder', 'Dupatta border', 'Dupatta details', ['No border', 'Printed', 'Embroidered', 'Lace', 'Zari', 'Gota patti', 'Tassels']),
  field('dupattaDimensions', 'Dupatta dimensions', 'Dupatta details', [], 'Verified length × width, with units'),
  field('countryOfOrigin', 'Country of origin', 'Origin & model', [], 'Only the origin stated on the product label'),
  field('model', 'Model information', 'Origin & model', [], 'Model height and size worn, if known', 'Model'),
];
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const labels = new Map(DETAIL_FIELDS.map(fact => [fact.stored.toLowerCase(), fact.key]));
const labelled = new RegExp('^\\s*(' + DETAIL_FIELDS.map(fact => escape(fact.stored)).join('|') + ')\\s*:\\s*(.*)$', 'i');
export function detailLine(line) {
  const match = String(line).match(labelled);
  return match ? { key: labels.get(match[1].toLowerCase()), value: match[2].trim() } : null;
}
export function stripDetailLines(value) {
  return String(value ?? '').split(/\r?\n/).filter(line => !detailLine(line)).join('\n').trim();
}
export function readDetailValues(product) {
  const result = Object.fromEntries(DETAIL_FIELDS.map(fact => [fact.key, '']));
  const seen = new Set();
  for (const line of [product.description, product.shortDescription].filter(Boolean).join('\n').split(/\r?\n/)) {
    const fact = detailLine(line);
    if (fact && !seen.has(fact.key)) { result[fact.key] = fact.value; seen.add(fact.key); }
  }
  return result;
}
