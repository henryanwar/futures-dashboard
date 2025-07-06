const fetch = require('node-fetch');

exports.handler = async function (event, context) {
  // Using the correct symbol for the Russell 2000 Index as a stable proxy.
  const FINNHUB_INDEX_SYMBOL = '^RUT'; 
  const FINNHUB_API_KEY = 'YOUR_FINNHUB_API_KEY'; // Make sure your key is pasted here.

  const url = `https://finnhub.io/api/v1/quote?symbol=${FINNHUB_INDEX_SYMBOL}&token=${FINNHUB_API_KEY}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    // Check for a valid response from Finnhub
    if (!response.ok || data.c === 0) {
      throw new Error(`Finnhub could not find data for proxy symbol: ${FINNHUB_INDEX_SYMBOL}`);
    }
    
    // 'pc' in Finnhub's response is the previous day's close price
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
