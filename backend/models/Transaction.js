const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    username: { type: String, required: true },
    email: { type: String },
    plan: { type: String, required: true },
    planName: { type: String },
    amount: { type: Number, required: true },
    days: { type: Number },
    paymentMethod: { type: String, required: true },
    phoneNumber: { type: String },
    status: { 
        type: String, 
        default: 'pending', 
        enum: ['pending', 'completed', 'failed', 'cancelled', 'refunded'] 
    },
    transactionRef: { type: String, unique: true },
    flutterwaveRef: { type: String },
    paymentData: { type: Object },
    completedAt: { type: Date },
    failedAt: { type: Date },
    failureReason: { type: String },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Transaction', TransactionSchema);