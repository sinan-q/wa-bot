const express = require('express')
const router = express.Router()
const waController = require('../controllers/WAController')

router.get('/status',  waController.status);
router.post('/start',  waController.start);
router.post('/send',  waController.send);
router.post('/logout',  waController.logout);
router.post('/stop', waController.stop);




module.exports = router;

