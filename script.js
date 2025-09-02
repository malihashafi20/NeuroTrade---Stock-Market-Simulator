const API_KEY = 'Your_key_here';  

// DOM Elements
const elements = {
    tickerContent: document.getElementById('tickerContent'),
    searchInput: document.getElementById('searchInput'),
    searchBtn: document.getElementById('searchBtn'),
    stockSymbol: document.getElementById('stockSymbol'),
    currentPrice: document.getElementById('currentPrice'),
    priceChange: document.getElementById('priceChange'),
    portfolioValue: document.getElementById('portfolioValue'),
    portfolioChange: document.getElementById('portfolioChange'),
    sharesInput: document.getElementById('sharesInput'),
    buyBtn: document.getElementById('buyBtn'),
    sellBtn: document.getElementById('sellBtn'),
    holdingsList: document.getElementById('holdingsList'),
    newsContainer: document.getElementById('newsContainer'),
    timeButtons: document.querySelectorAll('.time-btn'),
    chartSection: document.querySelector('.chart-container')
};

// State management
let currentState = {
    selectedStock: 'MSFT',
    currentStockData: null,
    portfolio: {
        cash: 10000,
        holdings: {},
        initialValue: 10000
    },
    chart: null,
};

// --- Core Functions ---

/**
 * Initializes the application by setting up event listeners and fetching initial data.
 */
function init() {
    setupEventListeners();
    loadPortfolioState();
    fetchAndDisplayStock(currentState.selectedStock, '1d'); // Default to 1-day timeframe
    fetchAndDisplayTicker();
    fetchAndDisplayNews(currentState.selectedStock);
    updatePortfolioDisplay(); // Initial portfolio display
}

/**
 * Sets up all the event listeners for user interactions.
 */
function setupEventListeners() {
    elements.searchBtn.addEventListener('click', () => handleSearch());
    elements.searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });

    elements.buyBtn.addEventListener('click', () => handleTransaction('buy'));
    elements.sellBtn.addEventListener('click', () => handleTransaction('sell'));

    elements.timeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.timeButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            fetchAndDisplayStock(currentState.selectedStock, btn.dataset.timeframe);
        });
    });
}

/**
 * Handles the stock search action.
 */
function handleSearch() {
    const symbol = elements.searchInput.value.toUpperCase().trim();
    if (symbol) {
        fetchAndDisplayStock(symbol, document.querySelector('.time-btn.active').dataset.timeframe);
        fetchAndDisplayNews(symbol);
    }
}

/**
 * Handles buy or sell transactions.
 * @param {string} type 'buy' or 'sell'
 */
function handleTransaction(type) {
    const sharesToTrade = parseInt(elements.sharesInput.value);
    const currentStockPrice = currentState.currentStockData ? currentState.currentStockData.price : null;

    if (!sharesToTrade || sharesToTrade <= 0) {
        alert('Please enter a valid number of shares.');
        return;
    }

    if (!currentStockPrice) {
        alert('Stock price data is not available.');
        return;
    }

    const symbol = currentState.selectedStock;
    const cost = sharesToTrade * currentStockPrice;
    const holdings = currentState.portfolio.holdings[symbol] || { shares: 0, averageCost: 0 };
    let success = false;

    if (type === 'buy') {
        if (currentState.portfolio.cash >= cost) {
            currentState.portfolio.cash -= cost;
            const totalShares = holdings.shares + sharesToTrade;
            const newTotalCost = (holdings.shares * holdings.averageCost) + cost;
            holdings.shares = totalShares;
            holdings.averageCost = newTotalCost / totalShares;
            currentState.portfolio.holdings[symbol] = holdings;
            success = true;
        } else {
            alert('Insufficient funds.');
        }
    } else if (type === 'sell') {
        if (holdings.shares >= sharesToTrade) {
            currentState.portfolio.cash += cost;
            holdings.shares -= sharesToTrade;
            if (holdings.shares === 0) {
                delete currentState.portfolio.holdings[symbol];
            } else {
                currentState.portfolio.holdings[symbol] = holdings;
            }
            success = true;
        } else {
            alert('You do not have enough shares to sell.');
        }
    }

    if (success) {
        savePortfolioState();
        updatePortfolioDisplay();
        elements.sharesInput.value = '';
    }
}

