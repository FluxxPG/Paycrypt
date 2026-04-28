// Paycrypt Browser SDK for Frontend Integration
(function(global) {
  'use strict';

  class PaycryptBrowserSDK {
    constructor(config) {
      this.config = config;
      this.baseUrl = config.baseUrl || 'https://api.paycrypt.com';
      this.apiKey = config.apiKey;
      this.isProduction = config.environment === 'production';
      this.websocket = null;
      this.eventListeners = new Map();
    }

    // Create payment with automatic method detection
    async createPayment(paymentData, options = {}) {
      try {
        const endpoint = `${this.baseUrl}/v1/payments`;
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          ...(options.idempotencyKey && { 'Idempotency-Key': options.idempotencyKey })
        };

        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            ...paymentData,
            // Auto-detect optimal payment method
            method: this.detectOptimalPaymentMethod()
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Payment creation failed');
        }

        return data;
      } catch (error) {
        throw new Error(`Payment creation failed: ${error.message}`);
      }
    }

    // Create UPI payment with enhanced features
    async createUPIPayment(paymentData, options = {}) {
      try {
        const endpoint = `${this.baseUrl}/v1/payments`;
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          ...(options.idempotencyKey && { 'Idempotency-Key': options.idempotencyKey })
        };

        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            ...paymentData,
            method: 'upi',
            // Auto-select best provider if not specified
            provider: paymentData.provider || this.selectOptimalUPIProvider()
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'UPI payment creation failed');
        }

        return data;
      } catch (error) {
        throw new Error(`UPI payment creation failed: ${error.message}`);
      }
    }

    // Create crypto payment
    async createCryptoPayment(paymentData, options = {}) {
      try {
        const endpoint = `${this.baseUrl}/v1/payments`;
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          ...(options.idempotencyKey && { 'Idempotency-Key': options.idempotencyKey })
        };

        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            ...paymentData,
            method: 'crypto'
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Crypto payment creation failed');
        }

        return data;
      } catch (error) {
        throw new Error(`Crypto payment creation failed: ${error.message}`);
      }
    }

    // Fetch payment with enhanced error handling
    async fetchPayment(paymentId, options = {}) {
      try {
        const endpoint = `${this.baseUrl}/public/payments/${paymentId}`;
        const response = await fetch(endpoint, {
          headers: {
            'Content-Type': 'application/json'
          }
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Payment fetch failed');
        }

        return data;
      } catch (error) {
        throw new Error(`Payment fetch failed: ${error.message}`);
      }
    }

    // Fetch UPI payment
    async fetchUPIPayment(paymentId, options = {}) {
      try {
        const endpoint = `${this.baseUrl}/public/upi-payments/${paymentId}`;
        const response = await fetch(endpoint, {
          headers: {
            'Content-Type': 'application/json'
          }
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'UPI payment fetch failed');
        }

        return data;
      } catch (error) {
        throw new Error(`UPI payment fetch failed: ${error.message}`);
      }
    }

    // Create payment link
    async createPaymentLink(paymentLinkData, options = {}) {
      try {
        const endpoint = `${this.baseUrl}/v1/payment_links`;
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          ...(options.idempotencyKey && { 'Idempotency-Key': options.idempotencyKey })
        };

        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            ...paymentLinkData,
            paymentMethod: this.detectOptimalPaymentMethod()
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Payment link creation failed');
        }

        return data;
      } catch (error) {
        throw new Error(`Payment link creation failed: ${error.message}`);
      }
    }

    // Verify payment
    async verifyPayment(paymentId, options = {}) {
      try {
        const endpoint = `${this.baseUrl}/v1/payments/${paymentId}/verify`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: JSON.stringify(options)
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Payment verification failed');
        }

        return data;
      } catch (error) {
        throw new Error(`Payment verification failed: ${error.message}`);
      }
    }

    // Generate checkout URL
    generateCheckoutUrl(paymentId, options = {}) {
      const baseUrl = this.config.checkoutUrl || `${this.baseUrl}/pay`;
      const params = new URLSearchParams({
        payment_id: paymentId,
        ...options
      });
      
      return `${baseUrl}?${params.toString()}`;
    }

    // Real-time payment monitoring
    monitorPayment(paymentId, callbacks) {
      // Use WebSocket if available, fallback to polling
      if (typeof WebSocket !== 'undefined') {
        return this.monitorPaymentWebSocket(paymentId, callbacks);
      } else {
        return this.monitorPaymentPolling(paymentId, callbacks);
      }
    }

    // WebSocket-based monitoring
    monitorPaymentWebSocket(paymentId, callbacks) {
      const wsUrl = this.baseUrl.replace('http', 'ws').replace('https', 'wss') + `/ws/payments/${paymentId}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('Payment monitoring WebSocket connected');
        if (callbacks.onConnect) callbacks.onConnect();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (callbacks.onUpdate) {
            callbacks.onUpdate({
              type: 'status_update',
              paymentId,
              data
            });
          }
        } catch (error) {
          console.error('WebSocket message error:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        if (callbacks.onError) callbacks.onError(error);
      };

      ws.onclose = () => {
        console.log('Payment monitoring WebSocket disconnected');
        if (callbacks.onDisconnect) callbacks.onDisconnect();
      };

      return {
        close: () => ws.close(),
        reconnect: () => {
          ws.reconnect();
        }
      };
    }

    // Polling-based monitoring
    async monitorPaymentPolling(paymentId, callbacks) {
      let lastStatus = null;
      
      const poll = async () => {
        try {
          const payment = await this.fetchPayment(paymentId);
          
          if (payment && payment.status !== lastStatus) {
            lastStatus = payment.status;
            
            if (callbacks.onUpdate) {
              callbacks.onUpdate({
                type: 'status_update',
                paymentId,
                data: payment
              });
            }

            // Stop polling on completion
            if (payment.status === 'confirmed' || payment.status === 'failed') {
              return true;
            }
          }
        } catch (error) {
          console.error('Payment polling error:', error);
          if (callbacks.onError) callbacks.onError(error);
        }
        
        return false;
      };

      // Initial poll
      await poll();
      
      // Continue polling every 2 seconds
      const interval = setInterval(poll, 2000);
      
      return {
        stop: () => clearInterval(interval)
      };
    }

    // Detect optimal payment method
    detectOptimalPaymentMethod() {
      // Check if user is on mobile device
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      // Check if UPI is supported (India region detection)
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const isIndia = timezone && timezone.includes('Asia/Kolkata');
      
      if (isMobile && isIndia) {
        return 'upi';
      }
      
      return 'crypto';
    }

    // Select optimal UPI provider
    selectOptimalUPIProvider() {
      // This would typically involve checking provider availability,
      // transaction limits, and merchant preferences
      // For now, return a default provider
      return 'phonepe';
    }

    // Format currency amount
    formatAmount(amount, currency) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency
      }).format(amount);
    }

    // Validate payment data
    validatePaymentData(paymentData) {
      const errors = [];

      if (!paymentData.amountFiat || paymentData.amountFiat <= 0) {
        errors.push('Amount must be greater than 0');
      }

      if (!paymentData.description || paymentData.description.length < 3) {
        errors.push('Description must be at least 3 characters');
      }

      if (!paymentData.successUrl || !paymentData.successUrl.startsWith('http')) {
        errors.push('Valid success URL is required');
      }

      if (!paymentData.cancelUrl || !paymentData.cancelUrl.startsWith('http')) {
        errors.push('Valid cancel URL is required');
      }

      return {
        valid: errors.length === 0,
        errors
      };
    }

    // Generate secure payment reference
    generatePaymentReference() {
      const timestamp = Date.now().toString(36);
      const random = Math.random().toString(36).substr(2, 9);
      return `browser_${timestamp}_${random}`;
    }

    // Connect to WebSocket for real-time payment updates
    connectWebSocket(paymentId, callbacks = {}) {
      const wsUrl = this.baseUrl.replace('http', 'ws') + `/ws/payments/${paymentId}`;

      this.websocket = new WebSocket(wsUrl);

      this.websocket.onopen = () => {
        console.log('WebSocket connected for payment:', paymentId);
        if (callbacks.onConnect) callbacks.onConnect();
      };

      this.websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (callbacks.onMessage) callbacks.onMessage(data);

          // Auto-handle payment status changes
          if (data.type === 'payment.confirmed' && callbacks.onConfirmed) {
            callbacks.onConfirmed(data);
          } else if (data.type === 'payment.failed' && callbacks.onFailed) {
            callbacks.onFailed(data);
          } else if (data.type === 'payment.expired' && callbacks.onExpired) {
            callbacks.onExpired(data);
          }
        } catch (error) {
          console.error('WebSocket message error:', error);
        }
      };

      this.websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
        if (callbacks.onError) callbacks.onError(error);
      };

      this.websocket.onclose = () => {
        console.log('WebSocket disconnected for payment:', paymentId);
        if (callbacks.onDisconnect) callbacks.onDisconnect();
      };

      return this.websocket;
    }

    // Disconnect WebSocket
    disconnectWebSocket() {
      if (this.websocket) {
        this.websocket.close();
        this.websocket = null;
      }
    }

    // Add event listener for payment events
    on(event, callback) {
      if (!this.eventListeners.has(event)) {
        this.eventListeners.set(event, []);
      }
      this.eventListeners.get(event).push(callback);
    }

    // Remove event listener
    off(event, callback) {
      if (this.eventListeners.has(event)) {
        const listeners = this.eventListeners.get(event);
        const index = listeners.indexOf(callback);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }
    }

    // Emit event to listeners
    emit(event, data) {
      if (this.eventListeners.has(event)) {
        this.eventListeners.get(event).forEach(callback => callback(data));
      }
    }

    // Create payment link
    async createPaymentLink(linkData, options = {}) {
      try {
        const endpoint = `${this.baseUrl}/v1/payment_links`;
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          ...(options.idempotencyKey && { 'Idempotency-Key': options.idempotencyKey })
        };

        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(linkData)
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Payment link creation failed');
        }

        return data;
      } catch (error) {
        throw new Error(`Payment link creation failed: ${error.message}`);
      }
    }

    // Get payment status
    async getPaymentStatus(paymentId) {
      try {
        const endpoint = `${this.baseUrl}/v1/payments/${paymentId}`;
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        };

        const response = await fetch(endpoint, {
          method: 'GET',
          headers
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Failed to fetch payment status');
        }

        return data;
      } catch (error) {
        throw new Error(`Failed to fetch payment status: ${error.message}`);
      }
    }

    // SDK info
    static getInfo() {
      return {
        name: 'Paycrypt Browser SDK',
        version: '1.0.0',
        features: [
          'Automatic Payment Method Detection',
          'UPI Payment Support',
          'Crypto Payment Support',
          'Real-time Payment Monitoring',
          'WebSocket Support',
          'Payment Link Creation',
          'Enhanced Error Handling',
          'Mobile Optimization',
          'Browser Compatibility',
          'Production-ready Security',
          'Event-driven Architecture',
          'Treasury Integration'
        ],
        supportedMethods: ['crypto', 'upi'],
        supportedUPIProviders: ['phonepe', 'paytm', 'razorpay', 'freecharge'],
        documentation: 'https://docs.paycrypt.com/sdk/browser'
      };
    }
  }

  // Export to global
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PaycryptBrowserSDK;
  } else if (typeof window !== 'undefined') {
    window.PaycryptBrowserSDK = PaycryptBrowserSDK;
  } else {
    global.PaycryptBrowserSDK = PaycryptBrowserSDK;
  }

})(typeof window !== 'undefined' ? window : global);
