const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
app.use(cors());

// 1. Tăng giới hạn Payload lên 50MB để hỗ trợ lưu ảnh Avatar (chuỗi Base64) từ trang Profile
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// 2. Mở lại cấp phát ảnh tĩnh để Frontend hiển thị được ảnh thực tế
app.use('/images', express.static(path.join(__dirname, 'images')));

const SECRET_KEY = 'chuoi_bao_mat_cua_candy_shop_luxury';

// 2. KẾT NỐI DATABASE
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '123456', // Sếp đổi thành '' nếu MySQL không có mật khẩu
    database: 'candyshop_db'
});

db.connect(err => {
    if (err) console.log('❌ Lỗi kết nối Database:', err.message);
    else {
        console.log('✅ Kết nối Database Luxury thành công - DREAM Store sẵn sàng!');
        // Bảng và dữ liệu mẫu hiện tại đã được quản lý bên ngoài qua file database.sql.
        // Điều này giúp file Backend nhẹ, sạch sẽ và tối ưu hiệu năng khởi động đáng kể!
        
        // Tự động mở rộng sức chứa của cột Avatar để lưu ảnh dung lượng cao không bị mất
        db.query("ALTER TABLE users MODIFY COLUMN avatar LONGTEXT", () => {});
        db.query("ALTER TABLE users ADD COLUMN address TEXT", () => {});
        db.query("ALTER TABLE users ADD COLUMN phone VARCHAR(20)", () => {});
        db.query("ALTER TABLE users ADD COLUMN dob DATE", () => {});
        db.query("ALTER TABLE users ADD COLUMN gender VARCHAR(10) DEFAULT 'Khác'", () => {});
        
        // Tự động đổi tên và icon danh mục trong Database theo yêu cầu mới
        db.query("UPDATE danhmuc SET category_name = 'Bánh Ngọt', icon = '🍰' WHERE category_name = 'Bánh Kem'", () => {});
        db.query("UPDATE danhmuc SET category_name = 'Bánh Mì', icon = '🥐' WHERE category_name = 'Bánh Pastry'", () => {});
        db.query("UPDATE danhmuc SET category_name = 'Kẹo', icon = '🍬' WHERE category_name = 'Kẹo & Chocolate'", () => {});
        db.query("UPDATE danhmuc SET category_name = 'Cookie', icon = '🍪' WHERE category_name = 'Bánh Macaron'", () => {});
    }
});

// 3. MIDDLEWARE XÁC THỰC (Lấy thông tin từ Token)
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ message: 'Sếp chưa đăng nhập!' });

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ message: 'Token hết hạn!' });
        req.user = user; // Chứa id (user_id) và role
        next();
    });
}

// 4. API LẤY SẢN PHẨM (Đã fix đường dẫn ảnh chuẩn)
app.get('/api/products', (req, res) => {
    const query = `
      SELECT p.*, d.category_name, h.brand_name 
      FROM sanpham p 
      LEFT JOIN danhmuc d ON p.category_id = d.category_id 
      LEFT JOIN hangsanxuat h ON p.brand_id = h.brand_id
    `; 
    db.query(query, (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // Map lại link ảnh: http://localhost:3000/images/tiramisu.jpg
        const products = result.map(p => ({
            ...p,
            image: p.image ? (p.image.startsWith('http') ? p.image : `http://localhost:3000/images/${p.image}`) : 'https://via.placeholder.com/150'
        }));
        res.json(products);
    });
});

// API LẤY TIN TỨC (PUBLIC - CHỈ LẤY BÀI ĐÃ ĐƯỢC DUYỆT)
app.get('/api/articles', (req, res) => {
    const query = `
        SELECT a.article_id as id, a.title, a.excerpt, a.image, a.created_at as date, a.category, COALESCE(u.full_name, 'Admin') as author
        FROM articles a
        LEFT JOIN users u ON a.author_id = u.user_id
        WHERE a.status = 'published'
        ORDER BY a.created_at DESC
    `;
    db.query(query, (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        // Map lại link ảnh
        const articles = result.map(p => ({ ...p, image: p.image ? (p.image.startsWith('http') ? p.image : `http://localhost:3000/images/${p.image}`) : 'https://via.placeholder.com/300' }));
        res.json(articles);
    });
});

