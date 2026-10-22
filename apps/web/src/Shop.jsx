import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Leaf,
  Truck,
  ShieldCheck,
  Plus,
  Minus,
  X,
  ShoppingBasket,
  Search,
  Check,
} from "lucide-react";
import { api, write, money, useApp, useData, ErrorBox, Loading } from "./lib";
export const categories = [
  ["Produce", "fruits_vegetables.png"],
  ["Dairy & eggs", "dairy_eggs.png"],
  ["Bakery", "bakery.png"],
  ["Beverages", "drinks.png"],
  ["Pantry", "pantry_staples.png"],
  ["Snacks", "snacks.png"],
  ["Frozen", "frozen_foods.png"],
  ["Personal care", "personal_care.png"],
  ["Baby care", "baby_care.png"],
  ["Meat & seafood", "meat_seafood.png"],
];
export function Home() {
  const { add, cart, quantity } = useApp();
  const [category, setCategory] = useState(""),
    [search, setSearch] = useState(""),
    [organic, setOrganic] = useState(false),
    [sort, setSort] = useState("name");
  const { data, error } = useData("/products");
  const products = (data || [])
    .filter(
      (p) =>
        (!category || p.category === category) &&
        (!organic || p.organic) &&
        p.name.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "low"
        ? a.priceMinor - b.priceMinor
        : sort === "high"
          ? b.priceMinor - a.priceMinor
          : a.name.localeCompare(b.name),
    );
  return (
    <>
      <section className="hero wrap">
        <div className="hero-copy">
          <span className="eyebrow">
            <Leaf size={15} /> A little fresher. Every day.
          </span>
          <h1>
            Good food.
            <br />
            Better <em>everydays.</em>
          </h1>
          <p>
            Fill your basket with the things you love.
            <br />
            Fresh essentials, thoughtfully picked for your home.
          </p>
          <a className="button" href="#catalog">
            Explore the market <ArrowRight size={18} />
          </a>
          <div className="hero-note">
            <span className="dot" /> Free delivery on orders ₹499 and above
          </div>
        </div>
        <div className="hero-art">
          <img
            src="/assets/hero_bg.jpeg"
            alt="A colourful selection of fresh groceries"
          />
          <div className="floating-note">
            <Leaf size={25} />
            <div>
              <strong>Freshness comes first</strong>
              <small>From your market to your doorstep</small>
            </div>
          </div>
        </div>
      </section>
      <div className="benefits wrap">
        <span>
          <Truck /> Delivered to your door
        </span>
        <span>
          <Leaf /> Organic options available
        </span>
        <span>
          <ShieldCheck /> Secure checkout
        </span>
      </div>
      <section className="wrap section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">THE EVERYDAY ESSENTIALS</span>
            <h2>A basket for every need.</h2>
          </div>
          <button
            className="text-button"
            onClick={() => {
              setCategory("");
              document
                .querySelector("#catalog")
                .scrollIntoView({ behavior: "smooth" });
            }}
          >
            Shop all <ArrowRight size={16} />
          </button>
        </div>
        <div className="categories">
          {categories.map(([name, image]) => (
            <button
              key={name}
              className={`category ${category === name ? "selected" : ""}`}
              onClick={() => {
                setCategory(category === name ? "" : name);
                document
                  .querySelector("#catalog")
                  .scrollIntoView({ behavior: "smooth" });
              }}
            >
              <div>
                <img src={`/assets/${image}`} alt="" />
              </div>
              <span>{name}</span>
            </button>
          ))}
        </div>
      </section>
      <section id="catalog" className="wrap section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">FILL YOUR BASKET</span>
            <h2>{category || "Fresh finds for your home."}</h2>
          </div>
          <span className="muted">{products.length} thoughtful picks</span>
        </div>
        <div className="filters">
          <label className="search">
            <Search size={19} />
            <input
              aria-label="Search products"
              placeholder="Find something fresh…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={organic}
              onChange={(e) => setOrganic(e.target.checked)}
            />{" "}
            Organic only
          </label>
          <select
            aria-label="Sort products"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="name">Name: A–Z</option>
            <option value="low">Price: low to high</option>
            <option value="high">Price: high to low</option>
          </select>
          {category && (
            <button className="chip" onClick={() => setCategory("")}>
              {category} <X size={14} />
            </button>
          )}
        </div>
        <ErrorBox>{error}</ErrorBox>
        {!data && !error ? (
          <Loading />
        ) : products.length ? (
          <div className="product-grid">
            {products.map((p) => (
              <article className="product" key={p.id}>
                <div className="product-image">
                  <img src={p.image} alt={p.name} loading="lazy" />
                  {p.organic && (
                    <span className="organic">
                      <Leaf size={12} />
                      Organic
                    </span>
                  )}
                </div>
                <div className="product-info">
                  <small>{p.category}</small>
                  <h3>{p.name}</h3>
                  <p>{p.unit}</p>
                  <div className="product-bottom">
                    <strong>{money(p.priceMinor)}</strong>
                    {cart[p.id] ? (
                      <div className="stepper">
                        <button
                          aria-label={`Remove one ${p.name}`}
                          onClick={() =>
                            quantity(p.id, cart[p.id].quantity - 1)
                          }
                        >
                          <Minus size={14} />
                        </button>
                        <span>{cart[p.id].quantity}</span>
                        <button
                          aria-label={`Add one ${p.name}`}
                          onClick={() => add(p)}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        className="add-button"
                        disabled={!p.stock}
                        onClick={() => add(p)}
                        aria-label={`Add ${p.name}`}
                      >
                        {p.stock ? (
                          <>
                            <Plus size={15} /> Add
                          </>
                        ) : (
                          "Sold out"
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty">
            <Search />
            <h3>No products found</h3>
            <p>Try another search or clear your filters.</p>
            <button
              className="button secondary"
              onClick={() => {
                setSearch("");
                setCategory("");
                setOrganic(false);
              }}
            >
              Clear filters
            </button>
          </div>
        )}
      </section>
      <section className="wrap promise">
        <div>
          <span className="eyebrow">LESS RUNNING AROUND. MORE LIVING.</span>
          <h2>
            Your weekly shop,
            <br />a little more effortless.
          </h2>
          <p>
            Build a basket, choose your address, and follow your order all the
            way home.
          </p>
          <a className="button" href="#catalog">
            Start your basket <ArrowRight size={17} />
          </a>
        </div>
        <img
          src="/assets/fruits_vegetables.png"
          alt="A fresh vegetable basket"
        />
      </section>
    </>
  );
}
export function CartDrawer({ close }) {
  const { cart, quantity, user } = useApp();
  const dialog = useRef();
  const entries = Object.values(cart),
    total = entries.reduce(
      (sum, i) => sum + i.product.priceMinor * i.quantity,
      0,
    );
  useEffect(() => {
    const d = dialog.current;
    d.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
    };
  }, []);
  return (
    <dialog
      className="drawer"
      ref={dialog}
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="drawer-inner">
        <div className="section-heading">
          <h2>
            Your basket <span className="count">{entries.length}</span>
          </h2>
          <button
            className="icon-button"
            aria-label="Close basket"
            onClick={close}
          >
            <X />
          </button>
        </div>
        {!entries.length ? (
          <div className="empty">
            <ShoppingBasket size={50} />
            <h3>Good things start here.</h3>
            <p>Add a few favourites to your basket.</p>
            <button className="button" onClick={close}>
              Explore the market
            </button>
          </div>
        ) : (
          <>
            <div className="cart-items">
              {entries.map(({ product: p, quantity: qty }) => (
                <div className="cart-row" key={p.id}>
                  <img src={p.image} alt="" />
                  <div>
                    <strong>{p.name}</strong>
                    <small>
                      {money(p.priceMinor)} / {p.unit}
                    </small>
                    <div className="stepper">
                      <button
                        aria-label={`Remove one ${p.name}`}
                        onClick={() => quantity(p.id, qty - 1)}
                      >
                        <Minus size={14} />
                      </button>
                      <span>{qty}</span>
                      <button
                        aria-label={`Add one ${p.name}`}
                        onClick={() => quantity(p.id, qty + 1)}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                  <strong>{money(p.priceMinor * qty)}</strong>
                </div>
              ))}
            </div>
            <div className="cart-summary">
              <p className="delivery-note">
                {total >= 49900
                  ? "You have unlocked free delivery."
                  : `Add ${money(49900 - total)} for free delivery.`}
              </p>
              <div className="spread">
                <span>Subtotal</span>
                <strong>{money(total)}</strong>
              </div>
              <div className="spread">
                <span>Delivery</span>
                <strong>{total >= 49900 ? "Free" : money(3900)}</strong>
              </div>
              <small className="muted">
                Prices and availability are checked at checkout.
              </small>
              <Link
                className="button full"
                to={user ? "/checkout" : "/login?next=/checkout"}
                onClick={close}
              >
                Continue to checkout <ArrowRight size={17} />
              </Link>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
export function Login() {
  const { setUser } = useApp();
  const navigate = useNavigate();
  const [register, setRegister] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const user = await write(
        `/auth/${register ? "register" : "login"}`,
        Object.fromEntries(new FormData(e.currentTarget)),
      );
      setUser(user);
      const next = new URLSearchParams(location.search).get("next");
      navigate(
        user.role === "ADMIN"
          ? "/admin"
          : user.role === "DELIVERY_PARTNER"
            ? "/delivery"
            : next === "/checkout"
              ? next
              : "/",
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="wrap auth-page">
      <div className="auth-art">
        <Leaf size={38} />
        <h1>
          Welcome to
          <br />
          your fresh start.
        </h1>
        <img src="/assets/fruits_vegetables.png" alt="Fresh produce" />
      </div>
      <form className="panel auth-form" onSubmit={submit}>
        <span className="eyebrow">YOUR DAILY DOSE OF FRESH</span>
        <h2>
          {register ? "Make yourself at home." : "Good to see you again."}
        </h2>
        <p className="muted">
          {register
            ? "Create your customer account."
            : "One sign-in for customers, managers, and delivery partners."}
        </p>
        {register && (
          <label>
            Your name
            <input name="name" autoComplete="name" required minLength={2} />
          </label>
        )}
        <label>
          Email address
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete={register ? "new-password" : "current-password"}
            required
            minLength={10}
          />
        </label>
        <ErrorBox>{error}</ErrorBox>
        <button className="button full" disabled={busy}>
          {busy ? "Please wait…" : register ? "Create account" : "Sign in"}
          <ArrowRight size={17} />
        </button>
        <button
          className="text-button"
          type="button"
          onClick={() => {
            setRegister(!register);
            setError("");
          }}
        >
          {register
            ? "Already have an account? Sign in"
            : "New here? Create an account"}
        </button>
      </form>
    </main>
  );
}
export function Checkout() {
  const { cart, setCart, user } = useApp();
  const navigate = useNavigate();
  const [step, setStep] = useState(0),
    [address, setAddress] = useState({
      name: user?.name || "",
      phone: "",
      line: "",
      city: "",
      postalCode: "",
    }),
    [paymentMethod, setPayment] = useState("COD"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const { data: config } = useData("/config"),
    { data: catalog, error: catalogError } = useData("/products");
  const attempt = useRef(null);
  const entries = Object.values(cart).map((i) => ({
    ...i,
    product: catalog?.find((p) => p.id === i.product.id) || i.product,
  }));
  const total = entries.reduce(
      (s, i) => s + i.product.priceMinor * i.quantity,
      0,
    ),
    delivery = total >= 49900 ? 0 : 3900;
  async function submit() {
    setBusy(true);
    setError("");
    const payload = {
      items: entries.map((i) => ({
        productId: i.product.id,
        quantity: i.quantity,
      })),
      address,
      paymentMethod,
    };
    const serialized = JSON.stringify(payload);
    if (!attempt.current || attempt.current.body !== serialized)
      attempt.current = { body: serialized, key: crypto.randomUUID() };
    try {
      const result = await write("/checkout", payload, "POST", {
        "Idempotency-Key": attempt.current.key,
      });
      setCart({});
      if (result.url) location.assign(result.url);
      else navigate(`/orders/${result.orderId}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!entries.length)
    return (
      <div className="wrap empty">
        <ShoppingBasket size={40} />
        <h2>Your basket is empty.</h2>
        <Link to="/" className="button">
          Explore the market
        </Link>
      </div>
    );
  return (
    <main className="wrap page">
      <Link className="back" to="/">
        ← Continue shopping
      </Link>
      <h1>A few details, then fresh.</h1>
      <div className="checkout-grid">
        <section className="panel">
          <div className="steps">
            {["Address", "Payment", "Review"].map((s, i) => (
              <span className={step >= i ? "current" : ""} key={s}>
                <b>{step > i ? <Check size={14} /> : i + 1}</b>
                {s}
              </span>
            ))}
          </div>
          {step === 0 ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setStep(1);
              }}
            >
              <h2>Where should we deliver?</h2>
              <div className="form-grid">
                {[
                  ["name", "Full name"],
                  ["phone", "Phone number"],
                  ["line", "House, street & area"],
                  ["city", "City"],
                  ["postalCode", "PIN code"],
                ].map(([key, text]) => (
                  <label key={key} className={key === "line" ? "wide" : ""}>
                    {text}
                    <input
                      required
                      value={address[key]}
                      minLength={key === "line" ? 8 : 2}
                      maxLength={key === "line" ? 300 : 80}
                      pattern={
                        key === "phone"
                          ? "\+?[0-9]{10,15}"
                          : key === "postalCode"
                            ? "[0-9]{6}"
                            : undefined
                      }
                      onChange={(e) =>
                        setAddress({ ...address, [key]: e.target.value })
                      }
                    />
                  </label>
                ))}
              </div>
              <button className="button">
                Continue <ArrowRight size={16} />
              </button>
            </form>
          ) : step === 1 ? (
            <div>
              <h2>How would you like to pay?</h2>
              <label className="payment-option">
                <input
                  type="radio"
                  checked={paymentMethod === "COD"}
                  onChange={() => setPayment("COD")}
                />
                <div>
                  <strong>Cash on delivery</strong>
                  <p>Pay your delivery partner when your order arrives.</p>
                </div>
              </label>
              <label
                className={`payment-option ${!config?.onlinePayment ? "disabled" : ""}`}
              >
                <input
                  type="radio"
                  disabled={!config?.onlinePayment}
                  checked={paymentMethod === "STRIPE"}
                  onChange={() => setPayment("STRIPE")}
                />
                <div>
                  <strong>Secure card payment</strong>
                  <p>
                    {config?.onlinePayment
                      ? "Complete payment with Stripe Checkout."
                      : "Unavailable until online payments are configured."}
                  </p>
                </div>
              </label>
              <div className="actions">
                <button className="button secondary" onClick={() => setStep(0)}>
                  Back
                </button>
                <button className="button" onClick={() => setStep(2)}>
                  Review order <ArrowRight size={16} />
                </button>
              </div>
            </div>
          ) : (
            <div>
              <h2>Everything look good?</h2>
              <p>
                <strong>{address.name}</strong>
                <br />
                {address.line}
                <br />
                {address.city}, {address.postalCode}
                <br />
                {address.phone}
              </p>
              <p className="chip">
                {paymentMethod === "COD"
                  ? "Cash on delivery"
                  : "Stripe Checkout"}
              </p>
              <p className="muted">
                Your order is confirmed after stock and current prices are
                checked. Product prices include applicable taxes.
              </p>
              <ErrorBox>{error || catalogError}</ErrorBox>
              <div className="actions">
                <button
                  disabled={busy}
                  className="button secondary"
                  onClick={() => setStep(1)}
                >
                  Back
                </button>
                <button
                  disabled={busy || !catalog}
                  className="button"
                  onClick={submit}
                >
                  {busy
                    ? "Placing order…"
                    : `Place order · ${money(total + delivery)}`}
                </button>
              </div>
            </div>
          )}
        </section>
        <aside className="panel order-summary">
          <h3>Your fresh picks</h3>
          {entries.map((i) => (
            <div className="summary-item" key={i.product.id}>
              <img src={i.product.image} alt="" />
              <span>
                {i.product.name}
                <small>Qty {i.quantity}</small>
              </span>
              <strong>{money(i.product.priceMinor * i.quantity)}</strong>
            </div>
          ))}
          <div className="spread">
            <span>Subtotal</span>
            <span>{money(total)}</span>
          </div>
          <div className="spread">
            <span>Delivery</span>
            <span>{delivery ? money(delivery) : "Free"}</span>
          </div>
          <div className="spread total">
            <strong>Total</strong>
            <strong>{money(total + delivery)}</strong>
          </div>
        </aside>
      </div>
    </main>
  );
}
