"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabase = void 0;
const express_1 = __importDefault(require("express"));
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
const auth_1 = require("./middleware/auth");
dotenv_1.default.config();
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const API_KEY = process.env.KIOSK_API_KEY;
exports.supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
const router = express_1.default.Router();
// ---------- AUTH ----------
router.get("/login", (req, res) => {
    res.render("login", { title: "Login", error: null });
});
router.post("/login", (req, res) => {
    if (!req.body) {
        res.status(400).send("Geen body ontvangen");
        return;
    }
    const { username, password } = req.body;
    if (username === "admin" && password === "password123") {
        req.session.user = { username };
        res.redirect("/");
    }
    else {
        res.render("login", { title: "Login", error: "Gebruikersnaam of wachtwoord klopt niet!" });
    }
});
router.get("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err)
            console.error("Error destroying session:", err);
        res.redirect("/login");
    });
});
// ---------- GLOBALE BEVEILIGING ----------
router.use((req, res, next) => {
    if (req.path === "/login" || req.path === "/logout")
        return next();
    (0, auth_1.isAuthenticated)(req, res, next);
});
// ---------- HOME ----------
router.get("/", (req, res) => {
    res.render("home", { title: "Back Office" });
});
router.get("/home", (req, res) => {
    res.render("home", { title: "Home" });
});
// ---------- DASHBOARD ----------
router.get("/dashboard", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { data: orders, error: ordersError } = yield exports.supabase
            .from("orders")
            .select("id, created_at, status");
        if (ordersError)
            throw ordersError;
        const { data: orderItems, error: itemsError } = yield exports.supabase
            .from("order_items")
            .select("order_id, quantity, price");
        if (itemsError)
            throw itemsError;
        const today = new Date();
        const todayStr = today.toISOString().slice(0, 10);
        const thisMonth = today.getMonth();
        const thisYear = today.getFullYear();
        const ordersToday = (orders || []).filter(order => {
            const date = new Date(order.created_at);
            return date.toISOString().slice(0, 10) === todayStr;
        });
        const ordersThisMonth = (orders || []).filter(order => {
            const date = new Date(order.created_at);
            return date.getMonth() === thisMonth && date.getFullYear() === thisYear;
        });
        const orderIdsThisYear = (orders || [])
            .filter(order => new Date(order.created_at).getFullYear() === thisYear)
            .map(order => order.id);
        const revenueThisYear = (orderItems || [])
            .filter(item => orderIdsThisYear.includes(item.order_id))
            .reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const ordersTodayCompleted = ordersToday.filter(order => order.status === "completed").length;
        const ordersTodayOpen = ordersToday.filter(order => order.status !== "completed").length;
        const now = new Date();
        const currentDay = now.getDate();
        const monthNames = [
            "januari", "februari", "maart", "april", "mei", "juni",
            "juli", "augustus", "september", "oktober", "november", "december"
        ];
        const currentMonthName = monthNames[now.getMonth()];
        const currentYear = now.getFullYear();
        res.render("dashboard", {
            title: "Dashboard",
            ordersTodayCompleted,
            ordersTodayOpen,
            ordersThisMonth: ordersThisMonth.length,
            revenueThisYear: revenueThisYear.toFixed(2),
            currentDay,
            currentMonthName,
            currentYear
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).send("Error loading dashboard statistics");
    }
}));
// ---------- BESTELLEN ----------
router.get("/bestellen", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { data: products, error } = yield exports.supabase
        .from("products")
        .select("id, name, price, category_id")
        .order("category_id", { ascending: true })
        .order("id", { ascending: true });
    if (error) {
        res.status(500).send("Error loading products");
        return;
    }
    res.render("bestellen", { title: "Bestellen", products });
}));
function getProducts() {
    return __awaiter(this, void 0, void 0, function* () {
        const { data: products } = yield exports.supabase
            .from("products")
            .select("id, name, price");
        return products || [];
    });
}
router.post("/orders/add", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const quantities = req.body.quantities || {};
        if (typeof quantities !== "object" || Array.isArray(quantities)) {
            res.status(400).send("Ongeldige hoeveelheden");
            return;
        }
        const items = Object.entries(quantities)
            .filter(([_, qty]) => !isNaN(Number(qty)) && Number(qty) > 0)
            .map(([key, qty]) => ({
            product_id: Number(key.replace('p', '')),
            quantity: Number(qty)
        }));
        if (items.length === 0) {
            return res.render("bestellen", {
                title: "Bestellen",
                products: yield getProducts(),
                error: "Selecteer minstens één product om te bestellen."
            });
        }
        const { data: products, error: prodError } = yield exports.supabase
            .from("products")
            .select("id, price")
            .in("id", items.map(i => i.product_id));
        if (prodError)
            throw prodError;
        const orderItems = items.map(item => {
            const prod = products.find((p) => p.id === item.product_id);
            return Object.assign(Object.assign({}, item), { price: prod ? prod.price : 0 });
        });
        const { error: orderError, data: orderData } = yield exports.supabase
            .from("orders")
            .insert([{ status: "pending", created_at: new Date().toISOString() }])
            .select("id")
            .single();
        if (orderError)
            throw orderError;
        const orderId = orderData.id;
        const itemsWithOrderId = orderItems.map(item => ({
            order_id: orderId,
            product_id: item.product_id,
            quantity: item.quantity,
            price: item.price
        }));
        if (itemsWithOrderId.length > 0) {
            const { error: itemsError } = yield exports.supabase
                .from("order_items")
                .insert(itemsWithOrderId);
            if (itemsError)
                throw itemsError;
        }
        res.redirect("/orders");
    }
    catch (error) {
        console.error(error);
        res.status(500).send("Bestelling plaatsen mislukt");
    }
}));
// ---------- PRODUCTS ----------
router.get("/products", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { data: products, error } = yield exports.supabase
            .from("products")
            .select("id, name, description, price, category_id, image_url, categories(name)")
            .order("category_id", { ascending: true })
            .order("id", { ascending: true });
        if (error)
            throw error;
        const { data: categories, error: catError } = yield exports.supabase
            .from("categories")
            .select("id, name");
        if (catError)
            throw catError;
        const message = req.query.message ? decodeURIComponent(req.query.message) : undefined;
        const errorMsg = req.query.error ? decodeURIComponent(req.query.error) : undefined;
        res.render("products", {
            title: "Products",
            products,
            categories,
            message,
            error: errorMsg,
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).send("Error loading products");
    }
}));
router.post("/products/add", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, description, price, category_id } = req.body;
        if (!name || typeof name !== "string" || name.length > 100 ||
            !description || typeof description !== "string" || description.length > 500 ||
            isNaN(Number(price)) || Number(price) < 0 ||
            isNaN(Number(category_id))) {
            res.redirect("/products?error=" + encodeURIComponent("Ongeldige invoer voor product"));
            return;
        }
        const { error } = yield exports.supabase
            .from("products")
            .insert([{ name, description, price: Number(price), category_id: Number(category_id) }]);
        if (error)
            throw error;
        res.redirect("/products?message=" + encodeURIComponent("Product succesvol toegevoegd!"));
    }
    catch (error) {
        console.error(error);
        res.redirect("/products?error=" + encodeURIComponent("Product toevoegen mislukt"));
    }
}));
router.post("/products/delete/:id", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        if (!id || isNaN(Number(id))) {
            res.redirect("/products?error=" + encodeURIComponent("Ongeldig product-id"));
            return;
        }
        const { error } = yield exports.supabase
            .from("products")
            .delete()
            .eq("id", id);
        if (error)
            throw error;
        res.redirect("/products?message=" + encodeURIComponent("Product succesvol verwijderd!"));
    }
    catch (error) {
        console.error(error);
        res.redirect("/products?error=" + encodeURIComponent("Product verwijderen mislukt"));
    }
}));
router.post("/products/imageurl/:id", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const { image_url } = req.body;
    if (!image_url || typeof image_url !== "string" || !/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i.test(image_url)) {
        res.redirect("/products?error=" + encodeURIComponent("Ongeldige afbeelding-url"));
        return;
    }
    yield exports.supabase.from("products").update({ image_url }).eq("id", id);
    res.redirect("/products?message=" + encodeURIComponent("Afbeelding-link succesvol aangepast!"));
}));
// ---------- CATEGORIES ----------
router.get("/categories", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { data: categories, error } = yield exports.supabase.from("categories").select("*");
        if (error)
            throw error;
        const message = req.query.message ? decodeURIComponent(req.query.message) : undefined;
        const errorMsg = req.query.error ? decodeURIComponent(req.query.error) : undefined;
        res.render("categories", {
            title: "Categories",
            categories,
            message,
            error: errorMsg,
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).send("Error loading categories");
    }
}));
router.get("/categories/:id/products", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    try {
        const { data: products, error } = yield exports.supabase
            .from("products")
            .select("id, name, description, price, category_id, image_url, categories(name)")
            .eq("category_id", id)
            .order("id", { ascending: true });
        if (error)
            throw error;
        const { data: categories, error: catError } = yield exports.supabase
            .from("categories")
            .select("id, name");
        if (catError)
            throw catError;
        res.render("products", {
            title: "Producten in categorie",
            products,
            categories,
            selectedCategory: id
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).send("Error loading products for category");
    }
}));
router.post("/categories/add", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name } = req.body;
        if (!name || typeof name !== "string" || name.length > 100) {
            res.redirect("/categories?error=" + encodeURIComponent("Ongeldige categorie-naam"));
            return;
        }
        const { error } = yield exports.supabase
            .from("categories")
            .insert([{ name }]);
        if (error)
            throw error;
        res.redirect("/categories?message=" + encodeURIComponent("Categorie succesvol toegevoegd!"));
    }
    catch (error) {
        console.error(error);
        res.redirect("/categories?error=" + encodeURIComponent("Categorie toevoegen mislukt"));
    }
}));
router.post("/categories/delete/:id", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        if (!id || isNaN(Number(id))) {
            res.redirect("/categories?error=" + encodeURIComponent("Ongeldig categorie-id"));
            return;
        }
        const { error } = yield exports.supabase
            .from("categories")
            .delete()
            .eq("id", id);
        if (error)
            throw error;
        res.redirect("/categories?message=" + encodeURIComponent("Categorie succesvol verwijderd!"));
    }
    catch (error) {
        console.error(error);
        res.redirect("/categories?error=" + encodeURIComponent("Categorie verwijderen mislukt"));
    }
}));
// ---------- ORDERS ----------
router.get("/orders", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { data: orders, error: ordersError } = yield exports.supabase
            .from("orders")
            .select("id, created_at, status")
            .neq("status", "completed")
            .order("created_at", { ascending: false });
        if (ordersError)
            throw ordersError;
        const { data: orderItems, error: itemsError } = yield exports.supabase
            .from("order_items")
            .select("id, order_id, product_id, quantity, price, status, products(name)");
        if (itemsError)
            throw itemsError;
        const ordersWithItems = (orders || []).map(order => (Object.assign(Object.assign({}, order), { items: (orderItems || []).filter(item => item.order_id === order.id) })));
        res.render("orders", {
            title: "Orders",
            orders: ordersWithItems,
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).send("Error loading orders");
    }
}));
router.get("/orders/completed", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { data: orders, error: ordersError } = yield exports.supabase
            .from("orders")
            .select("id, created_at, status")
            .eq("status", "completed")
            .order("created_at", { ascending: false });
        if (ordersError)
            throw ordersError;
        const orderIds = (orders || []).map(order => order.id);
        let orderItems = [];
        if (orderIds.length > 0) {
            const { data: itemsData, error: itemsError } = yield exports.supabase
                .from("order_items")
                .select("id, order_id, product_id, quantity, price, status, products(name)")
                .in("order_id", orderIds);
            if (itemsError)
                throw itemsError;
            orderItems = itemsData || [];
        }
        const ordersWithItems = (orders || []).map(order => (Object.assign(Object.assign({}, order), { items: orderItems.filter(item => item.order_id === order.id) })));
        res.render("afgewerkt", {
            title: "Afgewerkte bestellingen",
            orders: ordersWithItems
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).send("Error loading completed orders");
    }
}));
router.post("/orders/delete/:id", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield exports.supabase.from("order_items").delete().eq("order_id", req.params.id);
        yield exports.supabase.from("orders").delete().eq("id", req.params.id);
        res.redirect("/orders");
    }
    catch (error) {
        console.error(error);
        res.status(500).send("Bestelling verwijderen mislukt");
    }
}));
router.post("/orders/status/:id", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!id || isNaN(Number(id)) || !["pending", "completed"].includes(status)) {
            res.status(400).send("Ongeldige status of order-id");
            return;
        }
        const { error } = yield exports.supabase
            .from("orders")
            .update({ status })
            .eq("id", id);
        if (error)
            throw error;
        res.redirect("/orders");
    }
    catch (error) {
        console.error(error);
        res.status(500).send("Status bijwerken mislukt");
    }
}));
router.post("/order_items/status/:id", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const status = req.body.status === "completed" ? "completed" : "pending";
    const open = req.query.open;
    if (!id || isNaN(Number(id))) {
        res.status(400).send("Ongeldig order_item-id");
        return;
    }
    yield exports.supabase.from("order_items").update({ status }).eq("id", id);
    res.redirect(`/orders${open ? `#details-${open}` : ""}`);
}));
// ---------- API ----------
router.post("/api/orders", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== API_KEY) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    try {
        const { orderItems } = req.body;
        if (!orderItems ||
            !Array.isArray(orderItems) ||
            orderItems.length === 0 ||
            !orderItems.every(item => item &&
                typeof item.product_id === "number" &&
                item.product_id > 0 &&
                typeof item.quantity === "number" &&
                item.quantity > 0)) {
            res.status(400).json({ error: "Invalid order items" });
            return;
        }
        const productIds = orderItems.map((item) => item.product_id);
        const { data: products, error: prodError } = yield exports.supabase
            .from("products")
            .select("id, price")
            .in("id", productIds);
        if (prodError)
            throw prodError;
        const orderItemsWithPrice = orderItems.map((item) => {
            const product = products.find((p) => p.id === item.product_id);
            return Object.assign(Object.assign({}, item), { price: product ? product.price : 0 });
        });
        const { data: orderData, error: orderError } = yield exports.supabase
            .from("orders")
            .insert([{ status: "pending" }])
            .select();
        if (orderError)
            throw orderError;
        if (!orderData || orderData.length === 0)
            throw new Error("Failed to insert order or no data returned");
        const orderId = orderData[0].id;
        const orderItemsData = orderItemsWithPrice.map((item) => ({
            order_id: orderId,
            product_id: item.product_id,
            quantity: item.quantity,
            price: item.price,
        }));
        const { error: orderItemsError } = yield exports.supabase.from("order_items").insert(orderItemsData);
        if (orderItemsError)
            throw orderItemsError;
        res.status(201).json({ message: "Order placed successfully" });
    }
    catch (error) {
        console.error("Unexpected error:", error);
        res.status(500).json({ error: "Failed to place order" });
    }
}));
router.get("/api/categories", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== API_KEY) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    try {
        const { data: categories, error } = yield exports.supabase
            .from("categories")
            .select("id, name")
            .order("id", { ascending: true });
        if (error)
            throw error;
        res.json(categories);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Kon categorieën niet ophalen" });
    }
}));
router.get("/api/products", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== API_KEY) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    try {
        const categoryId = req.query.category_id;
        let query = exports.supabase
            .from("products")
            .select("id, name, description, price, category_id, image_url")
            .order("id", { ascending: true });
        if (categoryId) {
            query = query.eq("category_id", categoryId);
        }
        const { data: products, error } = yield query;
        if (error)
            throw error;
        res.json(products);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Kon producten niet ophalen" });
    }
}));
exports.default = router;
