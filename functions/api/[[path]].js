const SESSION_COOKIE = "__Host-ezqrprint-session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Cloudflare Workers currently caps Web Crypto PBKDF2 at 100,000 iterations.
const PASSWORD_ITERATIONS = 100_000;
const FILE_TTL_SECONDS = 24 * 60 * 60;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_ORDER_FILES = 20;
const MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

function fail(message, status = 400) {
  return json({ error: message }, status);
}

function cookieValue(request, name) {
  const part = request.headers.get("Cookie")?.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : null;
}

function randomHex(size = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function derivePassword(password, saltHex) {
  const salt = Uint8Array.from(saltHex.match(/.{2}/g), (part) => Number.parseInt(part, 16));
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PASSWORD_ITERATIONS }, material, 256);
  return Array.from(new Uint8Array(bits), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function getOwner(request, env) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await env.DB.prepare(
    "SELECT owners.id, owners.email FROM sessions JOIN owners ON owners.id = sessions.owner_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?",
  ).bind(await sha256(token), Date.now()).first();
  return session ? { id: session.id, email: session.email } : null;
}

async function requireOwner(request, env) {
  const owner = await getOwner(request, env);
  return owner ? { owner } : { response: fail("Sign in to continue.", 401) };
}

function sessionCookie(token) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

async function deleteShopFiles(env, shopId) {
  const page = await env.FILES.list({ prefix: `files/${shopId}/`, limit: 900 });
  for (let index = 0; index < page.keys.length; index += 100) {
    await Promise.all(page.keys.slice(index, index + 100).map(({ name }) => env.FILES.delete(name)));
  }
  return page.list_complete;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function validUuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function safeShop(row, includeOwner = false) {
  if (!row) return null;
  return {
    id: row.id,
    ...(includeOwner ? { ownerUid: row.owner_id } : {}),
    shopName: row.shop_name,
    slug: row.slug,
    ...(row.upi_id ? { upiId: row.upi_id, upiPayeeName: row.upi_payee_name } : {}),
    rates: {
      bwPerPage: row.bw_per_page,
      colorPerPage: row.color_per_page,
      bwDoubleSidedPerPage: row.bw_double_sided_per_page,
      colorDoubleSidedPerPage: row.color_double_sided_per_page,
    },
    ...(includeOwner ? { dailyCounter: row.daily_counter, lastOrderDate: row.last_order_date, createdAt: row.created_at } : {}),
  };
}

function ownerOrder(row) {
  const expired = row.expires_at <= Date.now();
  return {
    id: row.id,
    shopId: row.shop_id,
    tokenNumber: row.token_number,
    status: row.status,
    filesPurged: Boolean(row.files_purged) || expired,
    totalAmount: row.total_amount,
    finalAmount: row.final_amount,
    createdAt: { milliseconds: row.created_at },
    expiresAt: { milliseconds: row.expires_at },
    files: JSON.parse(row.files_json),
  };
}

function expectedStoragePath(shopId, orderId, storagePath) {
  const prefix = `files/${shopId}/${orderId}/`;
  return typeof storagePath === "string" && storagePath.startsWith(prefix) && /^[a-f0-9-]{36}$/i.test(storagePath.slice(prefix.length));
}

async function validateFiles(value, shopId, orderId, rates, env) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_ORDER_FILES) throw new Error(`Add between 1 and ${MAX_ORDER_FILES} files.`);
  const files = [];
  for (const file of value) {
    if (!file || typeof file !== "object") throw new Error("Invalid print file details.");
    const { fileName, storagePath, mimeType, pageCount, copies, colorMode, printSides, printNote } = file;
    if (typeof fileName !== "string" || !fileName.trim() || fileName.length > 255 || !expectedStoragePath(shopId, orderId, storagePath) || !MIME_TYPES.has(mimeType) || !Number.isSafeInteger(pageCount) || pageCount < 1 || pageCount > 10000 || !Number.isSafeInteger(copies) || copies < 1 || copies > 100 || !["bw", "color"].includes(colorMode) || !["single", "double"].includes(printSides) || !["standard", "id-card"].includes(printNote) || (mimeType === "application/pdf" && printNote !== "standard") || (mimeType !== "application/pdf" && pageCount !== 1)) throw new Error(`Invalid file: ${fileName || "unknown"}.`);
    if (!await env.FILES.get(storagePath, "stream")) throw new Error(`The upload for ${fileName} expired or could not be found. Please upload it again.`);
    const rate = colorMode === "bw"
      ? printSides === "double" ? rates.bwDoubleSidedPerPage : rates.bwPerPage
      : printSides === "double" ? rates.colorDoubleSidedPerPage : rates.colorPerPage;
    const itemCost = pageCount * copies * rate;
    if (!Number.isFinite(itemCost)) throw new Error("The order total is invalid.");
    files.push({ fileName, storagePath, downloadUrl: "", mimeType, pageCount, copies, colorMode, printSides, printNote, itemCost });
  }
  return files;
}

