import { onCall } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import Stripe from "stripe";
import { logger } from "firebase-functions";

admin.initializeApp();

const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY || "",
  {
    apiVersion: "2025-06-30.basil",
  }
);

export const cancelSubscription = onCall(async (request: functions.https.CallableRequest) => {
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
});

export const upgradeSubscription = onCall(async (request: functions.https.CallableRequest) => {
  try {
    const { subscriptionId, newPriceId, userId } = request.data;

    if (!subscriptionId || !newPriceId || !userId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "subscriptionId, newPriceId y userId son obligatorios"
      );
    }

    // Obtener la suscripción actual desde Stripe
    const currentSubscription = await stripe.subscriptions.retrieve(subscriptionId);

    // Hacer el upgrade con prorrateo
    const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
      proration_behavior: "create_prorations",
      items: [
        {
          id: currentSubscription.items.data[0].id,
          price: newPriceId,
        },
      ],
    });

    // Buscar en Firestore la suscripción activa del usuario
    const subsSnap = await admin
      .firestore()
      .collection("subscriptions")
      .where("userId", "==", userId)
      .where("status", "==", "active")
      .limit(1)
      .get();

    if (subsSnap.empty) {
      console.warn(`No se encontró una suscripción activa para el usuario ${userId}`);
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
});

export const getPlanById = onCall(async (request: functions.https.CallableRequest) => {
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
});

export const mintCustomToken = onCall(async (request: functions.https.CallableRequest) => {
  // 1️⃣ Log inicial
  logger.log('mintCustomToken called with data:', request.data);

  const idToken = request.data?.idToken as string | undefined;
  if (!idToken) {
    logger.error('No ID token provided in request.data');
    throw new Error('invalid-argument: No ID token provided');
  }
  logger.log('ID token received, verifying…');
  // 2️⃣ Verificar el ID token de Firebase
  let decoded: admin.auth.DecodedIdToken;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
    logger.log(`ID token valid. UID = ${decoded.uid}`);
  } catch (e: any) {
    logger.error('verifyIdToken failed:', e);
    throw new Error('unauthenticated: Invalid ID token');
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
    logger.error('createCustomToken failed:', e);
    throw new Error(`internal: Could not create custom token: ${e.message}`);
  }
}
);