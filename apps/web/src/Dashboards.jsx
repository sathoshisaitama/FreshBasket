import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  Package,
  ArrowRight,
  MapPin,
  Navigation,
  Plus,
  Pencil,
  ShoppingBasket,
  IndianRupee,
  Truck,
  LayoutDashboard,
  Users,
  Leaf,
} from "lucide-react";
import { useApp, useData, write, money, label, Loading, ErrorBox } from "./lib";
import { categories } from "./Shop";
export function OrderCards({ orders }) {
  if (!orders.length)
    return (
      <div className="empty">
        <Package size={40} />
        <h3>No orders yet</h3>
        <p>Your orders will appear here.</p>
      </div>
    );
  return (
    <div className="order-cards">
      {orders.map((o) => (
        <Link className="panel order-card" key={o.id} to={`/orders/${o.id}`}>
          <div className="spread">
            <span className={`badge ${o.status.toLowerCase()}`}>
              {label(o.status)}
            </span>
            <small>{new Date(o.createdAt).toLocaleDateString("en-IN")}</small>
          </div>
          <h3>Order #{o.id.slice(0, 8)}</h3>
          <p>{o.items.map((i) => `${i.quantity} × ${i.name}`).join(", ")}</p>
          <div className="spread">
            <strong>{money(o.totalMinor)}</strong>
            <span className="text-button">
              View order <ArrowRight size={16} />
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
export function Orders() {
  const { data, error } = useData("/orders", 10000);
  return (
    <main className="wrap page">
      <span className="eyebrow">FROM MARKET TO DOORSTEP</span>
      <h1>Your orders.</h1>
      <ErrorBox>{error}</ErrorBox>
      {data ? <OrderCards orders={data} /> : !error && <Loading />}
    </main>
  );
}
function Recenter({ position }) {
  const map = useMap();
  useEffect(() => {
    map.panTo(position);
  }, [position[0], position[1], map]);
  return null;
}
function TrackingMap({ order }) {
  if (order.latitude == null || order.longitude == null)
    return (
      <div className="map-wait">
        <MapPin size={35} />
        <strong>Waiting for a location update</strong>
        <span>
          Your partner’s location appears after pickup and location sharing.
        </span>
      </div>
    );
  const position = [order.latitude, order.longitude];
  return (
    <>
      <MapContainer center={position} zoom={14} className="map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <CircleMarker
          center={position}
          radius={10}
          pathOptions={{
            color: "#1b3022",
            fillColor: "#f97316",
            fillOpacity: 1,
          }}
        >
          <Popup>Delivery partner</Popup>
        </CircleMarker>
        <Recenter position={position} />
      </MapContainer>
      <p className="muted small">
        Last update: {new Date(order.locationAt).toLocaleTimeString()}
        {Date.now() - new Date(order.locationAt).getTime() > 30000
          ? " · Location may be stale"
          : ""}
      </p>
    </>
  );
}
function ShareLocation({ orderId }) {
  const [sharing, setSharing] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (!sharing) return;
    if (!navigator.geolocation) {
      setMessage("Your browser does not support location sharing.");
      setSharing(false);
      return;
    }
    let sent = 0;
    const id = navigator.geolocation.watchPosition(
      async ({ coords }) => {
        if (Date.now() - sent < 5000) return;
        sent = Date.now();
        try {
          await write(
            `/delivery/orders/${orderId}/location`,
            { latitude: coords.latitude, longitude: coords.longitude },
            "PUT",
          );
          setMessage("Location updated. Keep this page open during delivery.");
        } catch (e) {
          setMessage(e.message);
        }
      },
      (e) => {
        setMessage(e.message);
        setSharing(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [sharing, orderId]);
  return (
    <div className="location-controls">
      <button
        className={`button ${sharing ? "secondary" : ""}`}
        onClick={() => setSharing(!sharing)}
      >
        <Navigation size={16} />
        {sharing ? "Stop sharing location" : "Share live location"}
      </button>
      <small>
        {message ||
          "Allow location access to help the customer follow their delivery."}
      </small>
    </div>
  );
}
export function OrderDetail() {
  const { id } = useParams(),
    { user, notice } = useApp();
  const { data: order, error, refresh } = useData(`/orders/${id}`, 5000);
  const { data: partners } = useData(
    user.role === "ADMIN" ? "/admin/partners" : "/config",
  );
  const [busy, setBusy] = useState(false),
    [actionError, setError] = useState(""),
    [partnerId, setPartner] = useState(""),
    [code, setCode] = useState(""),
    [cash, setCash] = useState(false);
  async function act(path, body, method = "POST") {
    setBusy(true);
    setError("");
    try {
      const result = await write(path, body, method);
      if (result.url) location.assign(result.url);
      else {
        refresh();
        notice("Order updated");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!order)
    return (
      <main className="wrap page">
        <ErrorBox>{error}</ErrorBox>
        {!error && <Loading />}
      </main>
    );
  const isPartner = user.role === "DELIVERY_PARTNER",
    isAdmin = user.role === "ADMIN";
  const timeline = [
    "CONFIRMED",
    "PACKING",
    "READY",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
  ];
  return (
    <main className="wrap page">
      <Link
        className="back"
        to={isAdmin ? "/admin" : isPartner ? "/delivery" : "/orders"}
      >
        ← Back to orders
      </Link>
      <div className="section-heading">
        <div>
          <span className="eyebrow">ORDER #{id.slice(0, 8)}</span>
          <h1>
            {order.status === "DELIVERED"
              ? "Freshness, delivered."
              : order.status === "CANCELLED"
                ? "Order cancelled."
                : "Your basket is on its way."}
          </h1>
        </div>
        <span className={`badge ${order.status.toLowerCase()}`}>
          {label(order.status)}
        </span>
      </div>
      <ErrorBox>{error || actionError}</ErrorBox>
      <div className="checkout-grid">
        <div>
          <section className="panel">
            <h2>Order progress</h2>
            <div className="timeline">
              {timeline.map((status, index) => (
                <div
                  className={
                    timeline.indexOf(order.status) >= index ? "done" : ""
                  }
                  key={status}
                >
                  <b>{index + 1}</b>
                  <span>{label(status)}</span>
                </div>
              ))}
            </div>
            {order.status === "PENDING_PAYMENT" && (
              <p className="error">
                Waiting for payment confirmation. Stock is reserved temporarily.
              </p>
            )}
            {order.deliveryCode && (
              <div className="delivery-code">
                <span>
                  Delivery confirmation code
                  <strong>{order.deliveryCode}</strong>
                </span>
                <small>
                  Share this with your partner only when your groceries arrive.
                </small>
              </div>
            )}
            <div className="actions">
              {!isAdmin &&
                !isPartner &&
                order.status === "CONFIRMED" &&
                order.paymentMethod === "COD" && (
                  <button
                    disabled={busy}
                    className="button secondary"
                    onClick={() => {
                      if (confirm("Cancel this order and restore its stock?"))
                        act(`/orders/${id}/cancel`, {});
                    }}
                  >
                    Cancel order
                  </button>
                )}
              {order.status === "PENDING_PAYMENT" &&
                user.id === order.userId && (
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => act(`/orders/${id}/pay`, {})}
                  >
                    Continue payment
                  </button>
                )}
              {isAdmin && ["CONFIRMED", "PACKING"].includes(order.status) && (
                <button
                  disabled={busy}
                  className="button"
                  onClick={() =>
                    act(
                      `/orders/${id}/status`,
                      {
                        status:
                          order.status === "CONFIRMED" ? "PACKING" : "READY",
                      },
                      "PATCH",
                    )
                  }
                >
                  {order.status === "CONFIRMED"
                    ? "Start packing"
                    : "Mark ready for pickup"}
                </button>
              )}
              {isAdmin && order.status === "READY" && !order.partnerId && (
                <>
                  <select
                    aria-label="Delivery partner"
                    value={partnerId}
                    onChange={(e) => setPartner(e.target.value)}
                  >
                    <option value="">Auto-select available partner</option>
                    {Array.isArray(partners) &&
                      partners
                        .filter((p) => p.available)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.user.name}
                          </option>
                        ))}
                  </select>
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() =>
                      act(
                        `/admin/orders/${id}/assign`,
                        partnerId ? { partnerId } : {},
                      )
                    }
                  >
                    Assign partner
                  </button>
                </>
              )}
              {isPartner && order.status === "READY" && (
                <button
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    act(
                      `/orders/${id}/status`,
                      { status: "OUT_FOR_DELIVERY" },
                      "PATCH",
                    )
                  }
                >
                  Confirm pickup
                </button>
              )}
            </div>
            {isPartner && order.status === "OUT_FOR_DELIVERY" && (
              <div>
                <ShareLocation orderId={id} />
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    act(
                      `/orders/${id}/status`,
                      { status: "DELIVERED", code },
                      "PATCH",
                    );
                  }}
                >
                  <label>
                    Customer’s delivery code
                    <input
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      required
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="6-digit code"
                    />
                  </label>
                  {order.paymentMethod === "COD" && (
                    <label className="check">
                      <input
                        required
                        type="checkbox"
                        checked={cash}
                        onChange={(e) => setCash(e.target.checked)}
                      />
                      I collected {money(order.totalMinor)} in cash
                    </label>
                  )}
                  <button disabled={busy} className="button">
                    Confirm delivery
                  </button>
                </form>
              </div>
            )}
          </section>
          <section className="panel">
            <div className="section-heading">
              <h2>Delivery location</h2>
              <Truck size={22} />
            </div>
            {order.partner ? (
              <p>
                Partner: <strong>{order.partner.user.name}</strong>
              </p>
            ) : (
              <p className="muted">
                A partner will be assigned when your order is ready.
              </p>
            )}
            <TrackingMap order={order} />
          </section>
          <section className="panel">
            <h2>Activity</h2>
            <ul className="activity">
              {order.history.map((h) => (
                <li key={h.id}>
                  <span>{h.note}</span>
                  <small>{new Date(h.createdAt).toLocaleString("en-IN")}</small>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <aside>
          <section className="panel">
            <h3>Delivering to</h3>
            <strong>{order.address.name}</strong>
            <p>
              {order.address.line}
              <br />
              {order.address.city}, {order.address.postalCode}
              <br />
              {order.address.phone}
            </p>
          </section>
          <section className="panel order-summary">
            <h3>Your basket</h3>
            {order.items.map((i) => (
              <div className="summary-item" key={i.id}>
                <img src={i.image} alt="" />
                <span>
                  {i.name}
                  <small>Qty {i.quantity}</small>
                </span>
                <strong>{money(i.priceMinor * i.quantity)}</strong>
              </div>
            ))}
            <div className="spread">
              <span>Subtotal</span>
              <span>{money(order.subtotalMinor)}</span>
            </div>
            <div className="spread">
              <span>Delivery</span>
              <span>
                {order.deliveryMinor ? money(order.deliveryMinor) : "Free"}
              </span>
            </div>
            <div className="spread total">
              <strong>Total</strong>
              <strong>{money(order.totalMinor)}</strong>
            </div>
            <p className="muted small">
              {order.paymentMethod === "COD" ? "Cash on delivery" : "Stripe"} ·{" "}
              {label(order.paymentStatus)}
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}
function ProductEditor({ product, close, saved }) {
  const ref = useRef(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const p = product || {
    name: "",
    description: "",
    category: "Produce",
    priceMinor: 9900,
    stock: 20,
    organic: false,
    unit: "pack",
    image: "/assets/fruits_vegetables.png",
    active: true,
  };
  useEffect(() => {
    ref.current.showModal();
  }, []);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    const f = Object.fromEntries(new FormData(e.currentTarget));
    const data = {
      ...f,
      priceMinor: Math.round(Number(f.price) * 100),
      stock: Number(f.stock),
      organic: f.organic === "on",
      active: f.active === "on",
    };
    delete data.price;
    try {
      await write(
        `/admin/products${product ? `/${product.id}` : ""}`,
        data,
        product ? "PATCH" : "POST",
      );
      saved();
      close();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog className="modal" ref={ref} onCancel={close}>
      <form onSubmit={submit}>
        <div className="section-heading">
          <h2>{product ? "Edit product" : "Add a fresh pick"}</h2>
          <button
            className="icon-button"
            type="button"
            aria-label="Close editor"
            onClick={close}
          >
            ×
          </button>
        </div>
        <div className="form-grid">
          <label className="wide">
            Product name
            <input name="name" required minLength={2} defaultValue={p.name} />
          </label>
          <label>
            Category
            <select name="category" defaultValue={p.category}>
              {categories.map(([name]) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <label>
            Unit
            <input name="unit" required defaultValue={p.unit} />
          </label>
          <label>
            Price (₹)
            <input
              type="number"
              name="price"
              required
              min="0.01"
              step="0.01"
              defaultValue={p.priceMinor / 100}
            />
          </label>
          <label>
            Stock
            <input
              name="stock"
              type="number"
              required
              min="0"
              step="1"
              defaultValue={p.stock}
            />
          </label>
          <label className="wide">
            Image URL or local asset path
            <input name="image" required defaultValue={p.image} />
          </label>
          <label className="wide">
            Description
            <textarea name="description" defaultValue={p.description} />
          </label>
          <label className="check">
            <input type="checkbox" name="organic" defaultChecked={p.organic} />
            Organic
          </label>
          <label className="check">
            <input type="checkbox" name="active" defaultChecked={p.active} />
            Active in catalog
          </label>
        </div>
        <ErrorBox>{error}</ErrorBox>
        <button disabled={busy} className="button full">
          {busy ? "Saving…" : "Save product"}
        </button>
      </form>
    </dialog>
  );
}
export function Admin() {
  const [tab, setTab] = useState("Overview"),
    [edit, setEdit] = useState(undefined),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const products = useData("/admin/products"),
    orders = useData("/orders", 10000),
    partners = useData("/admin/partners");
  const { notice } = useApp();
  const paid = (orders.data || [])
    .filter((o) => o.paymentStatus === "PAID")
    .reduce((s, o) => s + o.totalMinor, 0);
  async function addPartner(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = e.currentTarget;
    try {
      await write("/admin/partners", Object.fromEntries(new FormData(form)));
      partners.refresh();
      form.reset();
      notice("Partner account created");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="wrap page">
      <span className="eyebrow">FRESHBASKET OPERATIONS</span>
      <h1>A fresh overview.</h1>
      <div className="tabs">
        {[
          ["Overview", LayoutDashboard],
          ["Products", Leaf],
          ["Orders", Package],
          ["Partners", Users],
        ].map(([name, Icon]) => (
          <button
            className={tab === name ? "selected" : ""}
            key={name}
            onClick={() => setTab(name)}
          >
            <Icon size={17} />
            {name}
          </button>
        ))}
      </div>
      <ErrorBox>
        {error || products.error || orders.error || partners.error}
      </ErrorBox>
      {tab === "Overview" && (
        <>
          <div className="stats">
            {[
              [IndianRupee, money(paid), "Paid revenue · latest 100 orders"],
              [
                ShoppingBasket,
                orders.data?.length || 0,
                "Recent orders · up to 100",
              ],
              [
                Package,
                (orders.data || []).filter(
                  (o) => !["DELIVERED", "CANCELLED"].includes(o.status),
                ).length,
                "Open orders in this view",
              ],
              [
                Leaf,
                (products.data || []).filter((p) => p.active && p.stock <= 5)
                  .length,
                "Low-stock products",
              ],
            ].map(([Icon, value, name]) => (
              <div className="panel stat" key={name}>
                <Icon />
                <strong>{value}</strong>
                <span>{name}</span>
              </div>
            ))}
          </div>
          <div className="section-heading">
            <h2>Latest orders</h2>
            <button className="text-button" onClick={() => setTab("Orders")}>
              View all <ArrowRight size={16} />
            </button>
          </div>
          {orders.data && <OrderCards orders={orders.data.slice(0, 6)} />}
        </>
      )}
      {tab === "Orders" &&
        (orders.data ? <OrderCards orders={orders.data} /> : <Loading />)}
      {tab === "Products" && (
        <>
          <div className="section-heading">
            <h2>Product catalog</h2>
            <button className="button" onClick={() => setEdit(null)}>
              <Plus size={17} />
              Add product
            </button>
          </div>
          <div className="panel table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(products.data || []).map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="table-product">
                        <img src={p.image} alt="" />
                        <span>
                          <strong>{p.name}</strong>
                          <small>
                            {p.category} · {p.unit}
                          </small>
                        </span>
                      </div>
                    </td>
                    <td>{money(p.priceMinor)}</td>
                    <td>
                      <span className={`badge ${p.stock <= 5 ? "low" : ""}`}>
                        {p.stock}
                      </span>
                    </td>
                    <td>{p.active ? "Active" : "Archived"}</td>
                    <td>
                      <div className="actions">
                        <button
                          className="icon-button"
                          aria-label={`Edit ${p.name}`}
                          onClick={() => setEdit(p)}
                        >
                          <Pencil size={17} />
                        </button>
                        {p.active && (
                          <button
                            className="text-button"
                            onClick={async () => {
                              if (!confirm(`Archive ${p.name}?`)) return;
                              try {
                                await write(
                                  `/admin/products/${p.id}`,
                                  {},
                                  "DELETE",
                                );
                                products.refresh();
                              } catch (e) {
                                setError(e.message);
                              }
                            }}
                          >
                            Archive
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {tab === "Partners" && (
        <div className="checkout-grid">
          <div className="panel">
            <h2>Your delivery team</h2>
            {(partners.data || []).map((p) => (
              <div className="partner-row" key={p.id}>
                <div className="avatar">
                  <Truck size={20} />
                </div>
                <div>
                  <strong>{p.user.name}</strong>
                  <small>{p.user.email}</small>
                </div>
                <span className="badge">
                  {p.available ? "Available" : "Offline"}
                </span>
              </div>
            ))}
          </div>
          <form className="panel" onSubmit={addPartner}>
            <h2>Add a delivery partner</h2>
            <label>
              Name
              <input name="name" required minLength={2} />
            </label>
            <label>
              Email
              <input name="email" type="email" required />
            </label>
            <label>
              Initial password
              <input
                name="password"
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
              />
            </label>
            <p className="muted small">
              Share the credentials privately with your partner.
            </p>
            <button className="button" disabled={busy}>
              Create partner
            </button>
          </form>
        </div>
      )}
      {edit !== undefined && (
        <ProductEditor
          product={edit}
          close={() => setEdit(undefined)}
          saved={() => {
            products.refresh();
            notice("Product saved");
          }}
        />
      )}
    </main>
  );
}
export function Delivery() {
  const { data, error } = useData("/orders", 10000),
    profile = useData("/delivery/profile");
  const { user, notice } = useApp();
  const [busy, setBusy] = useState(false);
  return (
    <main className="wrap page">
      <div className="section-heading">
        <div>
          <span className="eyebrow">DELIVERY PARTNER PORTAL</span>
          <h1>Good to see you, {user.name}.</h1>
          <p className="muted">Your next delivery starts here.</p>
        </div>
        <button
          className={`button ${profile.data?.available ? "" : "secondary"}`}
          disabled={busy || !profile.data}
          onClick={async () => {
            setBusy(true);
            try {
              await write(
                "/delivery/availability",
                { available: !profile.data.available },
                "PATCH",
              );
              profile.refresh();
            } catch (e) {
              notice(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <span className="dot" />
          {profile.data?.available
            ? "Available for deliveries"
            : "Offline · go available"}
        </button>
      </div>
      <ErrorBox>{error || profile.error}</ErrorBox>
      <h2>Active deliveries</h2>
      {data ? (
        <OrderCards
          orders={data.filter((o) =>
            ["READY", "OUT_FOR_DELIVERY"].includes(o.status),
          )}
        />
      ) : (
        <Loading />
      )}
      <h2 className="section">Completed deliveries</h2>
      {data && (
        <OrderCards orders={data.filter((o) => o.status === "DELIVERED")} />
      )}
    </main>
  );
}
