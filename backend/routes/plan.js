const express = require('express');
const User = require('../models/User');
const auth = require('../middleware/auth');
const router = express.Router();

// Get user dashboard data
router.get('/dashboard', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Purchase plan
router.post('/purchase', auth, async (req, res) => {
  try {
    const { plan } = req.body;
    
    let days = 0;
    let price = 0;
    
    switch(plan) {
      case '10days':
        days = 10;
        price = 20;
        break;
      case '35days':
        days = 35;
        price = 45;
        break;
      case '2months':
        days = 60;
        price = 100;
        break;
      case '3months':
        days = 90;
        price = 150;
        break;
      case '6months':
        days = 180;
        price = 300;
        break;
      case '1year':
        days = 365;
        price = 600;
        break;
      default:
        return res.status(400).json({ success: false, message: 'Invalid plan' });
    }
    
    const user = await User.findById(req.userId);
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + days);
    
    user.plan = plan;
    user.planExpiry = expiryDate;
    await user.save();
    
    res.json({
      success: true,
      message: `Successfully purchased ${plan} for ${price} XD`,
      plan: user.plan,
      expiry: user.planExpiry
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;