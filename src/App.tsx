import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Key, 
  ExternalLink, 
  RefreshCw, 
  Lock, 
  AlertCircle, 
  ChevronRight,
  Download,
  Filter,
  Eye,
  EyeOff,
  Terminal,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface HumbleKey {
  machine_name: string;
  human_name: string;
  redeemed_key_val?: string;
  is_gift: boolean;
  is_unrevealed: boolean;
  discontinued: boolean;
  key_type: string;
}

interface HumbleOrder {
  gamekey: string;
  created: string;
  product: {
    human_name: string;
    machine_name: string;
  };
}

interface OrderDetail {
  tpkd_dict?: {
    all_tpks: HumbleKey[];
  };
}

export default function App() {
  const [cookie, setCookie] = useState<string>('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<HumbleOrder[]>([]);
  const [allKeys, setAllKeys] = useState<(HumbleKey & { orderName: string; orderDate: string })[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showOnlyUnrevealed, setShowOnlyUnrevealed] = useState(true);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/humble/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookie }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch orders. Check your session cookie.');
      }

      const data = await response.json();
      setOrders(data);
      setIsLoggedIn(true);
      
      // After getting orders, fetch details for each to get keys
      fetchAllKeys(data);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const fetchAllKeys = async (orderList: HumbleOrder[]) => {
    const keys: (HumbleKey & { orderName: string; orderDate: string })[] = [];
    setProgress({ current: 0, total: orderList.length });

    // We fetch in batches to avoid overwhelming the server/API
    const batchSize = 5;
    for (let i = 0; i < orderList.length; i += batchSize) {
      const batch = orderList.slice(i, i + batchSize);
      await Promise.all(batch.map(async (order) => {
        try {
          const res = await fetch('/api/humble/order-details', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cookie, gamekey: order.gamekey }),
          });
          
          if (res.ok) {
            const detail: OrderDetail = await res.json();
            const orderKeys = detail.tpkd_dict?.all_tpks || [];
            orderKeys.forEach(k => {
              keys.push({
                ...k,
                orderName: order.product.human_name,
                orderDate: new Date(order.created).toLocaleDateString()
              });
            });
          }
        } catch (e) {
          console.error(`Error fetching order ${order.gamekey}:`, e);
        }
      }));
      setProgress(prev => ({ ...prev, current: Math.min(i + batchSize, orderList.length) }));
    }

    setAllKeys(keys);
    setLoading(false);
  };

  const filteredKeys = useMemo(() => {
    return allKeys.filter(key => {
      const matchesSearch = key.human_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            key.orderName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = showOnlyUnrevealed ? !key.redeemed_key_val : true;
      return matchesSearch && matchesFilter;
    });
  }, [allKeys, searchQuery, showOnlyUnrevealed]);

  const handleLogout = () => {
    setIsLoggedIn(false);
    setOrders([]);
    setAllKeys([]);
    setCookie('');
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="scanline" />
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white border border-[#141414] p-8 shadow-[8px_8px_0px_0px_rgba(20,20,20,1)]"
        >
          <div className="flex items-center gap-3 mb-6">
            <Terminal className="w-6 h-6" />
            <h1 className="text-2xl font-bold uppercase tracking-tight">Humble Key Finder</h1>
          </div>

          <p className="text-sm mb-6 opacity-70 leading-relaxed">
            Retrieve your unrevealed game keys directly from Humble Bundle. 
            You need to provide your <code className="bg-black/5 px-1 rounded">_simpleauth_sess</code> cookie.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] uppercase font-bold mb-1 opacity-50">Session Cookie</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-40" />
                <input 
                  type="password"
                  value={cookie}
                  onChange={(e) => setCookie(e.target.value)}
                  placeholder="Paste _simpleauth_sess here..."
                  className="w-full bg-[#f5f5f5] border border-[#141414] py-3 pl-10 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-black"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 text-red-700 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <button 
              onClick={fetchOrders}
              disabled={loading || !cookie}
              className="w-full bg-[#141414] text-[#E4E3E0] py-3 font-bold uppercase tracking-wider hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Initialize Scan'}
            </button>
          </div>

          <div className="mt-8 pt-6 border-t border-[#141414]/10">
            <h2 className="text-[10px] font-bold uppercase mb-3 opacity-50 flex items-center gap-1">
              <Info className="w-3 h-3" /> How to get your cookie:
            </h2>
            <ol className="text-[11px] space-y-2 opacity-70 list-decimal pl-4">
              <li>Log in to <a href="https://humblebundle.com" target="_blank" rel="noreferrer" className="underline">humblebundle.com</a></li>
              <li>Open DevTools (F12) → Application → Cookies</li>
              <li>Find <code className="font-bold">_simpleauth_sess</code> and copy its value</li>
            </ol>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-6xl mx-auto">
      <div className="scanline" />
      
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8 border-b border-[#141414] pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Terminal className="w-5 h-5" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-50">System: Humble_Key_Finder_v1.0</span>
          </div>
          <h1 className="text-4xl font-bold uppercase tracking-tighter">Inventory Dashboard</h1>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={fetchOrders}
            disabled={loading}
            className="px-4 py-2 border border-[#141414] text-xs font-bold uppercase hover:bg-[#141414] hover:text-[#E4E3E0] transition-all flex items-center gap-2"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button 
            onClick={handleLogout}
            className="px-4 py-2 bg-[#141414] text-[#E4E3E0] text-xs font-bold uppercase hover:bg-black transition-all"
          >
            Disconnect
          </button>
        </div>
      </header>

      {/* Stats & Progress */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-[#141414] p-4 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
          <div className="text-[10px] font-bold uppercase opacity-50 mb-1">Total Orders</div>
          <div className="text-3xl font-mono">{orders.length}</div>
        </div>
        <div className="bg-white border border-[#141414] p-4 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
          <div className="text-[10px] font-bold uppercase opacity-50 mb-1">Total Keys Found</div>
          <div className="text-3xl font-mono">{allKeys.length}</div>
        </div>
        <div className="bg-white border border-[#141414] p-4 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
          <div className="text-[10px] font-bold uppercase opacity-50 mb-1">Unrevealed Keys</div>
          <div className="text-3xl font-mono text-emerald-600">{allKeys.filter(k => !k.redeemed_key_val).length}</div>
        </div>
      </div>

      {loading && progress.total > 0 && (
        <div className="mb-8">
          <div className="flex justify-between text-[10px] font-bold uppercase mb-2">
            <span>Scanning Library...</span>
            <span>{Math.round((progress.current / progress.total) * 100)}%</span>
          </div>
          <div className="h-1 bg-black/10 w-full">
            <motion.div 
              className="h-full bg-black"
              initial={{ width: 0 }}
              animate={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-40" />
          <input 
            type="text"
            placeholder="Search games or bundles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-[#141414] py-2 pl-10 pr-4 text-sm focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer group">
            <div 
              onClick={() => setShowOnlyUnrevealed(!showOnlyUnrevealed)}
              className={`w-10 h-5 border border-[#141414] relative transition-colors ${showOnlyUnrevealed ? 'bg-[#141414]' : 'bg-transparent'}`}
            >
              <div className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 transition-all ${showOnlyUnrevealed ? 'right-1 bg-[#E4E3E0]' : 'left-1 bg-[#141414]'}`} />
            </div>
            <span className="text-xs font-bold uppercase">Unrevealed Only</span>
          </label>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white border border-[#141414] overflow-hidden shadow-[8px_8px_0px_0px_rgba(20,20,20,1)]">
        <div className="grid grid-cols-[1fr_2fr_1fr_1fr] bg-[#f5f5f5]">
          <div className="col-header">Date</div>
          <div className="col-header">Game Title</div>
          <div className="col-header">Source Bundle</div>
          <div className="col-header">Status</div>
        </div>

        <div className="max-h-[600px] overflow-y-auto">
          <AnimatePresence mode="popLayout">
            {filteredKeys.length > 0 ? (
              filteredKeys.map((key, idx) => (
                <motion.div 
                  key={`${key.machine_name}-${idx}`}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="data-row group"
                >
                  <div className="data-value opacity-60">{key.orderDate}</div>
                  <div className="font-bold flex items-center gap-2">
                    {key.human_name}
                    {key.is_gift && <span className="text-[8px] px-1 border border-current uppercase">Gift</span>}
                  </div>
                  <div className="data-value truncate pr-4 opacity-80">{key.orderName}</div>
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-bold uppercase ${!key.redeemed_key_val ? 'text-emerald-600' : 'opacity-40'}`}>
                      {!key.redeemed_key_val ? 'Unrevealed' : 'Revealed'}
                    </span>
                    <a 
                      href={`https://www.humblebundle.com/downloads?key=${orders.find(o => o.product.human_name === key.orderName)?.gamekey}`}
                      target="_blank"
                      rel="noreferrer"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="p-12 text-center opacity-40 italic text-sm">
                {loading ? 'Scanning records...' : 'No matching keys found in database.'}
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <footer className="mt-12 pt-8 border-t border-[#141414]/10 flex justify-between items-center text-[10px] font-bold uppercase opacity-40">
        <div>Terminal Session: {new Date().toLocaleTimeString()}</div>
        <div className="flex gap-4">
          <span>Status: Online</span>
          <span>Enc: AES-256</span>
        </div>
      </footer>
    </div>
  );
}
