const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
const bodyParser = require('body-parser');
const cors = require('cors');
const partials = require('express-partials');
const { Pool } = require('pg');
const session = require('express-session');
const bcrypt = require('bcrypt');
const saltRounds = 10;
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const router = express.Router();
const moment = require('moment');
const joi = require('joi');

const store = new session.MemoryStore();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(partials());
app.use(session({
    secret: 'nfdjd8vef(3fjv',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: false, maxAge: 3600000, sameSite: 'strict' },
    store: store
}));
app.set('view engine', 'ejs');
app.use(express.static('public'));

const pool = new Pool({
    user: "hectorcryo",
    host: "localhost",
    database: "eCommerce",
    password: "604b12bd9F!",
    port: 5432
});

const userRegSchema = joi.object({
    email: joi.string().email().required(),
    username: joi.string().required(),
    password: joi.string().min(6).required(),
    name: joi.string().required(),
    address: joi.string().required()
});

const cartSchema = joi.object({
    product_id: joi.number().integer().required(),
    quantity: joi.number().integer().required()
});

// const userRouter = require('./users');
// const checkoutRouter = require('./checkout');
// const cartRouter = require('./cart');
// const productsRouter = require('./products');
// const orderRouter = require('./orders');

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser((id, done) => {
    pool.query('SELECT * FROM users WHERE id = $1', [id], (err, res) => {
        done(err, res.rows[0]);
    });
});

passport.use(new LocalStrategy({
    usernameField: 'email',
    passwordField: 'password'
}, async (email, password, done) => {

    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];
        if (!user) {
            return done(null, false, { message: 'Incorrect email' });
        }
        const isMatch = bcrypt.compare(password, user.password);
        if (!isMatch) {
            return done(null, false, { message: 'Incorrect password' });
        }
        return done(null, user);
    } catch(err) {
      console.error("Error in LocalStrategy:", err);
      return done(err);
    }
}));

const ensureAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ message: "Unauthorized" });
};

app.post('/register', async (req, res, next) => {
    const { error } = userRegSchema.validate(req.body);
    if (error) {
        return res.status(400).json({ message: error.details[0].message });
    }
    
    const { email, password, username, name, address } = req.body;
    
    try {
        const salt = await bcrypt.genSalt(saltRounds);
        const hashedPassword = await bcrypt.hash(password, salt);
        const result = pool.query("INSERT INTO users (email, password, username, name, address) VALUES ($1, $2, $3, $4, $5) RETURNING *",
        [email, hashedPassword, username, name, address]);

        const user = result.rows[0];

        req.login(user, (err) => {
            if (err) {
                return next(err);
            }
            res.status(201).json({ message: "User registered successfully", user: user });
        });

    } catch(err) {
        if (err.code === '23505') {
            return res.status(409).json({ message: "User already exists" });
        } else {
            console.error("Error registering user:", err);
            res.status(500).json({ message: err.message });
        }
    }
});

app.post('/login', passport.authenticate('local', (err, user, info) =>{
    if (err) {
        return next(err);
    }
    if (!user) {
        return res.status(401).json({ message: info.message });
    }
    req.login(user, (err) => {
        if (err) {
            return next(err);
        }
        const {password, ...userData} = user;
        return res.status(200).json({ message: "Logged in successfully", user: userData });
    });
}));

// users route

app.get('/users/profile', ensureAuthenticated, (req, res) => {
    const userId = parseInt(req.params.id);
    pool.query('SELECT * FROM users WHERE id = $1', [userId], (err, result) => {
        if (err) {
            console.error("Error getting user:", err);
            res.status(500).json({ message: err.message });
        } else if (!result.rows[0]) {
            res.status(404).json({ message: "User not found" });
        } else {
            const { password, ...userData } = result.rows[0];
            res.status(200).json(userData);
        }
    });
});

app.put('/users/:id', ensureAuthenticated, async (req, res) => {
    const userId = parseInt(req.params.id);
    const { email, password, name, address } = req.body;

    try {
        let hashedPassword = password;
        if (password) {
            const salt = await bcrypt.genSalt(saltRounds);
            hashedPassword = await bcrypt.hash(password, salt);
        }
        await pool.query('UPDATE users SET email = $1, password = $2, name = $3, address = $4 WHERE id = $5 RETURNING *', [email, password, name, address, userId]);

        const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
        const updatedUser = result.rows[0];
        if (req.user && req.user.id === userId) {
            req.login(updatedUser, (err) => {
                if (err) {
                    console.error("Error updating user:", err);
                    return next(err);
                }
            });
        }

        res.status(200).json(updatedUser);
    } catch (err) {
        console.error("Error updating user:", err);
        res.status(500).json({ message: err.message });
    }
});

// cart route

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

app.get('/cart', ensureAuthenticated, async (req, res) => {
    const userId = parseInt(req.params.id);
    try {
        const result = await pool.query('SELECT * FROM cart WHERE id = $1', [userId]);
        if (result.rows.length === 0) {
            const newCart = await pool.query('INSERT INTO cart (id) VALUES ($1) RETURNING *', [userId]);
            res.status(200).json(newCart.rows[0]);
        } else {
            res.status(200).json(result.rows[0]);
        }
    } catch (err) {
        console.error("Error getting cart:", err);
        res.status(500).json({ message: err.message });
    }

});

app.post('/cart', ensureAuthenticated, async (req, res) => {
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

app.put('/cart/:productId', ensureAuthenticated, async (req, res) => {
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

// products route

app.get('/products', (req, res) => {
    pool.query('SELECT * FROM products', (err, result) => {
        if (err) {
            console.error("Error getting products:", err);
            res.status(500).json({ message: err.message });
        } else {
            res.status(200).json(result.rows);
        }
    });
});

app.get('/products/:id', (req, res) => {
    const productId = parseInt(req.params.id);
    pool.query('SELECT * FROM products WHERE id = $1', [productId], (err, result) => {
        if (err) {
            console.error("Error getting product:", err);
            res.status(500).json({ message: err.message });
        } else if (!result.rows[0]) {
            res.status(404).json({ message: "Product not found" });
        } else {
            res.status(200).json(result.rows);
        }
    });
});

// orders route
app.get('/orders', ensureAuthenticated, (req, res) => {
    pool.query('SELECT * FROM orders', (err, result) => {
        if (err) {
            console.error("Error getting orders:", err);
            res.status(500).json({ message: err.message });
        } else {
            res.status(200).json(result.rows);
        }
    });
});

app.get('/orders/:id', ensureAuthenticated, async (req, res) => {
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

app.post('/orders', ensureAuthenticated, async (req, res) => {
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

app.use((err, req, res, next) => {
    console.error(err.stack); // Log the full error stack trace
    res.status(500).json({ message: "Internal Server Error" });
  });

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

module.exports = { app, pool };