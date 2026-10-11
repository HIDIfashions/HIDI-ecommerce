import HidiPortraitReact from 'react';
import HidiPortraitSequence from '../hooks/useMediaSequence.js';
import { useDocumentVisible as HidiPortraitDocumentVisible, useInView as HidiPortraitInView } from '../hooks/useVisibility.js';
import { useHidi as HidiPortraitContext } from '../context/HidiContext.jsx';
import { landingImageProps as HidiPortraitImage, useLandingMedia as HidiPortraitMedia } from '../context/LandingMediaContext.jsx';
import '../styles/portrait-gallery.css';

export default function MeetHidi() {
  const R = HidiPortraitReact, h = R.createElement;
  const media = HidiPortraitMedia(), { dialogOpen } = HidiPortraitContext();
  const ref = R.useRef(null), visible = HidiPortraitInView(ref), pageVisible = HidiPortraitDocumentVisible();
  const [readySource, setReadySource] = R.useState(''), [failedSource, setFailedSource] = R.useState('');
  const list = media.ananya;
  const stories = [
    ['DSC01671', 'Her softer side.', 'A little softness for your everyday.', 'Ananya wearing a pink embroidered kurta'],
    ['DSC01431', 'Her little sunshine.', 'A brighter mood. A moment of your own.', 'Ananya wearing a yellow floral kurta'],
    ['DSC01567', 'Her spirited side.', 'For the days you feel like going further.', 'Ananya wearing an orange embroidered kurta and dupatta'],
    ['DSC01529', 'Her bold moments.', 'For the confidence you carry with you.', 'Ananya wearing a wine embroidered kurta'],
    ['DSC01849', 'Her quiet confidence.', 'A little courage, in your own way.', 'Ananya wearing a red floral embroidered kurta'],
  ];
  const items = R.useMemo(() => {
    if (media.status !== 'ready') return [];
    // Upgrade the retired single collage; subsequent admin selections keep priority.
    const retired = list?.items?.length === 1 && /1791693627341-da821fb4-1fad-4099-8799-c1ae965315b2\.jpg(?:$|\?)/.test(list.items[0].url);
    if (list?.active && list.items.length && !retired) return list.items.map((item, index) => ({
      ...item, props: HidiPortraitImage({ ananya: item }, 'ananya', '', `Ananya’s Pick — photograph ${index + 1}`),
      title: 'A version of her.', caption: 'For the many sides of you.',
    }));
    return stories.map(([id, title, caption, alt]) => {
      const props = HidiPortraitImage({}, 'ananya', `images/ananya-portraits/${id}.jpg`, alt);
      return { type: 'image', url: props.src, props, title, caption };
    });
  }, [media, list]);
  const sequence = HidiPortraitSequence({ items, autoPlay: list?.autoPlay, intervalSeconds: list?.intervalSeconds, readySource, visible: visible && pageVisible && !dialogOpen });
  const current = items[sequence.index], image = current?.props;
  return h('section', { id: 'meet-hidi', className: 'meet-section portrait-gallery', 'aria-labelledby': 'meet-title', 'aria-busy': media.status === 'loading', 'data-landing-config-status': media.status },
    h('div', { className: 'portrait-gallery__layout' },
      h('div', { ref, className: 'portrait-gallery__visual', ...sequence.handlers },
        h('div', { className: 'portrait-gallery__frame' },
          image && failedSource !== image.src ? h('img', { ...image, key: image.src, className: 'portrait-gallery__portrait', width: 1365, height: 2048, loading: 'eager', decoding: 'async', 'data-media-index': sequence.index,
            onLoad: event => { const element = event.currentTarget, url = image.src; element.decode().then(() => { if (element.isConnected) setReadySource(url); }).catch(() => {}); },
            onError: () => setFailedSource(image.src),
          }) : h('div', { className: 'portrait-gallery__placeholder', role: 'status' }, media.status === 'loading' ? 'Loading photographs…' : 'This photograph is unavailable.')),
        h('div', { className: 'portrait-gallery__previews', role: 'group', 'aria-label': 'Choose an Ananya photograph' }, items.map((item, index) =>
          h('button', { key: item.url + index, type: 'button', className: 'portrait-gallery__preview', 'aria-label': `Show photograph ${index + 1}: ${item.props.alt}`, 'aria-pressed': sequence.index === index, onClick: () => sequence.select(index) },
            h('img', { src: item.props.src, alt: '', width: 1365, height: 2048, loading: 'lazy', decoding: 'async' })))),
        h('p', { className: 'portrait-gallery__hint' }, 'Tap a photograph to see another side.'),
        list?.autoPlay && items.length > 1 && h('button', { type: 'button', className: 'portrait-gallery__pause', onClick: sequence.toggle }, sequence.paused ? 'Resume photographs' : 'Pause photographs')),
      h('div', { className: 'portrait-gallery__copy' },
        h('p', { className: 'portrait-gallery__eyebrow' }, 'Ananya’s Pick'),
        h('h2', { id: 'meet-title' }, 'Many versions ', h('em', null, 'of her')),
        h('p', { className: 'portrait-gallery__intro' }, 'For your quiet days, bold plans, and everything in between.'),
        h('div', { className: 'portrait-gallery__story', 'aria-live': 'polite', 'aria-atomic': 'true' },
          h('h3', null, current?.title || 'For the many sides of you.'), h('p', null, current?.caption || 'A little courage, in your own way.')),
        h('a', { className: 'portrait-gallery__shop', href: '/collections/ananyas-pick' }, 'Explore Ananya’s Pick ', h('span', { 'aria-hidden': true }, '↗')))));
}
