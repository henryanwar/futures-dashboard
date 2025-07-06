const fetch = require('node-fetch');

exports.handler = async function (event, context) {
  const PROXY_SYMBOL = 'IWM'; // Using IWM ETF as a stable proxy
  const ALPHA_VANTAGE_API_KEY = 'YOUR_ALPHA_VANTAGE_API_KEY'; // <-- PASTE YOUR KEY HERE

  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${PROXY_SYMBOL}&apikey=${ALPHA_VANTAGE_API_KEY}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    // Check for a valid response from Alpha Vantage
    const quote = data['Global Quote'];
    if (!quote || Object.keys(quote).length === 0) {
      throw new Error(`Alpha Vantage did not return data. The API limit may be reached.`);
    }
    
    // In Alpha Vantage's response, the key is "08. previous close"
    const closePrice = parseFloat(quote['08. previous close']);

    if (!closePrice) {
        throw new Error('Could not parse closing price from Alpha Vantage response.');
    }

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
