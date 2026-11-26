import type { Order, OrderFile, PublicShop, Shop } from "../types";

export interface OwnerUser {
  uid: string;
  email: string;
}

interface ApiErrorBody {
  error?: string;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body instanceof FormData ? {} : { "content-type": "application/json" }),
      ...options.headers,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as T & ApiErrorBody;
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status}).`);
  }
  return payload;
}

function withDates(order: Order): Order {
  const createdAt = order.createdAt as unknown as { milliseconds?: number };
  const expiresAt = order.expiresAt as unknown as { milliseconds?: number };
  return {
    ...order,
    createdAt: { toDate: () => new Date(createdAt.milliseconds ?? 0) },
    expiresAt: { toDate: () => new Date(expiresAt.milliseconds ?? 0) },
  };
}

export const api = {
  async me() {
    return request<{ user: OwnerUser | null }>("auth/me");
  },
  async register(email: string, password: string) {
    return request<{ user: OwnerUser }>("auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },
  async login(email: string, password: string) {
    return request<{ user: OwnerUser }>("auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },
  async logout() {
    return request<{ ok: boolean }>("auth/logout", { method: "POST" });
  },
  async deleteAccount(password: string) {
    return request<{ ok: boolean }>("auth/account", {
      method: "DELETE",
      body: JSON.stringify({ password }),
    });
  },
  async getShop() {
    const result = await request<{ shop: Shop | null }>("shop");
    return result.shop;
  },
  async saveShop(input: {
    shopName: string;
    slug: string;
    rates: PublicShop["rates"];
    upiId?: string;
    upiPayeeName?: string;
  }) {
    const result = await request<{ shop: Shop }>("shop", {
      method: "PUT",
      body: JSON.stringify(input),
    });
    return result.shop;
  },
  async getPublicShop(slug: string) {
    const result = await request<{ shop: PublicShop }>(`shops/${encodeURIComponent(slug)}`);
    return result.shop;
  },
  async getOrder(orderId: string) {
    const result = await request<{ order: Order }>(`orders/${encodeURIComponent(orderId)}`);
    return withDates(result.order);
  },
  async getOrders(status: "active" | "completed", range?: { start: Date; end: Date }) {
    const query = new URLSearchParams({ status });
    if (range) {
      query.set("start", String(range.start.getTime()));
      query.set("end", String(range.end.getTime()));
    }
    const result = await request<{ orders: Order[] }>(`orders?${query.toString()}`);
    return result.orders.map(withDates);
  },
  async createOrder(input: { id: string; shopId: string; files: OrderFile[] }) {
    return request<{ order: { id: string; tokenNumber: number } }>("orders", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  async appendFiles(orderId: string, files: OrderFile[]) {
    return request<{ fileCount: number }>(`orders/${encodeURIComponent(orderId)}/files`, {
      method: "POST",
      body: JSON.stringify({ files }),
    });
  },
  async updateOrder(orderId: string, action: string, amount?: number) {
    return request<{ ok: boolean }>(`orders/${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      body: JSON.stringify({ action, ...(amount === undefined ? {} : { amount }) }),
    });
  },
  async purgeFiles(orderId: string) {
    return request<{ ok: boolean }>(`orders/${encodeURIComponent(orderId)}/purge`, {
      method: "POST",
    });
  },
  uploadFile(file: File, mimeType: string, orderId: string, shopId: string, onProgress: (progress: number) => void) {
    return new Promise<{ storagePath: string }>((resolve, reject) => {
      const form = new FormData();
      form.append("file", file);
      form.append("orderId", orderId);
      form.append("shopId", shopId);
      form.append("mimeType", mimeType);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/uploads");
      xhr.withCredentials = true;
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
      });
      xhr.addEventListener("error", () => reject(new Error("The file upload could not reach the server.")));
      xhr.addEventListener("load", () => {
        let payload: { storagePath?: string; error?: string } = {};
        try { payload = JSON.parse(xhr.responseText) as typeof payload; } catch { /* use status below */ }
        if (xhr.status < 200 || xhr.status >= 300 || !payload.storagePath) {
          reject(new Error(payload.error || `File upload failed (${xhr.status}).`));
          return;
        }
        onProgress(100);
        resolve({ storagePath: payload.storagePath });
      });
      xhr.send(form);
    });
  },
  async deleteUpload(storagePath: string, orderId: string, shopId: string) {
    const parts = storagePath.split("/");
    const fileId = parts[parts.length - 1] ?? "";
    return request<{ ok: boolean }>(
      `uploads/${encodeURIComponent(fileId)}?shopId=${encodeURIComponent(shopId)}&orderId=${encodeURIComponent(orderId)}`,
      { method: "DELETE" },
    );
  },
  async fetchFile(orderId: string, file: OrderFile) {
    const parts = file.storagePath.split("/");
    const fileId = parts[parts.length - 1] ?? "";
    const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/files/${encodeURIComponent(fileId)}`, {
      credentials: "include",
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as ApiErrorBody;
      throw new Error(payload.error || `Could not download ${file.fileName} (${response.status}).`);
    }
    return response.blob();
  },
};
