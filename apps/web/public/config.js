/** Public integration settings. Never place API keys, passwords or tokens here.
 * Commerce and API routes are served on the same origin as this landing page.
 */
window.HIDI_CONFIG = Object.freeze({
  siteUrl: '/',
  auth: { signInUrl: '/account', signUpUrl: '/account' },
  app: { androidUrl: '', iosUrl: '' },
  policies: { shipping: '/shipping', returns: '/returns', privacy: '', terms: '', contact: '/contact' },
  socials: { instagram: '', facebook: '', x: '', youtube: '' },
  newsletterEndpoint: '/api/store/marketing/newsletter',
  // Messages supplied by the brand owner. Confirm the published policies before launch.
  announcement: {
    messages: [
      'Complimentary shipping on ₹1,499 and above',
      'Easy exchange within 7 days',
      '100% secure payments'
    ],
    pixelsPerSecond: 28
  },
  motion: { smoothScroll: true },
  carouselInterval: 6200
});
