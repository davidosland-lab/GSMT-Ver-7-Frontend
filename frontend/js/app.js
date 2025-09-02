/**
 * GSMT Ver 7.0 - Clean Architecture Frontend
 * Optimized for Netlify deployment with Railway backend integration
 */

class GSMTApp {
    constructor() {
        // Application state
        this.state = {
            apiBaseUrl: this.detectApiUrl(),
            selectedSymbols: new Set(),
            symbolsDatabase: new Map(),
            chartData: new Map(),
            chartInstance: null,
            settings: this.loadSettings(),
            isLoading: false,
            refreshTimer: null
        };
        
        // Initialize application
        this.init();
    }
    
    /**
     * Initialize the application
     */
    async init() {
        try {
            console.log('🚀 Initializing GSMT Ver 7.0');
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Initialize chart
            this.initializeChart();
            
            // Check API connection
            await this.checkApiConnection();
            
            // Load symbols database
            await this.loadSymbolsDatabase();
            
            // Apply settings
            this.applySettings();
            
            console.log('✅ GSMT Ver 7.0 ready');
            this.showToast('GSMT Ver 7.0 initialized successfully', 'success');
            
        } catch (error) {
            console.error('❌ Initialization failed:', error);
            this.updateApiStatus('error', 'Initialization failed');
            this.showToast('Failed to initialize. Using demo mode.', 'warning');
        }
    }
    
    /**
     * Detect API URL based on environment
     */
    detectApiUrl() {
        // Check if custom API URL is stored
        const saved = localStorage.getItem('gsmt-api-url');
        if (saved) return saved;
        
        // Development environment detection
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return 'http://localhost:8000';
        }
        
        // Production - try to use Railway URL pattern or fallback to demo
        const hostname = window.location.hostname;
        if (hostname.includes('netlify')) {
            // This will be configured via settings modal
            return null; // Will trigger demo mode until configured
        }
        
