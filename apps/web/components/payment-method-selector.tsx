"use client";

import { useState } from "react";
import { Smartphone, Wallet, ChevronDown } from "lucide-react";
import { Card } from "./ui/card";

type PaymentMethod = "crypto" | "upi";

type PaymentMethodOption = {
  value: PaymentMethod;
  label: string;
  icon: React.ReactNode;
  description: string;
  recommended?: boolean;
};

export const PaymentMethodSelector = ({
  selectedMethod,
  onMethodChange,
  disabled = false
}: {
  selectedMethod: PaymentMethod;
  onMethodChange: (method: PaymentMethod) => void;
  disabled?: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const methods: PaymentMethodOption[] = [
    {
      value: "crypto",
      label: "Crypto",
      icon: <Wallet className="h-5 w-5" />,
      description: "BTC, ETH, USDT and more",
      recommended: true
    },
    {
      value: "upi",
      label: "UPI",
      icon: <Smartphone className="h-5 w-5" />,
      description: "Configured UPI providers"
    }
  ];

  const selectedOption = methods.find(m => m.value === selectedMethod);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className="w-full flex items-center justify-between glass-soft rounded-xl px-4 py-3 text-left disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <div className="flex items-center gap-3">
          {selectedOption?.icon}
          <div>
            <p className="text-white font-medium">{selectedOption?.label}</p>
            <p className="text-xs text-slate-400">{selectedOption?.description}</p>
          </div>
        </div>
        <ChevronDown className={`h-5 w-5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && !disabled && (
        <div className="absolute z-10 w-full mt-2 glass-soft rounded-xl border border-white/10 overflow-hidden">
          {methods.map((method) => (
            <button
              key={method.value}
              type="button"
              onClick={() => {
                onMethodChange(method.value);
                setIsOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition hover:bg-white/5 ${
                selectedMethod === method.value ? 'bg-cyan-400/10' : ''
              }`}
            >
              {method.icon}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-white font-medium">{method.label}</p>
                  {method.recommended && (
                    <span className="text-xs bg-cyan-400/20 text-cyan-400 px-2 py-0.5 rounded-full">
                      Recommended
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400">{method.description}</p>
              </div>
              {selectedMethod === method.value && (
                <div className="h-2 w-2 bg-cyan-400 rounded-full" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
