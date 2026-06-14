// routes/sales.js
const express = require('express');
const router  = express.Router();
const { run, get, all } = require('../db');

async function attachItems(sale) {
  sale.items = await all('SELECT * FROM sale_items WHERE sale_id=?', [sale.id]);
  return sale;
}

// GET /api/sales
router.get('/', async (req, res) => {
  const { date, from, to, limit = 100 } = req.query;
  let sql = 'SELECT * FROM sales WHERE 1=1';
  const params = [];
  if (date) { sql += ' AND DATE(created_at)=?'; params.push(date); }
  else {
    if (from) { sql += ' AND DATE(created_at)>=?'; params.push(from); }
    if (to)   { sql += ' AND DATE(created_at)<=?'; params.push(to); }
  }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(Number(limit));
  try {
    const sales = await all(sql, params);
    res.json(await Promise.all(sales.map(attachItems)));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/sales/summary
router.get('/summary', async (req, res) => {
  const { from, to } = req.query;
  let f = '1=1'; const p = [];
  if (from) { f += ' AND DATE(s.created_at)>=?'; p.push(from); }
  if (to)   { f += ' AND DATE(s.created_at)<=?'; p.push(to); }
  try {
    const overview    = await get(`SELECT COUNT(*) AS total_bills, ROUND(SUM(total_amount),2) AS grand_total, ROUND(SUM(discount),2) AS total_discount, ROUND(AVG(total_amount),2) AS avg_bill FROM sales s WHERE ${f}`, p);
    const byCategory  = await all(`SELECT si.category, COUNT(DISTINCT s.id) AS bills, SUM(si.quantity) AS units_sold, ROUND(SUM(si.line_total),2) AS revenue FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE ${f} GROUP BY si.category ORDER BY revenue DESC`, p);
    const byDay       = await all(`SELECT DATE(s.created_at) AS day, COUNT(*) AS bills, ROUND(SUM(total_amount),2) AS revenue FROM sales s WHERE ${f} GROUP BY day ORDER BY day DESC`, p);
    res.json({ overview, byCategory, byDay });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/sales/:id
router.get('/:id', async (req, res) => {
  try {
    const sale = await get('SELECT * FROM sales WHERE id=?', [req.params.id]);
    if (!sale) return res.status(404).json({ error: 'Sale not found' });
    res.json(await attachItems(sale));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/sales/transaction/:txId
router.get('/transaction/:txId', async (req, res) => {
  try {
    const sale = await get('SELECT * FROM sales WHERE transaction_id=?', [req.params.txId]);
    if (!sale) return res.status(404).json({ error: 'Transaction not found' });
    res.json(await attachItems(sale));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/sales
router.post('/', async (req, res) => {
  const { transaction_id, total_amount, discount=0, cash_received, change_amount, lang='th', items=[] } = req.body;
  if (!transaction_id || total_amount === undefined || cash_received === undefined)
    return res.status(400).json({ error: 'transaction_id, total_amount and cash_received are required' });
  if (!items.length)
    return res.status(400).json({ error: 'items must not be empty' });
  try {
    const saleRes = await run(
      `INSERT INTO sales (transaction_id,total_amount,discount,cash_received,change_amount,lang) VALUES (?,?,?,?,?,?)`,
      [transaction_id, total_amount, discount, cash_received, change_amount, lang]
    );
    const saleId = saleRes.lastID;
    for (const item of items) {
      const lineTotal = item.unit_price * item.quantity;
      await run(
        `INSERT INTO sale_items (sale_id,product_id,barcode,name,category,unit_price,quantity,line_total) VALUES (?,?,?,?,?,?,?,?)`,
        [saleId, item.product_id||null, item.barcode, item.name, item.category||'', item.unit_price, item.quantity, lineTotal]
      );
      // Decrease stock
      if (item.product_id) {
        await run('UPDATE products SET stock=MAX(0,stock-?) WHERE id=?', [item.quantity, item.product_id]);
      }
    }
    const newSale = await get('SELECT * FROM sales WHERE id=?', [saleId]);
    res.status(201).json(await attachItems(newSale));
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Transaction ID already exists' });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/sales/:id  (void + restore stock)
router.delete('/:id', async (req, res) => {
  try {
    const sale = await get('SELECT * FROM sales WHERE id=?', [req.params.id]);
    if (!sale) return res.status(404).json({ error: 'Sale not found' });
    const items = await all('SELECT * FROM sale_items WHERE sale_id=?', [sale.id]);
    for (const item of items) {
      if (item.product_id) await run('UPDATE products SET stock=stock+? WHERE id=?', [item.quantity, item.product_id]);
    }
    await run('DELETE FROM sales WHERE id=?', [sale.id]);
    res.json({ message: `Sale ${sale.transaction_id} voided and stock restored` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
