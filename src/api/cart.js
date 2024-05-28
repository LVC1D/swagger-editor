const express = require('express');
const cartRouter = express.Router();
const {ensureAuthenticated, calculateSubtotal} = require('./helpers');
const joi = require('joi');


module.exports = (pool) => {
    const cartSchema = joi.object({
        product_id: joi.number().integer().required(),
        quantity: joi.number().integer().required()
    });

    cartRouter.get('/:id', ensureAuthenticated, async (req, res) => {
        const cartId = parseInt(req.params.id);
        try {
            const result = await pool.query('SELECT * FROM cart WHERE id = $1', [cartId]);
            if (result.rows.length === 0) {
                const newCart = await pool.query('INSERT INTO cart (id) VALUES ($1) RETURNING *', [cartId]);
                res.status(200).json(newCart.rows[0]);
            } else {
                res.status(200).json(result.rows[0]);
            }
        } catch (err) {
            console.error("Error getting cart:", err);
            res.status(500).json({ message: err.message });
        }
    
    });
    
    cartRouter.post('/', ensureAuthenticated, async (req, res) => {
        const { error } = cartSchema.validate(req.body);
        if (error) return res.status(400).json({ message: error.details[0].message });
        if (!req.user) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const userId = req.user.id;
        const { product_id, quantity } = req.body;
        try {
            const productResult = await pool.query('SELECT * FROM products WHERE id = $1', [product_id]);
            if (productResult.rows.length === 0) {
                return res.status(404).json({ message: "Product not found" });
            }
    
            const existingCartItemResult = await pool.query('SELECT * FROM cart_items WHERE user_id = $1 AND product_id = $2', [userId, product_id]);
            const existingCart = existingCartItemResult.rows[0];
            if (existingCart) {
                await pool.query('UPDATE cart_items SET quantity = $1 WHERE user_id = $2 AND product_id = $3', [existingCart.quantity + quantity, userId, product_id]);
            } else {
                await pool.query('INSERT INTO cart_items (user_id, product_id, quantity) VALUES ($1, $2, $3)', [userId, product_id, quantity]);
            }
    
            await pool.query('UPDATE cart SET item_count = (SELECT SUM(quantity) FROM cart_items WHERE user_id = $1), sub_total = $2 WHERE user_id = $1', [userId, await calculateSubtotal(userId)]);
            res.status(200).json({ message: "Item added to cart" });
        } catch (err) {
            console.error("Error updating cart:", err);
            res.status(500).json({ message: err.message });
        }
    });
    
    cartRouter.put('/:productId', ensureAuthenticated, async (req, res) => {
        const { error } = cartSchema.validate(req.body);
        if (error) return res.status(400).json({ message: error.details[0].message });
        const userId = parseInt(req.params.id);
        const { quantity } = req.body;
        const product_id = parseInt(req.params.productId);
    
        try {
            const existingCartItemResult = await pool.query('SELECT * FROM cart_items WHERE user_id = $1 AND product_id = $2', [userId, product_id]);
            const existingItem = existingCartItemResult.rows[0];
            if (!existingItem) {
                return res.status(404).json({ message: "Item not found in cart" });
            } else {
                await pool.query('UPDATE cart_items SET quantity = $1 WHERE user_id = $2 AND product_id = $3', [quantity, userId, productId]);
                await pool.query('UPDATE cart SET item_count = (SELECT SUM(quantity) FROM cart_items WHERE user_id = $1), sub_total = $2 WHERE user_id = $1', [userId, await calculateSubtotal(userId)]);
                res.status(200).json({ message: "Cart updated successfully" });
            }
        } catch (err) {
            console.error("Error updating cart:", err);
            res.status(500).json({ message: err.message });
        }
    });
    
    return cartRouter;
};