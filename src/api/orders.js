const express = require('express');
const orderRouter = express.Router();
const {ensureAuthenticated} = require('./helpers'); 


module.exports = (pool) => {

    orderRouter.get('/', ensureAuthenticated, (req, res) => {
        pool.query('SELECT * FROM orders', (err, result) => {
            if (err) {
                console.error("Error getting orders:", err);
                res.status(500).json({ message: err.message });
            } else {
                res.status(200).json(result.rows);
            }
        });
    });
    
    orderRouter.get('/:id', ensureAuthenticated, async (req, res) => {
        const orderId = parseInt(req.params.id);
        await pool.query('SELECT * FROM orders WHERE id = $1', [orderId], (err, result) => {
            if (err) {
                console.error("Error getting order:", err);
                res.status(500).json({ message: err.message });
            } else if (!result.rows[0]) {
                res.status(404).json({ message: "Order not found" });
            } else {
                res.status(200).json(result.rows);
            }
        });
    });
    
    orderRouter.post('/', ensureAuthenticated, async (req, res) => {
        if (!req.user) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const userId = req.user.id;
        const { product_id, quantity } = req.body;
        try {
            const productResult = await pool.query('SELECT * FROM products WHERE id = $1', [product_id]);
            if (productResult.rows.length === 0) {
                return res.status(404).json({ message: "Product not found in cart" });
            }
            const product = productResult.rows[0];
            const orderSum = product.price * quantity;
            const newOrder = await pool.query('INSERT INTO orders (order_date, order_sum, user_id) VALUES ($1, $2, $3) RETURNING *', [new Date().toISOString(), orderSum, userId]); 
    
            const order = newOrder.rows[0];
            res.status(200).json(order);
        } catch (err) {
            console.error("Error updating order:", err);
            res.status(500).json({ message: err.message });
        }
    });

    return orderRouter;
}