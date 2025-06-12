"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const express_ejs_layouts_1 = __importDefault(require("express-ejs-layouts"));
const routes_1 = __importDefault(require("./routes"));
const dotenv_1 = __importDefault(require("dotenv"));
const express_session_1 = __importDefault(require("express-session"));
const app = (0, express_1.default)();
const PORT = parseInt(process.env.PORT || "3000", 10);
dotenv_1.default.config();
app.use((0, express_session_1.default)({
    secret: "jouw_geheime_sleutel",
    resave: false,
    saveUninitialized: false
}));
app.use((req, res, next) => {
    res.locals.user = req.session.user;
    next();
});
app.set("view engine", "ejs");
app.set("views", path_1.default.join(__dirname, "views"));
app.use(express_ejs_layouts_1.default);
app.set("layout", "layouts/main");
app.use(express_1.default.static(path_1.default.join(__dirname, "public")));
app.use(express_1.default.urlencoded({ extended: true }));
app.use(express_1.default.json());
app.use((req, res, next) => {
    if (req.path === "/login" ||
        req.path === "/logout" ||
        req.path.startsWith("/css") ||
        req.path.startsWith("/js") ||
        req.path.startsWith("/images")) {
        return next();
    }
    if (req.session && req.session.user) {
        return next();
    }
    res.redirect("/login");
});
app.use("/", routes_1.default);
app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});
