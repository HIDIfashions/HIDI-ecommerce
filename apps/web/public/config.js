/** Public integration settings. Never place API keys, passwords or tokens here.
 * Empty links keep the honest local preview; no production account is created.
 */
window.HIDI_CONFIG = Object.freeze({
  siteUrl: 'https://thidigk.thehidi.com/',
  auth: { signInUrl: '', signUpUrl: '' },
  app: { androidUrl: '', iosUrl: '' },
  policies: { shipping: '', returns: '', privacy: '', terms: '', contact: '' },
  socials: { instagram: '', facebook: '', x: '', youtube: '' },
  newsletterEndpoint: '',
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
