import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import Stripe from "stripe";
import { logger } from "firebase-functions";

admin.initializeApp();

const stripe = new Stripe(process.env.APIKEY || "", {
  apiVersion: "2025-06-30.basil",
});

const storage = admin.storage();

export const moveImageToFinal = onCall(
  async (request: functions.https.CallableRequest) => {
    try {
      const { imageUrl, newFolder } = request.data;

      if (!imageUrl || typeof imageUrl !== "string") {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Image URL is missing."
        );
      }
      if (!newFolder || typeof newFolder !== "string") {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Destination folder is missing."
        );
      }

      // 1. Remove query params
      const withoutParams = imageUrl.split("?")[0];

      // 2. Extract the storage object path (strip bucket domain)
      let oldPath: string | null = null;

      const fileIndex = withoutParams.indexOf("/file_processing/");
      const videoIndex = withoutParams.indexOf("/video_processing/");

      if (fileIndex !== -1) {
        oldPath = withoutParams.substring(fileIndex + 1); // remove leading "/"
      } else if (videoIndex !== -1) {
        oldPath = withoutParams.substring(videoIndex + 1);
      }

      if (!oldPath) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Could not extract the storage path from the URL."
        );
      }

      // 3. Define new path
      const fileName = oldPath.split("/").pop();
      const newPath = `${newFolder}/${fileName}`;

      const bucket = storage.bucket();

      // 4. Copy then delete (move)
      await bucket.file(oldPath).copy(bucket.file(newPath));
      await bucket.file(oldPath).delete();

      // 5. Generate new signed URL
      const [signedUrl] = await bucket.file(newPath).getSignedUrl({
        action: "read",
        expires: "03-01-2035", // long expiration date
      });

      return { newUrl: signedUrl, newPath };
    } catch (err: any) {
      console.error("Error moving image:", err);
      throw new functions.https.HttpsError("unknown", err.message);
    }
  }
);

export const cancelSubscription = onCall(
  async (request: functions.https.CallableRequest) => {
    try {
      const { subscriptionId, userId } = request.data;

      if (!subscriptionId || !userId) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "subscriptionId and userId are required"
        );
      }

      // 1. Cancelar la suscripción en Stripe
      const deletedSubscription = await stripe.subscriptions.cancel(
        subscriptionId
      );

      // 2. Buscar el documento en Firestore con userId
      const subsRef = admin.firestore().collection("subscriptions");
      const snapshot = await subsRef.where("userId", "==", userId).get();

      if (snapshot.empty) {
        console.warn(`No subscription document found for userId: ${userId}`);
      } else {
        const batch = admin.firestore().batch();
        snapshot.docs.forEach((doc: any) => {
          batch.delete(doc.ref);
        });
        await batch.commit();
      }

      return { success: true, subscription: deletedSubscription };
    } catch (error: any) {
      console.error("Error cancelling subscription:", error);
      throw new functions.https.HttpsError("internal", error.message);
    }
  }
);

