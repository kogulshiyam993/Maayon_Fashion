 const express = require('express');
const router = express.Router();

// Add review
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
router.delete('/:id', async (req, res) => {
    try {
        const { error } = await req.supabase
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
