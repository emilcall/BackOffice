import express, { Application } from "express";
import path from "path";
import expressLayouts from "express-ejs-layouts";
import routes from "./routes";
import dotenv from "dotenv";
import session from "express-session";

const app: Application = express();
const PORT: number = parseInt(process.env.PORT || "3000", 10);
dotenv.config();

app.use(session({
  secret: "jouw_geheime_sleutel",
  resave: false,
  saveUninitialized: false
}));

app.use((req, res, next) => {
  res.locals.user = req.session.user;
  next();
});

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(expressLayouts);
app.set("layout", "layouts/main");

app.use(express.static(path.join(__dirname, "public")));

app.use(express.urlencoded({ extended: true }));

app.use(express.json());

app.use((req, res, next) => {
  if (
    req.path === "/login" ||
    req.path === "/logout" ||
    req.path.startsWith("/css") ||
    req.path.startsWith("/js") ||
    req.path.startsWith("/images")
  ) {
    return next();
  }
  if (req.session && req.session.user) {
    return next();
  }
  res.redirect("/login");
});

app.use("/", routes);

app.listen(PORT, (): void => {
  console.log(`Server is running at http://localhost:${PORT}`);
});