// 5. API ĐĂNG KÝ (Mật khẩu chữ thường)
app.post('/api/auth/register', (req, res) => {
    const { fullname, email, password } = req.body;
    db.query('INSERT INTO users (full_name, email, password_hash, role_id) VALUES (?, ?, ?, 3)', 
    [fullname, email, password], (err) => {
        if (err) return res.status(400).json({ message: 'Email đã tồn tại hoặc lỗi dữ liệu!' });
        res.json({ message: 'Đăng ký thành công!' });
    });
});

// 5.5. API QUÊN MẬT KHẨU
app.post('/api/auth/forgot-password', (req, res) => {
    const { email } = req.body;
    db.query("SELECT * FROM users WHERE email = ?", [email], (err, results) => {
        if (results && results.length > 0) {
            res.json({ message: "Đã gửi hướng dẫn khôi phục mật khẩu vào email của bạn!" });
        } else {
            res.status(404).json({ message: "Không tìm thấy tài khoản với email này!" });
        }
    });
});

// 5.6. API ĐĂNG NHẬP SOCIAL (Google / Facebook)
app.post('/api/auth/social-login', (req, res) => {
    const { email, fullname, provider } = req.body;
    db.query("SELECT * FROM users WHERE email = ?", [email], (err, results) => {
        if (results && results.length > 0) {
            const user = results[0];
            const token = jwt.sign({ id: user.user_id, role: user.role_id }, SECRET_KEY, { expiresIn: '1d' });
            const roleName = user.role_id === 1 ? 'admin' : (user.role_id === 2 ? 'staff' : 'user');
            res.json({ 
                message: "Đăng nhập thành công!", token, user_id: user.user_id,
                fullname: user.full_name, email: user.email, role_id: user.role_id, role: roleName
            });
        } else {
            db.query('INSERT INTO users (full_name, email, password_hash, role_id) VALUES (?, ?, ?, 3)', 
            [fullname, email, 'social_login_no_password'], (err, insertResult) => {
                if (err) return res.status(500).json({ message: 'Lỗi tạo tài khoản!' });
                const newUserId = insertResult.insertId;
                const token = jwt.sign({ id: newUserId, role: 3 }, SECRET_KEY, { expiresIn: '1d' });
                res.json({ 
                    message: "Đăng nhập và tạo tài khoản thành công!", token, user_id: newUserId,
                    fullname: fullname, email: email, role_id: 3, role: 'user'
                });
            });
        }
    });
});

// 6. API ĐĂNG NHẬP (Khớp với user sếp vừa Insert)
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    db.query("SELECT * FROM users WHERE email = ? AND password_hash = ?", [email, password], (err, results) => {
        if (results && results.length > 0) {
            const user = results[0];
            const token = jwt.sign({ id: user.user_id, role: user.role_id }, SECRET_KEY, { expiresIn: '1d' });
            const roleName = user.role_id === 1 ? 'admin' : (user.role_id === 2 ? 'staff' : 'user');
            res.json({ 
                message: "Đăng nhập thành công!", 
                token, 
                user_id: user.user_id,
                fullname: user.full_name, 
                email: user.email,
                role_id: user.role_id,
                role: roleName
            });
        } else {
            res.status(401).json({ message: "Sai email hoặc mật khẩu sếp ơi!" });
        }
    });
});

// 7. API GIỎ HÀNG
app.get('/api/cart', authenticateToken, (req, res) => {
    const query = `
        SELECT c.cart_id, c.product_id, p.product_name, p.price, p.image, c.quantity 
        FROM cart c JOIN sanpham p ON c.product_id = p.product_id 
        WHERE c.user_id = ?`;
    db.query(query, [req.user.id], (err, result) => {
        if (err) return res.status(500).json([]);
        const cartItems = (result || []).map(item => ({
            ...item,
            image: item.image ? (item.image.startsWith('http') ? item.image : `http://localhost:3000/images/${item.image}`) : ''
        }));
        res.json(cartItems);
    });
});

app.post('/api/cart', authenticateToken, (req, res) => {
    const { product_id, quantity } = req.body;
    // Sử dụng ON DUPLICATE KEY UPDATE dựa trên UNIQUE KEY (user_id, product_id) sếp đã tạo
    db.query('INSERT INTO cart (user_id, product_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + ?', 
    [req.user.id, product_id, quantity, quantity], (err) => {
        if (err) return res.status(500).json({ message: "Lỗi thêm giỏ!" });
        res.json({ message: 'Đã thêm vào giỏ thành công!' });
    });
});

