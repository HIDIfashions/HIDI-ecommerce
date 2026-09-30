import React from 'react';

export default class ErrorBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error, info) { console.error('HIDI could not render.', error, info); }
  render() {
    if (this.state.failed) return <main className="container section-space">
      <p className="eyebrow">HIDI</p><h1>Let’s try that again.</h1>
      <p>The preview could not load. Please refresh the page.</p>
      <button className="button button--burgundy" type="button" onClick={() => window.location.reload()}>Refresh HIDI</button>
    </main>;
    return this.props.children;
  }
}