async function authRoutes(request, env, path) {
  if (path === "auth/register" && request.method === "POST") {
    const body = await readJson(request);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return fail("Enter a valid email address.");
    if (password.length < 8 || password.length > 128) return fail("Use a password between 8 and 128 characters.");
    const id = crypto.randomUUID();
    const salt = randomHex(16);
    const passwordHash = await derivePassword(password, salt);
    try {
      await env.DB.prepare("INSERT INTO owners (id, email, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?)").bind(id, email, passwordHash, salt, Date.now()).run();
    } catch {
      return fail("An account with this email already exists.", 409);
    }
    return createSession(env, id, email);
  }

  if (path === "auth/login" && request.method === "POST") {
    const body = await readJson(request);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const owner = await env.DB.prepare("SELECT id, email, password_hash, password_salt FROM owners WHERE email = ?").bind(email).first();
    if (!owner || !constantTimeEqual(await derivePassword(password, owner.password_salt), owner.password_hash)) return fail("Email or password is incorrect.", 401);
    return createSession(env, owner.id, owner.email);
  }

  if (path === "auth/me" && request.method === "GET") {
    const owner = await getOwner(request, env);
    return json({ user: owner ? { uid: owner.id, email: owner.email } : null });
  }

  if (path === "auth/account" && request.method === "DELETE") {
    const owner = await getOwner(request, env);
    if (!owner) return fail("Sign in to continue.", 401);
    const body = await readJson(request);
    const password = typeof body?.password === "string" ? body.password : "";
    if (password.length < 8 || password.length > 128) return fail("Enter your current password to delete your account.");
    const credentials = await env.DB.prepare("SELECT password_hash, password_salt FROM owners WHERE id = ?").bind(owner.id).first();
    if (!credentials || !constantTimeEqual(await derivePassword(password, credentials.password_salt), credentials.password_hash)) return fail("The current password is incorrect.", 401);

    const shop = await env.DB.prepare("SELECT id FROM shops WHERE owner_id = ?").bind(owner.id).first();
    const statements = [];
    if (shop) statements.push(env.DB.prepare("DELETE FROM orders WHERE shop_id = ?").bind(shop.id));
    statements.push(env.DB.prepare("DELETE FROM shops WHERE owner_id = ?").bind(owner.id));
    statements.push(env.DB.prepare("DELETE FROM sessions WHERE owner_id = ?").bind(owner.id));
    statements.push(env.DB.prepare("DELETE FROM owners WHERE id = ?").bind(owner.id));
    await env.DB.batch(statements);

    if (shop) {
      try {
        const filesRemoved = await deleteShopFiles(env, shop.id);
        if (!filesRemoved) console.warn("EZQRPRINT account deleted; remaining uploaded files will expire automatically.");
      } catch (error) {
        console.error("EZQRPRINT account deleted; uploaded file cleanup will rely on automatic expiry.", error);
      }
    }
    return json({ ok: true }, 200, { "set-cookie": clearSessionCookie() });
  }

  if (path === "auth/logout" && request.method === "POST") {
    const token = cookieValue(request, SESSION_COOKIE);
    if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
    return json({ ok: true }, 200, { "set-cookie": clearSessionCookie() });
  }

  return null;
}

