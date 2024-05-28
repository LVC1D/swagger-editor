const ensureAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ message: "Unauthorized" });
}

async function calculateSubtotal(userId) {
    const cartItemsResult = await pool.query('SELECT * FROM cart_items WHERE user_id = $1', [userId]);
    const cartItems = cartItemsResult.rows;
  
    let subtotal = 0;
    for (const item of cartItems) {
      const productResult = await pool.query('SELECT price FROM products WHERE id = $1', [item.product_id]);
      const product = productResult.rows[0];
      subtotal += product.price * item.quantity;
    }
    return subtotal;
  }

module.exports = { ensureAuthenticated, calculateSubtotal };

