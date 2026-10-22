import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  Navigate,
  useNavigate,
} from "react-router-dom";
import {
  Leaf,
  ShoppingBasket,
  UserRound,
  LogOut,
  ArrowRight,
} from "lucide-react";
import { AppProvider, useApp, write, Loading } from "./lib";
import { Home, CartDrawer, Checkout, Login } from "./Shop";
import { Admin, Delivery, Orders, OrderDetail } from "./Dashboards";
import "./style.css";
function Guard({ roles, children }) {
  const { user, ready } = useApp();
  if (!ready) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role))
    return (
      <div className="wrap empty">
        <h1>Access restricted</h1>
        <p>This page is for another account role.</p>
        <Link to="/" className="button">
          Back to shop
        </Link>
      </div>
    );
  return children;
}
function App() {
  const { user, setUser, cart, notice } = useApp();
  const [drawer, setDrawer] = useState(false);
  const navigate = useNavigate();
  const count = Object.values(cart).reduce((s, i) => s + i.quantity, 0);
  return (
    <>
      <div className="topline">
        Fresh picks. Fair prices. A little more joy in every basket.
      </div>
      <header>
        <nav className="wrap nav">
          <Link className="brand" to="/">
            <span>
              <Leaf size={24} />
            </span>
            freshbasket<span className="brand-dot">.</span>
          </Link>
          <div className="nav-links">
            <Link to="/">The market</Link>
            {user && (
              <Link
                to={
                  user.role === "ADMIN"
                    ? "/admin"
                    : user.role === "DELIVERY_PARTNER"
                      ? "/delivery"
                      : "/orders"
                }
              >
                {user.role === "ADMIN"
                  ? "Manage store"
                  : user.role === "DELIVERY_PARTNER"
                    ? "My deliveries"
                    : "My orders"}
              </Link>
            )}
          </div>
          <div className="nav-actions">
            {user ? (
              <>
                <span className="hello">Hi, {user.name.split(" ")[0]}</span>
                <button
                  className="icon-button"
                  aria-label="Sign out"
                  onClick={async () => {
                    try {
                      await write("/auth/logout");
                      setUser(null);
                      navigate("/");
                    } catch (e) {
                      notice(e.message);
                    }
                  }}
                >
                  <LogOut size={18} />
                </button>
              </>
            ) : (
              <Link className="sign-in" to="/login">
                <UserRound size={18} />
                Sign in
              </Link>
            )}
            <button className="basket-button" onClick={() => setDrawer(true)}>
              <ShoppingBasket size={19} />
              <span>Basket</span>
              <b>{count}</b>
            </button>
          </div>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/checkout"
          element={
            <Guard roles={["USER"]}>
              <Checkout />
            </Guard>
          }
        />
        <Route
          path="/orders"
          element={
            <Guard>
              <Orders />
            </Guard>
          }
        />
        <Route
          path="/orders/:id"
          element={
            <Guard>
              <OrderDetail />
            </Guard>
          }
        />
        <Route
          path="/admin"
          element={
            <Guard roles={["ADMIN"]}>
              <Admin />
            </Guard>
          }
        />
        <Route
          path="/delivery"
          element={
            <Guard roles={["DELIVERY_PARTNER"]}>
              <Delivery />
            </Guard>
          }
        />
        <Route
          path="*"
          element={
            <div className="wrap empty">
              <h1>This aisle doesn’t exist.</h1>
              <Link className="button" to="/">
                Back to the market <ArrowRight size={16} />
              </Link>
            </div>
          }
        />
      </Routes>
      <footer>
        <div className="wrap footer-inner">
          <div>
            <Link className="brand" to="/">
              <Leaf />
              freshbasket.
            </Link>
            <p>
              Everyday essentials.
              <br />A fresher way to shop.
            </p>
          </div>
          <div>
            <strong>Explore</strong>
            <Link to="/">The market</Link>
            <Link to="/orders">Your orders</Link>
            <Link to="/login">Your account</Link>
          </div>
          <div>
            <strong>Made for everyday living.</strong>
            <p>
              A grocery delivery portfolio project.
              <br />
              Sample catalog · INR pricing
            </p>
          </div>
        </div>
        <div className="wrap footer-bottom">
          FreshBasket · 2026<span>From basket to doorstep.</span>
        </div>
      </footer>
      {drawer && <CartDrawer close={() => setDrawer(false)} />}
    </>
  );
}
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProvider>
        <App />
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
