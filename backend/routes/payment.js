const express = require('express');
const router = express.Router();
const Flutterwave = require('flutterwave-node-v3');
const User = require('../models/User.js');
const Transaction = require('../models/Transaction.js');
const auth = require('../middleware/auth.js');

// Initialize Flutterwave
const flw = new Flutterwave(
    process.env.FLW_PUBLIC_KEY,
    process.env.FLW_SECRET_KEY
);

// ==================== PLAN DETAILS ====================
const planDetails = {
    '10days': { amount: 20, days: 10, name: 'Starter Plan' },
    '35days': { amount: 45, days: 35, name: 'Basic Plan' },
    '2months': { amount: 100, days: 60, name: 'Pro Plan' },
    '3months': { amount: 150, days: 90, name: 'Business Plan' },
    '6months': { amount: 300, days: 180, name: 'Enterprise Plan' },
    '1year': { amount: 600, days: 365, name: 'Ultimate Plan' }
};

// ==================== NETWORK MAPPING ====================
const networkMap = {
    'mpesa': 'Mpesa',
    'tigo': 'Tigo',
    'airtel': 'Airtel',
    'halopesa': 'Halopesa'
};

// ==================== FORMAT PHONE NUMBER ====================
function formatPhoneNumber(phone, network) {
    // Remove all non-numeric characters
    let cleaned = phone.replace(/[^0-9]/g, '');
    
    // Remove leading zero if present
    if (cleaned.startsWith('0')) {
        cleaned = cleaned.substring(1);
    }
    
    // Remove 255 if already there
    if (cleaned.startsWith('255')) {
        cleaned = cleaned.substring(3);
    }
    
    // Add 255 prefix
    return `255${cleaned}`;
}

// ==================== INITIATE MOBILE MONEY PAYMENT ====================
router.post('/initiate-mobile-money', auth, async (req, res) => {
    try {
        const { plan, phoneNumber, network } = req.body;
        
        console.log('📝 Payment initiation request:', { plan, phoneNumber, network });
        
        // Validate inputs
        if (!plan || !phoneNumber || !network) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: plan, phoneNumber, network'
            });
        }
        
        // Check if plan exists
        const selectedPlan = planDetails[plan];
        if (!selectedPlan) {
            return res.status(400).json({
                success: false,
                message: 'Invalid plan selected'
            });
        }
        
        // Get user
        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        // Format phone number
        const formattedPhone = formatPhoneNumber(phoneNumber, network);
        console.log('📞 Formatted phone:', formattedPhone);
        
        // Check if network is supported
        const flutterwaveNetwork = networkMap[network.toLowerCase()];
        if (!flutterwaveNetwork) {
            return res.status(400).json({
                success: false,
                message: 'Unsupported network. Use: mpesa, tigo, airtel, or halopesa'
            });
        }
        
        // Generate unique transaction reference
        const tx_ref = `LOFT-${Date.now()}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
        
        // Prepare payload for Flutterwave
        const payload = {
            tx_ref: tx_ref,
            amount: selectedPlan.amount,
            currency: 'TZS',
            email: user.email,
            phone_number: formattedPhone,
            fullname: user.username,
            network: flutterwaveNetwork,
            redirect_url: `https://loft-oss.vercel.app/payment-callback.html?plan=${plan}&status=callback`,
            meta: {
                userId: user._id.toString(),
                username: user.username,
                plan: plan,
                planName: selectedPlan.name,
                days: selectedPlan.days
            }
        };
        
        console.log('📤 Flutterwave payload:', payload);
        
        // Initiate mobile money charge
        const response = await flw.MobileMoney.tanzania(payload);
        
        console.log('📥 Flutterwave response:', response);
        
        if (response.status === 'success') {
            // Save transaction as pending
            const transaction = new Transaction({
                userId: user._id,
                username: user.username,
                email: user.email,
                plan: plan,
                planName: selectedPlan.name,
                amount: selectedPlan.amount,
                days: selectedPlan.days,
                paymentMethod: network,
                status: 'pending',
                transactionRef: tx_ref,
                flutterwaveRef: response.data?.flw_ref || null,
                phoneNumber: formattedPhone
            });
            
            await transaction.save();
            console.log('💾 Transaction saved:', tx_ref);
            
            res.json({
                success: true,
                message: `STK Push sent to ${phoneNumber}. Enter your PIN to complete payment.`,
                transactionRef: tx_ref,
                flutterwaveRef: response.data?.flw_ref,
                status: response.data?.status
            });
        } else {
            console.error('❌ Flutterwave initiation failed:', response);
            res.status(400).json({
                success: false,
                message: response.message || 'Payment initiation failed. Please try again.'
            });
        }
        
    } catch (error) {
        console.error('❌ Payment initiation error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error. Please try again.'
        });
    }
});

