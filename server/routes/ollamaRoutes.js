// routes/generateClipRoutes.js
const express = require('express');
const router = express.Router();
const { generateClip } = require('../controllers/ollamaController');

router.post('/', generateClip);

module.exports = router;
