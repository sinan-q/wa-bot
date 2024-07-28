const express = require('express')
const router = express.Router()
const userController = require('../controllers/UserController')

router.get('/me',  userController.me);
router.get('/logout',  userController.logout);


module.exports = router;

