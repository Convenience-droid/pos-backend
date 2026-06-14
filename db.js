// ─────────────────────────────────────────────────────────────────
// db.js  —  Turso (libSQL) connection + Schema
//   - บน production (Render): ตั้งค่า TURSO_DATABASE_URL และ TURSO_AUTH_TOKEN
//     เพื่อใช้ฐานข้อมูล Turso (เก็บข้อมูลถาวรบนคลาวด์)
//   - บนเครื่อง (local dev): ถ้าไม่ตั้งค่า env ด้านบน จะใช้ไฟล์ ./pos.db ในเครื่องแทน
// ─────────────────────────────────────────────────────────────────
const { createClient } = require('@libsql/client');
require('dotenv').config();

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:./pos.db',
  authToken: process.env.TURSO_AUTH_TOKEN || undefined,
  intMode: 'number',
});

console.log('✅ DB target:', process.env.TURSO_DATABASE_URL ? 'Turso (cloud)' : 'local file ./pos.db');

// Helper: run a query that doesn't return rows
async function run(sql, params = []) {
  const result = await db.execute({ sql, args: params });
  return {
    lastID: Number(result.lastInsertRowid ?? 0),
    changes: result.rowsAffected ?? 0,
  };
}

// Helper: get one row
async function get(sql, params = []) {
  const result = await db.execute({ sql, args: params });
  return result.rows[0];
}

// Helper: get multiple rows
async function all(sql, params = []) {
  const result = await db.execute({ sql, args: params });
  return result.rows;
}

// ─── SCHEMA ───────────────────────────────────────────────────────
async function initDB() {
  try { await run('PRAGMA foreign_keys = ON'); } catch (_) {}

  await run(`
    CREATE TABLE IF NOT EXISTS products (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      barcode     TEXT    UNIQUE NOT NULL,
      name_th     TEXT    NOT NULL,
      name_en     TEXT    NOT NULL DEFAULT '',
      name_km     TEXT    NOT NULL DEFAULT '',
      category_th TEXT    NOT NULL DEFAULT '',
      category_en TEXT    NOT NULL DEFAULT '',
      category_km TEXT    NOT NULL DEFAULT '',
      price       REAL    NOT NULL DEFAULT 0,
      stock       INTEGER NOT NULL DEFAULT 0,
      image_url   TEXT    NOT NULL DEFAULT '',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS sales (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id  TEXT    UNIQUE NOT NULL,
      total_amount    REAL    NOT NULL DEFAULT 0,
      discount        REAL    NOT NULL DEFAULT 0,
      cash_received   REAL    NOT NULL DEFAULT 0,
      change_amount   REAL    NOT NULL DEFAULT 0,
      lang            TEXT    NOT NULL DEFAULT 'th',
      created_at      TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS sale_items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id     INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      product_id  INTEGER REFERENCES products(id) ON DELETE SET NULL,
      barcode     TEXT    NOT NULL,
      name        TEXT    NOT NULL,
      category    TEXT    NOT NULL DEFAULT '',
      unit_price  REAL    NOT NULL DEFAULT 0,
      quantity    INTEGER NOT NULL DEFAULT 1,
      line_total  REAL    NOT NULL DEFAULT 0
    )
  `);

  // Indexes
  await run(`CREATE INDEX IF NOT EXISTS idx_products_barcode   ON products(barcode)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_sales_transaction  ON sales(transaction_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_sales_created_at   ON sales(created_at)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id)`);

  // ─── SEED DATA ──────────────────────────────────────────────────
  const row = await get('SELECT COUNT(*) AS c FROM products');
  const c = row ? Number(row.c) : 0;
  if (c === 0) {
    const seeds = [
      ['8850006101001','น้ำเปล่า 600ml',       'Water 600ml',         'ទឹក 600ml',          'เครื่องดื่ม','Beverages','ភេសជ្ជៈ',         8,  50],
      ['8850006101002','น้ำอัดลม 325ml',       'Soda 325ml',          'សូដា 325ml',         'เครื่องดื่ม','Beverages','ភេសជ្ជៈ',         15, 30],
      ['8850006101003','ชาเขียว 500ml',        'Green Tea 500ml',     'តែបៃតង 500ml',      'เครื่องดื่ม','Beverages','ភេសជ្ជៈ',         20, 25],
      ['8850006101004','กาแฟกระป๋อง',          'Canned Coffee',       'កាហ្វេកំប៉ុង',      'เครื่องดื่ม','Beverages','ភេសជ្ជៈ',         18, 20],
      ['8850006101005','น้ำผลไม้ 1L',          'Fruit Juice 1L',      'ទឹកផ្លែឈើ 1L',     'เครื่องดื่ม','Beverages','ភេសជ្ជៈ',         45, 15],
      ['8850006102001','บะหมี่กึ่งสำเร็จรูป', 'Instant Noodles',    'មីកញ្ចប់',          'ของแห้ง',   'Dry Goods','គ្រឿងស្ងួត',      7,  100],
      ['8850006102002','ข้าวสาร 5kg',          'Rice 5kg',            'អង្ករ 5kg',         'ของแห้ง',   'Dry Goods','គ្រឿងស្ងួត',      150,20],
      ['8850006102003','น้ำตาลทราย 1kg',       'Sugar 1kg',           'ស្ករ 1kg',          'ของแห้ง',   'Dry Goods','គ្រឿងស្ងួត',      28, 30],
      ['8850006102004','เกลือ 500g',            'Salt 500g',           'អំបិល 500g',        'ของแห้ง',   'Dry Goods','គ្រឿងស្ងួត',      10, 40],
      ['8850006102005','น้ำมันพืช 1L',         'Vegetable Oil 1L',    'ប្រេងបន្លែ 1L',    'ของแห้ง',   'Dry Goods','គ្រឿងស្ងួត',      65, 15],
      ['8850006103001','มันฝรั่งทอด 75g',      'Potato Chips 75g',    'ដំឡូងចៀន 75g',     'ขนม',       'Snacks',   'អាហារសម្រន់',     20, 30],
      ['8850006103002','ช็อกโกแลต',            'Chocolate',           'សូកូឡា',            'ขนม',       'Snacks',   'អាហារសម្រន់',     35, 25],
      ['8850006103003','คุกกี้ 150g',          'Cookies 150g',        'នំខូគី 150g',       'ขนม',       'Snacks',   'អាហារសម្រន់',     45, 20],
      ['8850006104001','สบู่ก้อน',             'Bar Soap',            'សាប៊ូ',             'ของใช้',    'Household','គ្រឿងប្រើប្រាស់', 25, 20],
      ['8850006104002','ยาสีฟัน 150g',         'Toothpaste 150g',     'ថ្នាំដុសធ្មេញ 150g','ของใช้',   'Household','គ្រឿងប្រើប្រាស់', 45, 15],
      ['8850006104003','กระดาษชำระ 6ม้วน',    'Tissue Paper 6 Rolls','ក្រដាស់សំអាត 6 នំ', 'ของใช้',   'Household','គ្រឿងប្រើប្រាស់', 55, 20],
    ];
    for (const s of seeds) {
      await run(
        `INSERT INTO products (barcode,name_th,name_en,name_km,category_th,category_en,category_km,price,stock) VALUES (?,?,?,?,?,?,?,?,?)`,
        s
      );
    }
    console.log('✅ Seed data inserted (16 products)');
  }

  console.log('✅ Database ready');
}

module.exports = { db, run, get, all, initDB };
