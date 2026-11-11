// Firebase web config. These values are public by design (they identify the project, not a secret);
// access to data is controlled by firestore.rules.
export const firebaseConfig = {
  apiKey: 'AIzaSyAfVC6p0W9LIqkgT1HADnE8cK29RxF1G9w',
  authDomain: 'healthspan-tracker-app.firebaseapp.com',
  projectId: 'healthspan-tracker-app',
  storageBucket: 'healthspan-tracker-app.firebasestorage.app',
  messagingSenderId: '1088186330776',
  appId: '1:1088186330776:web:d40261ec1134751e91eaed',
};

// reCAPTCHA Enterprise (Fraud Defense) site key for Firebase App Check (public by design). Empty = App Check off.
export const appCheckSiteKey = '6LcoIxouAAAAAN0-Q-M1fFiZP8ZA7Q8vehfSZl5S';
