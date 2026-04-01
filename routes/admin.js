const express = require('express');
const router = express.Router();
const multer = require('multer');

// Memory storage — pass buffer directly to Supabase
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB per file
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only image files are allowed'), false);
    }
});

// Auth middleware
const requireAdmin = (req, res, next) => {
    if (!req.session.user || !req.session.isAdmin) return res.redirect('/auth/login');
    next();
};

// Helper: upload one file to Supabase Storage, return public URL
async function uploadToStorage(supabaseAdmin, file) {
    const ext      = file.originalname.split('.').pop();
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await supabaseAdmin.storage
        .from('product-images')
        .upload(filename, file.buffer, { contentType: file.mimetype, upsert: false });

    if (error) throw error;

    const { data } = supabaseAdmin.storage
        .from('product-images')
        .getPublicUrl(filename);

    return data.publicUrl;
}

// Helper: render dashboard with error/success
async function renderDashboard(req, res, { error = null, success = null } = {}) {
    const { data: products } = await req.supabase
        .from('products')
        .select('*, product_images(*)')
        .order('created_at', { ascending: false });

    res.render('admin/dashboard', {
        products: products || [],
        user: req.session.user,
        currentPage: 'admin',
        error,
        success
    });
}

// ── DASHBOARD ──
router.get('/dashboard', requireAdmin, async (req, res) => {
    try {
        await renderDashboard(req, res);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// ── ADD PRODUCT (multiple images) ──
router.post('/products', requireAdmin, upload.array('images', 10), async (req, res) => {
    const { name, description, price, category } = req.body;

    try {
        if (!req.files || req.files.length === 0) {
            return renderDashboard(req, res, { error: 'Please select at least one image.' });
        }

        // Upload all images to Supabase Storage
        const urls = await Promise.all(req.files.map(f => uploadToStorage(req.supabaseAdmin, f)));
        const primaryUrl = urls[0]; // first image = primary

        // Insert product (primary image saved in image_url for listing pages)
        const { data: inserted, error: prodErr } = await req.supabaseAdmin
            .from('products')
            .insert([{ name, description, price, category, image_url: primaryUrl, admin_id: req.session.user.id }])
            .select()
            .single();

        if (prodErr) throw prodErr;

        // Insert all images into product_images table
        const imageRows = urls.map((url, idx) => ({
            product_id: inserted.id,
            image_url:  url,
            is_primary: idx === 0,
            sort_order: idx
        }));

        const { error: imgErr } = await req.supabaseAdmin
            .from('product_images')
            .insert(imageRows);

        if (imgErr) throw imgErr;

        await renderDashboard(req, res, { success: `"${name}" added with ${urls.length} image(s)!` });

    } catch (err) {
        console.error('Add product error:', err);
        await renderDashboard(req, res, { error: err.message || 'Error adding product.' });
    }
});

// ── DELETE PRODUCT ──
router.delete('/products/:id', requireAdmin, async (req, res) => {
    try {
        await req.supabaseAdmin.from('reviews').delete().eq('product_id', req.params.id);
        await req.supabaseAdmin.from('product_images').delete().eq('product_id', req.params.id);
        const { error } = await req.supabaseAdmin.from('products').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Delete failed' });
    }
});

// ── DELETE SINGLE IMAGE ──
router.delete('/products/:productId/images/:imageId', requireAdmin, async (req, res) => {
    try {
        const { data: img } = await req.supabaseAdmin
            .from('product_images')
            .select('*')
            .eq('id', req.params.imageId)
            .single();

        if (!img) return res.status(404).json({ error: 'Image not found' });

        await req.supabaseAdmin.from('product_images').delete().eq('id', req.params.imageId);

        // If this was the primary image, promote the next one
        if (img.is_primary) {
            const { data: next } = await req.supabaseAdmin
                .from('product_images')
                .select('*')
                .eq('product_id', req.params.productId)
                .order('sort_order')
                .limit(1)
                .single();

            if (next) {
                await req.supabaseAdmin.from('product_images')
                    .update({ is_primary: true }).eq('id', next.id);
                await req.supabaseAdmin.from('products')
                    .update({ image_url: next.image_url }).eq('id', req.params.productId);
            }
        }

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete image' });
    }
});

// ── CATEGORY MANAGEMENT ──
router.post('/categories', requireAdmin, async (req, res) => {
    const { name } = req.body;
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    try {
        await req.supabaseAdmin.from('categories').insert([{ name: name.trim(), slug }]);
        res.redirect('/admin/dashboard');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/dashboard');
    }
});

router.delete('/categories/:id', requireAdmin, async (req, res) => {
    try {
        const { error } = await req.supabaseAdmin.from('categories').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete category' });
    }
});

module.exports = router;
