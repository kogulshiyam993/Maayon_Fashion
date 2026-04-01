 const express = require('express');
const router = express.Router();

// Home page
router.get('/', async (req, res) => {
    try {
        const { data: fashionProducts } = await req.supabase
            .from('products')
            .select('*')
            .eq('category', 'fashion')
            .limit(6);

        const { data: stationeryProducts } = await req.supabase
            .from('products')
            .select('*')
            .eq('category', 'stationery')
            .limit(6);

        res.render('index', {
            fashionProducts: fashionProducts || [],
            stationeryProducts: stationeryProducts || [],
            currentPage: 'home'
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
});

// Products page
router.get('/products/:category', async (req, res) => {
    try {
        const category = req.params.category;

        // Validate category dynamically from DB
        const { data: catRow } = await req.supabase
            .from('categories')
            .select('name, slug')
            .eq('slug', category)
            .single();

        if (!catRow) {
            return res.status(404).send('Category not found');
        }

        const { data: products } = await req.supabase
            .from('products')
            .select('*')
            .eq('category', category)
            .order('created_at', { ascending: false });

        res.render('products', {
            products: products || [],
            category,
            categoryName: catRow.name,
            currentPage: category
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
});

// Product detail page
router.get('/product/:id', async (req, res) => {
    try {
        const { data: product } = await req.supabase
            .from('products')
            .select('*')
            .eq('id', req.params.id)
            .single();
            
        const { data: reviews } = await req.supabase
            .from('reviews')
            .select('*')
            .eq('product_id', req.params.id)
            .order('created_at', { ascending: false });

        const { data: images } = await req.supabase
            .from('product_images')
            .select('*')
            .eq('product_id', req.params.id)
            .order('sort_order');

        if (!product) {
            return res.status(404).send('Product not found');
        }

        // Fallback: if no rows in product_images, use product.image_url
        const productImages = (images && images.length > 0)
            ? images
            : [{ id: null, image_url: product.image_url, is_primary: true }];

        res.render('product-detail', { product, reviews: reviews || [], images: productImages });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
});

// About page
router.get('/about', (req, res) => {
    res.render('about', { currentPage: 'about' });
});

// Reviews/Wall of Love page
router.get('/reviews', async (req, res) => {
    try {
        const { data: allReviews } = await req.supabase
            .from('reviews')
            .select('*, products(name)')
            .order('created_at', { ascending: false });

        res.render('reviews', { reviews: allReviews || [], currentPage: 'reviews' });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
