// error-monitor.js — Globales Error-Monitoring für makerspac.es
// Fängt uncaught Errors und unhandled Promise Rejections ab.
// Dev-Modus (localhost): zeigt ein Badge + Klick-Panel.
// Logs abrufbar via: errorMonitor.getLogs() / errorMonitor.exportLogs()

import { appContext } from './app-context.js';

const MAX_LOGS = 50;

class ErrorMonitor {
  #logs = [];
  #badge = null;

  init() {
    // window.onerror returning true suppresses browser console output (cancelable: false on ErrorEvent)
    const prevOnError = window.onerror;
    window.onerror = (msg, src, line, col, error) => {
      // Suppress benign MapLibre GL tile-parsing errors (null values in OpenFreeMap tiles)
      if (typeof msg === 'string' && msg.includes('Expected value to be of type number')) return true;
      return prevOnError ? prevOnError(msg, src, line, col, error) : false;
    };
    window.addEventListener('error', e => this.#record('uncaught', e.error || e));
    window.addEventListener('unhandledrejection', e => this.#record('promise', e.reason));

    if (this.#isDev()) {
      if (document.body) {
        this.#createBadge();
      } else {
        document.addEventListener('DOMContentLoaded', () => this.#createBadge());
      }
    }
  }

  #isDev() {
    return location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  }

  #getContext() {
    return {
      hash:         location.hash,
      viewport:     `${window.innerWidth}x${window.innerHeight}`,
      isNavigating: appContext.routingManager?._isNavigating ?? null,
      manualClick:  appContext.searchHeader?._manualSpaceClick ?? null,
    };
  }

  #record(type, error) {
    const entry = {
      t:     new Date().toISOString(),
      type,
      msg:   error?.message || String(error),
      stack: error?.stack?.split('\n').slice(0, 5).join('\n') || null,
      ctx:   this.#getContext(),
    };
    this.#logs.push(entry);
    if (this.#logs.length > MAX_LOGS) this.#logs.shift();
    this.#updateBadge();
  }

  // ─── Dev-Overlay ─────────────────────────────────────────────────────────

  #createBadge() {
    const badge = document.createElement('div');
    badge.id = 'error-monitor-badge';
    badge.style.cssText = [
      'display:none', 'position:fixed', 'bottom:8px', 'left:8px', 'z-index:99999',
      'background:#c0392b', 'color:#fff', 'padding:4px 10px', 'border-radius:4px',
      'font:12px/20px monospace', 'cursor:pointer', 'opacity:0.85', 'user-select:none'
    ].join(';');
    badge.addEventListener('click', () => this.#togglePanel());
    document.body.appendChild(badge);
    this.#badge = badge;
  }

  #updateBadge() {
    if (!this.#badge) return;
    const n = this.#logs.length;
    this.#badge.style.display = n > 0 ? 'block' : 'none';
    this.#badge.textContent = `⚠ ${n} error${n !== 1 ? 's' : ''}`;
  }

  #togglePanel() {
    const existing = document.getElementById('error-monitor-panel');
    if (existing) { existing.remove(); return; }

    const panel = document.createElement('div');
    panel.id = 'error-monitor-panel';
    panel.style.cssText = [
      'position:fixed', 'bottom:36px', 'left:8px', 'z-index:99999',
      'max-width:540px', 'max-height:320px', 'overflow-y:auto',
      'background:#1a1a1a', 'color:#f5f5f5',
      'border:1px solid #c0392b', 'border-radius:4px',
      'padding:8px', 'font:11px/16px monospace'
    ].join(';');

    this.#logs.forEach(e => {
      const row = document.createElement('div');
      row.style.cssText = 'margin-bottom:4px;border-bottom:1px solid #333;padding-bottom:4px';
      const time = document.createElement('span');
      time.style.color = '#888';
      time.textContent = e.t.slice(11, 19) + ' ';
      row.appendChild(time);
      row.appendChild(document.createTextNode(`[${e.type}] ${e.msg}`));
      panel.appendChild(row);
    });

    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'clear all';
    clearBtn.style.cssText = 'background:#c0392b;color:#fff;border:none;padding:2px 8px;cursor:pointer;border-radius:2px;font-size:11px;margin-top:4px';
    clearBtn.addEventListener('click', () => { this.clear(); panel.remove(); });
    panel.appendChild(clearBtn);

    document.body.appendChild(panel);

    const outside = (e) => {
      if (!panel.contains(e.target) && e.target !== this.#badge) {
        panel.remove();
        document.removeEventListener('pointerdown', outside);
      }
    };
    setTimeout(() => document.addEventListener('pointerdown', outside), 0);
  }

  // ─── Öffentliche API ─────────────────────────────────────────────────────

  /**
   * Explizites Error-Reporting aus Modulen heraus.
   * Ersetzt verstreute console.error()-Aufrufe in try/catch-Blöcken.
   *
   * @param {string} context - Kurzbeschreibung wo der Fehler auftrat, z.B. 'SpaceAPI fetch'
   * @param {Error|unknown} error - Der aufgetretene Fehler
   *
   * @example
   * try {
   *   await fetch(endpoint);
   * } catch (e) {
   *   errorMonitor.report('SpaceAPI fetch', e);
   * }
   */
  report(context, error) {
    const wrapped = error instanceof Error ? error : new Error(String(error));
    wrapped.message = `[${context}] ${wrapped.message}`;
    this.#record('reported', wrapped);
  }

  getLogs()    { return [...this.#logs]; }
  exportLogs() { return JSON.stringify(this.#logs, null, 2); }
  clear()      { this.#logs = []; this.#updateBadge(); }
}

export const errorMonitor = new ErrorMonitor();

// Backward Compat: globaler Zugriff via window.AppErrorMonitor
window.AppErrorMonitor = errorMonitor;
