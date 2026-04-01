const express = require('express');
const router = express.Router();

// Check if user is admin (middleware)
const requireAdmin = async (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    
    // Check if user has admin role
    const { data: userRole } = await req.supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', req.session.user.id)
        .single();
    
    if (!userRole || userRole.role !== 'admin') {
        return res.status(403).send('Access denied. Admin privileges required.');
    }
    
    req.session.isAdmin = true;
    next();
};

// Login page
router.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/admin/dashboard');
    }
    res.render('auth/login', { error: null });
});

// Handle login with Supabase Auth
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    
    try {
        const { data, error } = await req.supabase.auth.signInWithPassword({
            email,
            password
        });
        
        if (error) throw error;
        
        // Check if user has admin role
        const { data: userRole, error: roleError } = await req.supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', data.user.id)
            .single();
        
        if (roleError || !userRole || userRole.role !== 'admin') {
            // Sign out if not admin
            await req.supabase.auth.signOut();
            return res.render('auth/login', { 
                error: 'You do not have admin privileges' 
            });
        }
        
        // Store user in session
        req.session.user = {
            id: data.user.id,
            email: data.user.email,
            role: userRole.role
        };
        req.session.isAdmin = true;
        
        res.redirect('/admin/dashboard');
    } catch (error) {
        console.error('Login error:', error);
        res.render('auth/login', { 
            error: 'Invalid email or password' 
        });
    }
});

// Register page (optional - for adding new admins)
router.get('/register', async (req, res) => {
    // Only allow existing admins to create new admin accounts
    if (!req.session.isAdmin) {
        return res.redirect('/auth/login');
    }
    res.render('auth/register', { error: null, success: null });
});

// Handle registration (admin only)
router.post('/register', requireAdmin, async (req, res) => {
    const { email, password, role = 'admin' } = req.body;
    
    try {
        // Create user in Supabase Auth
        const { data: authData, error: authError } = await req.supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true // Auto-confirm email
        });
        
        if (authError) throw authError;
        
        // Assign role in user_roles table
        const { error: roleError } = await req.supabase
            .from('user_roles')
            .insert({
                user_id: authData.user.id,
                role: role
            });
        
        if (roleError) throw roleError;
        
        res.render('auth/register', {
            success: `User ${email} created successfully!`,
            error: null
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.render('auth/register', {
            error: error.message || 'Registration failed',
            success: null
        });
    }
});

// Logout
router.get('/logout', async (req, res) => {
    await req.supabase.auth.signOut();
    req.session.destroy();
    res.redirect('/');
});

// Password reset request
router.get('/forgot-password', (req, res) => {
    res.render('auth/forgot-password', { error: null, success: null });
});

// Handle password reset request
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    
    try {
        const { error } = await req.supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${req.protocol}://${req.get('host')}/auth/reset-password`
        });
        
        if (error) throw error;
        
        res.render('auth/forgot-password', {
            success: 'Password reset email sent! Check your inbox.',
            error: null
        });
    } catch (error) {
        console.error('Password reset error:', error);
        res.render('auth/forgot-password', {
            error: 'Failed to send reset email',
            success: null
        });
    }
});

// Reset password page
router.get('/reset-password', (req, res) => {
    res.render('auth/reset-password', { error: null });
});

// Handle password update
router.post('/reset-password', async (req, res) => {
    const { password } = req.body;
    
    try {
        const { error } = await req.supabase.auth.updateUser({
            password: password
        });
        
        if (error) throw error;
        
        res.redirect('/auth/login');
    } catch (error) {
        console.error('Password update error:', error);
        res.render('auth/reset-password', {
            error: 'Failed to update password'
        });
    }
});

module.exports = router;