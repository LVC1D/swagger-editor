const express = require('express');
const userRouter = express.Router();
const {pool} = require('./server');

app.get("/users/:id", (req, res) => {
    const userId = parseInt(req.params.id);
    pool.query('SELECT * FROM users WHERE id = $1', [userId], (err, result) => {
        if (err) {
            console.error("Error getting user:", err);
            res.status(500).json({ message: err.message });
        }
        if (!result.rows[0]) {
            res.status(404).json({ message: "User not found" });
        }
        res.status(200).json(result.rows);
    });
});

module.exports = userRouter;