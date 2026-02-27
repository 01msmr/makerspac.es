// error-monitor.js – globales Error-Monitoring für makerspac.es
// Fängt uncaught Errors und unhandled Promise Rejections ab.
// Logs abrufbar via: window.AppErrorMonitor.exportLogs()

window.AppErrorMonitor = (() => {
  const MAX_LOGS = 50;
  const logs = [];

  function getContext() {
    return {
      hash: window.location.hash,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      isNavigating: window.routingManager?._isNavigating ?? null,
      manualClick: window.app?.searchHeader?._manualSpaceClick ?? null,
    };
  }

  function record(type, error) {
    const entry = {
      t: new Date().toISOString(),
      type,
      msg: error?.message || String(error),
      stack: error?.stack?.split('\n').slice(0, 5).join('\n') || null,
      ctx: getContext(),
    };
    logs.push(entry);
    if (logs.length > MAX_LOGS) logs.shift();
    console.error('[ErrorMonitor]', entry.type, entry.msg, entry.ctx);
  }

  window.addEventListener('error', e => record('uncaught', e.error || e));
  window.addEventListener('unhandledrejection', e => record('promise', e.reason));

  return {
    getLogs: () => [...logs],
    exportLogs: () => JSON.stringify(logs, null, 2),
    clear: () => logs.splice(0),
  };
})();
