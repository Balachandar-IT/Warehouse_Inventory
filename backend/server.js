const express = require('express')
const cors = require('cors')
const path = require('path')
const { Pool } = require('pg')
require('dotenv').config()

const app = express()
const PORT = process.env.PORT || 5000
const apiRouter = express.Router()

app.use(cors())
app.use(express.json())

console.log('DATABASE_URL:', process.env.DATABASE_URL)

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // ssl: { rejectUnauthorized: false }
})

// ---------- helpers ----------
function validateProductInput(req, res, next) {
  const { part_number, description, category, status = 'Active' } = req.body
  if (!part_number || !description || !category) {
    return res.status(400).json({ error: 'Part Number, Product Description, and Category are required.' })
  }
  if (!['Active', 'Inactive'].includes(status)) {
    return res.status(400).json({ error: 'Product status must be Active or Inactive.' })
  }
  next()
}

async function ensureProductStatusColumn(client) {
  await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'Active'`)
}

async function ensureStockStatusTypeConstraint(client) {
  await client.query(`ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_stock_status_type_check`)
  await client.query(`ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_stock_status_type_check CHECK (stock_status_type IN ('Available','Reserved','Pending PO','Modify','Sold','Showroom Unit','Warranty Replacement','Returned Stock','Damaged Stock'))`)
}

function isSalesProductsRequest(req) {
  const role = req.query.role || req.query.userRole || req.headers['x-user-role'] || req.headers['x-role']
  return String(role || '').toLowerCase() === 'sales'
}

function normalizeQuantity(row, key) {
  const value = Number(row[key])
  return Number.isFinite(value) ? value : 0
}

function buildProductResponse(row, isSales) {
  const currentQuantity = normalizeQuantity(row, 'current_quantity')
  const availableQuantity = Math.max(0, normalizeQuantity(row, 'available_quantity'))
  const stockStatusType = isSales && row.stock_status_type !== 'Damaged Stock'
    ? 'Available'
    : row.stock_status_type

  return {
    ...row,
    current_quantity: currentQuantity,
    available_quantity: availableQuantity,
    stock_status_type: stockStatusType
  }
}

// ---------- routes ----------
apiRouter.get('/', (req, res) => {
  res.json({ message: 'Datacom Inventory API is running' })
})

// ========== USER AUTH ==========
// Login
apiRouter.post('/login', async (req, res) => {
  const { username, password } = req.body
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required.' })
  }

  try {
    const client = await pool.connect()
    try {
      const result = await client.query(
        'SELECT * FROM users WHERE LOWER(username) = LOWER($1) AND password = $2',
        [username, password]
      )
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid username or password.' })
      }
      const user = result.rows[0]
      res.json({
        id: user.id,
        username: user.username,
        role: user.role,
        allowedPages: user.allowed_pages
      })
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('DB error (POST /login):', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Sign Up (self-service)
apiRouter.post('/signup', async (req, res) => {
  const { username, password } = req.body
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required.' })
  }

  const role = 'sales'
  const allowed_pages = ['inventory-view']

  try {
    const client = await pool.connect()
    try {
      const result = await client.query(
        `INSERT INTO users (username, password, role, allowed_pages) VALUES ($1,$2,$3,$4) RETURNING id, username, role, allowed_pages`,
        [username, password, role, allowed_pages]
      )
      res.json({ message: 'Account created successfully. You can now log in.', user: result.rows[0] })
    } finally {
      client.release()
    }
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username already exists. Please choose another.' })
    console.error('DB error (POST /signup):', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Forgot Password
apiRouter.post('/forgot-password', async (req, res) => {
  const { username, newPassword } = req.body
  if (!username || !newPassword) {
    return res.status(400).json({ error: 'Username and new password required.' })
  }

  try {
    const client = await pool.connect()
    try {
      const check = await client.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username])
      if (check.rows.length === 0) return res.status(404).json({ error: 'Username not found.' })
      await client.query('UPDATE users SET password = $1 WHERE id = $2', [newPassword, check.rows[0].id])
      res.json({ message: 'Password reset successfully.' })
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('DB error (POST /forgot-password):', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ========== USER MANAGEMENT (admin) ==========
// Get all users
apiRouter.get('/users', async (req, res) => {
  try {
    const client = await pool.connect()
    try {
      const result = await client.query('SELECT id, username, role, allowed_pages, created_at FROM users ORDER BY id')
      res.json(result.rows)
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('DB error (GET /users):', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Create user (admin)
apiRouter.post('/users', async (req, res) => {
  const { username, password, role = 'sales', allowed_pages } = req.body
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required.' })
  }

  try {
    const client = await pool.connect()
    try {
      const result = await client.query(
        `INSERT INTO users (username, password, role, allowed_pages) VALUES ($1,$2,$3,$4) RETURNING id, username, role, allowed_pages`,
        [username, password, role, allowed_pages || ['inventory-view']]
      )
      res.json({ message: 'User created successfully', user: result.rows[0] })
    } finally {
      client.release()
    }
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username already exists.' })
    console.error('DB error (POST /users):', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ✅ UPDATE USER (role & allowed pages)
apiRouter.put('/users/:id', async (req, res) => {
  const userId = Number(req.params.id)
  if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ error: 'Invalid user id' })

  const { role, allowed_pages } = req.body
  if (!role && !allowed_pages) {
    return res.status(400).json({ error: 'Please provide role or allowed_pages to update.' })
  }

  try {
    const client = await pool.connect()
    try {
      const check = await client.query('SELECT id FROM users WHERE id = $1', [userId])
      if (check.rows.length === 0) return res.status(404).json({ error: 'User not found' })

      const result = await client.query(
        `UPDATE users SET role = COALESCE($1, role), allowed_pages = COALESCE($2, allowed_pages) WHERE id = $3 RETURNING id, username, role, allowed_pages`,
        [role || null, allowed_pages || null, userId]
      )
      res.json({ message: 'User updated successfully', user: result.rows[0] })
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('DB error (PUT /users):', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Delete user
apiRouter.delete('/users/:id', async (req, res) => {
  const userId = Number(req.params.id)
  if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ error: 'Invalid user id' })

  try {
    const client = await pool.connect()
    try {
      const result = await client.query('DELETE FROM users WHERE id = $1 RETURNING *', [userId])
      if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' })
      res.json({ message: 'User deleted successfully', user: result.rows[0] })
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('DB error (DELETE /users):', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ========== PRODUCTS ==========
// GET products
apiRouter.get('/products', async (req, res) => {
  const isSales = isSalesProductsRequest(req)

  try {
    const client = await pool.connect()
    try {
      await ensureProductStatusColumn(client)
      const result = await client.query(
        `WITH movement_totals AS (
          SELECT
            part_number,
            COALESCE(SUM(
              CASE
                WHEN operation_type = 'Add Stock' THEN quantity
                WHEN operation_type = 'Remove Stock' THEN -quantity
                WHEN operation_type = 'Adjustment' THEN quantity
                ELSE 0
              END
            ), 0)::int AS current_quantity,
            COALESCE(SUM(
              CASE
                WHEN operation_type = 'Add Stock' AND stock_status_type = 'Available' THEN quantity
                WHEN operation_type = 'Remove Stock' AND stock_status_type = 'Sold' THEN -quantity
                ELSE 0
              END
            ), 0)::int AS available_quantity,
            COUNT(*) FILTER (WHERE stock_status_type <> 'Available') AS non_available_status_count,
            COUNT(DISTINCT stock_status_type) FILTER (WHERE stock_status_type <> 'Available') AS distinct_non_available_status_count,
            MAX(stock_status_type) FILTER (WHERE stock_status_type <> 'Available') AS only_non_available_status,
            COUNT(*) FILTER (WHERE stock_status_type = 'Sold') AS sold_status_count
          FROM stock_movements
          GROUP BY part_number
        ),
        products_with_quantity AS (
          SELECT
            p.id,
            p.part_number,
            p.description AS description,
            p.category,
            COALESCE(p.status, 'Active') AS status,
            p.created_at,
            COALESCE(mt.current_quantity, 0) AS current_quantity,
            GREATEST(COALESCE(mt.available_quantity, 0), 0) AS available_quantity,
            CASE
              WHEN COALESCE(mt.current_quantity, 0) <= 0 AND COALESCE(mt.sold_status_count, 0) > 0 THEN 'Sold'
              WHEN COALESCE(mt.current_quantity, 0) <= 0 THEN 'Out of Stock'
              WHEN GREATEST(COALESCE(mt.available_quantity, 0), 0) > 0 AND COALESCE(mt.non_available_status_count, 0) = 0 THEN 'Available'
              WHEN GREATEST(COALESCE(mt.available_quantity, 0), 0) > 0 THEN 'Mixed'
              WHEN COALESCE(mt.sold_status_count, 0) > 0 THEN 'Sold'
              WHEN COALESCE(mt.distinct_non_available_status_count, 0) = 1 THEN mt.only_non_available_status
              WHEN COALESCE(mt.distinct_non_available_status_count, 0) > 1 THEN 'Mixed'
              ELSE 'Out of Stock'
            END AS stock_status_type
          FROM products p
          LEFT JOIN movement_totals mt ON mt.part_number = p.part_number
        )
        SELECT *
        FROM products_with_quantity
        WHERE ($1::boolean = false OR available_quantity > 0 OR stock_status_type = 'Damaged Stock')
        ORDER BY id DESC`,
        [isSales]
      )
      res.json(result.rows.map((row) => buildProductResponse(row, isSales)))
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('DB error (GET /products):', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST product
apiRouter.post('/products', validateProductInput, async (req, res) => {
  const { part_number, description, category, status = 'Active' } = req.body
  try {
    const client = await pool.connect()
    try {
      await ensureProductStatusColumn(client)
      const result = await client.query(
        `INSERT INTO products (part_number, description, category, status) VALUES ($1,$2,$3,$4) ON CONFLICT (part_number) DO UPDATE SET description = EXCLUDED.description, category = EXCLUDED.category, status = EXCLUDED.status RETURNING *`,
        [part_number, description, category, status]
      )
      res.json({ message: 'Product saved successfully', product: result.rows[0] })
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('DB error (POST /products):', err.message)
    res.status(500).json({ error: err.message })
  }
})

// PUT product
apiRouter.put('/products/:id', validateProductInput, async (req, res) => {
  const productId = Number(req.params.id)
  if (!Number.isInteger(productId) || productId <= 0) return res.status(400).json({ error: 'Invalid product id' })

  const { part_number, description, category, status = 'Active' } = req.body
  try {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await ensureProductStatusColumn(client)
      await client.query(`ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_part_number_fkey`)
      await client.query(`ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_part_number_fkey FOREIGN KEY (part_number) REFERENCES products(part_number) ON UPDATE CASCADE`)

      const result = await client.query(`UPDATE products SET part_number = $1, description = $2, category = $3, status = $4 WHERE id = $5 RETURNING *`, [part_number, description, category, status, productId])
      if (result.rows.length === 0) {
        await client.query('ROLLBACK')
        return res.status(404).json({ error: 'Product not found' })
      }
      await client.query('COMMIT')
      res.json({ message: 'Product updated successfully', product: result.rows[0] })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('DB error (PUT /products):', err.message)
    if (err.code === '23505') return res.status(409).json({ error: 'Part number already exists.' })
    res.status(500).json({ error: err.message })
  }
})

// DELETE product
apiRouter.delete('/products/:id', async (req, res) => {
  const productId = Number(req.params.id)
  if (!Number.isInteger(productId) || productId <= 0) return res.status(400).json({ error: 'Invalid product id' })

  try {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const productResult = await client.query('SELECT part_number FROM products WHERE id = $1', [productId])
      if (productResult.rows.length === 0) {
        await client.query('ROLLBACK')
        return res.status(404).json({ error: 'Product not found' })
      }
      const movementResult = await client.query('SELECT 1 FROM stock_movements WHERE part_number = $1 LIMIT 1', [productResult.rows[0].part_number])
      if (movementResult.rows.length > 0) {
        await client.query('ROLLBACK')
        return res.status(409).json({ error: 'Product has stock movement/history. Set the product status to Inactive instead of deleting it.' })
      }
      await client.query('DELETE FROM products WHERE id = $1', [productId])
      await client.query('COMMIT')
      res.json({ message: 'Product deleted successfully' })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('DB error (DELETE /products):', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ========== STOCK MOVEMENTS ==========
// GET stock movements
apiRouter.get('/stock-movements', async (req, res) => {
  try {
    const client = await pool.connect()
    try {
      const result = await client.query(`SELECT id, operation_type, stock_card_no, adjustment_reason, part_number, quantity, location, stock_status_type, shipment, poc_key_in, remark, created_at FROM stock_movements ORDER BY id ASC`)
      res.json(result.rows)
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('DB error (GET /stock-movements):', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST stock movement
apiRouter.post('/stock-movements', async (req, res) => {
  const { operation_type, stock_card_no, adjustment_reason, part_number, quantity, location, stock_status_type, shipment, poc_key_in, remark } = req.body
  try {
    const client = await pool.connect()
    try {
      await ensureStockStatusTypeConstraint(client)
      await ensureProductStatusColumn(client)

      const productResult = await client.query('SELECT status FROM products WHERE part_number = $1', [part_number])
      if (productResult.rows.length === 0) return res.status(400).json({ error: 'Part number not found. Please create product master first.' })
      if (productResult.rows[0].status === 'Inactive') return res.status(409).json({ error: 'Product is Inactive. Set it to Active before creating a new stock entry.' })

      const result = await client.query(
        `INSERT INTO stock_movements (operation_type, stock_card_no, adjustment_reason, part_number, quantity, location, stock_status_type, shipment, poc_key_in, remark) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [operation_type, stock_card_no, adjustment_reason, part_number, quantity, location, stock_status_type, shipment, poc_key_in, remark]
      )
      res.json({ message: 'Stock movement saved', movement: result.rows[0] })
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('DB error (POST /stock-movements):', err.message)
    res.status(500).json({ error: err.message })
  }
})

