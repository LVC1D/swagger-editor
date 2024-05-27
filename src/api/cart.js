const express = require('express');
const { pool } = require('./server');
const cartRouter = express.Router();


module.exports = (pool) => {
    cartRouter.get('/:id', (req, res) => {
        const userId = parseInt(req.params.id);
        pool.query('SELECT * FROM cart WHERE id = $1', [userId], (err, result) => {
        if (err) {
            console.error("Error getting cart:", err);
            res.status(500).json({ message: err.message });
        } else if (!result.rows[0]) {
            res.status(404).json({ message: "Cart not found" });
        } else {
            res.status(200).json(result.rows);
        }
        });
    });
    
    cartRouter.put('/:id', async (req, res) => {
        const userId = parseInt(req.params.id);
        const { product_id, quantity } = req.body;
    
        try {
            await pool.query('UPDATE cart SET product_id = $1, quantity = $2 WHERE id = $3 RETURNING *', [product_id, quantity, userId]);
    
            const result = await pool.query('SELECT * FROM cart WHERE id = $1', [userId]);
            const updatedCart = result.rows[0];
            res.status(200).json(updatedCart);
        } catch (err) {
            console.error("Error updating cart:", err);
            res.status(500).json({ message: err.message });
        }
    });
    
    return cartRouter;
};