export const upgradeSubscription = onCall(
  async (request: functions.https.CallableRequest) => {
    try {
      const { subscriptionId, newPriceId, userId } = request.data;

      if (!subscriptionId || !newPriceId || !userId) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "subscriptionId, newPriceId y userId son obligatorios"
        );
      }

      // Obtener la suscripción actual desde Stripe
      const currentSubscription = await stripe.subscriptions.retrieve(
        subscriptionId
      );

      // Hacer el upgrade con prorrateo
      const updatedSubscription = await stripe.subscriptions.update(
        subscriptionId,
        {
          cancel_at_period_end: false,
          proration_behavior: "create_prorations",
          items: [
            {
              id: currentSubscription.items.data[0].id,
              price: newPriceId,
            },
          ],
        }
      );

      // Buscar en Firestore la suscripción activa del usuario
      const subsSnap = await admin
        .firestore()
        .collection("subscriptions")
        .where("userId", "==", userId)
        .where("status", "==", "active")
        .limit(1)
        .get();

      if (subsSnap.empty) {
        console.warn(
          `No se encontró una suscripción activa para el usuario ${userId}`
        );
      } else {
        const docRef = subsSnap.docs[0].ref;
        await docRef.update({
          planId: newPriceId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      return {
        success: true,
        subscription: updatedSubscription,
      };
    } catch (err: any) {
      console.error("Error upgrading subscription:", err);
      throw new functions.https.HttpsError("internal", err.message);
    }
  }
);

export const getPlanById = onCall(
  async (request: functions.https.CallableRequest) => {
    const { priceId } = request.data;

    if (!priceId || typeof priceId !== "string") {
      throw new Error("El priceId es requerido y debe ser un string.");
    }

    try {
      const price = await stripe.prices.retrieve(priceId, {
        expand: ["product"],
      });

      if (!price || typeof price.product !== "object") {
        throw new Error("No se encontró el producto asociado.");
      }

      const product = price.product as Stripe.Product;

      return {
        priceId: price.id,
        unit_amount: price.unit_amount ?? 0,
        currency: price.currency,
        recurring: price.recurring ?? null,
        product: {
          id: product.id,
          name: product.name,
          description: product.description ?? "",
          metadata: product.metadata,
        },
      };
    } catch (error: any) {
      console.error("Error al obtener plan:", error.message);
      throw new Error("No se pudo obtener el plan.");
    }
  }
);

export const mintCustomToken = onCall(
  async (request: functions.https.CallableRequest) => {
    // 1️⃣ Log inicial
    logger.log("mintCustomToken called with data:", request.data);

    const idToken = request.data?.idToken as string | undefined;
    if (!idToken) {
      logger.error("No ID token provided in request.data");
      throw new Error("invalid-argument: No ID token provided");
    }
    logger.log("ID token received, verifying…");
    // 2️⃣ Verificar el ID token de Firebase
    let decoded: admin.auth.DecodedIdToken;
    try {
      decoded = await admin.auth().verifyIdToken(idToken);
      logger.log(`ID token valid. UID = ${decoded.uid}`);
    } catch (e: any) {
      logger.error("verifyIdToken failed:", e);
      throw new Error("unauthenticated: Invalid ID token");
    }

    /*// 3️⃣ Verificar que el usuario existe
  try {
    const userRecord = await admin.auth().getUser(decoded.uid);
    logger.log('User record fetched:', {
      uid: userRecord.uid,
      email: userRecord.email,
      providerData: userRecord.providerData,
    });
  } catch (e: any) {
    logger.error('getUser failed for uid', decoded.uid, e);
    throw new Error('not-found: User record not found');
  }*/

    // 4️⃣ Crear el custom token
    try {
      const customToken = await admin.auth().createCustomToken(decoded.uid);
      logger.log(`Custom token minted for UID ${decoded.uid}`);
      return { customToken };
    } catch (e: any) {
      logger.error("createCustomToken failed:", e);
      throw new Error(`internal: Could not create custom token: ${e.message}`);
    }
  }
);

export const validateCoupon = onCall(async (request) => {
  try {
    const { couponCode, planId, userId } = request.data;

    // Validate required parameters
    if (!couponCode || typeof couponCode !== "string") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Coupon code is required"
      );
    }

    logger.info(`Validating coupon: ${couponCode} for plan: ${planId}`);

    // Validate the coupon in Stripe
    const coupon = await stripe.coupons.retrieve(couponCode.toUpperCase());

    // Check if the coupon is valid
    if (!coupon.valid) {
      return {
        valid: false,
        error: "The coupon is not valid or has expired",
      };
    }

    // Check expiration by date
    if (coupon.redeem_by && coupon.redeem_by * 1000 < Date.now()) {
      return {
        valid: false,
        error: "The coupon has expired",
      };
    }

    // Check if max redemptions have been reached
    if (
      coupon.max_redemptions &&
      coupon.times_redeemed >= coupon.max_redemptions
    ) {
      return {
        valid: false,
        error: "The coupon has reached its redemption limit",
      };
    }

    // Check plan-specific restrictions (if defined in metadata)
    if (coupon.metadata && coupon.metadata.restricted_plans && planId) {
      const allowedPlans = coupon.metadata.restricted_plans.split(",");
      if (!allowedPlans.includes(planId)) {
        return {
          valid: false,
          error: "This coupon is not valid for the selected plan",
        };
      }
    }

    // Check if the user has already used this coupon (optional)
    if (
      userId &&
      coupon.metadata &&
      coupon.metadata.one_per_customer === "true"
    ) {
      const subsRef = admin.firestore().collection("subscriptions");
      const existingUse = await subsRef
        .where("userId", "==", userId)
        .where("couponUsed.id", "==", coupon.id)
        .get();

      if (!existingUse.empty) {
        return {
          valid: false,
          error: "You have already used this coupon before",
        };
      }
    }

    // Check minimum amount (if defined in metadata)
    if (coupon.metadata && coupon.metadata.minimum_amount && planId) {
      // Here you could fetch the plan price and verify the minimum amount
      // const price = await stripe.prices.retrieve(planId);
      // if (price.unit_amount && price.unit_amount < parseInt(coupon.metadata.minimum_amount)) {
      //   return {
      //     valid: false,
      //     error: `This coupon requires a minimum amount of $${parseInt(coupon.metadata.minimum_amount) / 100}`
      //   };
      // }
    }

    logger.info(`Coupon validated successfully: ${couponCode}`);

    return {
      valid: true,
      coupon: {
        id: coupon.id,
        percent_off: coupon.percent_off,
        amount_off: coupon.amount_off,
        currency: coupon.currency,
        name: coupon.name,
        duration: coupon.duration,
        duration_in_months: coupon.duration_in_months,
        metadata: coupon.metadata,
      },
    };
  } catch (error: any) {
    logger.error("Error validating coupon:", error);

    // Handle Stripe-specific errors
    if (error.type === "StripeInvalidRequestError") {
      return {
        valid: false,
        error: "Invalid coupon code",
      };
    }

    if (error.code === "resource_missing") {
      return {
        valid: false,
        error: "Coupon code does not exist",
      };
    }

    // For other errors, throw HttpsError
    throw new functions.https.HttpsError("internal", "Internal server error");
  }
});
