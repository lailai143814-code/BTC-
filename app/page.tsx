'use client';

import React, { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { TrendingUp, AlertTriangle, DollarSign, Activity } from 'lucide-react';

export default function Dashboard() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentBtcPrice, setCurrentBtcPrice] = useState(0);
  const [latestCape, setLatestCape] = useState(0);
  
  const [records, setRecords] = useState<any[]>([]);
  const [inputDate, setInputDate] = useState('');
  const [inputUsdt, setInputUsdt] = useState('');

  useEffect(() => {
    fetchData();
    const saved = localStorage.getItem('btc_dca_records');
    if (saved) setRecords(JSON.parse(saved));
  }, []);

  async function fetchData() {
    try {
      const res = await fetch('/api/market-data');
      const json = await res.json();
      if (json.history) {
        setData(json.history);
        setCurrentBtcPrice(json.currentPrice);
        setLatestCape(json.latestCape);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const handleAddRecord = () => {
    if (!inputDate || !inputUsdt) return;
    const targetDate = new Date(inputDate).getTime();
    let foundPrice = currentBtcPrice;
    
    if (data.length > 0) {
        const closest = data.reduce((prev, curr) => {
            const prevDiff = Math.abs(new Date(prev.date).getTime() - targetDate);
            const currDiff = Math.abs(new Date(curr.date).getTime() - targetDate);
            return currDiff < prevDiff ? curr : prev;
        });
        if (closest?.btc) foundPrice = closest.btc;
    }

    const amount = parseFloat(inputUsdt);
    const newRecord = {
      id: Date.now(),
      date: inputDate,
      usdtAmount: amount,
      btcPriceAtBuy: foundPrice,
      btcAmount: amount / foundPrice
    };

    const updated = [...records, newRecord];
    setRecords(updated);
    localStorage.setItem('btc_dca_records', JSON.stringify(updated));
    setInputDate(''); setInputUsdt('');
  };

  const handleDelete = (id: number) => {
    const updated = records.filter(r => r.id !== id);
    setRecords(updated);
    localStorage.setItem('btc_dca_records', JSON.stringify(updated));
  };

  const totalInvested = records.reduce((sum, r) => sum + r.usdtAmount, 0);
  const totalBtc = records.reduce((sum, r) => sum + r.btcAmount, 0);
  const currentVal = totalBtc * currentBtcPrice;
  const roi = totalInvested > 0 ? ((currentVal - totalInvested) / totalInvested) * 100 : 0;

  const getSignal = (cape: number) => {
    if (cape < 30) return { text: "BUY (抄底)", color: "text-green-500", border: "border-green-500" };
    if (cape > 40) return { text: "SELL (风险)", color: "text-red-500", border: "border-red-500" };
    return { text: "HOLD (观望)", color: "text-yellow-500", border: "border-yellow-500" };
  };

  const signal = getSignal(latestCape);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-black text-white">Loading Intelligence...</div>;

  return (
    <div className="min-h-screen bg-black text-gray-100 p-4 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex justify-between items-center border-b border-gray-800 pb-4">
          <h1 className="text-2xl font-bold text-blue-400">BTC AI-Valuation Model</h1>
          <div className={`px-4 py-2 border ${signal.border} rounded-lg ${signal.color} font-bold`}>
            {signal.text} (CAPE: {latestCape.toFixed(1)})
          </div>
        </div>

        <div className="bg-gray-900 p-4 rounded-xl border border-gray-800 h-[350px]">
          <ResponsiveContainer>
            <LineChart data={data}>
              <CartesianGrid stroke="#333" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="#666" fontSize={12} />
              <YAxis yAxisId="left" stroke="#F59E0B" fontSize={12} />
              <YAxis yAxisId="right" orientation="right" stroke="#10B981" domain={[20, 50]} fontSize={12} />
              <Tooltip contentStyle={{backgroundColor: '#111', borderColor: '#333'}} />
              <Line yAxisId="left" dataKey="btc" stroke="#F59E0B" name="BTC" dot={false} strokeWidth={2} />
              <Line yAxisId="left" dataKey="nvda" stroke="#8B5CF6" name="NVDA" dot={false} strokeWidth={2} />
              <Line yAxisId="right" type="stepAfter" dataKey="cape" stroke="#10B981" name="CAPE" dot={false} strokeWidth={2} />
              <ReferenceLine yAxisId="right" y={30} stroke="green" strokeDasharray="3 3" />
              <ReferenceLine yAxisId="right" y={40} stroke="red" strokeDasharray="3 3" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-gray-900 p-6 rounded-xl border border-gray-800">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><DollarSign size={18}/> Add Buy Record</h3>
            <div className="space-y-3">
              <input type="date" value={inputDate} onChange={e=>setInputDate(e.target.value)} className="w-full bg-gray-800 border border-gray-700 p-2 rounded text-white" />
              <input type="number" placeholder="USDT Amount" value={inputUsdt} onChange={e=>setInputUsdt(e.target.value)} className="w-full bg-gray-800 border border-gray-700 p-2 rounded text-white" />
              <button onClick={handleAddRecord} className="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded font-bold">Add</button>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-800 text-sm">
              <div className="flex justify-between"><span>Invested:</span> <span>${totalInvested}</span></div>
              <div className="flex justify-between font-bold mt-1"><span>ROI:</span> <span className={roi>=0?"text-green-400":"text-red-400"}>{roi.toFixed(2)}%</span></div>
            </div>
          </div>

          <div className="md:col-span-2 bg-gray-900 p-6 rounded-xl border border-gray-800 overflow-hidden flex flex-col h-[300px]">
             <h3 className="text-lg font-bold mb-4">History</h3>
             <div className="overflow-y-auto">
               <table className="w-full text-sm text-gray-400">
                 <thead><tr className="text-left text-gray-500"><th>Date</th><th>USDT</th><th>BTC Price</th><th>Amt</th><th></th></tr></thead>
                 <tbody>
                   {records.slice().reverse().map(r => (
                     <tr key={r.id} className="border-b border-gray-800"><td className="py-2">{r.date}</td><td>${r.usdtAmount}</td><td>${r.btcPriceAtBuy.toLocaleString()}</td><td>{r.btcAmount.toFixed(5)}</td><td><button onClick={()=>handleDelete(r.id)} className="text-red-500">x</button></td></tr>
                   ))}
                 </tbody>
               </table>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}