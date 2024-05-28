const express = require('express');
const userRouter = express.Router();
const bcrypt = require('bcrypt');
const saltRounds = 10;
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const {ensureAuthenticated} = require('./helpers');
const joi = require('joi');

module.exports = (pool) => {
    userRouter.use(passport.initialize());
    userRouter.use(passport.session());

    const userRegSchema = joi.object({
        email: joi.string().email().required(),
        username: joi.string().required(),
        password: joi.string().min(6).required(),
        name: joi.string().required(),
        address: joi.string().required()
    });

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
        } catch (err) {
            console.error("Error in LocalStrategy:", err);
            return done(err);
        }
    }));

    userRouter.post('/register', async (req, res, next) => {
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

        } catch (err) {
            if (err.code === '23505') {
                return res.status(409).json({ message: "User already exists" });
            } else {
                console.error("Error registering user:", err);
                res.status(500).json({ message: err.message });
            }
        }
    });

    userRouter.post('/login', passport.authenticate('local', { failureRedirect: '/login', failureMessage: true }, (err, user, info) => {
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
            const { password, ...userData } = user;
            return res.status(200).json({ message: "Logged in successfully", user: userData });
        });
    }));

    userRouter.get('/', ensureAuthenticated, async (req, res) => {
        const users = await pool.query('SELECT * FROM users');
        res.status(200).json(users);
    });
    
    userRouter.get('/:id', ensureAuthenticated, (req, res) => {
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
    
    userRouter.put('/:id', ensureAuthenticated, async (req, res) => {
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

  return userRouter;
};