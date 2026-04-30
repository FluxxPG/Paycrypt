// Paycrypt Browser SDK.
// This SDK never sends secret API keys from the browser. Merchants create payments
// on their own backend, then pass the returned paymentId or checkoutUrl here.
(function (global) {
  "use strict";

  const terminalStatuses = new Set(["confirmed", "failed", "expired"]);

  class PaycryptBrowserSDK {
    constructor(config = {}) {
      this.config = config;
      this.apiBaseUrl = config.apiBaseUrl || config.baseUrl || "http://localhost:4000";
      this.checkoutBaseUrl = config.checkoutBaseUrl || config.appBaseUrl || "http://localhost:3003";
      this.wsUrl = config.wsUrl || null;
      this.fetcher = config.fetcher || fetch.bind(global);
    }

    checkoutUrl(paymentIdOrUrl) {
      if (!paymentIdOrUrl) {
        throw new Error("paymentIdOrUrl is required");
      }
      if (/^https?:\/\//i.test(paymentIdOrUrl)) {
        return paymentIdOrUrl;
      }
      return `${this.checkoutBaseUrl.replace(/\/$/, "")}/pay/${encodeURIComponent(paymentIdOrUrl)}`;
    }

    openCheckout(paymentIdOrUrl, options = {}) {
      const url = this.checkoutUrl(paymentIdOrUrl);
      if (options.redirect) {
        global.location.href = url;
        return null;
      }
      return global.open(url, options.target || "_blank", options.windowFeatures || "noopener,noreferrer");
    }

    mountCheckout(paymentIdOrUrl, container, options = {}) {
      const target =
        typeof container === "string" ? global.document.querySelector(container) : container;
      if (!target) {
        throw new Error("Checkout container was not found");
      }

      const iframe = global.document.createElement("iframe");
      iframe.src = this.checkoutUrl(paymentIdOrUrl);
      iframe.title = options.title || "Paycrypt checkout";
      iframe.allow = "clipboard-write; payment";
      iframe.style.width = options.width || "100%";
      iframe.style.height = options.height || "760px";
      iframe.style.border = options.border || "0";
      iframe.style.borderRadius = options.borderRadius || "24px";
      iframe.style.background = options.background || "#020617";
      target.replaceChildren(iframe);

      return {
        iframe,
        destroy: () => iframe.remove()
      };
    }

    async fetchPayment(paymentId) {
      const response = await this.fetcher(
        `${this.apiBaseUrl.replace(/\/$/, "")}/public/payments/${encodeURIComponent(paymentId)}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || `Payment fetch failed with ${response.status}`);
      }
      return payload;
    }

    monitorPayment(paymentId, callbacks = {}, options = {}) {
      if (global.io && this.wsUrl) {
        return this.monitorWithSocketIo(paymentId, callbacks, options);
      }
      return this.monitorWithPolling(paymentId, callbacks, options);
    }

    monitorWithSocketIo(paymentId, callbacks = {}, options = {}) {
      const socket = global.io(this.wsUrl, {
        transports: ["websocket", "polling"],
        ...options.socketOptions
      });
      const events = ["payment.created", "payment.pending", "payment.confirmed", "payment.failed", "payment.expired"];

      socket.on("connect", () => {
        socket.emit("payment:join", paymentId);
        callbacks.onConnect?.();
      });
      for (const eventName of events) {
        socket.on(eventName, (event) => {
          callbacks.onUpdate?.(event);
          if (terminalStatuses.has(event.status)) {
            callbacks.onTerminal?.(event);
          }
        });
      }
      socket.on("connect_error", (error) => callbacks.onError?.(error));

      return {
        mode: "socket.io",
        close: () => socket.close()
      };
    }

    monitorWithPolling(paymentId, callbacks = {}, options = {}) {
      let closed = false;
      let lastStatus = null;
      const intervalMs = options.intervalMs || 2500;

      const tick = async () => {
        if (closed) return;
        try {
          const payment = await this.fetchPayment(paymentId);
          if (payment.status !== lastStatus) {
            lastStatus = payment.status;
            callbacks.onUpdate?.(payment);
          }
          if (terminalStatuses.has(payment.status)) {
            closed = true;
            callbacks.onTerminal?.(payment);
            return;
          }
        } catch (error) {
          callbacks.onError?.(error);
        }

        if (!closed) {
          global.setTimeout(tick, intervalMs);
        }
      };

      void tick();

      return {
        mode: "polling",
        close: () => {
          closed = true;
        }
      };
    }

    static getInfo() {
      return {
        name: "Paycrypt Browser SDK",
        version: "1.0.0",
        safeForBrowser: true,
        features: [
          "Hosted checkout opening",
          "Embeddable checkout iframe",
          "Public payment status fetching",
          "Socket.IO realtime when available",
          "Polling fallback"
        ]
      };
    }
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = PaycryptBrowserSDK;
  } else {
    global.PaycryptBrowserSDK = PaycryptBrowserSDK;
  }
})(typeof window !== "undefined" ? window : globalThis);
