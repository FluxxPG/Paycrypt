"use client";

import { useEffect, useState } from "react";
import { Copy, Smartphone, QrCode, ExternalLink, CheckCircle, AlertCircle } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";

// Simple Button component for UPI checkout
const SimpleButton = ({ 
  children, 
  onClick, 
  variant = "default",
  className = "",
  ...props 
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "default" | "outline";
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    onClick={onClick}
    className={`inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition hover:scale-[1.01] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50 ${
      variant === "outline" 
        ? "border border-slate-600 bg-transparent text-slate-100 hover:bg-white/10" 
        : "bg-cyan-400 text-slate-950 hover:bg-cyan-300"
    } ${className}`}
    {...props}
  >
    {children}
  </button>
);

type UPICheckoutPayment = {
  id: string;
  merchant_id: string;
  amount_fiat: number;
  fiat_currency: string;
  payment_method: "upi";
  upi_provider: string;
  upi_transaction_id: string;
  upi_intent_url?: string;
  upi_qr_code?: string;
  upi_status: string;
  description: string;
  status: string;
  expires_at: string;
  success_url: string;
  cancel_url: string;
};

export const UPICheckoutPanel = ({ payment }: { payment: UPICheckoutPayment }) => {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [copied, setCopied] = useState(false);
  const [intentError, setIntentError] = useState(false);

  useEffect(() => {
    const tick = () => {
      setSecondsLeft(Math.max(0, Math.floor((new Date(payment.expires_at).getTime() - Date.now()) / 1000)));
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [payment.expires_at]);

  const handleCopyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const handleUPIIntent = () => {
    if (payment.upi_intent_url) {
      try {
        window.location.href = payment.upi_intent_url;
      } catch (error) {
        setIntentError(true);
        console.error("Failed to open UPI intent:", error);
      }
    }
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const getProviderDisplayName = (provider: string) => {
    return provider
      .split(/[_-]/g)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "created":
      case "pending":
        return "text-yellow-400";
      case "confirmed":
        return "text-green-400";
      case "failed":
        return "text-red-400";
      case "expired":
        return "text-gray-400";
      default:
        return "text-slate-300";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "confirmed":
        return <CheckCircle className="h-5 w-5 text-green-400" />;
      case "failed":
      case "expired":
        return <AlertCircle className="h-5 w-5 text-red-400" />;
      default:
        return <Smartphone className="h-5 w-5 text-yellow-400" />;
    }
  };

  if (secondsLeft <= 0) {
    return (
      <main className="mx-auto flex min-h-screen max-w-4xl items-center px-6 py-12">
        <Card className="w-full p-8 text-center">
          <AlertCircle className="mx-auto h-16 w-16 text-red-400" />
          <h1 className="mt-6 text-3xl font-semibold text-white">Payment Expired</h1>
          <p className="mt-3 text-slate-300">
            This UPI payment session has expired. Please return to the merchant to initiate a new payment.
          </p>
          <div className="mt-6 flex gap-4 justify-center">
            <SimpleButton
              onClick={() => window.location.href = payment.cancel_url}
              variant="outline"
            >
              Return to Merchant
            </SimpleButton>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <div className="grid w-full gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <Card className="p-8">
        <Badge className="mb-4">UPI Payment</Badge>
        <h1 className="text-4xl font-semibold text-white">Complete your UPI payment</h1>
        <p className="mt-2 text-slate-300">{payment.description}</p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="glass-soft rounded-2xl p-4">
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Smartphone className="h-4 w-4" /> UPI Provider
            </div>
            <p className="mt-3 text-xl font-medium text-white">
              {getProviderDisplayName(payment.upi_provider)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Unified Payments Interface
            </p>
          </div>
          <div className="glass-soft rounded-2xl p-4">
            <div className="flex items-center gap-2 text-sm text-slate-300">Expires</div>
            <p className="mt-3 text-xl font-medium text-white">
              {formatTime(secondsLeft)}
            </p>
          </div>
        </div>

        <div className="mt-6 glass-soft rounded-3xl p-5">
          <div className="flex items-center justify-between text-sm text-slate-400">
            <span>Amount</span>
            <div className="flex items-center gap-2">
              {getStatusIcon(payment.status)}
              <span className={getStatusColor(payment.status)}>
                {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
              </span>
            </div>
          </div>
          <p className="mt-3 text-3xl font-bold text-white">
            {Number(payment.amount_fiat).toLocaleString("en-IN")} {payment.fiat_currency}
          </p>
          <p className="mt-1 text-sm text-slate-300">
            Payable via any UPI app
          </p>
        </div>

        {/* UPI Intent Button */}
        {payment.upi_intent_url && (
          <div className="mt-6">
            <SimpleButton
              onClick={handleUPIIntent}
              className="w-full py-3"
            >
              <Smartphone className="mr-2 h-5 w-5" />
              Pay via UPI App
            </SimpleButton>
            {intentError && (
              <p className="mt-2 text-sm text-red-400">
                Unable to open UPI app. Please use the QR code or copy the payment details.
              </p>
            )}
          </div>
        )}

        {/* Payment Instructions */}
        <div className="mt-6 w-full space-y-3 text-left text-sm text-slate-300">
          <div className="glass-soft rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <QrCode className="h-4 w-4" />
              <span className="font-medium text-white">Option 1: QR Code</span>
            </div>
            <p>Scan the QR code with any UPI app to complete payment.</p>
          </div>
          <div className="glass-soft rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Smartphone className="h-4 w-4" />
              <span className="font-medium text-white">Option 2: UPI Intent</span>
            </div>
            <p>Click the "Pay via UPI App" button to open your default UPI app.</p>
          </div>
          <div className="glass-soft rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <ExternalLink className="h-4 w-4" />
              <span className="font-medium text-white">Option 3: Manual Entry</span>
            </div>
            <p>Copy the payment details and enter them manually in your UPI app.</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex gap-4">
          <SimpleButton
            onClick={() => window.location.href = payment.cancel_url}
            variant="outline"
            className="flex-1"
          >
            Return to Merchant
          </SimpleButton>
          {payment.upi_intent_url && (
            <SimpleButton
              onClick={handleUPIIntent}
              className="flex-1"
            >
              Try UPI App Again
            </SimpleButton>
          )}
        </div>
      </Card>

      {/* QR Code Panel */}
      <Card className="flex flex-col items-center justify-center p-8 text-center">
        <div className="mb-6">
          <h3 className="text-xl font-semibold text-white mb-2">Scan QR Code</h3>
          <p className="text-sm text-slate-300">
            Use any UPI app to scan this QR code
          </p>
        </div>

        {payment.upi_qr_code ? (
          <>
            <div className="relative">
              <QRCodeSVG 
                value={payment.upi_qr_code} 
                size={280} 
                bgColor="transparent" 
                fgColor="#ffffff" 
              />
              <div className="absolute -bottom-4 left-1/2 transform -translate-x-1/2 glass-soft rounded-full px-4 py-2">
                <p className="text-xs font-medium text-white">
                  {getProviderDisplayName(payment.upi_provider)}
                </p>
              </div>
            </div>
            
            {/* Copy QR Code Data */}
            <div className="mt-6 w-full">
              <div className="glass-soft rounded-2xl p-4">
                <div className="flex items-center justify-between text-sm text-slate-400 mb-2">
                  <span>Payment Details</span>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 text-cyan-200"
                    onClick={() => handleCopyToClipboard(payment.upi_qr_code || "")}
                  >
                    <Copy className="h-4 w-4" />
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <p className="break-all font-mono text-xs text-white p-2 bg-black/20 rounded">
                  {payment.upi_qr_code}
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center">
            <QrCode className="mx-auto h-16 w-16 text-slate-400 mb-4" />
            <p className="text-slate-300">QR code will be generated</p>
            <p className="text-sm text-slate-400 mt-2">
              Waiting for payment initialization...
            </p>
          </div>
        )}

        <div className="mt-6 text-center">
          <p className="text-3xl font-bold text-white">
            {Number(payment.amount_fiat).toLocaleString("en-IN")} {payment.fiat_currency}
          </p>
          <p className="mt-2 text-sm text-slate-300">
            Status: <span className={`capitalize ${getStatusColor(payment.status)}`}>
              {payment.status}
            </span>
          </p>
        </div>

        {/* Real-time Updates Notice */}
        <div className="mt-6 glass-soft rounded-2xl p-4">
          <div className="flex items-center gap-2 text-sm text-cyan-200">
            <div className="h-2 w-2 bg-green-400 rounded-full animate-pulse"></div>
            <span>Real-time updates active</span>
          </div>
          <p className="mt-2 text-xs text-slate-300">
            This page will automatically update when your payment is confirmed.
          </p>
        </div>
      </Card>
    </div>
  );
};
