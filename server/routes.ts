import express, { Request, Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { isAuthenticated } from "./middleware/auth";
import multer from "multer";
import path from "path";
dotenv.config();

// Extend express-session types to include 'user' property
declare module "express-session" {
  interface SessionData {
    user?: { username: string };
  }
}

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_KEY!;
const API_KEY = process.env.KIOSK_API_KEY;
export const supabase = createClient(supabaseUrl, supabaseKey);

const router = express.Router();

// ---------- AUTH ----------
router.get("/login", (req: Request, res: Response): void => {
  res.render("login", { title: "Login", error: null });
});

router.post("/login", (req: Request, res: Response): void => {
  if (!req.body) {
    res.status(400).send("Geen body ontvangen");
    return;
  }
  const { username, password } = req.body;
  if (username === "admin" && password === "password123") {
    req.session.user = { username };
    res.redirect("/");
  } else {
    res.render("login", { title: "Login", error: "Gebruikersnaam of wachtwoord klopt niet!" });
  }
});

router.get("/logout", (req: Request, res: Response): void => {
  req.session.destroy((err) => {
    if (err) console.error("Error destroying session:", err);
    res.redirect("/login");
  });
});

// ---------- GLOBALE BEVEILIGING ----------
router.use((req, res, next) => {
  if (req.path === "/login" || req.path === "/logout") return next();
  isAuthenticated(req, res, next);
});

// Multer memory storage
const upload = multer({ storage: multer.memoryStorage() });

router.post("/products/imageupload/:id", upload.single("image"), async (req, res): Promise<void> => {
  const { id } = req.params;
  if (!req.file) {
    res.redirect("/products?error=" + encodeURIComponent("Geen afbeelding geselecteerd"));
    return;
  }

  // Unieke bestandsnaam
  const fileExt = req.file.originalname.split('.').pop();
  const fileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}.${fileExt}`;

  // Upload naar Supabase Storage
  const { data, error } = await supabase.storage
    .from("product-images")
    .upload(fileName, req.file.buffer, {
      contentType: req.file.mimetype,
      upsert: false
    });

if (error) {
  console.error("Supabase upload error:", error);
  res.redirect("/products?error=" + encodeURIComponent("Upload naar Supabase Storage mislukt: " + error.message));
  return;
}

// Haal de publieke URL op
const { data: publicUrlData } = supabase
  .storage
  .from("product-images")
  .getPublicUrl(fileName);

// Sla de publieke URL op in je database
await supabase
  .from("products")
  .update({ picture: publicUrlData.publicUrl })
  .eq("id", id);

  res.redirect("/products?message=" + encodeURIComponent("Afbeelding succesvol geüpload!"));
});

router.post("/products/delete-image/:id", async (req, res) => {
  const { id } = req.params;

  // Haal het product op om de bestandsnaam te weten
  const { data: product, error: fetchError } = await supabase
    .from("products")
    .select("picture")
    .eq("id", id)
    .single();

  if (fetchError || !product || !product.picture) {
    res.redirect("/products?error=" + encodeURIComponent("Geen afbeelding gevonden om te verwijderen"));
    return;
  }

  // Extract bestandsnaam uit de URL
  const urlParts = product.picture.split("/");
  const fileName = urlParts[urlParts.length - 1];

  // Verwijder uit Supabase Storage
  const { error: storageError } = await supabase
    .storage
    .from("product-images")
    .remove([fileName]);

  if (storageError) {
    res.redirect("/products?error=" + encodeURIComponent("Afbeelding kon niet verwijderd worden"));
    return;
  }

  // Verwijder de URL uit de database
  await supabase
    .from("products")
    .update({ picture: null })
    .eq("id", id);

  res.redirect("/products?message=" + encodeURIComponent("Afbeelding succesvol verwijderd!"));
});

// ---------- HOME ----------
router.get("/", (req: Request, res: Response): void => {
  res.render("home", { title: "Back Office" });
});
router.get("/home", (req: Request, res: Response): void => {
  res.render("home", { title: "Home" });
});

// ---------- DASHBOARD ----------
router.get("/dashboard", async (req: Request, res: Response): Promise<void> => {
  try {
    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("id, created_at, status");
    if (ordersError) throw ordersError;

    const { data: orderItems, error: itemsError } = await supabase
      .from("order_items")
      .select("order_id, quantity, price");
    if (itemsError) throw itemsError;

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
  } catch (error) {
    console.error(error);
    res.status(500).send("Error loading dashboard statistics");
  }
});

// ---------- BESTELLEN ----------
router.get("/bestellen", async (req: Request, res: Response): Promise<void> => {
  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, price, category_id")
    .order("category_id", { ascending: true })
    .order("id", { ascending: true });
  if (error) {
    res.status(500).send("Error loading products");
    return;
  }
  res.render("bestellen", { title: "Bestellen", products });
});

async function getProducts() {
  const { data: products } = await supabase
    .from("products")
    .select("id, name, price");
  return products || [];
}

router.post("/orders/add", async (req: Request, res: Response) => {
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
        products: await getProducts(),
        error: "Selecteer minstens één product om te bestellen."
      });
    }

    const { data: products, error: prodError } = await supabase
      .from("products")
      .select("id, price")
      .in("id", items.map(i => i.product_id));
    if (prodError) throw prodError;

    const orderItems = items.map(item => {
      const prod = products.find((p: any) => p.id === item.product_id);
      return {
        ...item,
        price: prod ? prod.price : 0
      };
    });

    const { error: orderError, data: orderData } = await supabase
      .from("orders")
      .insert([{ status: "pending", created_at: new Date().toISOString() }])
      .select("id")
      .single();
    if (orderError) throw orderError;

    const orderId = orderData.id;

    const itemsWithOrderId = orderItems.map(item => ({
      order_id: orderId,
      product_id: item.product_id,
      quantity: item.quantity,
      price: item.price
    }));

    if (itemsWithOrderId.length > 0) {
      const { error: itemsError } = await supabase
        .from("order_items")
        .insert(itemsWithOrderId);
      if (itemsError) throw itemsError;
    }

    res.redirect("/orders");
  } catch (error) {
    console.error(error);
    res.status(500).send("Bestelling plaatsen mislukt");
  }
});

// ---------- PRODUCTS ----------
router.get("/products", async (req: Request, res: Response): Promise<void> => {
  try {
    const { data: products, error } = await supabase
      .from("products")
      .select("id, name, description, price, category_id, picture, categories(name)")
      .order("category_id", { ascending: true })
      .order("id", { ascending: true });
    if (error) throw error;

    const { data: categories, error: catError } = await supabase
      .from("categories")
      .select("id, name");
    if (catError) throw catError;

    const message = req.query.message ? decodeURIComponent(req.query.message as string) : undefined;
    const errorMsg = req.query.error ? decodeURIComponent(req.query.error as string) : undefined;

    res.render("products", {
      title: "Products",
      products,
      categories,
      message,
      error: errorMsg,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error loading products");
  }
});

router.post("/products/add", async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, price, category_id } = req.body;
    if (
      !name || typeof name !== "string" || name.length > 100 ||
      !description || typeof description !== "string" || description.length > 500 ||
      isNaN(Number(price)) || Number(price) < 0 ||
      isNaN(Number(category_id))
    ) {
      res.redirect("/products?error=" + encodeURIComponent("Ongeldige invoer voor product"));
      return;
    }
    const { error } = await supabase
      .from("products")
      .insert([{ name, description, price: Number(price), category_id: Number(category_id) }]);
    if (error) throw error;
    res.redirect("/products?message=" + encodeURIComponent("Product succesvol toegevoegd!"));
  } catch (error) {
    console.error(error);
    res.redirect("/products?error=" + encodeURIComponent("Product toevoegen mislukt"));
  }
});

router.post("/products/delete/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!id || isNaN(Number(id))) {
      res.redirect("/products?error=" + encodeURIComponent("Ongeldig product-id"));
      return;
    }
    const { error } = await supabase
      .from("products")
      .delete()
      .eq("id", id);
    if (error) throw error;
    res.redirect("/products?message=" + encodeURIComponent("Product succesvol verwijderd!"));
  } catch (error) {
    console.error(error);
    res.redirect("/products?error=" + encodeURIComponent("Product verwijderen mislukt"));
  }
});

// ---------- CATEGORIES ----------
router.get("/categories", async (req: Request, res: Response): Promise<void> => {
  try {
    const { data: categories, error } = await supabase.from("categories").select("*");
    if (error) throw error;

    const message = req.query.message ? decodeURIComponent(req.query.message as string) : undefined;
    const errorMsg = req.query.error ? decodeURIComponent(req.query.error as string) : undefined;

    res.render("categories", {
      title: "Categories",
      categories,
      message,
      error: errorMsg,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error loading categories");
  }
});

router.get("/categories/:id/products", async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const { data: products, error } = await supabase
      .from("products")
      .select("id, name, description, price, category_id, picture, categories(name)")
      .eq("category_id", id)
      .order("id", { ascending: true });
    if (error) throw error;

    const { data: categories, error: catError } = await supabase
      .from("categories")
      .select("id, name");
    if (catError) throw catError;

    res.render("products", {
      title: "Producten in categorie",
      products,
      categories,
      selectedCategory: id
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error loading products for category");
  }
});

router.post("/categories/add", async (req: Request, res: Response): Promise<void> => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== "string" || name.length > 100) {
      res.redirect("/categories?error=" + encodeURIComponent("Ongeldige categorie-naam"));
      return;
    }
    const { error } = await supabase
      .from("categories")
      .insert([{ name }]);
    if (error) throw error;
    res.redirect("/categories?message=" + encodeURIComponent("Categorie succesvol toegevoegd!"));
  } catch (error) {
    console.error(error);
    res.redirect("/categories?error=" + encodeURIComponent("Categorie toevoegen mislukt"));
  }
});

router.post("/categories/delete/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!id || isNaN(Number(id))) {
      res.redirect("/categories?error=" + encodeURIComponent("Ongeldig categorie-id"));
      return;
    }
    const { error } = await supabase
      .from("categories")
      .delete()
      .eq("id", id);
    if (error) throw error;
    res.redirect("/categories?message=" + encodeURIComponent("Categorie succesvol verwijderd!"));
  } catch (error) {
    console.error(error);
    res.redirect("/categories?error=" + encodeURIComponent("Categorie verwijderen mislukt"));
  }
});

// ---------- ORDERS ----------
router.get("/orders", async (req: Request, res: Response): Promise<void> => {
  try {
    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("id, created_at, status")
      .neq("status", "completed")
      .order("created_at", { ascending: false });
    if (ordersError) throw ordersError;

    const { data: orderItems, error: itemsError } = await supabase
      .from("order_items")
      .select("id, order_id, product_id, quantity, price, status, products(name)");
    if (itemsError) throw itemsError;

    const ordersWithItems = (orders || []).map(order => ({
      ...order,
      items: (orderItems || []).filter(item => item.order_id === order.id)
    }));

    res.render("orders", {
      title: "Orders",
      orders: ordersWithItems,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error loading orders");
  }
});

router.get("/orders/completed", async (req: Request, res: Response): Promise<void> => {
  try {
    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("id, created_at, status")
      .eq("status", "completed")
      .order("created_at", { ascending: false });
    if (ordersError) throw ordersError;

    const orderIds = (orders || []).map(order => order.id);
    let orderItems: any[] = [];
    if (orderIds.length > 0) {
      const { data: itemsData, error: itemsError } = await supabase
        .from("order_items")
        .select("id, order_id, product_id, quantity, price, status, products(name)")
        .in("order_id", orderIds);
      if (itemsError) throw itemsError;
      orderItems = itemsData || [];
    }

    const ordersWithItems = (orders || []).map(order => ({
      ...order,
      items: orderItems.filter(item => item.order_id === order.id)
    }));

    res.render("afgewerkt", {
      title: "Afgewerkte bestellingen",
      orders: ordersWithItems
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error loading completed orders");
  }
});

router.post("/orders/delete/:id", async (req: Request, res: Response) => {
  try {
    await supabase.from("order_items").delete().eq("order_id", req.params.id);
    await supabase.from("orders").delete().eq("id", req.params.id);
    res.redirect("/orders");
  } catch (error) {
    console.error(error);
    res.status(500).send("Bestelling verwijderen mislukt");
  }
});

router.post("/orders/status/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!id || isNaN(Number(id)) || !["pending", "completed"].includes(status)) {
      res.status(400).send("Ongeldige status of order-id");
      return;
    }
    const { error } = await supabase
      .from("orders")
      .update({ status })
      .eq("id", id);
    if (error) throw error;
    res.redirect("/orders");
  } catch (error) {
    console.error(error);
    res.status(500).send("Status bijwerken mislukt");
  }
});

router.post("/order_items/status/:id", async (req, res) => {
  const { id } = req.params;
  const status = req.body.status === "completed" ? "completed" : "pending";
  const open = req.query.open;
  if (!id || isNaN(Number(id))) {
    res.status(400).send("Ongeldig order_item-id");
    return;
  }
  await supabase.from("order_items").update({ status }).eq("id", id);
  res.redirect(`/orders${open ? `#details-${open}` : ""}`);
});

// ---------- API ----------
router.post("/api/orders", async (req: Request, res: Response): Promise<void> => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== API_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const { orderItems } = req.body;
    if (
      !orderItems ||
      !Array.isArray(orderItems) ||
      orderItems.length === 0 ||
      !orderItems.every(item =>
        item &&
        typeof item.product_id === "number" &&
        item.product_id > 0 &&
        typeof item.quantity === "number" &&
        item.quantity > 0
      )
    ) {
      res.status(400).json({ error: "Invalid order items" });
      return;
    }

    const productIds = orderItems.map((item: any) => item.product_id);
    const { data: products, error: prodError } = await supabase
      .from("products")
      .select("id, price")
      .in("id", productIds);
    if (prodError) throw prodError;

    const orderItemsWithPrice = orderItems.map((item: any) => {
      const product = products.find((p: any) => p.id === item.product_id);
      return {
        ...item,
        price: product ? product.price : 0
      };
    });

    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .insert([{ status: "pending" }])
      .select();
    if (orderError) throw orderError;
    if (!orderData || orderData.length === 0) throw new Error("Failed to insert order or no data returned");
    const orderId = orderData[0].id;

    const orderItemsData = orderItemsWithPrice.map((item: any) => ({
      order_id: orderId,
      product_id: item.product_id,
      quantity: item.quantity,
      price: item.price,
    }));
    const { error: orderItemsError } = await supabase.from("order_items").insert(orderItemsData);
    if (orderItemsError) throw orderItemsError;

    res.status(201).json({ message: "Order placed successfully" });
  } catch (error) {
    console.error("Unexpected error:", error);
    res.status(500).json({ error: "Failed to place order" });
  }
});

router.get("/api/categories", async (req: Request, res: Response) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== API_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const { data: categories, error } = await supabase
      .from("categories")
      .select("id, name")
      .order("id", { ascending: true });
    if (error) throw error;
    res.json(categories);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Kon categorieën niet ophalen" });
  }
});

router.get("/api/products", async (req: Request, res: Response) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== API_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const categoryId = req.query.category_id;
    let query = supabase
      .from("products")
      .select("id, name, description, price, category_id, picture")
      .order("id", { ascending: true });
    if (categoryId) {
      query = query.eq("category_id", categoryId);
    }
    const { data: products, error } = await query;
    if (error) throw error;
    res.json(products);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Kon producten niet ophalen" });
  }
});

export default router;