// API XÓA SẢN PHẨM KHỎI GIỎ HÀNG
app.delete('/api/cart/:id', authenticateToken, (req, res) => {
    const cart_id = req.params.id;
    db.query('DELETE FROM cart WHERE cart_id = ? AND user_id = ?', [cart_id, req.user.id], (err, result) => {
        if (err) return res.status(500).json({ message: "Lỗi xóa sản phẩm khỏi giỏ hàng" });
        res.json({ message: 'Đã xóa sản phẩm khỏi giỏ hàng!' });
    });
});

// 7.5 API LẤY THÔNG TIN CÁ NHÂN
app.get('/api/users/profile', authenticateToken, (req, res) => {
    db.query('SELECT full_name, email, avatar, address, phone, dob, gender, role_id FROM users WHERE user_id = ?', [req.user.id], (err, results) => {
        if (err) return res.status(500).json({ message: "Lỗi lấy thông tin" });
        if (results.length > 0) {
            const userProfile = results[0];
            db.query("SELECT COUNT(*) as count FROM orders WHERE user_id = ? AND status != 'Đã hủy'", [req.user.id], (err, orderRes) => {
                userProfile.is_first_order = (!err && orderRes[0].count === 0);
                res.json(userProfile);
            });
        } else res.status(404).json({ message: "Không tìm thấy người dùng" });
    });
});

// 7.6 API CẬP NHẬT THÔNG TIN CÁ NHÂN
app.put('/api/users/profile', authenticateToken, (req, res) => {
    const { full_name, avatar, address, phone, dob, gender } = req.body;
    const safeDob = dob ? dob : null; // Chuyển thành null nếu người dùng không nhập ngày sinh
    db.query('UPDATE users SET full_name = ?, avatar = ?, address = ?, phone = ?, dob = ?, gender = ? WHERE user_id = ?', 
    [full_name, avatar, address, phone, safeDob, gender, req.user.id], (err) => {
            if (err) {
                console.error("🚨 LỖI CẬP NHẬT PROFILE:", err.message);
                return res.status(500).json({ message: "Lỗi DB: " + err.message });
            }
        res.json({ message: 'Cập nhật hồ sơ thành công!' });
    });
});

// 7.7 API ĐỔI MẬT KHẨU
app.put('/api/users/change-password', authenticateToken, (req, res) => {
    const { oldPassword, newPassword } = req.body;
    db.query('SELECT password_hash FROM users WHERE user_id = ?', [req.user.id], (err, results) => {
        if (err || results.length === 0) return res.status(500).json({ message: "Lỗi hệ thống" });
        if (results[0].password_hash !== oldPassword) return res.status(400).json({ message: "Mật khẩu cũ không chính xác!" });
        
        db.query('UPDATE users SET password_hash = ? WHERE user_id = ?', [newPassword, req.user.id], (err) => {
            if (err) return res.status(500).json({ message: "Lỗi cập nhật mật khẩu" });
            res.json({ message: 'Đổi mật khẩu thành công!' });
        });
    });
});

// API CẬP NHẬT SỐ LƯỢNG GIỎ HÀNG
app.put('/api/cart/:id', authenticateToken, (req, res) => {
    const cart_id = req.params.id;
    const { quantity } = req.body;
    db.query('UPDATE cart SET quantity = ? WHERE cart_id = ? AND user_id = ?', [quantity, cart_id, req.user.id], (err) => {
        if (err) return res.status(500).json({ message: "Lỗi cập nhật số lượng" });
        res.json({ message: 'Cập nhật thành công!' });
    });
});

