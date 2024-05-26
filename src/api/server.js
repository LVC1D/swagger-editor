const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
const bodyParser = require('body-parser');
const cors = require('cors');
const {Pool} = require('pg');
const session = require('express-session');
const bcrypt = require('bcrypt');
const saltRounds = 10;
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const router = express.Router();
const userRouter = require('./users');
const checkoutRouter = require('./checkout');
const cartRouter = require('./cart');
const productsRouter = require('./products');
const orderRouter = require('./orders');
const store = new session.MemoryStore();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(session({
    secret: 'nfdjd8vef(3fjv',
    resave: false,
    saveUninitialized: false,
    cookie: {secure: false, httpOnly: false, maxAge: 3600000, sameSite: 'strict'},
    store: store
})); 

const pool = new Pool({
    user: "hectorcryo",
    host: "localhost",
    database: "eCommerce",
    password: "604b12bd9F!",
    port: 5432
});

app.use(passport.initialize());
app.use(passport.session());

app.use('/users', userRouter);
app.use('/checkout', checkoutRouter);
app.use('/cart', cartRouter);
app.use('/products', productsRouter);
app.use('/orders', orderRouter);

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
    }, (email, password, done) => {

    try {
        const result = pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];
        if (!user) {
            return done(null, false, {message: 'Incorrect email'});
        }
        const isMatch = bcrypt.compare(password, user.password);
        if (!isMatch) {
            return done(null, false, {message: 'Incorrect password'});
        }
        return done(null, user);
    } catch {
        return done(null, false, {message: 'Incorrect email or password'});
    }
}));

app.post('/register', async (req, res) => {
    const {email, password} = req.body;
    
    try {
        const salt = await bcrypt.genSalt(saltRounds);
        const hashedPassword = await bcrypt.hash(password, salt);
        const result = pool.query("INSERT INTO users (email, password) VALUES ($1, $2) RETURNING *", [email, hashedPassword]);
        
        const user = result.rows[0];
        
        req.login(user, (err) => {
            if (err) {
                return next(err);
            }
            res.redirect('/profile');
        });
    } catch {
        console.error("Error registering user:", err);
        res.status(500).json({ message: err.message });
    }
});

app.post('/login', passport.authenticate('local', {
    successRedirect: '/profile',
    failureRedirect: '/login',
    failureFlash: true
}));

app.get("/register", (req, res) => {
    res.render("register");
});

app.listen(port, () => {    
    console.log(`Server is running on port ${port}`);
});

module.exports = pool;