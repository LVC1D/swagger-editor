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
const {ensureAuthenticated} = require('./helpers');

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

const userRouter = require('./users');
const orderRouter = require('./orders');
const productRouter = require('./products');
const cartRouter = require('./cart');
const checkoutRouter = require('./checkout');

// Use routers
app.use('/users', userRouter(pool, ensureAuthenticated));
app.use('/orders', orderRouter(pool, ensureAuthenticated));
app.use('/products', productRouter(pool, ensureAuthenticated));
app.use('/cart', cartRouter(pool, ensureAuthenticated));
app.use('/checkout', checkoutRouter(pool, ensureAuthenticated));


app.use((err, req, res, next) => {
    console.error(err.stack); // Log the full error stack trace
    res.status(500).json({ message: "Internal Server Error" });
  });

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

module.exports = { app, pool };