// 8. API THANH TOÁN (Checkout)
app.post('/api/checkout', authenticateToken, (req, res) => {
    // 🚀 Bơm sẵn dữ liệu mặc định nếu Frontend chưa có form nhập liệu
    let { customer_name, phone, address, note } = req.body;
    customer_name = customer_name || "Khách Hàng Trực Tuyến";
    phone = phone || "0123456789";
    address = address || "Nhận tại cửa hàng DREAM Store";
    note = note || "";

    const queryItems = `SELECT c.product_id, c.quantity, p.price FROM cart c JOIN sanpham p ON c.product_id = p.product_id WHERE c.user_id = ?`;
    
    db.query(queryItems, [req.user.id], (err, cartItems) => {
        if (err || !cartItems || cartItems.length === 0) return res.status(400).json({ message: 'Giỏ hàng trống!' });
        
        // Kiểm tra xem khách hàng đã có đơn nào chưa (không tính đơn đã hủy)
        db.query("SELECT COUNT(*) as orderCount FROM orders WHERE user_id = ? AND status != 'Đã hủy'", [req.user.id], (err, orderRes) => {
            const isFirstOrder = (!err && orderRes[0].orderCount === 0);
            
            let totalAmount = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            if (isFirstOrder) totalAmount = totalAmount * 0.8; // Giảm 20% cho đơn đầu tiên
            
            db.query('INSERT INTO orders (user_id, customer_name, phone, shipping_address, total_price, note) VALUES (?, ?, ?, ?, ?, ?)', 
            [req.user.id, customer_name, phone, address, totalAmount, note], (err, orderResult) => {
            if (err) {
                console.error("🚨 LỖI TẠO ĐƠN HÀNG (SQL):", err.message); // Báo lỗi đỏ ra CMD
                return res.status(500).json({ message: "Lỗi DB: " + err.message }); // Báo thẳng ra giao diện web
            }
            
            const order_id = orderResult.insertId;
            const orderDetailsData = cartItems.map(item => [order_id, item.product_id, item.quantity, item.price]);
            
            db.query('INSERT INTO order_details (order_id, product_id, quantity, price) VALUES ?', [orderDetailsData], (err) => {
                if (err) {
                    console.error("🚨 LỖI LƯU CHI TIẾT ĐƠN (SQL):", err.message);
                    return res.status(500).json({ message: "Lỗi lưu chi tiết đơn hàng: " + err.message });
                }
                
                // 1. TRỪ TỒN KHO SẢN PHẨM KHI ĐẶT HÀNG THÀNH CÔNG
                cartItems.forEach(item => {
                    // Dùng GREATEST để đảm bảo tồn kho không bao giờ bị âm
                    db.query('UPDATE sanpham SET stock = GREATEST(stock - ?, 0) WHERE product_id = ?', [item.quantity, item.product_id], (err) => {
                        if (err) console.error("Lỗi trừ tồn kho:", err.message);
                    });
                });
                
                // 2. XÓA SẢN PHẨM KHỎI GIỎ HÀNG SAU KHI ĐẶT
                db.query('DELETE FROM cart WHERE user_id = ?', [req.user.id], () => {
                    res.json({ message: 'Thanh toán thành công! Đơn hàng đang được chờ duyệt.', order_id });
                });
            });
        });
        });
    });
});

// 8.5. API LẤY ĐƠN HÀNG CỦA KHÁCH HÀNG (Tracking)
app.get('/api/orders/my-orders', authenticateToken, (req, res) => {
    const queryOrders = `SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC`;
    db.query(queryOrders, [req.user.id], (err, orders) => {
        if (err) return res.status(500).json([]);
        if (orders.length === 0) return res.json([]);

        const orderIds = orders.map(o => o.order_id);
        const queryDetails = `
            SELECT od.order_id, od.quantity, od.price, p.product_name, p.image 
            FROM order_details od 
            JOIN sanpham p ON od.product_id = p.product_id 
            WHERE od.order_id IN (?)
        `;
        db.query(queryDetails, [orderIds], (err, details) => {
            if (err) return res.status(500).json(orders); // Trả về đơn hàng không có chi tiết nếu lỗi
            
            const ordersWithDetails = orders.map(order => ({
                ...order,
                items: details
                    .filter(d => d.order_id === order.order_id)
                    .map(d => ({
                        ...d,
                        image: d.image ? (d.image.startsWith('http') ? d.image : `http://localhost:3000/images/${d.image}`) : 'https://via.placeholder.com/150'
                    }))
            }));
            res.json(ordersWithDetails);
        });
    });
});

