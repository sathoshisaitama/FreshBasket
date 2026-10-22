import { createContext, useContext, useEffect, useState } from "react";
export const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value / 100);
export const label = (value) =>
  value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (s) => s.toUpperCase());
export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: "include",
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || "Request failed");
  return body;
}
export const write = (path, body = {}, method = "POST", headers = {}) =>
  api(path, { method, body: JSON.stringify(body), headers });
export function useData(path, interval = 0) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () =>
      api(path)
        .then((result) => {
          if (alive) {
            setData(result);
            setError("");
          }
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    load();
    const timer = interval ? setInterval(load, interval) : null;
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, [path, interval, version]);
  return { data, error, refresh: () => setVersion((v) => v + 1) };
}
const Context = createContext(null);
export function AppProvider({ children }) {
  const [user, setUser] = useState(null),
    [ready, setReady] = useState(false),
    [notice, setNotice] = useState("");
  const [cart, setCart] = useState(() => {
    try {
      const c = JSON.parse(localStorage.getItem("freshbasket-cart") || "{}");
      return c && typeof c === "object" && !Array.isArray(c) ? c : {};
    } catch {
      return {};
    }
  });
  useEffect(() => {
    api("/auth/me")
      .then(setUser)
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    localStorage.setItem("freshbasket-cart", JSON.stringify(cart));
  }, [cart]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  const add = (product) => {
    if ((cart[product.id]?.quantity || 0) >= Math.min(product.stock, 30)) {
      setNotice("Maximum available quantity reached");
      return;
    }
    setCart((c) => ({
      ...c,
      [product.id]: { product, quantity: (c[product.id]?.quantity || 0) + 1 },
    }));
  };
  const quantity = (id, qty) =>
    setCart((c) => {
      const next = { ...c };
      if (qty < 1) delete next[id];
      else
        next[id] = {
          ...c[id],
          quantity: Math.min(qty, c[id].product.stock, 30),
        };
      return next;
    });
  return (
    <Context.Provider
      value={{
        user,
        setUser,
        ready,
        cart,
        setCart,
        add,
        quantity,
        notice: setNotice,
      }}
    >
      {children}
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            ×
          </button>
        </div>
      )}
    </Context.Provider>
  );
}
export const useApp = () => useContext(Context);
export function ErrorBox({ children }) {
  return children ? (
    <p className="error" role="alert">
      {children}
    </p>
  ) : null;
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <span className="spinner" />
      Loading your fresh picks…
    </div>
  );
}