// ==================== WEBHOOK (Flutterwave inaita hii baada ya payment) ====================
router.post('/webhook', async (req, res) => {
    try {
        const event = req.body;
        
        console.log('🔔 Webhook received:', JSON.stringify(event, null, 2));
        
        // Verify webhook signature (security)
        const signature = req.headers['verif-hash'];
        if (signature !== process.env.FLW_SECRET_HASH) {
            console.log('⚠️ Invalid webhook signature');
            return res.status(401).json({ status: 'unauthorized' });
        }
        
        // Handle different event types
        if (event.event === 'charge.completed') {
            const data = event.data;
            
            if (data.status === 'successful') {
                const { tx_ref, flw_ref, amount, currency, customer } = data;
                
                console.log('✅ Payment successful for transaction:', tx_ref);
                
                // Find transaction by reference
                const transaction = await Transaction.findOne({ transactionRef: tx_ref });
                
                if (!transaction) {
                    console.log('❌ Transaction not found:', tx_ref);
                    return res.status(404).json({ status: 'transaction_not_found' });
                }
                
                if (transaction.status === 'completed') {
                    console.log('⚠️ Transaction already processed:', tx_ref);
                    return res.json({ status: 'already_processed' });
                }
                
                // Update transaction
                transaction.status = 'completed';
                transaction.flutterwaveRef = flw_ref;
                transaction.completedAt = new Date();
                transaction.paymentData = data;
                await transaction.save();
                
                console.log('💾 Transaction updated:', tx_ref);
                
                // Activate user's plan
                const user = await User.findById(transaction.userId);
                if (user) {
                    const expiryDate = new Date();
                    expiryDate.setDate(expiryDate.getDate() + transaction.days);
                    
                    user.plan = transaction.plan;
                    user.planExpiry = expiryDate;
                    await user.save();
                    
                    console.log('🎉 User plan activated:', user.username, 'Plan:', transaction.plan);
                } else {
                    console.log('❌ User not found:', transaction.userId);
                }
            } else {
                console.log('❌ Payment failed:', data.status);
                
                // Update transaction as failed
                const transaction = await Transaction.findOne({ transactionRef: event.data?.tx_ref });
                if (transaction && transaction.status === 'pending') {
                    transaction.status = 'failed';
                    transaction.failedAt = new Date();
                    transaction.failureReason = event.data?.processor_response || 'Payment failed';
                    await transaction.save();
                }
            }
        }
        
        res.json({ status: 'ok' });
        
    } catch (error) {
        console.error('❌ Webhook error:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// ==================== VERIFY TRANSACTION STATUS ====================
router.get('/verify/:transactionRef', auth, async (req, res) => {
    try {
        const { transactionRef } = req.params;
        
        console.log('🔍 Verifying transaction:', transactionRef);
        
        const transaction = await Transaction.findOne({ transactionRef });
        
        if (!transaction) {
            return res.status(404).json({
                success: false,
                message: 'Transaction not found'
            });
        }
        
        // Also verify with Flutterwave if still pending
        if (transaction.status === 'pending') {
            try {
                const response = await flw.Transaction.verify({ id: transaction.flutterwaveRef });
                if (response.data && response.data.status === 'successful') {
                    transaction.status = 'completed';
                    transaction.completedAt = new Date();
                    await transaction.save();
                    
                    // Activate user plan
                    const user = await User.findById(transaction.userId);
                    if (user) {
                        const expiryDate = new Date();
                        expiryDate.setDate(expiryDate.getDate() + transaction.days);
                        user.plan = transaction.plan;
                        user.planExpiry = expiryDate;
                        await user.save();
                    }
                }
            } catch (err) {
                console.log('Flutterwave verify error:', err.message);
            }
        }
        
        res.json({
            success: true,
            status: transaction.status,
            transaction: {
                plan: transaction.plan,
                amount: transaction.amount,
                paymentMethod: transaction.paymentMethod,
                createdAt: transaction.createdAt,
                completedAt: transaction.completedAt
            }
        });
        
    } catch (error) {
        console.error('❌ Verification error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==================== GET USER TRANSACTIONS ====================
router.get('/my-transactions', auth, async (req, res) => {
    try {
        const transactions = await Transaction.find({ userId: req.userId })
            .sort({ createdAt: -1 })
            .limit(20);
        
        res.json({
            success: true,
            transactions: transactions.map(t => ({
                plan: t.plan,
                amount: t.amount,
                status: t.status,
                paymentMethod: t.paymentMethod,
                createdAt: t.createdAt,
                completedAt: t.completedAt
            }))
        });
        
    } catch (error) {
        console.error('❌ Error fetching transactions:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==================== GET ALL TRANSACTIONS (ADMIN ONLY) ====================
router.get('/admin/all-transactions', auth, async (req, res) => {
    try {
        // Check if user is admin
        const user = await User.findById(req.userId);
        if (!user || !user.isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }
        
        const transactions = await Transaction.find()
            .sort({ createdAt: -1 })
            .limit(100);
        
        const stats = {
            totalTransactions: transactions.length,
            totalRevenue: transactions.reduce((sum, t) => sum + (t.status === 'completed' ? t.amount : 0), 0),
            pendingCount: transactions.filter(t => t.status === 'pending').length,
            completedCount: transactions.filter(t => t.status === 'completed').length,
            failedCount: transactions.filter(t => t.status === 'failed').length
        };
        
        res.json({
            success: true,
            stats,
            transactions
        });
        
    } catch (error) {
        console.error('❌ Error fetching admin transactions:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==================== HEALTH CHECK ====================
router.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'Flutterwave Payment Gateway',
        supportedNetworks: ['M-Pesa', 'Tigo Pesa', 'Airtel Money', 'Halopesa'],
        currency: 'TZS'
    });
});

module.exports = router;