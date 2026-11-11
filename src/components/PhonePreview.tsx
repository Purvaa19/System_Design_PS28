import React, { useState, useEffect } from 'react';
import {
  ShoppingBag,
  CreditCard,
  Zap,
  CheckCircle2,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  Clock,
  Lock,
} from 'lucide-react';
import type { FlagState, LabOperationMode } from '../types/simulation';
import {
  evaluateFlag,
  getFlag,
  peekCachedFlag,
  subscribeCacheChange,
} from '../services/flagCacheEngine';

interface PhonePreviewProps {
  flagState: FlagState;
  operationMode?: LabOperationMode;
}

export const PhonePreview: React.FC<PhonePreviewProps> = ({
  flagState,
  operationMode = 'simulation',
}) => {
  // In Simulation Mode: behavior remains EXACTLY unchanged (reads flagState.phoneClientValue)
  // In Live AWS Mode: Phone SDK obtains value through real Map cache evaluation flow (CHANGE 1)
  const [liveSdkEvaluation, setLiveSdkEvaluation] = useState<{
    value: boolean;
    status: 'HIT' | 'MISS' | 'FETCHING' | 'EMPTY' | 'EXPIRED';
    isHit: boolean;
  }>(() => {
    if (operationMode !== 'live_aws') {
      return { value: flagState.phoneClientValue, status: 'HIT', isHit: true };
    }
    const peek = peekCachedFlag('new_checkout');
    if (peek.state === 'ON') return { value: true, status: 'HIT', isHit: true };
    if (peek.state === 'OFF') return { value: false, status: 'HIT', isHit: true };
    return { value: flagState.phoneClientValue, status: peek.state, isHit: false };
  });

  useEffect(() => {
    if (operationMode !== 'live_aws') return;

    let isMounted = true;

    const performSdkEvaluation = async () => {
      const peek = peekCachedFlag('new_checkout');
      if (peek.state === 'ON' || peek.state === 'OFF') {
        // Cache HIT: synchronous in-memory Map lookup, zero AWS GET requests
        const res = evaluateFlag('new_checkout');
        if (isMounted) {
          setLiveSdkEvaluation({
            value: res.value,
            status: 'HIT',
            isHit: true,
          });
        }
        return;
      }

      // Cache MISS (EMPTY or EXPIRED): fetch via asynchronous getFlag() cache-aside flow
      if (isMounted) {
        setLiveSdkEvaluation((prev) => ({
          ...prev,
          status: 'FETCHING',
          isHit: false,
        }));
      }

      try {
        const res = await getFlag('new_checkout');
        if (isMounted) {
          setLiveSdkEvaluation({
            value: res.value,
            status: 'HIT',
            isHit: true,
          });
        }
      } catch (err) {
        console.warn('[PhoneSDK] Cache miss fetch failed:', err);
        if (isMounted) {
          setLiveSdkEvaluation((prev) => ({
            ...prev,
            status: peek.state === 'EXPIRED' ? 'EXPIRED' : 'EMPTY',
            isHit: false,
          }));
        }
      }
    };

    // Initial evaluation on mount or mode switch
    performSdkEvaluation();

    // Subscribe ONLY to actual cache mutations (WebSocket delta push, Sync GET, Clear Cache, Refill)
    // Never subscribes to telemetry or per-iteration evaluation updates!
    const unsubscribe = subscribeCacheChange(() => {
      const peek = peekCachedFlag('new_checkout');
      if (peek.state === 'ON' || peek.state === 'OFF') {
        // Cache refreshed with valid data: set value from peek directly (no evaluateFlag() call inside listener)
        if (isMounted) {
          setLiveSdkEvaluation({
            value: peek.value ?? false,
            status: 'HIT',
            isHit: true,
          });
        }
      } else if (peek.state === 'EMPTY') {
        if (isMounted) {
          setLiveSdkEvaluation((prev) => ({
            ...prev,
            status: 'EMPTY',
            isHit: false,
          }));
        }
      } else if (peek.state === 'EXPIRED') {
        if (isMounted) {
          setLiveSdkEvaluation((prev) => ({
            ...prev,
            status: 'EXPIRED',
            isHit: false,
          }));
        }
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [operationMode]);

  const isNewCheckoutActive =
    operationMode === 'live_aws'
      ? liveSdkEvaluation.value
      : flagState.phoneClientValue;

  const [orderPlaced, setOrderPlaced] = useState(false);

  const handleCheckoutAction = async () => {
    setOrderPlaced(true);
    setTimeout(() => setOrderPlaced(false), 2400);

    // In Live AWS mode, order action evaluates flag against the real Map cache
    if (operationMode === 'live_aws') {
      try {
        const peek = peekCachedFlag('new_checkout');
        if (peek.state === 'EMPTY' || peek.state === 'EXPIRED') {
          const res = await getFlag('new_checkout');
          setLiveSdkEvaluation({
            value: res.value,
            status: 'HIT',
            isHit: true,
          });
        } else {
          const res = evaluateFlag('new_checkout');
          setLiveSdkEvaluation({
            value: res.value,
            status: 'HIT',
            isHit: true,
          });
        }
      } catch (err) {
        console.warn('[PhoneSDK] Order checkout evaluation error:', err);
      }
    }
  };

  return (
    <div className="flex flex-col items-center">
      {/* Mobile Device Frame */}
      <div className="w-[300px] h-[580px] bg-slate-900 rounded-[38px] p-2.5 shadow-xl border-4 border-slate-800 relative flex flex-col shrink-0">
        {/* Dynamic Island / Speaker Notch */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-24 h-4 bg-slate-800 rounded-full z-20 flex items-center justify-center">
          <div className="w-2.5 h-2.5 rounded-full bg-slate-950 mr-2" />
          <div className="w-1.5 h-1.5 rounded-full bg-blue-900/60" />
        </div>

        {/* Inner Phone Screen */}
        <div className="w-full h-full bg-slate-50 rounded-[30px] overflow-hidden flex flex-col relative text-slate-800 select-none">
          {/* iOS-Style Status Bar */}
          <div className="h-7 px-5 pt-1.5 flex items-center justify-between text-[11px] font-semibold text-slate-700 shrink-0">
            <span>9:41</span>
            <div className="flex items-center space-x-1 text-[10px]">
              <span className="font-mono text-[9px] font-bold">5G</span>
              <div className="w-4 h-2 border border-slate-600 rounded-xs p-0.2 flex items-center">
                <div className="w-full h-full bg-slate-700 rounded-xs" />
              </div>
            </div>
          </div>

          {/* ShopEasy App Header */}
          <div className="px-4 py-2 bg-white border-b border-slate-200 flex items-center justify-between shadow-xs shrink-0">
            <div className="flex items-center space-x-1.5">
              <div className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center text-white">
                <ShoppingBag className="w-3.5 h-3.5" />
              </div>
              <span className="font-black text-sm text-slate-900 tracking-tight">ShopEasy</span>
            </div>
            {operationMode === 'live_aws' ? (
              <div className="flex items-center space-x-1 text-[10px] font-medium">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    liveSdkEvaluation.status === 'HIT'
                      ? 'bg-emerald-500'
                      : liveSdkEvaluation.status === 'FETCHING'
                      ? 'bg-blue-500 animate-spin'
                      : 'bg-amber-500'
                  }`}
                />
                <span className="text-slate-600">
                  SDK:{' '}
                  <span
                    className={
                      liveSdkEvaluation.status === 'HIT'
                        ? 'text-emerald-700 font-bold'
                        : liveSdkEvaluation.status === 'FETCHING'
                        ? 'text-blue-700 font-bold'
                        : 'text-amber-700 font-bold'
                    }
                  >
                    {liveSdkEvaluation.status === 'FETCHING'
                      ? 'Fetching...'
                      : liveSdkEvaluation.status === 'HIT'
                      ? `HIT (${liveSdkEvaluation.value ? 'ON' : 'OFF'})`
                      : liveSdkEvaluation.status}
                  </span>
                </span>
              </div>
            ) : (
              <div className="flex items-center space-x-1 text-[10px] text-slate-500 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>SDK Connected</span>
              </div>
            )}
          </div>

          {/* App Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {/* Cart Summary Card */}
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2">
                <span>ORDER SUMMARY (1 ITEM)</span>
                <span className="text-blue-600 font-bold">$150.00</span>
              </div>
              <div className="flex items-center space-x-2.5">
                <div className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-2xl shrink-0">
                  👟
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-slate-900 truncate">Nike Air Max Pulse</h4>
                  <p className="text-[10px] text-slate-500">Size: US 10.5 • Color: Black</p>
                  <p className="text-[11px] font-bold text-slate-800">$150.00</p>
                </div>
              </div>
            </div>

            {/* Success Toast Modal */}
            {orderPlaced && (
              <div className="p-3 bg-emerald-600 text-white rounded-xl shadow-lg flex items-center space-x-2 animate-bounce">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <div className="text-xs">
                  <p className="font-bold">Order Confirmed!</p>
                  <p className="text-[10px] opacity-90">Evaluated with flag: {isNewCheckoutActive ? 'ON' : 'OFF'}</p>
                </div>
              </div>
            )}

            {/* DYNAMIC FEATURE FLAG AREA: NEW CHECKOUT vs OLD CHECKOUT */}
            {isNewCheckoutActive ? (
              /* ======================================================== */
              /* NEW CHECKOUT EXPERIENCE (Flag = ON) */
              /* ======================================================== */
              <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-3 shadow-xs space-y-2.5 animate-fadeIn">
                {/* Header & New Experience Label */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1 text-blue-900 font-black text-xs">
                    <Zap className="w-3.5 h-3.5 text-blue-600 fill-blue-600" />
                    <span>New Checkout</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide bg-blue-600 text-white flex items-center space-x-1 shadow-xs">
                    <Sparkles className="w-2.5 h-2.5 mr-0.5" />
                    NEW EXPERIENCE
                  </span>
                </div>

                <p className="text-[10px] text-blue-800/80 leading-tight">
                  Fast 1-Click checkout with saved payment credentials.
                </p>

                {/* Express 1-Click Pay Buttons */}
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={handleCheckoutAction}
                    className="py-1.5 px-2 bg-slate-900 text-white rounded-lg text-[10px] font-bold flex items-center justify-center space-x-1 hover:bg-black transition-colors"
                  >
                    <span>Pay</span>
                  </button>
                  <button
                    onClick={handleCheckoutAction}
                    className="py-1.5 px-2 bg-white border border-slate-300 text-slate-800 rounded-lg text-[10px] font-bold flex items-center justify-center space-x-1 hover:bg-slate-100 transition-colors"
                  >
                    <span className="text-blue-600 font-bold">G</span>
                    <span>Pay</span>
                  </button>
                </div>

                {/* Delivery perk pill */}
                <div className="flex items-center space-x-1.5 text-[10px] text-blue-900 bg-white/70 p-1.5 rounded-lg border border-blue-200">
                  <Clock className="w-3 h-3 text-blue-600 shrink-0" />
                  <span>Free Express Delivery: <strong>Tomorrow, 10 AM</strong></span>
                </div>

                {/* Main Action Button */}
                <button
                  onClick={handleCheckoutAction}
                  className="w-full py-2.5 px-3 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 flex items-center justify-center space-x-1.5 transition-all"
                >
                  <span>Continue to Checkout</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              /* ======================================================== */
              /* OLD CHECKOUT EXPERIENCE (Flag = OFF) */
              /* ======================================================== */
              <div className="bg-slate-100 border border-slate-300 rounded-xl p-3 shadow-xs space-y-2.5">
                {/* Header & Old Checkout Label */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1 text-slate-700 font-bold text-xs">
                    <CreditCard className="w-3.5 h-3.5 text-slate-500" />
                    <span>Traditional Checkout</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide bg-slate-200 text-slate-600 border border-slate-300">
                    Old Checkout
                  </span>
                </div>

                <p className="text-[10px] text-slate-500 leading-tight">
                  Standard multi-step manual payment form.
                </p>

                {/* Legacy Traditional Form Fields */}
                <div className="space-y-1.5 text-[10px]">
                  <div>
                    <label className="text-slate-500 block text-[9px] mb-0.5">Card Number</label>
                    <input
                      type="text"
                      readOnly
                      value="•••• •••• •••• 4242"
                      className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-slate-600 font-mono text-[10px]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div>
                      <label className="text-slate-500 block text-[9px] mb-0.5">Expiry</label>
                      <input
                        type="text"
                        readOnly
                        value="12 / 28"
                        className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-slate-600 text-[10px]"
                      />
                    </div>
                    <div>
                      <label className="text-slate-500 block text-[9px] mb-0.5">CVV</label>
                      <input
                        type="password"
                        readOnly
                        value="•••"
                        className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-slate-600 text-[10px]"
                      />
                    </div>
                  </div>
                </div>

                {/* Legacy Standard Button */}
                <button
                  onClick={handleCheckoutAction}
                  className="w-full py-2 px-3 bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center justify-center space-x-1.5 transition-colors"
                >
                  <Lock className="w-3 h-3 text-slate-300" />
                  <span>Place Order ($150.00)</span>
                </button>
              </div>
            )}

            {/* Trust badge footer in app */}
            <div className="flex items-center justify-center space-x-1 text-[10px] text-slate-400 pt-1">
              <ShieldCheck className="w-3 h-3" />
              <span>256-Bit Encrypted Client SDK</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