async function createSession(env, ownerId, email) {
  const token = randomHex();
  await env.DB.prepare("INSERT INTO sessions (token_hash, owner_id, expires_at) VALUES (?, ?, ?)").bind(await sha256(token), ownerId, Date.now() + SESSION_TTL_MS).run();
  return json({ user: { uid: ownerId, email } }, 200, { "set-cookie": sessionCookie(token) });
}

async function upload(request, env) {
  let form;
  try { form = await request.formData(); } catch { return fail("Choose a supported print file."); }
  const orderId = form.get("orderId");
  const shopId = form.get("shopId");
  const mimeType = form.get("mimeType");
  const file = form.get("file");
  if (!validUuid(orderId) || typeof shopId !== "string" || shopId.length > 128 || !(file instanceof File)) return fail("Invalid upload details.");
  if (!MIME_TYPES.has(mimeType) || file.size < 1 || file.size > MAX_FILE_BYTES) return fail("Choose a non-empty PDF, JPG, JPEG, or PNG file up to 25 MB.");
  const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const signatureMatches = mimeType === "application/pdf"
    ? new TextDecoder().decode(await file.slice(0, 1024).arrayBuffer()).includes("%PDF-")
    : mimeType === "image/jpeg"
      ? signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff
      : signature.length === 8 && signature[0] === 0x89 && signature[1] === 0x50 && signature[2] === 0x4e && signature[3] === 0x47 && signature[4] === 0x0d && signature[5] === 0x0a && signature[6] === 0x1a && signature[7] === 0x0a;
  if (!signatureMatches) return fail("The file contents do not match the selected file type.");
  const shop = await env.DB.prepare("SELECT id FROM shops WHERE id = ?").bind(shopId).first();
  if (!shop) return fail("This EZQRPRINT shop is not available.", 404);
  const storagePath = `files/${shopId}/${orderId}/${crypto.randomUUID()}`;
  await env.FILES.put(storagePath, await file.arrayBuffer(), { expirationTtl: FILE_TTL_SECONDS, metadata: { contentType: mimeType, fileName: file.name.slice(0, 255) } });
  return json({ storagePath });
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
  const authResponse = await authRoutes(request, env, path);
  if (authResponse) return authResponse;

  if (path === "uploads" && request.method === "POST") return upload(request, env);
  const uploadMatch = path.match(/^uploads\/([0-9a-f-]{36})$/i);
  if (uploadMatch && request.method === "DELETE") {
    const url = new URL(request.url);
    const shopId = url.searchParams.get("shopId");
    const orderId = url.searchParams.get("orderId");
    const storagePath = `files/${shopId}/${orderId}/${uploadMatch[1]}`;
    if (!validUuid(orderId) || typeof shopId !== "string") return fail("Invalid upload details.");
    await env.FILES.delete(storagePath);
    return json({ ok: true });
  }
  if (path === "health" && request.method === "GET") return json({ ok: true });

  const publicShopMatch = path.match(/^shops\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
  if (publicShopMatch && request.method === "GET") {
    const row = await env.DB.prepare("SELECT * FROM shops WHERE slug = ?").bind(publicShopMatch[1]).first();
    return row ? json({ shop: safeShop(row) }) : fail("This EZQRPRINT shop could not be found.", 404);
  }

  if (path === "shop" && request.method === "GET") {
    const auth = await requireOwner(request, env); if (auth.response) return auth.response;
    const row = await env.DB.prepare("SELECT * FROM shops WHERE owner_id = ?").bind(auth.owner.id).first();
    return json({ shop: safeShop(row, true) });
  }

  if (path === "shop" && request.method === "PUT") {
    const auth = await requireOwner(request, env); if (auth.response) return auth.response;
    const body = await readJson(request);
    const shopName = typeof body?.shopName === "string" ? body.shopName.trim() : "";
    const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
    const bw = body?.rates?.bwPerPage;
    const color = body?.rates?.colorPerPage;
    const existing = await env.DB.prepare("SELECT * FROM shops WHERE owner_id = ?").bind(auth.owner.id).first();
    const bwDoubleSided = body?.rates?.bwDoubleSidedPerPage ?? existing?.bw_double_sided_per_page ?? bw;
    const colorDoubleSided = body?.rates?.colorDoubleSidedPerPage ?? existing?.color_double_sided_per_page ?? color;
    const upiId = typeof body?.upiId === "string" ? body.upiId.trim() : "";
    const payee = typeof body?.upiPayeeName === "string" ? body.upiPayeeName.trim() : "";
    if (!shopName || shopName.length > 80) return fail("Enter a shop name up to 80 characters.");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 50) return fail("Use lowercase letters, numbers, and single hyphens for the shop URL.");
    if (typeof bw !== "number" || !Number.isFinite(bw) || bw < 0 || bw > 100000 || typeof color !== "number" || !Number.isFinite(color) || color < 0 || color > 100000 || typeof bwDoubleSided !== "number" || !Number.isFinite(bwDoubleSided) || bwDoubleSided < 0 || bwDoubleSided > 100000 || typeof colorDoubleSided !== "number" || !Number.isFinite(colorDoubleSided) || colorDoubleSided < 0 || colorDoubleSided > 100000) return fail("Enter valid non-negative per-page rates.");
    if (Boolean(upiId) !== Boolean(payee) || upiId.length > 100 || payee.length > 100) return fail("Enter both UPI ID and payee name, or leave both blank.");
    const collision = await env.DB.prepare("SELECT owner_id FROM shops WHERE slug = ? AND owner_id <> ?").bind(slug, auth.owner.id).first();
    if (collision) return fail("That shop URL is already in use. Choose another.", 409);
    const now = Date.now();
    const day = istDateKey(now);
    await env.DB.prepare(`INSERT INTO shops (id, owner_id, shop_name, slug, upi_id, upi_payee_name, bw_per_page, color_per_page, bw_double_sided_per_page, color_double_sided_per_page, daily_counter, last_order_date, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 100, ?, ?)
      ON CONFLICT(owner_id) DO UPDATE SET shop_name=excluded.shop_name, slug=excluded.slug, upi_id=excluded.upi_id, upi_payee_name=excluded.upi_payee_name, bw_per_page=excluded.bw_per_page, color_per_page=excluded.color_per_page, bw_double_sided_per_page=excluded.bw_double_sided_per_page, color_double_sided_per_page=excluded.color_double_sided_per_page`).bind(
      existing?.id ?? auth.owner.id, auth.owner.id, shopName, slug, upiId || null, payee || null, bw, color, bwDoubleSided, colorDoubleSided, existing?.last_order_date ?? day, existing?.created_at ?? now,
    ).run();
    const saved = await env.DB.prepare("SELECT * FROM shops WHERE owner_id = ?").bind(auth.owner.id).first();
    return json({ shop: safeShop(saved, true) });
  }

  if (path === "orders" && request.method === "GET") {
    const auth = await requireOwner(request, env); if (auth.response) return auth.response;
    const shop = await env.DB.prepare("SELECT id FROM shops WHERE owner_id = ?").bind(auth.owner.id).first();
    if (!shop) return json({ orders: [] });
    const status = url.searchParams.get("status") ?? "active";
    let rows;
    if (status === "completed") {
      const start = Number(url.searchParams.get("start")); const end = Number(url.searchParams.get("end"));
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return fail("Choose a valid date range.");
      rows = await env.DB.prepare("SELECT * FROM orders WHERE shop_id = ? AND status = 'completed' AND created_at >= ? AND created_at < ? ORDER BY created_at ASC").bind(shop.id, start, end).all();
    } else {
      rows = await env.DB.prepare("SELECT * FROM orders WHERE shop_id = ? AND status IN ('pending', 'printing', 'awaiting_payment') ORDER BY created_at ASC").bind(shop.id).all();
    }
    return json({ orders: rows.results.map(ownerOrder) });
  }

  if (path === "orders" && request.method === "POST") {
    const body = await readJson(request);
    const { id, shopId, files: rawFiles } = body ?? {};
    if (!validUuid(id) || typeof shopId !== "string") return fail("Invalid order details.");
    const shop = await env.DB.prepare("SELECT * FROM shops WHERE id = ?").bind(shopId).first();
    if (!shop) return fail("This EZQRPRINT shop is not available.", 404);
    let files;
    try { files = await validateFiles(rawFiles, shopId, id, { bwPerPage: shop.bw_per_page, colorPerPage: shop.color_per_page, bwDoubleSidedPerPage: shop.bw_double_sided_per_page, colorDoubleSidedPerPage: shop.color_double_sided_per_page }, env); }
    catch (error) { return fail(error instanceof Error ? error.message : "Invalid print file details."); }
    const totalAmount = files.reduce((total, file) => total + file.itemCost, 0);
    const now = Date.now();
    const today = istDateKey(now);
    const counter = await env.DB.prepare("UPDATE shops SET daily_counter = CASE WHEN last_order_date = ? THEN daily_counter + 1 ELSE 101 END, last_order_date = ? WHERE id = ? RETURNING daily_counter").bind(today, today, shopId).first();
    if (!counter) return fail("This EZQRPRINT shop is no longer available.", 404);
    try {
      await env.DB.prepare("INSERT INTO orders (id, shop_id, token_number, status, payment_claimed, files_purged, total_amount, final_amount, created_at, expires_at, files_json) VALUES (?, ?, ?, 'pending', 0, 0, ?, ?, ?, ?, ?)").bind(id, shopId, counter.daily_counter, totalAmount, totalAmount, now, now + FILE_TTL_SECONDS * 1000, JSON.stringify(files)).run();
    } catch (error) { return fail("This order session already exists or could not be saved.", 409); }
    return json({ order: { id, tokenNumber: counter.daily_counter } }, 201);
  }

  const fileMatch = path.match(/^orders\/([0-9a-f-]{36})\/files\/([0-9a-f-]{36})$/i);
  if (fileMatch && request.method === "GET") {
    const auth = await requireOwner(request, env); if (auth.response) return auth.response;
    const row = await env.DB.prepare("SELECT orders.files_json, orders.files_purged, orders.expires_at FROM orders JOIN shops ON shops.id = orders.shop_id WHERE orders.id = ? AND shops.owner_id = ?").bind(fileMatch[1], auth.owner.id).first();
    if (!row || row.files_purged || row.expires_at <= Date.now()) return fail("This print file is no longer available.", 404);
    const file = JSON.parse(row.files_json).find((entry) => entry.storagePath.endsWith(`/${fileMatch[2]}`));
    if (!file) return fail("This print file is not part of the order.", 404);
    const object = await env.FILES.get(file.storagePath, "stream");
    if (!object) return fail("This print file has expired.", 404);
    const safeName = file.fileName.replace(/[\r\n"\\]/g, "_");
    return new Response(object, { headers: { "content-type": file.mimeType, "content-disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  }

  const orderPath = path.match(/^orders\/([0-9a-f-]{36})(?:\/(files|purge))?$/i);
  if (orderPath && request.method === "GET" && !orderPath[2]) {
    const row = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(orderPath[1]).first();
    if (!row) return fail("This order is no longer available.", 404);
    return json({ order: ownerOrder(row) });
  }

  if (orderPath && orderPath[2] === "files" && request.method === "POST") {
    const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(orderPath[1]).first();
    if (!order) return fail("This order is no longer available.", 404);
    if (!["pending", "printing"].includes(order.status) || order.files_purged || order.expires_at <= Date.now()) return fail("More files cannot be added to this order.", 409);
    const shop = await env.DB.prepare("SELECT * FROM shops WHERE id = ?").bind(order.shop_id).first();
    const body = await readJson(request);
    let newFiles;
    try { newFiles = await validateFiles(body?.files, order.shop_id, order.id, { bwPerPage: shop.bw_per_page, colorPerPage: shop.color_per_page, bwDoubleSidedPerPage: shop.bw_double_sided_per_page, colorDoubleSidedPerPage: shop.color_double_sided_per_page }, env); }
    catch (error) { return fail(error instanceof Error ? error.message : "Invalid print file details."); }
    const existingFiles = JSON.parse(order.files_json);
    if (existingFiles.length + newFiles.length > MAX_ORDER_FILES) return fail(`An order can contain up to ${MAX_ORDER_FILES} files.`);
    const files = [...existingFiles, ...newFiles];
    const total = files.reduce((sum, file) => sum + file.itemCost, 0);
    await env.DB.prepare("UPDATE orders SET files_json = ?, total_amount = ?, final_amount = ? WHERE id = ? AND status IN ('pending', 'printing') AND files_purged = 0").bind(JSON.stringify(files), total, total, order.id).run();
    return json({ fileCount: files.length });
  }

  if (orderPath && orderPath[2] === "purge" && request.method === "POST") {
    const auth = await requireOwner(request, env); if (auth.response) return auth.response;
    const order = await env.DB.prepare("SELECT orders.* FROM orders JOIN shops ON shops.id = orders.shop_id WHERE orders.id = ? AND shops.owner_id = ?").bind(orderPath[1], auth.owner.id).first();
    if (!order) return fail("This order is no longer available.", 404);
    const files = JSON.parse(order.files_json);
    await Promise.all(files.map((file) => env.FILES.delete(file.storagePath)));
    await env.DB.prepare("UPDATE orders SET files_purged = 1 WHERE id = ?").bind(order.id).run();
    return json({ ok: true });
  }

  if (orderPath && !orderPath[2] && request.method === "PATCH") {
    const body = await readJson(request);
    const action = body?.action;
    const auth = await requireOwner(request, env); if (auth.response) return auth.response;
    const order = await env.DB.prepare("SELECT orders.* FROM orders JOIN shops ON shops.id = orders.shop_id WHERE orders.id = ? AND shops.owner_id = ?").bind(orderPath[1], auth.owner.id).first();
    if (!order) return fail("This order is no longer available.", 404);
    if (action === "printing" && order.status === "pending") {
      await env.DB.prepare("UPDATE orders SET status = 'printing' WHERE id = ?").bind(order.id).run();
    } else if (action === "request-payment") {
      const amount = body.amount;
      if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || amount > 10000000) return fail("Enter a valid non-negative final amount in ₹.");
      await env.DB.prepare("UPDATE orders SET status = 'awaiting_payment', final_amount = ? WHERE id = ? AND status <> 'completed'").bind(amount, order.id).run();
    } else if (action === "confirm-paid") {
      await env.DB.prepare("UPDATE orders SET status = 'completed' WHERE id = ?").bind(order.id).run();
    } else return fail("This order action is not available.", 409);
    return json({ ok: true });
  }

  return fail("API route not found.", 404);
}

function istDateKey(timestamp) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(timestamp));
}

export async function onRequest(context) {
  try {
    const response = await handleApi(context.request, context.env);
    return response ?? fail("API route not found.", 404);
  } catch (error) {
    console.error("EZQRPRINT API error", error);
    return fail("The service could not complete that request. Please try again.", 500);
  }
}
