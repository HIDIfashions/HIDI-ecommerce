/** Bind only to loopback. Retry occupied ports without stopping other processes. */
export async function listenAvailable(server, { port, host = '127.0.0.1', attempts = 50, onRetry } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer between 0 and 65535.');
  for (let retry = 0; retry < attempts; retry += 1) {
    const candidate = port === 0 ? 0 : port + retry;
    if (candidate > 65535) break;
    try {
      await new Promise((resolve, reject) => {
        const fail = (error) => { server.off('listening', ready); reject(error); };
        const ready = () => { server.off('error', fail); resolve(); };
        server.once('error', fail);
        server.once('listening', ready);
        server.listen(candidate, host);
      });
      return server.address().port;
    } catch (error) {
      if (error.code !== 'EADDRINUSE' || port === 0) throw error;
      onRetry?.(candidate);
    }
  }
  throw new Error(`No free local port found in the ${attempts}-port range starting at ${port}. Set PORT to another number.`);
}
