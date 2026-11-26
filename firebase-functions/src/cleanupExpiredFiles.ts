import { Timestamp } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { db, storage } from "./admin";

const PAGE_SIZE = 100;

export const cleanupExpiredFiles = onSchedule("every 60 minutes", async () => {
  const now = Timestamp.now();
  let lastDocumentId: string | undefined;

  while (true) {
    let query = db
      .collection("orders")
      .where("filesPurged", "==", false)
      .where("expiresAt", "<=", now)
      .orderBy("expiresAt")
      .limit(PAGE_SIZE);

    if (lastDocumentId) {
      const lastDocument = await db.collection("orders").doc(lastDocumentId).get();
      if (!lastDocument.exists) {
        lastDocumentId = undefined;
        continue;
      }
      query = query.startAfter(lastDocument);
    }

    const snapshot = await query.get();
    if (snapshot.empty) {
      return;
    }

    const bucket = storage.bucket();
    for (const orderSnapshot of snapshot.docs) {
      const order = orderSnapshot.data();
      if (
        typeof order.shopId !== "string" ||
        !Array.isArray(order.files) ||
        order.files.length === 0
      ) {
        throw new Error(`Order ${orderSnapshot.id} has invalid cleanup metadata.`);
      }

      const filePaths = order.files.map((file: unknown) => {
        const storagePath =
          typeof file === "object" && file !== null && "storagePath" in file
            ? file.storagePath
            : undefined;
        const expectedPrefix = `shops/${order.shopId}/orders/${orderSnapshot.id}/`;
        if (
          typeof storagePath !== "string" ||
          !storagePath.startsWith(expectedPrefix) ||
          storagePath.length === expectedPrefix.length ||
          storagePath.slice(expectedPrefix.length).includes("/")
        ) {
          throw new Error(`Order ${orderSnapshot.id} contains an invalid storage path.`);
        }
        return storagePath;
      });

      await Promise.all(
        filePaths.map((storagePath) =>
          bucket.file(storagePath).delete({ ignoreNotFound: true }),
        ),
      );

      await db.runTransaction(async (transaction) => {
        const freshSnapshot = await transaction.get(orderSnapshot.ref);
        const freshOrder = freshSnapshot.data();
        if (
          freshSnapshot.exists &&
          freshOrder?.filesPurged === false &&
          freshOrder.expiresAt instanceof Timestamp &&
          freshOrder.expiresAt.toMillis() <= now.toMillis()
        ) {
          transaction.update(orderSnapshot.ref, { filesPurged: true });
        }
      });
    }

    lastDocumentId = snapshot.docs[snapshot.docs.length - 1].id;
    if (snapshot.size < PAGE_SIZE) {
      return;
    }
  }
});
