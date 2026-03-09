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
  Info,
  Trash2,
  FileJson,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import JSZip from 'jszip';

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
  product?: {
    human_name: string;
    machine_name: string;
  };
}

interface OrderDetail {
  product?: {
    human_name: string;
    machine_name: string;
  };
  created?: string;
  tpkd_dict?: {
    all_tpks: HumbleKey[];
  };
}

type StoredKey = HumbleKey & { 
  orderName: string; 
  orderDate: string; 
  orderGameKey: string;
  uid: string;
};

const STORAGE_KEYS = {
  ORDERS: 'humble_orders',
  KEYS: 'humble_keys',
  COOKIE: 'humble_cookie',
  LAST_SCAN: 'humble_last_scan'
};

const guessDateFromName = (name: string): string | null => {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  // Look for "Month YYYY" pattern (e.g., "October 2019")
  const monthRegex = new RegExp(`(${months.join('|')})\\s+(\\d{4})`, 'i');
  const match = name.match(monthRegex);
  
  if (match) {
    return `${match[1]} 1, ${match[2]}`; // Normalize to first of the month for Date parsing
  }
  
  // Look for just YYYY (e.g., "Humble Bundle 2020")
  const yearMatch = name.match(/\b(20\d{2})\b/);
  if (yearMatch) {
    return `January 1, ${yearMatch[1]}`;
  }
  
  return null;
};

