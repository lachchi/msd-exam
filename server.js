const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'products.json');

app.use(express.json());

// Utility: read products.json safely
function readProducts() {
  return new Promise((resolve, reject) => {
    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
      if (err) {
        if (err.code === 'ENOENT') {
          // File missing, initialize with empty array
          return resolve([]);
        }
        return reject(err);
      }
      if (!data || data.trim() === '') return resolve([]);
      try {
        const parsed = JSON.parse(data);
        if (!Array.isArray(parsed)) return resolve([]);
        resolve(parsed);
      } catch (e) {
        // If file contains invalid JSON, treat as empty
        resolve([]);
      }
    });
  });
}

// Utility: write products.json safely (atomic write)
function writeProducts(products) {
  return new Promise((resolve, reject) => {
    const tempFile = DATA_FILE + '.tmp';
    const json = JSON.stringify(products, null, 2);
    fs.writeFile(tempFile, json, 'utf8', (err) => {
      if (err) return reject(err);
      fs.rename(tempFile, DATA_FILE, (renameErr) => {
        if (renameErr) return reject(renameErr);
        resolve();
      });
    });
  });
}

function validateProductInput(body, isPartial = false) {
  const errors = [];
  const allowedKeys = ['name', 'price', 'inStock'];
  const keys = Object.keys(body || {});

  // Unknown keys
  for (const k of keys) {
    if (!allowedKeys.includes(k)) errors.push(`Unknown field: ${k}`);
  }

  if (!isPartial) {
    if (typeof body?.name !== 'string' || body.name.trim() === '') errors.push('name must be a non-empty string');
    if (typeof body?.price !== 'number' || !Number.isFinite(body.price) || body.price < 0) errors.push('price must be a non-negative number');
    if (typeof body?.inStock !== 'boolean') errors.push('inStock must be a boolean');
  } else {
    if ('name' in body && (typeof body.name !== 'string' || body.name.trim() === '')) errors.push('name must be a non-empty string');
    if ('price' in body && (typeof body.price !== 'number' || !Number.isFinite(body.price) || body.price < 0)) errors.push('price must be a non-negative number');
    if ('inStock' in body && typeof body.inStock !== 'boolean') errors.push('inStock must be a boolean');
  }

  return errors;
}

// GET /products -> return all products
app.get('/products', async (req, res) => {
  try {
    const products = await readProducts();
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: 'Failed to read products', error: err.message });
  }
});

// GET /products/instock -> return only products where inStock is true
app.get('/products/instock', async (req, res) => {
  try {
    const products = await readProducts();
    res.json(products.filter(p => p && p.inStock === true));
  } catch (err) {
    res.status(500).json({ message: 'Failed to read products', error: err.message });
  }
});

// POST /products -> create new product with auto-increment id
app.post('/products', async (req, res) => {
  const errors = validateProductInput(req.body, false);
  if (errors.length) return res.status(400).json({ message: 'Invalid input', errors });

  try {
    const products = await readProducts();
    const maxId = products.reduce((max, p) => (typeof p.id === 'number' && p.id > max ? p.id : max), 0);
    const newProduct = {
      id: maxId + 1,
      name: req.body.name.trim(),
      price: req.body.price,
      inStock: req.body.inStock,
    };
    products.push(newProduct);
    await writeProducts(products);
    res.status(201).json(newProduct);
  } catch (err) {
    res.status(500).json({ message: 'Failed to save product', error: err.message });
  }
});

// PUT /products/:id -> update existing product
app.put('/products/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid id' });

  const errors = validateProductInput(req.body, true);
  if (errors.length) return res.status(400).json({ message: 'Invalid input', errors });

  try {
    const products = await readProducts();
    const idx = products.findIndex(p => p && p.id === id);
    if (idx === -1) return res.status(404).json({ message: 'Product not found' });

    const updated = { ...products[idx], ...req.body };
    if (typeof updated.name === 'string') updated.name = updated.name.trim();
    products[idx] = updated;

    await writeProducts(products);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update product', error: err.message });
  }
});

// DELETE /products/:id -> remove product
app.delete('/products/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid id' });

  try {
    const products = await readProducts();
    const lengthBefore = products.length;
    const remaining = products.filter(p => p && p.id !== id);

    if (remaining.length === lengthBefore) return res.status(404).json({ message: 'Product not found' });

    await writeProducts(remaining);
    res.json({ message: 'Product deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete product', error: err.message });
  }
});

// Health check
app.get('/', (req, res) => {
  res.send('Products API is running');
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
