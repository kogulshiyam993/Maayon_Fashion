const express = require('express');
const router = express.Router();

// Middleware: only admins can delete reviews
const requireAdmin = (req, res, next) => {
    if (!req.session.user || !req.session.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

// Add review (public)
router.post('/add', async (req, res) => {
    const { product_id, customer_name, rating, comment } = req.body;
    try {
        const { error } = await req.supabase
            .from('reviews')
            .insert([{ product_id, customer_name, rating, comment }]);
        if (error) throw error;
        res.redirect(`/product/${product_id}`);
    } catch (error) {
        console.error(error);
        res.status(500).send('Error adding review');
    }
});

// Delete review (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        const { error } = await req.supabaseAdmin
            .from('reviews')
            .delete()
            .eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Delete failed' });
    }
});

module.exports = router;
