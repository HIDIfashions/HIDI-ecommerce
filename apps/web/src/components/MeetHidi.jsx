import React, { useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import MediaSequenceControls from './MediaSequenceControls.jsx';
import useMediaSequence from '../hooks/useMediaSequence.js';
import { useDocumentVisible, useInView } from '../hooks/useVisibility.js';
import { useHidi } from '../context/HidiContext.jsx';
import { landingImageProps, useLandingMedia } from '../context/LandingMediaContext.jsx';

export default function MeetHidi() {
  const landingMedia = useLandingMedia();
  const { dialogOpen } = useHidi();
  const sectionRef = useRef(null);
  const visible = useInView(sectionRef);
  const pageVisible = useDocumentVisible();
  const [landscapeSource, setLandscapeSource] = useState(null);
  const [readySource, setReadySource] = useState('');
  const list = landingMedia.ananya;
  const items = useMemo(() => {
    if (landingMedia.status !== 'ready') return [];
    if (list?.active && list.items.length) return list.items.map((item, index) => ({ ...item, props: landingImageProps({ ananya: item }, 'ananya', '', `Ananya's pick ${index + 1}`) }));
    const props = landingImageProps(list ? {} : landingMedia, 'ananya-green', 'images/ananya-top-picks/ananya-green.webp', "Ananya's pick");
    return [{ type: 'image', url: props.src, fitMode: landingMedia['ananya-green']?.fitMode || 'cover', props }];
  }, [landingMedia, list]);
  const sequence = useMediaSequence({ items, autoPlay: list?.autoPlay, intervalSeconds: list?.intervalSeconds, readySource, visible: visible && pageVisible && !dialogOpen });
  const current = items[sequence.index];
  const image = current?.props;
  const isLandscape = Boolean(image && landscapeSource === image.src);

  return (
    <section className="meet-section meet-section--cinematic meet-section--single" id="meet-hidi" aria-labelledby="meet-title" aria-busy={landingMedia.status === 'loading'} data-landing-config-status={landingMedia.status}>
      <div className="ananya-section-heading"><h2 id="meet-title">Ananya's Pick</h2></div>
      <div className="container">
        <div ref={sectionRef} className="meet-cinematic meet-cinematic--photo" {...sequence.handlers}>
          <div className="meet-cinematic__content">
            <a className="button button--gold meet-cinematic__button" href="/collections/all">Shop now <Icon name="arrow" /></a>
          </div>
          <div className="meet-cinematic__stage">
            <div className="meet-cinematic__slide is-active">
              {image && <img key={image.src} className="meet-cinematic__model" {...image} data-media-index={sequence.index} data-ananya-layout={isLandscape ? 'photo' : 'portrait'} style={{ ...image.style, objectFit: isLandscape && current.fitMode !== 'contain' ? 'var(--ananya-photo-fit, cover)' : 'contain' }} loading="eager" decoding="async" onLoad={event => {
                const element = event.currentTarget, selectedUrl = image.src;
                setLandscapeSource(element.naturalWidth >= element.naturalHeight && element.naturalHeight > 0 ? selectedUrl : null);
                element.decode().then(() => { if (element.isConnected) setReadySource(selectedUrl); }).catch(() => {});
              }} />}
            </div>
          </div>
          <MediaSequenceControls items={items} sequence={sequence} label="Ananya photo" />
        </div>
      </div>
    </section>
  );
}
