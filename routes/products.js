// routes/products.js
const express    = require('express');
const router     = express.Router();
const { run, get, all } = require('../db');

function formatProduct(row, lang = 'th') {
  return {
    id:          row.id,
    barcode:     row.barcode,
    name:        row[`name_${lang}`]     || row.name_th,
    name_th:     row.name_th,
    name_en:     row.name_en,
    name_km:     row.name_km,
    category:    row[`category_${lang}`] || row.category_th,
    category_th: row.category_th,
    category_en: row.category_en,
    category_km: row.category_km,
    price:       row.price,
    stock:       row.stock,
    image_url:   row.image_url,
    created_at:  row.created_at,
    updated_at:  row.updated_at,
  };
}

// GET /api/products
router.get('/', async (req, res) => {
  const { lang = 'th', category, q } = req.query;
  let sql = 'SELECT * FROM products WHERE 1=1';
  const params = [];
  if (category) {
    sql += ' AND (category_th=? OR category_en=? OR category_km=?)';
    params.push(category, category, category);
  }
  if (q) {
    sql += ' AND (name_th LIKE ? OR name_en LIKE ? OR name_km LIKE ? OR barcode LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  sql += ' ORDER BY category_th, name_th';
  try {
    const rows = await all(sql, params);
    res.json(rows.map(r => formatProduct(r, lang)));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/products/barcode/:barcode
router.get('/barcode/:barcode', async (req, res) => {
  const { lang = 'th' } = req.query;
  try {
    const row = await get('SELECT * FROM products WHERE barcode=?', [req.params.barcode]);
    if (!row) return res.status(404).json({ error: 'Product not found' });
    res.json(formatProduct(row, lang));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/products/:id
router.get('/:id', async (req, res) => {
  const { lang = 'th' } = req.query;
  try {
    const row = await get('SELECT * FROM products WHERE id=?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Product not found' });
    res.json(formatProduct(row, lang));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/products
router.post('/', async (req, res) => {
  const { barcode, name_th, name_en='', name_km='',
          category_th='', category_en='', category_km='',
          price, stock=0, image_url='' } = req.body;
  if (!barcode || !name_th || price === undefined)
    return res.status(400).json({ error: 'barcode, name_th and price are required' });
  try {
    const result = await run(
      `INSERT INTO products (barcode,name_th,name_en,name_km,category_th,category_en,category_km,price,stock,image_url)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [barcode,name_th,name_en,name_km,category_th,category_en,category_km,price,stock,image_url]
    );
    const row = await get('SELECT * FROM products WHERE id=?', [result.lastID]);
    res.status(201).json(formatProduct(row));
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Barcode already exists' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/products/:id
router.put('/:id', async (req, res) => {
  const fields = ['barcode','name_th','name_en','name_km','category_th','category_en','category_km','price','stock','image_url'];
  const updates = [], values = [];
  fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f}=?`); values.push(req.body[f]); } });
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
  values.push(req.params.id);
  try {
    const r = await run(`UPDATE products SET ${updates.join(',')} WHERE id=?`, values);
    if (!r.changes) return res.status(404).json({ error: 'Product not found' });
    const row = await get('SELECT * FROM products WHERE id=?', [req.params.id]);
    res.json(formatProduct(row));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/products/:id/stock
router.patch('/:id/stock', async (req, res) => {
  const { adjustment } = req.body;
  if (adjustment === undefined) return res.status(400).json({ error: 'adjustment is required' });
  try {
    const r = await run('UPDATE products SET stock=MAX(0,stock+?) WHERE id=?', [adjustment, req.params.id]);
    if (!r.changes) return res.status(404).json({ error: 'Product not found' });
    const row = await get('SELECT * FROM products WHERE id=?', [req.params.id]);
    res.json(formatProduct(row));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/products/:id
router.delete('/:id', async (req, res) => {
  try {
    const r = await run('DELETE FROM products WHERE id=?', [req.params.id]);
    if (!r.changes) return res.status(404).json({ error: 'Product not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
