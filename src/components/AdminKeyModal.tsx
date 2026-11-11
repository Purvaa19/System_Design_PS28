import React, { useState } from 'react';
import { Key, Lock, Eye, EyeOff, ShieldCheck, X, AlertTriangle, Trash2 } from 'lucide-react';
import { setInMemoryAdminKey, getInMemoryAdminKey, clearInMemoryAdminKey } from '../services/backendClient';

interface AdminKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  promptReason?: string;
}

export const AdminKeyModal: React.FC<AdminKeyModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  promptReason,
}) => {
  const currentKey = getInMemoryAdminKey() || '';
  const [keyValue, setKeyValue] = useState(currentKey);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = keyValue.trim();
    if (!trimmed) {
      setErrorMsg('Please enter a valid Admin API Key (minimum 8 characters).');
      return;
    }
    if (trimmed.length < 8) {
      setErrorMsg('Admin API Key must be at least 8 characters as defined in SAM parameters.');
      return;
    }

    setInMemoryAdminKey(trimmed);
    setErrorMsg('');
    onClose();
    onSuccess?.();
  };

  const handleClear = () => {
    clearInMemoryAdminKey();
    setKeyValue('');
    setErrorMsg('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                AWS Admin Authorization
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">
                Live Cloud Feature Flag Mutation
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-6 space-y-4">
          {promptReason && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start space-x-2 text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>{promptReason}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Admin API Key (`x-admin-key`)
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={keyValue}
                onChange={(e) => {
                  setKeyValue(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }}
                placeholder="Enter AdminApiKey passed during SAM deployment"
                className="w-full pl-9 pr-10 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all text-slate-900 bg-white"
                autoFocus
              />
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                title={showPassword ? 'Hide Key' : 'Show Key'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errorMsg && (
              <p className="mt-1 text-[11px] text-red-600 font-medium">{errorMsg}</p>
            )}
          </div>

          {/* Security Notice Box */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-[11px] text-slate-600">
            <div className="flex items-center space-x-1.5 text-emerald-700 font-bold">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Zero-Storage In-Memory Security</span>
            </div>
            <p className="leading-relaxed">
              This key is maintained strictly in volatile JavaScript process memory for this active session.
              It is <strong>never written to localStorage, sessionStorage, cookies, or Git</strong>. Closing or refreshing the page clears it instantly.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            {currentKey ? (
              <button
                type="button"
                onClick={handleClear}
                className="inline-flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Forget Key</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                Authorize & Save
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
