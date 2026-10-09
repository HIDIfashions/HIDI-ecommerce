import React from 'react';
import Icon from './Icon.jsx';

export default function MediaSequenceControls({ items, sequence, label }) {
  if (items.length < 2) return null;
  return <div className="media-sequence-controls" aria-label={`${label} controls`}>
    <button type="button" aria-label={`Previous ${label}`} onClick={sequence.previous}><Icon name="chevronLeft" /></button>
    <div className="media-sequence-dots" aria-label={`Choose ${label}`}>
      {items.map((item, index) => <button key={item.assetId || item.url} type="button" className={index === sequence.index ? 'is-active' : ''} aria-label={`Show ${label} ${index + 1}`} aria-current={index === sequence.index ? 'true' : undefined} onClick={() => sequence.select(index)}><span /></button>)}
    </div>
    <button type="button" aria-label={`Next ${label}`} onClick={sequence.next}><Icon name="chevronRight" /></button>
    <button type="button" aria-label={`${sequence.paused ? 'Start' : 'Pause'} ${label} rotation`} onClick={sequence.toggle}><Icon name={sequence.paused ? 'play' : 'pause'} /></button>
  </div>;
}
