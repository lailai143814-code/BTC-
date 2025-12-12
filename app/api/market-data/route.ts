// src/app/api/market-data/route.ts
import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

// 强制不缓存，确保每次都是最新数据
export const dynamic = 'force-dynamic';

// 1. 获取 CAPE (爬虫)
async function fetchCape() {
  try {
    const res = await fetch('https://www.multpl.com/shiller-pe/table/by-month', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const html = await res.text();
    const $ = cheerio.load(html);
    const data: any[] = [];
    $('table#datatable tr').each((i, el) => {
      if (i === 0) return;
      const tds = $(el).find('td');
      const date = new Date($(tds[0]).text().trim());
      const val = parseFloat($(tds[1]).text().trim());
      if (!isNaN(date.getTime()) && !isNaN(val)) {
        data.push({ date: date.toISOString().split('T')[0], value: val });
      }
    });
    return data.reverse();
  } catch (e) {
    console.error("CAPE Error", e);
    // 如果爬虫失败，返回一个保底的历史值，不影响主图显示
    return [{ date: '2024-01-01', value: 32 }];
  }
}

// 2. 获取 BTC (直接连币安 Binance API，最稳的真实数据)
async function fetchBtc() {
  try {
    // 币安接口：周线，最近500周
    const res = await fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1w&limit=500');
    const raw = await res.json();
    
    // 币安返回格式: [时间戳, 开盘, 高, 低, 收盘, ...]
    // 我们只需要 时间戳(0) 和 收盘价(4)
    return raw.map((item: any[]) => ({
      date: new Date(item[0]).toISOString().split('T')[0], // 转换时间格式
      close: parseFloat(item[4]),
      timestamp: item[0]
    }));
  } catch (e) {
    console.error("Binance Error", e);
    return [];
  }
}

// 3. 获取 NVDA (伪装成浏览器直接请求雅虎源接口)
async function fetchNvda() {
  try {
    const res = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/NVDA?interval=1wk&range=5y', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const json = await res.json();
    const result = json.chart.result[0];
    const timestamps = result.timestamp;
    const closes = result.indicators.quote[0].close;

    const data = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i]) {
        data.push({
          date: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
          close: closes[i],
          timestamp: timestamps[i] * 1000
        });
      }
    }
    return data;
  } catch (e) {
    console.error("NVDA Yahoo Error", e);
    return [];
  }
}

export async function GET() {
  try {
    // 并行获取三大真实数据源
    const [btcData, nvdaData, capeData] = await Promise.all([
      fetchBtc(),
      fetchNvda(),
      fetchCape()
    ]);

    // 如果币安都连不上，那说明网络彻底断了，抛出错误
    if (btcData.length === 0) throw new Error("No Market Data Available");

    // 数据合并逻辑：以 BTC 的时间轴为基准
    const merged = btcData.map((btcItem: any) => {
      // 找同期的 NVDA
      const nvdaItem = nvdaData.find((n: any) => 
        Math.abs(n.timestamp - btcItem.timestamp) < 604800000 // 7天误差内
      );

      // 找最近的 CAPE
      let capeVal = 0;
      for (const c of capeData) {
        if (new Date(c.date).getTime() <= btcItem.timestamp) capeVal = c.value;
      }
      // 补全最新的 CAPE
      if (capeVal === 0 && capeData.length > 0) capeVal = capeData[capeData.length - 1].value;

      return {
        date: btcItem.date,
        btc: btcItem.close,
        nvda: nvdaItem ? nvdaItem.close : null,
        cape: capeVal
      };
    });

    // 获取最新实时价格（取数组最后一个）
    const currentBtcPrice = btcData[btcData.length - 1]?.close || 0;
    const latestCapeVal = capeData[capeData.length - 1]?.value || 0;

    return NextResponse.json({
      history: merged,
      currentPrice: currentBtcPrice,
      latestCape: latestCapeVal
    });

  } catch (error) {
    return NextResponse.json({ error: 'Data Fetch Failed' }, { status: 500 });
  }
}