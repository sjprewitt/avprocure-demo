# AVProcure Design Note — Mobile Work Cart (dedicated floor terminal)

**Status:** Planning — **ON HOLD** (display + mount cost too high for now) · **Author:** design discussion, 2026-07-27

---

## 1. Vision
A rolling warehouse cart with a dedicated AVProcure terminal, so the app becomes a **floor
tool**: scan a serial at the shelf and deploy/receive/put-away/count *where the equipment
physically is*, instead of walking back to a desk. Pairs directly with the just-shipped wedge
scanner support and the deployment cart.

## 2. Decisions locked (from user, 2026-07-27)
- **Terminal:** mini-PC + touchscreen (desktop-grade browser; needs a cart battery for mobility).
- **Workflows (all four):** scan & deploy · receive & put-away · cycle counts/audits · add & locate.
- **Connectivity:** mostly online with brief drops → **blip resilience, not a full offline rebuild.**
- **Operator identity:** a shared "cart" login stays signed in + a **quick operator picker** on each
  release, so the paper trail's `releasedBy` names the real person without a login step every time.
- **Label printing:** **yes** — include a thermal label printer + a label template.
- **On hold (2026-07-27):** deferred purely on hardware cost (display + mount). Design is settled;
  resume when budget allows. Software Phase A can proceed independently since it needs no cart.

## 3. The one architectural truth
AVProcure is **server-hosted** (Apache/PHP/SQLite on the Pi); the cart is a *thin client*. WiFi to
the Pi is its lifeline. Because coverage is "mostly reliable," the goal is to **not lose an
in-progress action on a momentary drop** — cheap to achieve by extending the write path we already
have (§6, Phase A) — rather than a full offline PWA (deferred to Phase D unless dead zones appear).

## 4. Hardware — bill of materials
| Item | Recommendation | Notes |
|---|---|---|
| Mini-PC | Fanless Intel N100/N305 class | Silent, cheap, ample for a browser; low draw (~10–20 W). |
| Touchscreen | 15.6"–21.5" capacitive (USB touch + HDMI) | Bigger = easier tap targets at the shelf. |
| Battery | Portable power station ~300–500 Wh, **or** a 12–19 V DC-UPS | Mini-PC + screen draw ~30–60 W → several hours/shift; size to shift length. |
| Mount | VESA articulating arm on the cart | Tilt/height for standing use. |
| Cart | Utility/AV cart w/ work surface + lower shelf | Shelf holds the battery; surface for staging boxes. |
| Scanner | Bluetooth **2D wedge** scanner (keyboard-emulating) | Already supported (v0.7.23.26.x); pairs as a keyboard, no driver. |
| Label printer **(included)** | Thermal (Zebra ZD-series / Brother QL) | User wants on-cart label printing (location/asset/serial). |
| Input backup | Small wireless keyboard/trackpad | Fallback to touch. |

## 5. Kiosk, OS & network setup
- **OS:** Linux kiosk (matches your Pi/Linux comfort) — minimal Debian/Ubuntu + Chromium launched
  `--kiosk` at the AVProcure URL, or a purpose-built kiosk image. Auto-login to a low-privilege user.
- **Reaching the Pi:** on the warehouse LAN, point at the Pi directly (fast); use **Tailscale
  MagicDNS** if the cart roams beyond the LAN. Keep HTTPS via the existing cert/hostname.
- **Session:** the cart uses the existing gate.php cookie session. Two competing needs — keep the
  shift logged in (keep-alive ping) **but** auto-lock an unattended cart (§6 Phase C).
- **Security:** an always-logged-in cart on the floor is the main risk. Mitigations: a low-priv
  cart account, an app-level idle auto-lock (PIN to resume), and capturing the human on each
  release (we already record `recipient`; see the operator-login open question in §8).

## 6. Software work in AVProcure (phased, each independently shippable)
- **Phase A — Blip resilience (small; benefits *every* user, not just the cart).**
  The write path (`dbSave`/`dbDelete`, js/core.js) already has a `_failedQueue`, a pending-save
  badge, and a reauth flow — but a *network* error currently only logs (`_dbFail`) instead of
  queueing. Extend the `.catch` to enqueue the failed write, add `window` `online`/`offline`
  listeners + a periodic retry that flushes `_failedQueue`, and surface a connectivity/"pending
  sync" indicator. Result: a brief WiFi drop no longer loses a save — it retries on reconnect.
- **Phase B — Cart Mode UI.**
  A touch skin + launcher, entered via `?mode=cart` (or a toggle). A `body.cart-mode` class scales
  up tap targets/fonts in css/app.css; a launcher home screen with four big tiles — **Scan &
  Deploy · Receive & Put-away · Count · Add & Locate** — deep-links into the *existing* pages
  (no rewrite). Scanner-first: focus stays ready for the wedge gun. Reuses the deploy cart, receive
  flow, inventory table, and warehouse map already built.
- **Phase C — Kiosk session handling.**
  App-level idle auto-lock (blur + PIN to resume), a session keep-alive so a working shift isn't
  logged out, and the **operator picker** (decided): a shared cart login with a fast per-release
  person selector so the deployment paper trail's `releasedBy` reflects the actual person.
- **Phase B+ — Label printing (decided).** Drive the thermal printer from the app with a label
  template (location / asset / serial), reusing the manifest print pipeline; print from the
  inventory row, the put-away flow, and the locations tree.
- **Phase D — Full offline (deferred).** Only if real dead zones emerge: a PWA/service-worker
  cache + a durable write queue. Explicitly out of scope for now given "mostly online."

## 7. Cycle counts — the one genuinely new workflow
Deploy, receive, put-away, and add/locate already exist; Phase B mostly re-skins them. **Cycle
counts/audits** has no home yet: a guided "count this shelf" mode (scan a location → list its
expected units → scan/confirm present → flag missing/extra → post adjustments to the transfers
audit log). Worth scoping as its own mini-feature within Phase B or just after.

## 8. Open questions (remaining)
1. **Budget ceiling** for the hardware build (steers screen size, battery capacity, printer) — the
   current blocker; display + mount are the costly pieces.
2. **LAN vs Tailscale** as the cart's primary path to the Pi.

## 9. Suggested first step (when resumed)
The project is **on hold on hardware cost**, but **Phase A (blip resilience)** needs no cart and
benefits every existing desktop user — so it can ship anytime, independently, and de-risks the cart
in advance. Do it first; then Phase B (Cart Mode) once a physical unit exists to tune touch
ergonomics against.