// --- Data Fetching and Display ---

/**
 * Reusable function to fetch data from Alpha Vantage API.
 * @param {string} url The API endpoint URL.
 * @returns {Promise<object|null>} The fetched data or null on error.
 */
async function fetchData(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (data['Error Message'] || data['Note']) {
            throw new Error(data['Error Message'] || data['Note']);
        }
        return data;
    } catch (error) {
        console.error('Error fetching data:', error);
        displayErrorMessage(`Error fetching data: ${error.message}`);
        return null;
    }
}

/**
 * Fetches and displays the main stock data and chart.
 * @param {string} symbol The stock symbol to fetch.
 * @param {string} timeframe The chart timeframe (e.g., '1d', '1m').
 */
async function fetchAndDisplayStock(symbol, timeframe) {
    displayLoadingState(elements.chartSection);
    
    // Fetch real-time price
    const quoteUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${API_KEY}`;
    const quoteData = await fetchData(quoteUrl);
    
    if (quoteData && quoteData['Global Quote'] && Object.keys(quoteData['Global Quote']).length > 0) {
        const quote = quoteData['Global Quote'];
        const currentPrice = parseFloat(quote['05. price']);
        const change = parseFloat(quote['09. change']);
        const changePercent = parseFloat(quote['10. change percent'].replace('%', ''));

        currentState.selectedStock = symbol;
        currentState.currentStockData = { price: currentPrice, change, changePercent };

        elements.stockSymbol.textContent = symbol;
        elements.currentPrice.textContent = `$${currentPrice.toFixed(2)}`;
        elements.priceChange.textContent = `${change > 0 ? '+' : ''}${change.toFixed(2)} (${changePercent.toFixed(2)}%)`;
        
        elements.priceChange.className = `price-change ${change > 0 ? 'positive' : 'negative'}`;
        
        // Fetch historical data for the chart
        let historyFunction;
        switch (timeframe) {
            case '1d':
                historyFunction = 'TIME_SERIES_INTRADAY';
                break;
            case '1w':
            case '1m':
                historyFunction = 'TIME_SERIES_DAILY';
                break;
            case '3m':
            case '1y':
                historyFunction = 'TIME_SERIES_WEEKLY';
                break;
            default:
                historyFunction = 'TIME_SERIES_DAILY';
        }

        const historyUrl = `https://www.alphavantage.co/query?function=${historyFunction}&symbol=${symbol}&outputsize=compact&apikey=${API_KEY}`;
        const historyData = await fetchData(historyUrl);

        if (historyData) {
            const timeSeriesKey = Object.keys(historyData).find(key => key.includes('Time Series'));
            if (timeSeriesKey) {
                const dataPoints = historyData[timeSeriesKey];
                const labels = Object.keys(dataPoints).reverse();
                const prices = labels.map(date => parseFloat(dataPoints[date]['4. close']));
                renderChart(labels, prices, symbol);
            } else {
                displayErrorMessage('No historical data available for this timeframe.');
                renderEmptyChart();
            }
        }
    } else {
        displayErrorMessage('Stock not found or invalid symbol. Please try again.');
        renderEmptyChart();
    }
    updatePortfolioDisplay();
}

/**
 * Fetches and displays a real-time stock ticker.
 */
