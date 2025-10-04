class ChatApp {
    constructor() {
        this.socket = null;
        this.currentUser = null;
        this.selectedReceiver = null;
        this.isScrolling = false;
        this.scrollTimeout = null;
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        document.getElementById('login-btn').addEventListener('click', () => this.login());
        document.getElementById('username-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.login();
        });

        document.getElementById('logout-btn').addEventListener('click', () => this.logout());
        document.getElementById('send-btn').addEventListener('click', () => this.sendMessage());
        document.getElementById('message-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });

        document.getElementById('receiver-select').addEventListener('change', (e) => {
            this.selectReceiver(e.target.value);
        });

        // Add scroll event listener for manual scrolling detection
        this.initializeScrollHandling();
    }

    initializeScrollHandling() {
        // This will be called once the messages container is available
        setTimeout(() => {
            const messagesContainer = document.getElementById('messages-container');
            if (messagesContainer) {
                messagesContainer.addEventListener('scroll', () => this.handleScroll());
                
                // Enable touch scrolling
                messagesContainer.style.webkitOverflowScrolling = 'touch';
                
                // Force scrollbar visibility
                this.ensureScrollbarVisibility();
            }
        }, 1000);
    }

    handleScroll() {
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) return;

        this.isScrolling = true;
        
        // Clear existing timeout
        if (this.scrollTimeout) {
            clearTimeout(this.scrollTimeout);
        }
        
        // Set a new timeout to mark scrolling as ended
        this.scrollTimeout = setTimeout(() => {
            this.isScrolling = false;
        }, 150);
    }

    ensureScrollbarVisibility() {
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) return;

        // Force scrollbar visibility by ensuring content overflow
        const checkScrollbar = () => {
            const hasScrollbar = messagesContainer.scrollHeight > messagesContainer.clientHeight;
            if (!hasScrollbar) {
                // Add minimal padding to ensure scrollbar area is reserved
                messagesContainer.style.minHeight = 'calc(100% + 1px)';
            }
        };

        // Check initially and after content changes
        checkScrollbar();
        setTimeout(checkScrollbar, 500);
        setTimeout(checkScrollbar, 1000);
    }

    scrollToBottom(force = false) {
        // Only auto-scroll if not manually scrolling or if forced
        if (!this.isScrolling || force) {
            const messagesContainer = document.getElementById('messages-container');
            if (messagesContainer) {
                // Use multiple methods to ensure scrolling works
                setTimeout(() => {
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }, 0);
                
                setTimeout(() => {
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }, 100);
            }
        }
    }

    displayMessage(message) {
        const messagesContainer = document.getElementById('messages-container');
        
        const welcomeMessage = messagesContainer.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.style.display = 'none';
        }
        
        const messageElement = document.createElement('div');
        messageElement.className = `message ${message.sender === this.currentUser ? 'sent' : 'received'}`;
        
        const time = new Date(message.timestamp).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit'
        });
        
        messageElement.innerHTML = `
            <div class="message-header">${message.sender}</div>
            <div class="message-text">${this.escapeHtml(message.text)}</div>
            <div class="message-time">${time}</div>
        `;
        
        messagesContainer.appendChild(messageElement);
        
        // Scroll to bottom when new message is added
        const shouldScroll = message.sender === this.currentUser || 
                           (message.sender === this.selectedReceiver && message.receiver === this.currentUser);
        
        if (shouldScroll) {
            this.scrollToBottom(true);
        }
        
        // Ensure scrollbar remains visible
        this.ensureScrollbarVisibility();
    }

    displayConversationHistory(messages) {
        const messagesContainer = document.getElementById('messages-container');
        messagesContainer.innerHTML = '';
        
        if (messages.length === 0) {
            this.showWelcomeMessage('Start a new conversation with ' + this.selectedReceiver);
            return;
        }
        
        messages.forEach(message => this.displayMessage(message));
        
        // Scroll to bottom after loading history
        setTimeout(() => {
            this.scrollToBottom(true);
            this.ensureScrollbarVisibility();
        }, 100);
    }

    showChatScreen(users) {
        document.getElementById('login-screen').classList.remove('active');
        document.getElementById('chat-screen').classList.add('active');
        
        document.getElementById('current-user').textContent = this.currentUser;
        this.populateUsersList(users);
        this.showWelcomeMessage();
        
        // Initialize scrolling after chat screen is shown
        setTimeout(() => {
            this.initializeScrollHandling();
            this.ensureScrollbarVisibility();
        }, 500);
    }

    // ... rest of your existing methods remain the same ...

    showLoadingScreen() {
        const loginScreen = document.getElementById('login-screen');
        loginScreen.innerHTML = `
            <div class="loading-container">
                <div class="loading-spinner"></div>
                <div class="loading-text">Launching Christian Et Celestin Chat...</div>
            </div>
        `;
        
        // Add fade-in animation
        setTimeout(() => {
            const loadingContainer = loginScreen.querySelector('.loading-container');
            if (loadingContainer) {
                loadingContainer.style.animation = 'fadeIn 0.5s ease-in';
            }
        }, 10);
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    new ChatApp();
    
    // Additional scrollbar visibility check
    setTimeout(() => {
        const app = new ChatApp();
        app.ensureScrollbarVisibility();
    }, 2000);
});