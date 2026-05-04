// routes/chatbotRoutes.js

const express = require('express');
const router  = express.Router();

const { runChatbot, getChatbotHistory } = require('../controllers/chatbotController');
const { protect, authorize }             = require('../middleware/auth');

// Only patients can use the chatbot
router.post('/',        protect, authorize('patient'), runChatbot);
router.get('/history',  protect, authorize('patient'), getChatbotHistory);

module.exports = router;