        return window.location.origin;
    }
    
    /**
     * Setup all event listeners
     */
    setupEventListeners() {
        // Symbol search
        const symbolSearch = document.getElementById('symbol-search');
        symbolSearch.addEventListener('input', this.debounce(this.handleSymbolSearch.bind(this), 300));
        symbolSearch.addEventListener('keydown', this.handleSymbolKeydown.bind(this));
        
        // Control buttons
        document.getElementById('analyze-btn').addEventListener('click', this.handleAnalyze.bind(this));
        document.getElementById('clear-btn').addEventListener('click', this.handleClear.bind(this));
        
        // Settings
        document.getElementById('settings-btn').addEventListener('click', this.showSettings.bind(this));
        document.getElementById('close-settings').addEventListener('click', this.hideSettings.bind(this));
        document.getElementById('save-settings').addEventListener('click', this.saveSettings.bind(this));
        document.getElementById('cancel-settings').addEventListener('click', this.hideSettings.bind(this));
        
        // Chart controls
        document.getElementById('chart-type').addEventListener('change', this.handleChartTypeChange.bind(this));
        document.getElementById('fullscreen-btn').addEventListener('click', this.toggleFullscreen.bind(this));
        
        // Global events
        document.addEventListener('click', this.handleDocumentClick.bind(this));
        window.addEventListener('resize', this.debounce(this.handleResize.bind(this), 250));
    }
    
    /**
     * Initialize the main chart
     */
    initializeChart() {
        const chartContainer = document.getElementById('main-chart');
        this.state.chartInstance = echarts.init(chartContainer, 'light', {
            renderer: 'canvas',
            useDirtyRect: true
        });
        
        // Set initial empty state
        this.updateChart();
    }
    
    /**
     * Check API connection
     */
    async checkApiConnection() {
        if (!this.state.apiBaseUrl) {
            this.updateApiStatus('disconnected', 'API URL not configured');
            return false;
        }
        
        try {
            const response = await fetch(`${this.state.apiBaseUrl}/health`, {
                method: 'GET',
                timeout: 5000
            });
            
            if (response.ok) {
                const data = await response.json();
                this.updateApiStatus('connected', `v${data.version}`);
                return true;
            } else {
                throw new Error(`API returned ${response.status}`);
            }
        } catch (error) {
            console.warn('API connection failed:', error);
            this.updateApiStatus('error', 'Connection failed');
            return false;
        }
    }
    
    /**
     * Load symbols database from API
     */
    async loadSymbolsDatabase() {
        if (!this.state.apiBaseUrl) {
            this.loadFallbackSymbols();
            return;
        }
        
        try {
            const response = await fetch(`${this.state.apiBaseUrl}/symbols`);
            if (response.ok) {
                const data = await response.json();
                
                // Process symbols by category
                for (const [category, symbols] of Object.entries(data.categories)) {
                    symbols.forEach(symbol => {
                        this.state.symbolsDatabase.set(symbol.symbol, {
                            ...symbol,
                            category: category
                        });
                    });
                }
                
                console.log(`📊 Loaded ${this.state.symbolsDatabase.size} symbols`);
            } else {
                throw new Error('Failed to load symbols');
            }
        } catch (error) {
            console.warn('Failed to load symbols from API:', error);
            this.loadFallbackSymbols();
        }
    }
    
    /**
     * Load fallback symbols for demo mode
     */
    loadFallbackSymbols() {
        const fallbackSymbols = [
            { symbol: '^GSPC', name: 'S&P 500', market: 'US', category: 'Index' },
            { symbol: '^IXIC', name: 'NASDAQ', market: 'US', category: 'Index' },
            { symbol: '^AXJO', name: 'ASX 200', market: 'Australia', category: 'Index' },
            { symbol: 'AAPL', name: 'Apple Inc.', market: 'US', category: 'Technology' },
            { symbol: 'GOOGL', name: 'Alphabet Inc.', market: 'US', category: 'Technology' },
            { symbol: 'CBA.AX', name: 'Commonwealth Bank', market: 'Australia', category: 'Finance' }
        ];
        
        fallbackSymbols.forEach(symbol => {
            this.state.symbolsDatabase.set(symbol.symbol, symbol);
        });
        
        console.log('📊 Loaded fallback symbols');
    }
    
    /**
     * Handle symbol search
     */
    async handleSymbolSearch(event) {
        const query = event.target.value.trim();
        const suggestionsContainer = document.getElementById('symbol-suggestions');
        
        if (query.length < 1) {
            suggestionsContainer.classList.add('hidden');
            return;
        }
        
        let suggestions = [];
        
        // Try API search first
        if (this.state.apiBaseUrl) {
            try {
                const response = await fetch(`${this.state.apiBaseUrl}/search/${encodeURIComponent(query)}`);
                if (response.ok) {
                    const data = await response.json();
                    suggestions = data.results.slice(0, 8);
                }
            } catch (error) {
                console.warn('API search failed, using local search');
            }
        }
        
        // Fallback to local search
        if (suggestions.length === 0) {
            suggestions = this.searchSymbolsLocally(query);
        }
        
        this.displaySuggestions(suggestions);
    }
    
    /**
     * Search symbols locally
     */
    searchSymbolsLocally(query) {
        const results = [];
        const queryLower = query.toLowerCase();
        
        for (const [symbol, info] of this.state.symbolsDatabase.entries()) {
            if (symbol.toLowerCase().includes(queryLower) || 
                info.name.toLowerCase().includes(queryLower)) {
                results.push({
                    symbol: symbol,
                    name: info.name,
                    market: info.market,
                    category: info.category
                });
                
                if (results.length >= 8) break;
            }
        }
        
        return results;
    }
    
    /**
     * Display search suggestions
     */
    displaySuggestions(suggestions) {
        const container = document.getElementById('symbol-suggestions');
        
        if (suggestions.length === 0) {
            container.innerHTML = '<div class="p-3 text-sm text-gray-500">No symbols found</div>';
        } else {
            container.innerHTML = suggestions.map(suggestion => `
                <div class="suggestion-item p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0" 
                     data-symbol="${suggestion.symbol}">
                    <div class="flex justify-between items-center">
                        <div>
                            <div class="font-medium text-gray-900">${suggestion.symbol}</div>
                            <div class="text-sm text-gray-600">${suggestion.name}</div>
                        </div>
                        <div class="text-xs text-gray-500">${suggestion.market}</div>
                    </div>
                </div>
            `).join('');
            
            // Add click listeners
            container.querySelectorAll('.suggestion-item').forEach(item => {
                item.addEventListener('click', this.handleSymbolSelection.bind(this));
            });
        }
        
        container.classList.remove('hidden');
    }
    
    /**
     * Handle symbol selection
     */
    handleSymbolSelection(event) {
        const symbol = event.currentTarget.dataset.symbol;
        this.addSymbol(symbol);
        
        // Clear search
        document.getElementById('symbol-search').value = '';
        document.getElementById('symbol-suggestions').classList.add('hidden');
    }
    
    /**
     * Handle symbol keydown
     */
    handleSymbolKeydown(event) {
        if (event.key === 'Enter') {
            const suggestions = document.querySelectorAll('.suggestion-item');
            if (suggestions.length > 0) {
                suggestions[0].click();
            }
        } else if (event.key === 'Escape') {
            document.getElementById('symbol-suggestions').classList.add('hidden');
        }
    }
    
    /**
     * Add symbol to selection
     */
    addSymbol(symbol) {
        if (this.state.selectedSymbols.has(symbol)) {
            this.showToast(`${symbol} is already selected`, 'warning');
            return;
        }
        
        if (this.state.selectedSymbols.size >= 10) {
            this.showToast('Maximum 10 symbols allowed', 'warning');
            return;
        }
        
        this.state.selectedSymbols.add(symbol);
        this.updateSelectedSymbolsDisplay();
        this.showToast(`Added ${symbol} to analysis`, 'success');
    }
    
    /**
     * Remove symbol from selection
     */
    removeSymbol(symbol) {
        this.state.selectedSymbols.delete(symbol);
        this.state.chartData.delete(symbol);
        this.updateSelectedSymbolsDisplay();
        this.updateChart();
        this.showToast(`Removed ${symbol} from analysis`, 'info');
    }
    
    /**
     * Update selected symbols display
     */
    updateSelectedSymbolsDisplay() {
        const container = document.getElementById('selected-symbols');
        const chipsContainer = document.getElementById('symbol-chips');
        const countElement = document.getElementById('symbol-count');
        
        if (this.state.selectedSymbols.size === 0) {
            container.classList.add('hidden');
            return;
        }
        
        container.classList.remove('hidden');
        countElement.textContent = `${this.state.selectedSymbols.size} symbol${this.state.selectedSymbols.size > 1 ? 's' : ''}`;
        
        chipsContainer.innerHTML = Array.from(this.state.selectedSymbols).map(symbol => {
            const info = this.state.symbolsDatabase.get(symbol) || { name: symbol, market: 'Unknown' };
            return `
                <div class="symbol-chip flex items-center bg-primary-100 text-primary-800 px-3 py-2 rounded-full text-sm">
                    <div class="flex flex-col">
                        <span class="font-medium">${symbol}</span>
                        <span class="text-xs text-primary-600">${info.name}</span>
                    </div>
                    <button class="ml-3 text-primary-600 hover:text-primary-800 transition-colors" onclick="app.removeSymbol('${symbol}')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        }).join('');
    }
    
    /**
     * Handle analyze button
     */
    async handleAnalyze() {
        if (this.state.selectedSymbols.size === 0) {
            this.showToast('Please select at least one symbol', 'warning');
            return;
        }
        
        this.setLoading(true);
        
        try {
            const symbols = Array.from(this.state.selectedSymbols);
            const period = document.getElementById('time-period').value;
            const chartType = document.getElementById('chart-type').value;
            
            let analysisData;
            
            if (this.state.apiBaseUrl) {
                // Try API analysis
                const response = await fetch(`${this.state.apiBaseUrl}/analyze`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        symbols: symbols,
                        period: period,
                        chart_type: chartType
                    })
                });
                
                if (response.ok) {
                    analysisData = await response.json();
                } else {
                    throw new Error(`API error: ${response.status}`);
                }
            } else {
                // Generate demo data
                analysisData = this.generateDemoAnalysis(symbols, period);
            }
            
            // Store and display data
            this.state.chartData.clear();
            for (const [symbol, data] of Object.entries(analysisData.data)) {
                this.state.chartData.set(symbol, data);
            }
            
            this.updateChart();
            this.updatePerformanceSummary();
            
            this.showToast(`Analysis complete: ${symbols.length} symbols processed`, 'success');
            
        } catch (error) {
            console.error('Analysis failed:', error);
            this.showToast('Analysis failed. Using demo data.', 'error');
            
            // Fallback to demo data
            const symbols = Array.from(this.state.selectedSymbols);
            const period = document.getElementById('time-period').value;
            const demoData = this.generateDemoAnalysis(symbols, period);
            
            this.state.chartData.clear();
            for (const [symbol, data] of Object.entries(demoData.data)) {
                this.state.chartData.set(symbol, data);
            }
            
            this.updateChart();
            this.updatePerformanceSummary();
        } finally {
            this.setLoading(false);
        }
    }
    
    /**
     * Generate demo analysis data
     */
    generateDemoAnalysis(symbols, period) {
        const data = {};
        const days = this.getPeriodDays(period);
        
        symbols.forEach(symbol => {
            const points = [];
            let basePrice = symbol.startsWith('^') ? 
                Math.random() * 30000 + 5000 : 
                Math.random() * 400 + 50;
            
            for (let i = 0; i < Math.min(50, days); i++) {
                const timestamp = new Date(Date.now() - (days - i) * 24 * 60 * 60 * 1000);
                const change = (Math.random() - 0.5) * 0.04; // 4% max change
                basePrice *= (1 + change);
                
                const percentageChange = ((basePrice - (basePrice / Math.pow(1 + change, i + 1))) / (basePrice / Math.pow(1 + change, i + 1))) * 100;
                
                points.push({
                    timestamp: timestamp.toISOString(),
                    timestamp_ms: timestamp.getTime(),
                    open: basePrice * 0.99,
                    high: basePrice * 1.02,
                    low: basePrice * 0.98,
                    close: basePrice,
                    volume: Math.floor(Math.random() * 10000000),
                    percentage_change: percentageChange
                });
            }
            
            data[symbol] = points;
        });
        
        return { data, success: true };
    }
    
    /**
     * Get period in days
     */
    getPeriodDays(period) {
        const periodMap = {
            '24h': 1, '3d': 3, '1w': 7, '2w': 14, 
            '1M': 30, '3M': 90, '6M': 180, '1Y': 365, '2Y': 730
        };
        return periodMap[period] || 1;
    }
    
    /**
     * Update the main chart
     */
    updateChart() {
        if (!this.state.chartInstance) return;
        
        if (this.state.chartData.size === 0) {
            this.state.chartInstance.setOption(this.getEmptyChartOption());
            return;
        }
        
        const chartType = document.getElementById('chart-type').value;
        const option = this.generateChartOption(chartType);
        this.state.chartInstance.setOption(option, true);
    }
    
    /**
     * Generate chart option
     */
    generateChartOption(chartType) {
        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#f97316', '#06b6d4', '#84cc16'];
        const series = [];
        let colorIndex = 0;
        
        for (const [symbol, data] of this.state.chartData.entries()) {
            if (chartType === 'percentage') {
                series.push({
                    name: symbol,
                    type: 'line',
                    data: data.map(point => [point.timestamp_ms, point.percentage_change]),
                    smooth: true,
                    symbol: 'none',
                    lineStyle: { width: 2 },
                    color: colors[colorIndex % colors.length]
                });
            } else if (chartType === 'price') {
                series.push({
                    name: symbol,
                    type: 'line',
                    data: data.map(point => [point.timestamp_ms, point.close]),
                    smooth: true,
                    symbol: 'none',
                    lineStyle: { width: 2 },
                    color: colors[colorIndex % colors.length]
                });
            }
            colorIndex++;
        }
        
        return {
            title: {
                text: chartType === 'percentage' ? 'Percentage Change Analysis' : 'Price Analysis',
                left: 'center',
                textStyle: { fontSize: 16, fontWeight: 'bold', color: '#374151' }
            },
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'cross' },
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                borderColor: '#e5e7eb',
                textStyle: { color: '#374151' }
            },
            legend: {
                top: 40,
                type: 'scroll'
            },
            grid: {
                left: '3%',
                right: '4%',
                bottom: '8%',
                top: '15%',
                containLabel: true
            },
            xAxis: {
                type: 'time',
                axisLine: { lineStyle: { color: '#d1d5db' } },
                axisLabel: { color: '#6b7280' }
            },
            yAxis: {
                type: 'value',
                axisLine: { lineStyle: { color: '#d1d5db' } },
                axisLabel: { 
                    color: '#6b7280',
                    formatter: chartType === 'percentage' ? '{value}%' : '${value}'
                },
                splitLine: { lineStyle: { color: '#f3f4f6' } }
            },
            series: series,
            animation: true,
            animationDuration: 1000
        };
    }
    
    /**
     * Get empty chart option
     */
    getEmptyChartOption() {
        return {
            title: {
                text: 'Select symbols to begin analysis',
                left: 'center',
                top: 'middle',
                textStyle: { fontSize: 16, color: '#9ca3af' }
            },
            grid: { show: false },
            xAxis: { show: false },
            yAxis: { show: false }
        };
    }
    
    /**
     * Update performance summary
     */
    updatePerformanceSummary() {
        const container = document.getElementById('performance-summary');
        const grid = document.getElementById('performance-grid');
        
        if (this.state.chartData.size === 0) {
            container.classList.add('hidden');
            return;
        }
        
        container.classList.remove('hidden');
        
        const cards = Array.from(this.state.chartData.entries()).map(([symbol, data]) => {
            const latestPoint = data[data.length - 1];
            const change = latestPoint?.percentage_change || 0;
            const isPositive = change >= 0;
            const info = this.state.symbolsDatabase.get(symbol) || { name: symbol, market: 'Unknown' };
            
            return `
                <div class="performance-card bg-gray-50 rounded-lg p-4">
                    <div class="flex items-center justify-between mb-2">
                        <div class="font-medium text-gray-900">${symbol}</div>
                        <div class="text-xs text-gray-500">${info.market}</div>
                    </div>
                    <div class="text-sm text-gray-600 mb-3">${info.name}</div>
                    <div class="flex items-center justify-between">
                        <span class="text-lg font-bold ${isPositive ? 'text-success-600' : 'text-danger-600'}">
                            ${isPositive ? '+' : ''}${change.toFixed(2)}%
                        </span>
                        <i class="fas fa-arrow-${isPositive ? 'up' : 'down'} ${isPositive ? 'text-success-500' : 'text-danger-500'}"></i>
                    </div>
                </div>
            `;
        }).join('');
        
        grid.innerHTML = cards;
    }
    
    /**
     * Handle chart type change
     */
    handleChartTypeChange() {
        if (this.state.chartData.size > 0) {
            this.updateChart();
        }
    }
    
    /**
     * Handle clear
     */
    handleClear() {
        this.state.selectedSymbols.clear();
        this.state.chartData.clear();
        this.updateSelectedSymbolsDisplay();
        this.updateChart();
        document.getElementById('performance-summary').classList.add('hidden');
        this.showToast('Analysis cleared', 'info');
    }
    
    /**
     * Set loading state
     */
    setLoading(loading) {
        this.state.isLoading = loading;
        const indicator = document.getElementById('loading-indicator');
        const button = document.getElementById('analyze-btn');
        
        if (loading) {
            indicator.classList.remove('hidden');
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Analyzing...';
        } else {
            indicator.classList.add('hidden');
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-chart-area mr-2"></i>Analyze';
        }
    }
    
    /**
     * Update API status
     */
    updateApiStatus(status, message) {
        const statusElement = document.getElementById('api-status');
        const dot = statusElement.querySelector('div');
        const text = statusElement.querySelector('span');
        
        dot.className = 'w-2 h-2 rounded-full';
        
        switch (status) {
            case 'connected':
                dot.classList.add('bg-success-500');
                text.textContent = `Connected ${message}`;
                text.className = 'text-xs text-success-600';
                break;
            case 'error':
                dot.classList.add('bg-danger-500');
                text.textContent = message;
                text.className = 'text-xs text-danger-600';
                break;
            case 'disconnected':
                dot.classList.add('bg-yellow-500');
                text.textContent = message;
                text.className = 'text-xs text-yellow-600';
                break;
            default:
                dot.classList.add('bg-gray-400', 'animate-pulse');
                text.textContent = message;
                text.className = 'text-xs text-gray-500';
        }
    }
    
    /**
     * Show settings modal
     */
    showSettings() {
        document.getElementById('settings-modal').classList.remove('hidden');
        document.getElementById('api-url').value = this.state.apiBaseUrl || '';
        document.getElementById('auto-refresh').checked = this.state.settings.autoRefresh;
        document.getElementById('refresh-interval').value = this.state.settings.refreshInterval;
    }
    
    /**
     * Hide settings modal
     */
    hideSettings() {
        document.getElementById('settings-modal').classList.add('hidden');
    }
    
    /**
     * Save settings
     */
    async saveSettings() {
        const apiUrl = document.getElementById('api-url').value.trim();
        const autoRefresh = document.getElementById('auto-refresh').checked;
        const refreshInterval = parseInt(document.getElementById('refresh-interval').value);
        
        // Update state
        this.state.apiBaseUrl = apiUrl;
        this.state.settings.autoRefresh = autoRefresh;
        this.state.settings.refreshInterval = refreshInterval;
        
        // Save to localStorage
        localStorage.setItem('gsmt-api-url', apiUrl);
        localStorage.setItem('gsmt-settings', JSON.stringify(this.state.settings));
        
        // Test new API connection
        if (apiUrl) {
            await this.checkApiConnection();
            await this.loadSymbolsDatabase();
        }
        
        this.applySettings();
        this.hideSettings();
        this.showToast('Settings saved successfully', 'success');
    }
    
    /**
     * Load settings
     */
    loadSettings() {
        const defaultSettings = {
            autoRefresh: false,
            refreshInterval: 300
        };
        
        try {
            const saved = localStorage.getItem('gsmt-settings');
            return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
        } catch (error) {
            return defaultSettings;
        }
    }
    
    /**
     * Apply settings
     */
    applySettings() {
        // Auto-refresh functionality
        if (this.state.refreshTimer) {
            clearInterval(this.state.refreshTimer);
            this.state.refreshTimer = null;
        }
        
        if (this.state.settings.autoRefresh && this.state.selectedSymbols.size > 0) {
            this.state.refreshTimer = setInterval(() => {
                this.handleAnalyze();
            }, this.state.settings.refreshInterval * 1000);
        }
    }
    
    /**
     * Toggle fullscreen
     */
    toggleFullscreen() {
        const chartContainer = document.getElementById('main-chart');
        
        if (!document.fullscreenElement) {
            chartContainer.requestFullscreen().then(() => {
                setTimeout(() => this.state.chartInstance?.resize(), 100);
            });
        } else {
            document.exitFullscreen();
        }
    }
    
    /**
     * Handle document clicks
     */
    handleDocumentClick(event) {
        if (!event.target.closest('#symbol-search') && !event.target.closest('#symbol-suggestions')) {
            document.getElementById('symbol-suggestions').classList.add('hidden');
        }
    }
    
    /**
     * Handle resize
     */
    handleResize() {
        if (this.state.chartInstance) {
            this.state.chartInstance.resize();
        }
    }
    
    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const id = Date.now();
        
        const colors = {
            success: 'bg-success-500',
            error: 'bg-danger-500',
            warning: 'bg-yellow-500',
            info: 'bg-primary-500'
        };
        
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };
        
        const toast = document.createElement('div');
        toast.className = `toast flex items-center p-4 rounded-lg shadow-lg text-white ${colors[type]} transform transition-all duration-300`;
        toast.innerHTML = `
            <i class="fas ${icons[type]} mr-3"></i>
            <span class="flex-1">${message}</span>
            <button onclick="this.parentElement.remove()" class="ml-3 text-white hover:text-gray-200">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            if (toast.parentElement) {
                toast.classList.add('toast-exit');
                setTimeout(() => toast.remove(), 300);
            }
        }, 5000);
    }
    
    /**
     * Debounce utility
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
}

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new GSMTApp();
});

// Export for external use
window.GSMTApp = GSMTApp;