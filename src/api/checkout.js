const express = require('express');
const checkoutRouter = express.Router();
const {ensureAuthenticated, calculateSubtotal} = require('./helpers');


module.exports = (pool) => {

    checkoutRouter.post('/cart/:id/checkout', ensureAuthenticated, async (req, res) => {
        const cartId = parseInt(req.params.id);
        if(!cartId) {
            return res.status(400).json({ message: "Cart not found" });
        }

        try {
            const result = await pool.query('SELECT * FROM cart_items WHERE cart_id = $1', [cartId]);
            if (result.rows.length === 0) {
                return res.status(404).json({ message: "Cart not found" });
            }
            const cart = result.rows[0];
            const userId = cart.user_id;
            const subtotal = await calculateSubtotal(userId);
            const submittedOrder = await pool.query('INSERT INTO orders (order_date, order_sum, user_id) VALUES ($1, $2, $3)', [new Date().toISOString(), subtotal, userId]);
            orderId = submittedOrder.rows[0].id;

            for (item in result.rows) { 
                await pool.query('INSERT INTO order_items (order_id, product_id, quantity) VALUES ($1, $2, $3)', [orderId, item.product_id, item.quantity]);
            }
            
            await pool.query('DELETE FROM cart_items WHERE cart_id = $1', [cartId]);
            await pool.query('UPDATE cart SET item_count = 0, sub_total = 0 WHERE id = $1', [cartId]);
            res.status(201).json({ message: "Order placed", orderId: orderId});
        } catch (err) {
            console.error("Error placing order:", err);
            res.status(500).json({ message: err.message });
        }
    });
    return checkoutRouter;
}