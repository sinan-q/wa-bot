const express = require('express')
const router = express.Router()
const authController = require('../controllers/AuthController')

router.post('/register', authController.registerUser);

router.post('/login', authController.loginUser);

router.get('/refresh', authController.refreshToken );


module.exports = router;