// 8.6. API HỦY ĐƠN HÀNG TỪ PHÍA KHÁCH HÀNG
app.put('/api/orders/:id/cancel', authenticateToken, (req, res) => {
    const orderId = req.params.id;
    
    // Kiểm tra xem đơn hàng có thuộc về user đang đăng nhập không
    db.query('SELECT status FROM orders WHERE order_id = ? AND user_id = ?', [orderId, req.user.id], (err, results) => {
        if (err || results.length === 0) return res.status(404).json({ message: "Không tìm thấy đơn hàng!" });
        
        const status = results[0].status;
        if (status === 'Đang giao hàng' || status === 'Thành công') {
            return res.status(400).json({ message: "Đơn hàng đang được giao, không thể hủy!" });
        }

        db.query('UPDATE orders SET status = ? WHERE order_id = ?', ['Đã hủy', orderId], (err) => {
            if (err) return res.status(500).json({ message: "Lỗi hủy đơn hàng" });
            
            // HOÀN LẠI TỒN KHO NẾU KHÁCH HÀNG TỰ HỦY ĐƠN
            db.query('SELECT product_id, quantity FROM order_details WHERE order_id = ?', [orderId], (err, items) => {
                if (!err && items) {
                    items.forEach(item => {
                        db.query('UPDATE sanpham SET stock = stock + ? WHERE product_id = ?', [item.quantity, item.product_id]);
                    });
                }
            });

            res.json({ message: 'Hủy đơn hàng thành công!' });
        });
    });
});

// 9. API ORDER CHO ADMIN & NHÂN VIÊN
app.get('/api/orders', authenticateToken, (req, res) => {
    if (req.user.role != 1 && req.user.role != 2) return res.status(403).json({ message: 'Cấm truy cập! Chỉ Admin/Nhân viên mới vào được đây.' });
    const queryOrders = `SELECT * FROM orders ORDER BY created_at DESC`;
    db.query(queryOrders, (err, orders) => {
        if (err) return res.status(500).json([]);
        if (orders.length === 0) return res.json([]);

        const orderIds = orders.map(o => o.order_id);
        const queryDetails = `
            SELECT od.order_id, od.quantity, od.price, p.product_name, p.image 
            FROM order_details od 
            JOIN sanpham p ON od.product_id = p.product_id 
            WHERE od.order_id IN (?)
        `;
        db.query(queryDetails, [orderIds], (err, details) => {
            if (err) return res.status(500).json(orders);
            
            const ordersWithDetails = orders.map(order => ({
                ...order,
                fullname: order.customer_name,
                address: order.shipping_address,
                total_price: order.total_amount || order.total_price, // Đảm bảo lấy đúng trường tiền
                items: details
                    .filter(d => d.order_id === order.order_id)
                    .map(d => ({
                        ...d,
                        image: d.image ? (d.image.startsWith('http') ? d.image : `http://localhost:3000/images/${d.image}`) : 'https://via.placeholder.com/150'
                    }))
            }));
            res.json(ordersWithDetails);
        });
    });
});

// 10. API QUẢN TRỊ cập nhật trạng thái đơn hàng
app.put('/api/admin/orders/:id/status', authenticateToken, (req, res) => {
    if (req.user.role != 1 && req.user.role != 2) return res.status(403).json({ message: 'Quyền truy cập bị từ chối!' });
    const { status } = req.body;
    db.query('UPDATE orders SET status = ? WHERE order_id = ?', [status, req.params.id], (err) => {
        if (err) {
            console.error("🚨 LỖI CẬP NHẬT TRẠNG THÁI ĐƠN HÀNG:", err.message);
            return res.status(500).json({ message: "Lỗi Server/DB: " + err.message });
        }
        
        // HOÀN LẠI TỒN KHO NẾU ADMIN/NHÂN VIÊN HỦY ĐƠN KHÁCH HÀNG
        if (status === 'Đã hủy') {
            db.query('SELECT product_id, quantity FROM order_details WHERE order_id = ?', [req.params.id], (err, items) => {
                if (!err && items) {
                    items.forEach(item => {
                        db.query('UPDATE sanpham SET stock = stock + ? WHERE product_id = ?', [item.quantity, item.product_id]);
                    });
                }
            });
        }
        
        res.json({ message: 'Đã cập nhật trạng thái đơn hàng!' });
    });
});

