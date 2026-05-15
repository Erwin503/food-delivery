import admin from 'firebase-admin';
import logger from './logger';

export interface FirebaseHealth {
  configured: boolean;
  initialized: boolean;
  provider: 'firebase';
  message: string | null;
}

const firebaseConfigError = {
  message: null as string | null,
};

const getFirebaseProjectId = (): string =>
  process.env.FIREBASE_PROJECT_ID?.trim() || '';

const getFirebaseClientEmail = (): string =>
  process.env.FIREBASE_CLIENT_EMAIL?.trim() || '';

const getFirebasePrivateKey = (): string =>
  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim() || '';

export const isFirebaseConfigured = (): boolean =>
  Boolean(getFirebaseProjectId() && getFirebaseClientEmail() && getFirebasePrivateKey());

export const initializeFirebase = (): void => {
  if (!isFirebaseConfigured()) {
    firebaseConfigError.message = 'Firebase is not configured';
    return;
  }

  if (admin.apps.length > 0) {
    firebaseConfigError.message = null;
    return;
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: getFirebaseProjectId(),
        clientEmail: getFirebaseClientEmail(),
        privateKey: getFirebasePrivateKey(),
      }),
    });

    firebaseConfigError.message = null;
  } catch (error) {
    firebaseConfigError.message = error instanceof Error ? error.message : String(error);
    logger.error('Firebase initialization failed', { error: firebaseConfigError.message });
  }
};

export const getFirebaseHealth = (): FirebaseHealth => ({
  configured: isFirebaseConfigured(),
  initialized: admin.apps.length > 0,
  provider: 'firebase',
  message: firebaseConfigError.message,
});

export const sendPushNotification = async (
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> => {
  if (!tokens.length) {
    return;
  }

  initializeFirebase();

  if (admin.apps.length === 0) {
    throw new Error(firebaseConfigError.message || 'Firebase is not initialized');
  }

  for (let index = 0; index < tokens.length; index += 500) {
    const chunk = tokens.slice(index, index + 500);
    const response = await admin.messaging().sendEachForMulticast({
      tokens: chunk,
      notification: {
        title,
        body,
      },
      data,
    });

    if (response.failureCount > 0) {
      const failures = response.responses
        .map((item, responseIndex) => ({ item, responseIndex }))
        .filter(({ item }) => !item.success)
        .map(({ item, responseIndex }) => ({
          token: chunk[responseIndex],
          error: item.error?.message || 'Unknown Firebase error',
        }));

      logger.warn('Firebase push notification completed with failures', {
        sent: response.successCount,
        failed: response.failureCount,
        failures,
      });
    }
  }
};
