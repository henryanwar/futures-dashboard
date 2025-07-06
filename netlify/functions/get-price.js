const fetch = require('node-fetch');

exports.handler = async function (event, context) {
  const FINNHUB_INDEX_SYMBOL = 'IWM';
  const FINNHUB_API_KEY = 'd1l5q9pr01qt8foressgd1l5q9pr01qt8forest0'; // <-- PASTE YOUR KEY HERE

  const url = `https://finnhub.io/api/v1/quote?symbol=${FINNHUB_INDEX_SYMBOL}&token=${FINNHUB_API_KEY}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    // If the API key is invalid, Finnhub sends an error message in the JSON response
    if (data.error) {
      throw new Error(`Finnhub API Error: ${data.error}`);
    }

    if (!response.ok || data.c === 0) {
      throw new Error(`Finnhub could not find data. Raw response: ${JSON.stringify(data)}`);
    }
    
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