async function fetchAndDisplayTicker() {
    const symbols = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'META', 'NVDA', 'NFLX'];
    elements.tickerContent.innerHTML = '';
    
    for (const symbol of symbols) {
        const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${API_KEY}`;
        const data = await fetchData(url);
        
        if (data && data['Global Quote'] && Object.keys(data['Global Quote']).length > 0) {
            const quote = data['Global Quote'];
            const price = parseFloat(quote['05. price']).toFixed(2);
            const change = parseFloat(quote['10. change percent'].replace('%', '')).toFixed(2);
            
            const tickerItem = document.createElement('div');
            tickerItem.className = 'ticker-item';
            const changeClass = change >= 0 ? 'positive' : 'negative';

            tickerItem.innerHTML = `
                <span class="ticker-symbol">${symbol}</span>
                <span class="ticker-price">$${price}</span>
                <span class="ticker-change ${changeClass}">${change}%</span>
            `;
            elements.tickerContent.appendChild(tickerItem);
        }
    }
}

/**
 * Fetches and displays real-time news and sentiment analysis.
 * @param {string} symbol The stock symbol to fetch news for.
 */
async function fetchAndDisplayNews(symbol) {
    elements.newsContainer.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    // Ensure you're using the proxy URL if you set one up
    // const url = `http://localhost:3000/news-sentiment?tickers=${symbol}`; // Example proxy URL
    const url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${symbol}&apikey=${API_KEY}`; // Direct API call if no proxy

    const data = await fetchData(url);
    
    elements.newsContainer.innerHTML = ''; // Clear loading spinner

    if (data && data.feed && data.feed.length > 0) {
        data.feed.slice(0, 10).forEach(item => { // Display top 10 articles
            const sentiment = item.overall_sentiment_score;
            let sentimentClass = 'sentiment-neutral';
            if (sentiment > 0.35) {
                sentimentClass = 'sentiment-positive';
            } else if (sentiment < -0.35) {
                sentimentClass = 'sentiment-negative';
            }

            // --- MODIFIED CODE STARTS HERE ---
            const publishedTime = item.time_published;
            let formattedTime = '';

            if (publishedTime) {
                const date = new Date(publishedTime);
                if (!isNaN(date.getTime())) { // Check if the date is valid
                    formattedTime = date.toLocaleString();
                } else {
                    // Fallback if date is invalid but exists, e.g., show raw string or a default
                    // console.warn(`Invalid date format for: ${publishedTime}`);
                    // formattedTime = `Published: ${publishedTime}`; // Optional: show raw string
                    formattedTime = ''; // Or simply leave it empty if you prefer
                }
            } else {
                formattedTime = ''; // If time_published is missing
            }
            // --- MODIFIED CODE ENDS HERE ---

            const newsItem = document.createElement('div');
            newsItem.className = 'news-item';
            newsItem.innerHTML = `
                <a href="${item.url}" target="_blank" style="text-decoration: none; color: inherit;">
                    <div class="news-title">
                        <span class="sentiment-indicator ${sentimentClass}"></span>
                        ${item.title}
                    </div>
                    <div class="news-content">${item.summary}</div>
                    <div class="news-time">${formattedTime}</div> </a>
            `;
            elements.newsContainer.appendChild(newsItem);
        });
    } else {
        displayErrorMessage('No recent news found for this stock.');
    }
}

/**
 * Renders the stock chart.
 * @param {string[]} labels The date labels.
 * @param {number[]} data The stock prices.
 */
function renderChart(labels, data, symbol) {
    if (currentState.chart) {
        currentState.chart.destroy();
    }

    const ctx = document.getElementById('stockChart').getContext('2d');
    
    // Create a linear gradient for the chart background
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(0, 245, 255, 0.4)');
    gradient.addColorStop(1, 'rgba(0, 245, 255, 0)');

    currentState.chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: `${symbol} Price`,
                data: data,
                borderColor: '#00f5ff',
                backgroundColor: gradient,
                borderWidth: 2,
                pointRadius: 0,
                fill: true,
                tension: 0.2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    display: false,
                    grid: {
                        color: 'rgba(42, 42, 90, 0.5)'
                    },
                    ticks: {
                        color: '#a0a0c0'
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(42, 42, 90, 0.5)'
                    },
                    ticks: {
                        color: '#a0a0c0',
                        callback: function(value) {
                            return `$${value.toFixed(2)}`;
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        title: function(context) {
                            return `Date: ${context[0].label}`;
                        },
                        label: function(context) {
                            const value = context.parsed.y;
                            return `Price: $${value.toFixed(2)}`;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Renders an empty chart with a message.
 */
function renderEmptyChart() {
    if (currentState.chart) {
        currentState.chart.destroy();
    }
    elements.chartSection.innerHTML = '<div class="loading"><div class="error-message">Chart data unavailable.</div></div>';
}

/**
 * Updates the portfolio display with current values.
 */
async function updatePortfolioDisplay() {
    let totalPortfolioValue = currentState.portfolio.cash;
    const holdingSymbols = Object.keys(currentState.portfolio.holdings);
    
    // Fetch live prices for all holdings
    for (const symbol of holdingSymbols) {
        const holdings = currentState.portfolio.holdings[symbol];
        if (holdings.shares > 0) {
            const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${API_KEY}`;
            const data = await fetchData(url);
            if (data && data['Global Quote'] && Object.keys(data['Global Quote']).length > 0) {
                const currentPrice = parseFloat(data['Global Quote']['05. price']);
                totalPortfolioValue += currentPrice * holdings.shares;
            }
        }
    }

    const profitLoss = totalPortfolioValue - currentState.portfolio.initialValue;
    const profitLossPercent = (profitLoss / currentState.portfolio.initialValue) * 100;

    elements.portfolioValue.textContent = `$${totalPortfolioValue.toFixed(2)}`;
    elements.portfolioChange.textContent = `${profitLoss > 0 ? '+' : ''}$${profitLoss.toFixed(2)} (${profitLossPercent.toFixed(2)}%)`;
    elements.portfolioChange.className = `portfolio-change ${profitLoss > 0 ? 'positive' : 'negative'}`;

    // Render holdings list
    elements.holdingsList.innerHTML = '';
    if (holdingSymbols.length === 0) {
        elements.holdingsList.innerHTML = '<p style="text-align:center; color:#8080a0;">No holdings yet.</p>';
    } else {
        for (const symbol of holdingSymbols) {
            const holdings = currentState.portfolio.holdings[symbol];
            if (holdings.shares > 0) {
                const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${API_KEY}`;
                const data = await fetchData(url);
                let currentValue = 0;
                if (data && data['Global Quote'] && Object.keys(data['Global Quote']).length > 0) {
                    const currentPrice = parseFloat(data['Global Quote']['05. price']);
                    currentValue = currentPrice * holdings.shares;
                }
                
                const holdingItem = document.createElement('div');
                holdingItem.className = 'holding-item';
                holdingItem.innerHTML = `
                    <div class="holding-info">
                        <div class="holding-symbol">${symbol}</div>
                        <div class="holding-details">${holdings.shares} shares @ $${holdings.averageCost.toFixed(2)}</div>
                    </div>
                    <div class="holding-value">$${currentValue.toFixed(2)}</div>
                `;
                elements.holdingsList.appendChild(holdingItem);
            }
        }
    }
}

/**
 * Saves the portfolio state to local storage.
 */
function savePortfolioState() {
    localStorage.setItem('neurotradePortfolio', JSON.stringify(currentState.portfolio));
}

/**
 * Loads the portfolio state from local storage.
 */
function loadPortfolioState() {
    const savedState = localStorage.getItem('neurotradePortfolio');
    if (savedState) {
        currentState.portfolio = JSON.parse(savedState);
    }
}

/**
 * Displays a loading state with a spinner.
 * @param {HTMLElement} element The parent element to display the spinner in.
 */
function displayLoadingState(element) {
    element.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
}

/**
 * Displays an error message.
 * @param {string} message The error message to display.
 */
function displayErrorMessage(message) {
    elements.stockSymbol.textContent = 'ERROR';
    elements.currentPrice.textContent = 'N/A';
    elements.priceChange.textContent = '';
    elements.chartSection.innerHTML = `<div class="error-message">${message}</div>`;
}

// Initialize the simulator on page load

init();
