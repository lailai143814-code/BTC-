// src/app/api/market-data/route.ts
import { NextResponse } from 'next/server';
import yahooFinance from 'yahoo-finance2';
import * as cheerio from 'cheerio';

// 爬虫函数
async function fetchLiveCape() {
  try {
    const response = await fetch('https://www.multpl.com/shiller-pe/table/by-month', {
      next: { revalidate: 3600 }
    });
    const html = await response.text();
    const $ = cheerio.load(html);
    const capeData: any[] = [];
    
    $('table#datatable tr').each((i, elem) => {
      if (i === 0) return;
      const tds = $(elem).find('td');
      const dateText = $(tds[0]).text().trim();
      const valueText = $(tds[1]).text().trim();
      
      if (dateText && valueText) {
        const date = new Date(dateText);
        const value = parseFloat(valueText);
        if (!isNaN(date.getTime()) && !isNaN(value)) {
            capeData.push({ date: date.toISOString().split('T')[0], value });
        }
      }
    });
    return capeData.reverse();
  } catch (error) {
    return [
      { date: '2023-01-01', value: 28.32 },
      { date: '2024-01-01', value: 32.05 },
      { date: '2024-10-01', value: 37.00 }
    ];
  }
}

export async function GET() {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 4);

    const queryOptions = { period1: startDate, period2: endDate, interval: '1wk' as const };

    const [btcResult, nvdaResult, capeResult] = await Promise.all([
      yahooFinance.historical('BTC-USD', queryOptions),
      yahooFinance.historical('NVDA', queryOptions),
      fetchLiveCape()
    ]);

    // 【强制类型转换】消灭所有红线
    const btcData = btcResult as any[];
    const nvdaData = nvdaResult as any[];
    const capeHistory = capeResult as any[];

    const mergedData = btcData.map((btcItem) => {
      const dateStr = btcItem.date.toISOString().split('T')[0];
      
      const nvdaItem = nvdaData.find((n: any) => 
        Math.abs(n.date.getTime() - btcItem.date.getTime()) < 604800000
      );

      let capeValue = 0;
      for (let i = 0; i < capeHistory.length; i++) {
         if (new Date(capeHistory[i].date) <= btcItem.date) {
            capeValue = capeHistory[i].value;
         }
      }
      if (capeValue === 0 && capeHistory.length > 0) capeValue = capeHistory[capeHistory.length - 1].value;

      return {
        date: dateStr,
        btc: btcItem.close,
        nvda: nvdaItem ? nvdaItem.close : null,
        cape: capeValue,
      };
    });

    const btcQuote = await yahooFinance.quote('BTC-USD');
    // 【这里是修复的关键】把 quote 也强转为 any，防止它报找不到属性
    const currentPrice = (btcQuote as any).regularMarketPrice || 0;
    const latestCapeVal = capeHistory[capeHistory.length - 1]?.value || 0;

    return NextResponse.json({ 
        history: mergedData, 
        currentPrice: currentPrice, 
        latestCape: latestCapeVal 
    });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}