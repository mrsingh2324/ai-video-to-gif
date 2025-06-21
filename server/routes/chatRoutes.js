// routes/chatRoutes.js
const express = require('express');
const router = express.Router();
const { chatWithDeepSeek } = require('../controllers/chatController');

router.post('/chat', chatWithDeepSeek);

module.exports = router;
