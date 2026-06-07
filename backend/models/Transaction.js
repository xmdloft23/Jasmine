const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  username: { type: String, required: true },
  plan: { type: String, required: true },
  amount: { type: Number, required: true },
  paymentMethod: { type: String, default: 'PayPal' },
  status: { type: String, default: 'completed' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Transaction', TransactionSchema);