// 11. API THÊM SẢN PHẨM (ADMIN & STAFF)
app.post('/api/products', authenticateToken, (req, res) => {
    if (req.user.role != 1 && req.user.role != 2) return res.status(403).json({ message: 'Quyền truy cập bị từ chối!' });
    const { product_name, price, stock, unit, image, category_id, brand_id } = req.body;
    const query = `INSERT INTO sanpham (product_name, price, stock, unit, image, category_id, brand_id) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    db.query(query, [product_name, price, stock || 0, unit || 'Cái', image || 'placeholder.jpg', category_id || 1, brand_id || 1], (err, result) => {
        if (err) return res.status(500).json({ message: 'Lỗi thêm sản phẩm', error: err.message });
        res.json({ message: 'Thêm sản phẩm thành công!', product_id: result.insertId });
    });
});

// 12. API SỬA SẢN PHẨM (ADMIN & STAFF)
app.put('/api/products/:id', authenticateToken, (req, res) => {
    if (req.user.role != 1 && req.user.role != 2) return res.status(403).json({ message: 'Quyền truy cập bị từ chối!' });
    const { product_name, price, stock, unit, image, category_id, brand_id } = req.body;
    const query = `UPDATE sanpham SET product_name=?, price=?, stock=?, unit=?, image=?, category_id=?, brand_id=? WHERE product_id=?`;
    db.query(query, [product_name, price, stock, unit, image, category_id, brand_id, req.params.id], (err) => {
        if (err) return res.status(500).json({ message: 'Lỗi cập nhật sản phẩm', error: err.message });
        res.json({ message: 'Cập nhật sản phẩm thành công!' });
    });
});

// 13. API XÓA SẢN PHẨM (ADMIN & STAFF)
app.delete('/api/products/:id', authenticateToken, (req, res) => {
    if (req.user.role != 1 && req.user.role != 2) return res.status(403).json({ message: 'Quyền truy cập bị từ chối!' });
    db.query('DELETE FROM sanpham WHERE product_id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ message: 'Lỗi xóa sản phẩm', error: err.message });
        res.json({ message: 'Xóa sản phẩm thành công!' });
    });
});

// 14. API GỬI LIÊN HỆ
app.post('/api/contact', (req, res) => {
    const { name, email, message } = req.body;
    if (!name || !email || !message) {
        return res.status(400).json({ message: 'Vui lòng điền đầy đủ thông tin!' });
    }
    db.query('INSERT INTO contacts (name, email, message) VALUES (?, ?, ?)', [name, email, message], (err) => {
        if (err) return res.status(500).json({ message: 'Lỗi lưu tin nhắn', error: err.message });
        res.json({ message: 'Cảm ơn bạn đã liên hệ! Tin nhắn đã được gửi thành công.' });
    });
});

// 15. API LẤY DANH SÁCH KHÁCH HÀNG (ADMIN)
app.get('/api/admin/users', authenticateToken, (req, res) => {
    if (req.user.role != 1) return res.status(403).json({ message: 'Cấm truy cập!' });
    const query = `SELECT user_id, full_name, email, phone, address, role_id FROM users ORDER BY user_id DESC`;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ message: 'Lỗi lấy danh sách khách hàng' });
        res.json(results);
    });
});

// 16. API CẤP QUYỀN TÀI KHOẢN (CHỈ ADMIN)
app.put('/api/admin/users/:id/role', authenticateToken, (req, res) => {
    if (req.user.role != 1) return res.status(403).json({ message: 'Cấm truy cập! Chỉ Admin mới có quyền đổi vai trò.' });
    
    // NGĂN ADMIN TỰ TƯỚC QUYỀN CỦA CHÍNH MÌNH
    if (req.user.id == req.params.id) {
        return res.status(400).json({ message: 'Lỗi: Bạn không thể tự thay đổi chức vụ của chính mình!' });
    }

    const { role_id } = req.body;
    
    // NGĂN CẤP QUYỀN ADMIN CHO NGƯỜI KHÁC (Chỉ được cấp quyền Staff hoặc User)
    if (role_id == 1) {
        return res.status(403).json({ message: 'Lỗi bảo mật: Không thể cấp quyền Admin qua giao diện!' });
    }

    // NGĂN ADMIN NÀY TƯỚC QUYỀN CỦA MỘT ADMIN KHÁC (Ngoại trừ việc can thiệp trực tiếp vào Database)
    db.query('SELECT role_id FROM users WHERE user_id = ?', [req.params.id], (err, results) => {
        if (err || results.length === 0) return res.status(404).json({ message: 'Không tìm thấy người dùng' });
        
        if (results[0].role_id === 1) {
            return res.status(403).json({ message: 'Lỗi bảo mật: Không thể tước quyền của một Admin khác!' });
        }

        db.query('UPDATE users SET role_id = ? WHERE user_id = ?', [role_id, req.params.id], (err) => {
            if (err) return res.status(500).json({ message: 'Lỗi cập nhật phân quyền' });
            res.json({ message: 'Cập nhật chức vụ thành công!' });
        });
    });
});

// 17. API QUẢN LÝ DANH MỤC (Cho Frontend)
app.get('/api/categories', (req, res) => {
    // Đổi tên cột cho khớp với Frontend (category_id -> id, category_name -> name)
    db.query('SELECT category_id as id, category_name as name, parent_id FROM danhmuc', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

app.post('/api/categories', authenticateToken, (req, res) => {
    if (req.user.role != 1 && req.user.role != 2) return res.status(403).json({ message: 'Cấm truy cập!' });
    const { name, parent_id } = req.body;
    db.query('INSERT INTO danhmuc (category_name, parent_id) VALUES (?, ?)', [name, parent_id || null], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Thêm danh mục thành công!', id: result.insertId });
    });
});

app.delete('/api/categories/:id', authenticateToken, (req, res) => {
    if (req.user.role != 1 && req.user.role != 2) return res.status(403).json({ message: 'Cấm truy cập!' });
    db.query('DELETE FROM danhmuc WHERE category_id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Xóa danh mục thành công!' });
    });
});

// --- API QUẢN LÝ TIN TỨC (ADMIN & STAFF) ---

// 1. Lấy tất cả bài viết (cho trang quản trị)
app.get('/api/admin/articles', authenticateToken, (req, res) => {
    if (req.user.role != 1 && req.user.role != 2) return res.status(403).json({ message: 'Cấm truy cập!' });
    const query = `
        SELECT a.*, COALESCE(u.full_name, 'Admin') as author_name
        FROM articles a
        LEFT JOIN users u ON a.author_id = u.user_id
        ORDER BY a.created_at DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ message: 'Lỗi lấy danh sách bài viết' });
        res.json(results);
    });
});

