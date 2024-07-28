const express = require('express')
const router = express.Router()
const userController = require('../controllers/UserController')

router.get('/me',  userController.me);

module.exports = router;

