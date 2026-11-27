const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");

initializeApp();

// The existing app uses this named Firestore database, not (default).
const DATABASE_ID = "ai-studio-9bcc4e44-8b56-4391-8b8a-8902ce85c9ad";
const db = getFirestore(DATABASE_ID);

const collectionLabels = {
  shopping: "لیست خرید",
  goals: "هدف‌ها",
  habits: "عادت‌ها",
  gratitudes: "قدردانی‌ها",
  schedules: "برنامه‌ها",
  expenses: "هزینه‌ها",
  bills: "قبض‌ها",
  meds: "یادآوری‌های سلامت",
  meals: "برنامه غذایی",
  vault: "یادداشت‌های مشترک",
  packing: "وسایل سفر",
  events: "مناسبت‌ها",
  chores: "کارهای خانه",
  alerts: "یادآوری‌ها",
  callers: "مخاطبان",
};

exports.notifyCoupleSpaceChange = onDocumentWritten(
  {
    document: "spaces/{spaceId}/{collectionId}/{documentId}",
    database: DATABASE_ID,
    region: "us-central1",
  },
  async (event) => {
    const collectionId = event.params.collectionId;
    const label = collectionLabels[collectionId];
    if (!label) return;

    // For deletes, the prior updatedByUid is not necessarily the deleting user.
    // Do not send a misleading notification until deletes carry an authenticated tombstone.
    if (!event.data || !event.data.after.exists) return;
    const changed = event.data.after.data();
    const senderUid = changed && changed.updatedByUid;
    if (typeof senderUid !== "string" || !senderUid) return;

    const spaceId = event.params.spaceId;
    const membersSnap = await db.collection("spaces").doc(spaceId).collection("members").get();
    const recipientUids = membersSnap.docs
      .map((member) => member.id)
      .filter((uid) => uid && uid !== senderUid);
    if (recipientUids.length === 0) return;

    const tokenDocs = [];
    for (const uid of recipientUids) {
      const snap = await db.collection("users").doc(uid).collection("pushTokens").get();
      tokenDocs.push(...snap.docs);
    }
    const tokens = [...new Set(tokenDocs.map((item) => item.get("token")).filter((token) => typeof token === "string" && token.length > 20))];
    if (tokens.length === 0) return;

    const data = {
      title: "رفیقو",
      body: "یک تغییر تازه در " + label + " فضای مشترک شما ثبت شد.",
      type: "couple_space_update",
      spaceId,
    };

    // Batch by 500 FCM tokens. Only generic text is sent; private item contents stay in Firestore.
    for (let offset = 0; offset < tokens.length; offset += 500) {
      const batchTokens = tokens.slice(offset, offset + 500);
      const result = await getMessaging().sendEachForMulticast({
        tokens: batchTokens,
        data,
        android: { priority: "high" },
      });
      const invalid = [];
      result.responses.forEach((response, index) => {
        if (!response.success) {
          const code = response.error && response.error.code;
          if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") {
            invalid.push(batchTokens[index]);
          } else {
            logger.warn("FCM delivery failed", { code, message: response.error && response.error.message });
          }
        }
      });
      if (invalid.length) {
        const invalidSet = new Set(invalid);
        const cleanup = tokenDocs.filter((item) => invalidSet.has(item.get("token")));
        await Promise.all(cleanup.map((item) => item.ref.delete()));
      }
    }
  }
);