// 2. Tạo bài viết mới
app.post('/api/admin/articles', authenticateToken, (req, res) => {
    if (req.user.role != 1 && req.user.role != 2) return res.status(403).json({ message: 'Cấm truy cập!' });
    
    const { title, excerpt, content, image, category } = req.body;
    const author_id = req.user.id;
    // Admin đăng bài thì duyệt luôn, Staff đăng thì phải chờ
    const status = req.user.role === 1 ? 'published' : 'pending_approval';

    const query = `INSERT INTO articles (title, excerpt, content, image, category, author_id, status) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    db.query(query, [title, excerpt, content, image, category, author_id, status], (err, result) => {
        if (err) return res.status(500).json({ message: 'Lỗi tạo bài viết', error: err.message });
        res.json({ message: 'Tạo bài viết thành công!', article_id: result.insertId });
    });
});

// 3. Cập nhật bài viết
app.put('/api/admin/articles/:id', authenticateToken, (req, res) => {
    if (req.user.role != 1 && req.user.role != 2) return res.status(403).json({ message: 'Cấm truy cập!' });
    const { title, excerpt, content, image, category } = req.body;
    const query = `UPDATE articles SET title=?, excerpt=?, content=?, image=?, category=? WHERE article_id=?`;
    db.query(query, [title, excerpt, content, image, category, req.params.id], (err) => {
        if (err) return res.status(500).json({ message: 'Lỗi cập nhật bài viết', error: err.message });
        res.json({ message: 'Cập nhật bài viết thành công!' });
    });
});

// 4. Xóa bài viết
app.delete('/api/admin/articles/:id', authenticateToken, (req, res) => {
    if (req.user.role != 1 && req.user.role != 2) return res.status(403).json({ message: 'Cấm truy cập!' });
    db.query('DELETE FROM articles WHERE article_id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ message: 'Lỗi xóa bài viết', error: err.message });
        res.json({ message: 'Xóa bài viết thành công!' });
    });
});

// 5. Duyệt bài viết (Chỉ Admin)
app.put('/api/admin/articles/:id/status', authenticateToken, (req, res) => {
    if (req.user.role != 1) return res.status(403).json({ message: 'Chỉ Admin mới có quyền duyệt bài!' });
    const { status } = req.body; // status can be 'published' or 'pending_approval'
    db.query('UPDATE articles SET status = ? WHERE article_id = ?', [status, req.params.id], (err) => {
        if (err) return res.status(500).json({ message: "Cập nhật thất bại" });
        res.json({ message: 'Đã cập nhật trạng thái bài viết!' });
    });
});

app.listen(3000, () => {
    console.log('🚀 DREAM Store Backend running at: http://localhost:3000');
});