// DELETE stock movement
apiRouter.delete('/stock-movements/:id', async (req, res) => {
  const movementId = Number(req.params.id)
  if (!Number.isInteger(movementId) || movementId <= 0) return res.status(400).json({ error: 'Invalid stock movement id' })

  try {
    const client = await pool.connect()
    try {
      const result = await client.query('DELETE FROM stock_movements WHERE id = $1 RETURNING *', [movementId])
      if (result.rows.length === 0) return res.status(404).json({ error: 'Stock movement not found' })
      res.json({ message: 'Stock movement deleted successfully', movement: result.rows[0] })
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('DB error (DELETE /stock-movements):', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ========== PUT (UPDATE) STOCK MOVEMENT - Only editable fields: part_number, stock_status_type, remark ==========
apiRouter.put('/stock-movements/:id', async (req, res) => {
  const movementId = Number(req.params.id)
  if (!Number.isInteger(movementId) || movementId <= 0) {
    return res.status(400).json({ error: 'Invalid stock movement id' })
  }

  // Only accept the three editable fields from the client
  const { part_number, stock_status_type, remark } = req.body

  if (!part_number || !stock_status_type) {
    return res.status(400).json({ error: 'Part number and stock status type are required.' })
  }

  try {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // 1. Fetch the old movement record
      const oldMovement = await client.query(
        'SELECT part_number, operation_type, quantity FROM stock_movements WHERE id = $1',
        [movementId]
      )
      if (oldMovement.rows.length === 0) {
        await client.query('ROLLBACK')
        return res.status(404).json({ error: 'Stock movement not found' })
      }
      const old = oldMovement.rows[0]

      // 2. If part number has changed, adjust inventory (revert old product, apply to new product)
      if (old.part_number !== part_number) {
        // Revert effect from old product (opposite of original operation)
        let revertDelta = 0
        if (old.operation_type === 'Add Stock') revertDelta = -old.quantity
        else if (old.operation_type === 'Remove Stock') revertDelta = +old.quantity
        // For 'Adjustment' you may define your own logic (e.g., treat as no change or specify a delta)
        if (revertDelta !== 0) {
          await client.query(
            'UPDATE products SET current_quantity = COALESCE(current_quantity, 0) + $1 WHERE part_number = $2',
            [revertDelta, old.part_number]
          )
        }

        // Apply effect to new product (same operation as original)
        let applyDelta = 0
        if (old.operation_type === 'Add Stock') applyDelta = +old.quantity
        else if (old.operation_type === 'Remove Stock') applyDelta = -old.quantity
        if (applyDelta !== 0) {
          await client.query(
            'UPDATE products SET current_quantity = COALESCE(current_quantity, 0) + $1 WHERE part_number = $2',
            [applyDelta, part_number]
          )
        }
      }

      // 3. Verify the new part number exists and is active
      const productCheck = await client.query(
        'SELECT status FROM products WHERE part_number = $1',
        [part_number]
      )
      if (productCheck.rows.length === 0) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: 'Part number not found. Please create product master first.' })
      }
      if (productCheck.rows[0].status === 'Inactive') {
        await client.query('ROLLBACK')
        return res.status(409).json({ error: 'Product is Inactive. Cannot update stock entry.' })
      }

      // 4. Update only the editable fields
      const result = await client.query(
        `UPDATE stock_movements SET 
          part_number = $1,
          stock_status_type = $2,
          remark = $3
        WHERE id = $4
        RETURNING *`,
        [part_number, stock_status_type, remark || null, movementId]
      )

      await client.query('COMMIT')
      res.json({ message: 'Stock movement updated', movement: result.rows[0] })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('DB error (PUT /stock-movements):', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ========== FINAL MIDDLEWARE ==========
const frontendDistPath = path.join(__dirname, '..', 'frontend', 'dist')
const iconPath = path.join(__dirname, 'icon.jpeg')

app.get('/icon.jpeg', (req, res) => {
  res.sendFile(iconPath)
})
app.use(express.static(frontendDistPath))
app.use('/api', apiRouter)
app.use('/', apiRouter)

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next()
  res.sendFile(path.join(frontendDistPath, 'index.html'), (err) => {
    if (err) next()
  })
})

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON request body.' })
  }
  next(err)
})

app.use((req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' })
})

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Datacom Inventory API running on port ${PORT}`)
  })
}

module.exports = app
