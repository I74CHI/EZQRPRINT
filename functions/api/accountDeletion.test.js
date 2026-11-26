import { describe, expect, it, vi } from "vitest";
import { onRequest } from "./[[path]].js";

const SESSION_TOKEN = "a".repeat(64);
const PASSWORD = "correct-horse-battery";
const SALT = "00112233445566778899aabbccddeeff";

async function deriveTestPasswordHash(password) {
  const salt = Uint8Array.from(SALT.match(/.{2}/g), (part) => Number.parseInt(part, 16));
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 100_000 },
    material,
    256,
  );
  return Array.from(new Uint8Array(bits), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createEnvironment({ passwordHash, shop = { id: "shop-123" } }) {
  const batches = [];
  const filesDeleted = [];
  const filesList = vi.fn(async () => ({
    keys: [{ name: "files/shop-123/order-123/file-123" }],
    list_complete: true,
  }));
  const db = {
    prepare(sql) {
      const statement = {
        sql,
        values: [],
        bind(...values) {
          this.values = values;
          return this;
        },
        async first() {
          if (sql.startsWith("SELECT owners.id, owners.email FROM sessions")) {
            return { id: "owner-123", email: "owner@example.com" };
          }
          if (sql.startsWith("SELECT password_hash, password_salt FROM owners")) {
            return { password_hash: passwordHash, password_salt: SALT };
          }
          if (sql.startsWith("SELECT id FROM shops WHERE owner_id")) return shop;
          return null;
        },
      };
      return statement;
    },
    async batch(statements) {
      batches.push(statements.map(({ sql, values }) => ({ sql, values })));
      return statements.map(() => ({ success: true }));
    },
  };

  return {
    env: {
      DB: db,
      FILES: {
        list: filesList,
        async delete(key) { filesDeleted.push(key); },
      },
    },
    batches,
    filesDeleted,
    filesList,
  };
}

function deleteRequest(password) {
  return new Request("https://ezqrprint.test/api/auth/account", {
    method: "DELETE",
    headers: {
      cookie: `__Host-ezqrprint-session=${SESSION_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ password }),
  });
}

describe("permanent account deletion", () => {
  it("requires the current password before deleting account data", async () => {
    const passwordHash = await deriveTestPasswordHash(PASSWORD);
    const mock = createEnvironment({ passwordHash });

    const response = await onRequest({ request: deleteRequest("wrong-password"), env: mock.env });

    expect(response.status).toBe(401);
    expect(mock.batches).toHaveLength(0);
    expect(mock.filesList).not.toHaveBeenCalled();
  });

  it("deletes the shop's orders, shop, sessions, owner, and uploaded files", async () => {
    const passwordHash = await deriveTestPasswordHash(PASSWORD);
    const mock = createEnvironment({ passwordHash });

    const response = await onRequest({ request: deleteRequest(PASSWORD), env: mock.env });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(mock.batches[0].map(({ sql }) => sql)).toEqual([
      "DELETE FROM orders WHERE shop_id = ?",
      "DELETE FROM shops WHERE owner_id = ?",
      "DELETE FROM sessions WHERE owner_id = ?",
      "DELETE FROM owners WHERE id = ?",
    ]);
    expect(mock.filesList).toHaveBeenCalledWith({ prefix: "files/shop-123/", limit: 900 });
    expect(mock.filesDeleted).toEqual(["files/shop-123/order-123/file-123"]);
  });
});
