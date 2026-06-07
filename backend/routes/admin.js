const express = require('express');
const User = require('../models/User.js');
const Transaction = require('../models/Transaction.js');
const router = express.Router();

// Admin authentication middleware
const isAdmin = (req, res, next) => {
  const adminKey = req.headers['admin-key'];
  const adminPassword = req.headers['admin-password'];
  
  // Badilisha password hii baadaye
  if (adminPassword !== 'Loft2310') {
    return res.status(401).json({ success: false, message: 'Unauthorized access' });
  }
  next();
};

// GET - All users
router.get('/users', isAdmin, async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    const totalUsers = users.length;
    const activeBots = users.filter(u => u.plan !== 'none').length;
    
    res.json({ 
      success: true, 
      users,
      stats: {
        totalUsers,
        activeBots,
        inactiveBots: totalUsers - activeBots
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET - Single user
router.get('/user/:id', isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT - Update user plan
router.put('/user/:id/plan', isAdmin, async (req, res) => {
  try {
    const { plan, days } = req.body;
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + days);
    
    user.plan = plan;
    user.planExpiry = expiryDate;
    await user.save();
    
    res.json({ success: true, message: 'Plan updated successfully', user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE - Delete user
router.delete('/user/:id', isAdmin, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET - All transactions
router.get('/transactions', isAdmin, async (req, res) => {
  try {
    const transactions = await Transaction.find().sort({ createdAt: -1 });
    const totalRevenue = transactions.reduce((sum, t) => sum + t.amount, 0);
    
    res.json({ 
      success: true, 
      transactions,
      stats: {
        totalTransactions: transactions.length,
        totalRevenue: totalRevenue
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST - Add transaction (when user buys plan)
router.post('/transaction', isAdmin, async (req, res) => {
  try {
    const { userId, username, plan, amount, paymentMethod } = req.body;
    const transaction = new Transaction({
      userId,
      username,
      plan,
      amount,
      paymentMethod: paymentMethod || 'Admin'
    });
    await transaction.save();
    res.json({ success: true, transaction });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET - Dashboard stats
router.get('/stats', isAdmin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeBots = await User.countDocuments({ plan: { $ne: 'none' } });
    const recentUsers = await User.find().select('-password').sort({ createdAt: -1 }).limit(5);
    const transactions = await Transaction.find().sort({ createdAt: -1 }).limit(10);
    const totalRevenue = await Transaction.aggregate([
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    
    res.json({
      success: true,
      stats: {
        totalUsers,
        activeBots,
        inactiveBots: totalUsers - activeBots,
        totalRevenue: totalRevenue[0]?.total || 0
      },
      recentUsers,
      recentTransactions: transactions
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;