export default function App() {
  const [cookie, setCookie] = useState<string>(() => localStorage.getItem(STORAGE_KEYS.COOKIE) || '');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<HumbleOrder[]>([]);
  const [allKeys, setAllKeys] = useState<StoredKey[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [keyFilter, setKeyFilter] = useState<'all' | 'unrevealed' | 'revealed'>('unrevealed');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [lastScanDate, setLastScanDate] = useState<string | null>(null);

  // Load from local storage on mount
  useEffect(() => {
    const storedOrders = localStorage.getItem(STORAGE_KEYS.ORDERS);
    const storedKeys = localStorage.getItem(STORAGE_KEYS.KEYS);
    const storedLastScan = localStorage.getItem(STORAGE_KEYS.LAST_SCAN);

    if (storedOrders && storedKeys) {
      try {
        setOrders(JSON.parse(storedOrders));
        const parsedKeys = JSON.parse(storedKeys);
        // Ensure all keys have a UID (for backward compatibility with existing cache)
        const keysWithUid = parsedKeys.map((k: any) => ({
          ...k,
          uid: k.uid || `${k.orderGameKey}-${k.machine_name}`
        }));
        setAllKeys(keysWithUid);
        setIsLoggedIn(true);
        if (storedLastScan) setLastScanDate(storedLastScan);
      } catch (e) {
        console.error("Failed to parse stored data", e);
      }
    }
  }, []);

  // Save to local storage when data changes
  useEffect(() => {
    if (orders.length > 0) localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));
    if (allKeys.length > 0) localStorage.setItem(STORAGE_KEYS.KEYS, JSON.stringify(allKeys));
  }, [orders, allKeys]);

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
      localStorage.setItem(STORAGE_KEYS.COOKIE, cookie);
      
      // After getting orders, fetch details for each to get keys
      fetchAllKeys(data);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const fetchAllKeys = async (orderList: any[]) => {
    const keys: StoredKey[] = [];
    setProgress({ current: 0, total: orderList.length });

    // We fetch in batches to avoid overwhelming the server/API
    const batchSize = 5;
    for (let i = 0; i < orderList.length; i += batchSize) {
      const batch = orderList.slice(i, i + batchSize);
      await Promise.all(batch.map(async (orderItem) => {
        const gamekey = typeof orderItem === 'string' ? orderItem : orderItem.gamekey;
        const fallbackDate = typeof orderItem === 'object' ? orderItem.created : null;
        if (!gamekey) return;

        try {
          const res = await fetch('/api/humble/order-details', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cookie, gamekey }),
          });
          
          if (res.ok) {
            const detail: OrderDetail = await res.json();
            const orderKeys = detail.tpkd_dict?.all_tpks || [];
            const bundleName = detail.product?.human_name || 'Unknown Bundle';
            let bundleDate = detail.created || fallbackDate || 'Unknown Date';

            // Try to guess date from name if API date is missing
            if (bundleDate === 'Unknown Date') {
              const guessed = guessDateFromName(bundleName);
              if (guessed) bundleDate = guessed;
            }

            orderKeys.forEach(k => {
              keys.push({
                ...k,
                orderName: bundleName,
                orderDate: bundleDate,
                orderGameKey: gamekey,
                uid: `${gamekey}-${k.machine_name}`
              });
            });
          }
        } catch (e) {
          console.error(`Error fetching order ${gamekey}:`, e);
        }
      }));
      setProgress(prev => ({ ...prev, current: Math.min(i + batchSize, orderList.length) }));
    }

    setAllKeys(keys);
    const now = new Date().toLocaleString();
    setLastScanDate(now);
    localStorage.setItem(STORAGE_KEYS.LAST_SCAN, now);
    setLoading(false);
  };

  const exportToZip = async () => {
    const zip = new JSZip();
    const keysToExport = filteredKeys;
    
    if (keysToExport.length === 0) {
      alert('No keys to export with current filters.');
      return;
    }

    // Create CSV content
    const csvHeader = 'Game Title,Order Name,Order Date,Is Gift,Key\n';
    const csvRows = keysToExport.map(k => {
      const humanName = (k.human_name || 'Unknown Game').replace(/"/g, '""');
      const orderName = (k.orderName || 'Unknown Order').replace(/"/g, '""');
      const keyValue = (k.redeemed_key_val || '').replace(/"/g, '""');
      
      let formattedDate = 'Unknown Date';
      if (k.orderDate && k.orderDate !== 'Unknown Date') {
        const d = new Date(k.orderDate);
        if (!isNaN(d.getTime())) {
          formattedDate = d.toLocaleDateString();
        }
      }
      
      return `"${humanName}","${orderName}","${formattedDate}","${k.is_gift}","${keyValue}"`;
    }).join('\n');
    
    zip.file('filtered_keys.csv', csvHeader + csvRows);
    
    // Create JSON content
    zip.file('filtered_keys.json', JSON.stringify(keysToExport, null, 2));
    
    // Create a simple text list of revealed keys in the selection
    const revealedInSelection = keysToExport.filter(k => k.redeemed_key_val);
    if (revealedInSelection.length > 0) {
      const textList = revealedInSelection.map(k => `${k.human_name} (${k.orderName}) - ${k.key_type}: ${k.redeemed_key_val}`).join('\n');
      zip.file('revealed_keys_list.txt', textList);
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const link = document.createElement('a');
    link.href = url;
    link.download = `humble_keys_${keyFilter}_${new Date().toISOString().split('T')[0]}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const clearCache = () => {
    if (window.confirm('Are you sure you want to clear all cached data and logout? This will require a full re-scan next time.')) {
      localStorage.removeItem(STORAGE_KEYS.ORDERS);
      localStorage.removeItem(STORAGE_KEYS.KEYS);
      localStorage.removeItem(STORAGE_KEYS.LAST_SCAN);
      localStorage.removeItem(STORAGE_KEYS.COOKIE);
      setOrders([]);
      setAllKeys([]);
      setLastScanDate(null);
      setCookie('');
      setIsLoggedIn(false);
    }
  };

  const filteredKeys = useMemo(() => {
    const filtered = allKeys.filter(key => {
      const humanName = key.human_name || '';
      const orderName = key.orderName || '';
      const query = searchQuery.toLowerCase();
      
      const matchesSearch = humanName.toLowerCase().includes(query) || 
                            orderName.toLowerCase().includes(query);
      
      let matchesFilter = true;
      if (keyFilter === 'unrevealed') {
        matchesFilter = !key.redeemed_key_val;
      } else if (keyFilter === 'revealed') {
        matchesFilter = !!key.redeemed_key_val;
      }

      return matchesSearch && matchesFilter;
    });

    return [...filtered].sort((a, b) => {
      const getTime = (dateStr: string) => {
        if (!dateStr || dateStr === 'Unknown Date') return 0;
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? 0 : d.getTime();
      };
      
      const timeA = getTime(a.orderDate);
      const timeB = getTime(b.orderDate);
      
      if (timeA === timeB) return 0;
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });
  }, [allKeys, searchQuery, keyFilter, sortOrder]);

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
          {lastScanDate && (
            <div className="text-[10px] font-bold uppercase opacity-40 mt-1">
              Last Scanned: {lastScanDate}
            </div>
          )}
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <button 
            onClick={exportToZip}
            disabled={allKeys.length === 0}
            className="px-4 py-2 border border-[#141414] text-xs font-bold uppercase hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all flex items-center gap-2"
          >
            <Download className="w-3 h-3" />
            Export ZIP
          </button>
          <button 
            onClick={fetchOrders}
            disabled={loading}
            className="px-4 py-2 border border-[#141414] text-xs font-bold uppercase hover:bg-[#141414] hover:text-[#E4E3E0] transition-all flex items-center gap-2"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Rescan
          </button>
          <button 
            onClick={clearCache}
            className="px-4 py-2 border border-red-600 text-red-600 text-xs font-bold uppercase hover:bg-red-600 hover:text-white transition-all flex items-center gap-2"
          >
            <Trash2 className="w-3 h-3" />
            Reset & Logout
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
          <div className="flex items-center bg-[#f5f5f5] border border-[#141414] p-1">
            {(['all', 'unrevealed', 'revealed'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setKeyFilter(f)}
                className={`px-4 py-1.5 text-[10px] font-bold uppercase transition-all ${
                  keyFilter === f 
                    ? 'bg-[#141414] text-[#E4E3E0]' 
                    : 'text-[#141414] hover:bg-black/5'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

      {/* Data Table */}
      <div className="bg-white border border-[#141414] overflow-hidden shadow-[8px_8px_0px_0px_rgba(20,20,20,1)]">
        <div className="grid grid-cols-[1fr_2fr_1fr_1.5fr] bg-[#f5f5f5] px-4 border-b border-[#141414] scrollbar-gutter-stable">
          <button 
            onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
            className="col-header hover:bg-black/5 flex items-center gap-1 transition-colors text-left"
          >
            Date {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
          <div className="col-header">Game Title</div>
          <div className="col-header">Source Bundle</div>
          <div className="col-header">Key / Status</div>
        </div>

        <div className="max-h-[600px] overflow-y-auto scrollbar-gutter-stable">
          <AnimatePresence mode="popLayout">
            {filteredKeys.length > 0 ? (
              filteredKeys.map((item, idx) => {
                return (
                  <motion.div 
                    key={`${item.uid}-${idx}`}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="data-row grid-cols-[1fr_2fr_1fr_1.5fr] group"
                  >
                    <div className="data-value opacity-60">
                      {(() => {
                        if (!item.orderDate || item.orderDate === 'Unknown Date') return 'Unknown Date';
                        const d = new Date(item.orderDate);
                        return isNaN(d.getTime()) ? 'Unknown Date' : d.toLocaleDateString();
                      })()}
                    </div>
                    <div className="font-bold flex items-center gap-2">
                      {item.human_name}
                      {item.is_gift && <span className="text-[8px] px-1 border border-current uppercase">Gift</span>}
                    </div>
                    <div className="data-value truncate pr-4 opacity-80">{item.orderName}</div>
                    <div className="flex items-center justify-between gap-2">
                    {item.redeemed_key_val ? (
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span className="data-value text-emerald-600 truncate select-all bg-emerald-50 px-1 rounded">
                          {item.redeemed_key_val}
                        </span>
                      </div>
                    ) : (
                      <a 
                        href={`https://www.humblebundle.com/downloads?key=${item.orderGameKey}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] font-bold uppercase text-emerald-600 hover:underline flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Go to Bundle
                      </a>
                    )}
                    <a 
                      href={`https://www.humblebundle.com/downloads?key=${item.orderGameKey}`}
                      target="_blank"
                      rel="noreferrer"
                      className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </motion.div>
              );
            })
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
