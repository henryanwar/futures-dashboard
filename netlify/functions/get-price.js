const fetch = require('node-fetch');

exports.handler = async function (event, context) {
  const { symbol } = event.queryStringParameters;
  const FINNHUB_API_KEY = 'd1l5q9pr01qt8foressgd1l5q9pr01qt8forest0'; // <-- PASTE YOUR KEY HERE

  if (!symbol) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Symbol parameter is required.' }),
    };
  }

  // Finnhub expects a different format for futures symbols (e.g., RTYU5 -> RTYU25)
  // This is a basic conversion that might need adjustment for other contracts.
  const convertedSymbol = symbol.replace(/([A-Z])(\d)$/, '$1$2' + (new Date().getFullYear() + 1).toString().slice(-1));
  const url = `https://finnhub.io/api/v1/quote?symbol=${convertedSymbol}&token=${FINNHUB_API_KEY}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || data.c === 0) {
      throw new Error(`Finnhub could not find data for symbol: ${convertedSymbol}`);
    }
    
    // 'pc' in Finnhub's response is the previous close price
    const closePrice = data.pc;

    return {
      statusCode: 200,
      body: JSON.stringify({ close: closePrice }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
