class ChatApp {
    constructor() {
        this.socket = null;
        this.currentUser = null;
        this.selectedReceiver = null;
        this.isScrolling = false;
        this.scrollTimeout = null;
        this.typingTimeout = null;
        this.isAtBottom = true;
        this.scrollPosition = 0;
        this.isLoadingMessages = false;
        
        this.initializeEventListeners();
        this.initializeWhatsAppLikeScroll();
    }

    initializeEventListeners() {
        document.getElementById('login-btn').addEventListener('click', () => this.login());
        document.getElementById('username-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.login();
        });

        document.getElementById('logout-btn').addEventListener('click', () => this.logout());
        document.getElementById('logout-btn-mobile').addEventListener('click', () => this.logout());
        document.getElementById('send-btn').addEventListener('click', () => this.sendMessage());
        document.getElementById('mobile-send-btn').addEventListener('click', () => this.sendMessage());
        
        document.getElementById('message-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        
        document.getElementById('mobile-message-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });

        document.getElementById('message-input').addEventListener('input', () => this.handleTyping());
        document.getElementById('mobile-message-input').addEventListener('input', () => this.handleTyping());
        
        document.getElementById('receiver-select').addEventListener('change', (e) => {
            this.selectReceiver(e.target.value);
        });
        
        document.getElementById('mobile-receiver-select').addEventListener('change', (e) => {
            this.selectReceiver(e.target.value);
        });

        // Mobile menu toggle
        document.getElementById('mobile-menu-btn').addEventListener('click', () => this.toggleMobileMenu());
        document.getElementById('close-mobile-menu').addEventListener('click', () => this.closeMobileMenu());
    }

    initializeWhatsAppLikeScroll() {
        // WhatsApp-like scroll initialization
        setTimeout(() => {
            this.setupMessagesContainer();
        }, 100);
        
        // Prevent body scroll completely like WhatsApp
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
    }

    setupMessagesContainer() {
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) return;

        // WhatsApp-like scroll settings
        messagesContainer.style.overflowY = 'auto';
        messagesContainer.style.webkitOverflowScrolling = 'touch';
        messagesContainer.style.height = '100%';
        
        // Add scroll event listener for WhatsApp-like behavior
        messagesContainer.addEventListener('scroll', () => this.handleWhatsAppScroll());
        
        // Create scroll to bottom button (like WhatsApp)
        this.createScrollToBottomButton();
        
        // Ensure perfect scrollbar visibility
        this.ensurePerfectScrollbar();
    }

    createScrollToBottomButton() {
        // Remove existing button if any
        const existingBtn = document.querySelector('.scroll-to-bottom');
        if (existingBtn) existingBtn.remove();

        const scrollBtn = document.createElement('div');
        scrollBtn.className = 'scroll-to-bottom';
        scrollBtn.innerHTML = '↓';
        scrollBtn.title = 'Scroll to bottom';
        scrollBtn.style.display = 'none';
        scrollBtn.addEventListener('click', () => {
            this.scrollToBottom(true);
            scrollBtn.style.display = 'none';
        });
        
        document.querySelector('.chat-area').appendChild(scrollBtn);
        this.scrollToBottomBtn = scrollBtn;
    }

    handleWhatsAppScroll() {
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer || this.isLoadingMessages) return;

        // Calculate if user is at bottom (like WhatsApp)
        const threshold = 50; // WhatsApp uses small threshold
        const currentPosition = messagesContainer.scrollTop + messagesContainer.clientHeight;
        const maxPosition = messagesContainer.scrollHeight;
        
        this.isAtBottom = (maxPosition - currentPosition) <= threshold;
        
        // Show/hide scroll to bottom button like WhatsApp
        if (this.scrollToBottomBtn) {
            if (this.isAtBottom) {
                this.scrollToBottomBtn.style.display = 'none';
            } else {
                this.scrollToBottomBtn.style.display = 'flex';
            }
        }

        // Load more messages when scrolling to top (like WhatsApp)
        if (messagesContainer.scrollTop < 100 && !this.isLoadingMessages) {
            // This is where you could implement loading older messages
            // For now, we'll just maintain the current behavior
        }
    }

    ensurePerfectScrollbar() {
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) return;

        // Force scrollbar to always be available
        const ensureScroll = () => {
            if (messagesContainer.scrollHeight <= messagesContainer.clientHeight) {
                messagesContainer.style.minHeight = 'calc(100% + 1px)';
            }
        };

        ensureScroll();
        setTimeout(ensureScroll, 500);
    }

    scrollToBottom(force = false) {
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) return;

        // WhatsApp-like smooth scrolling to bottom
        if (force || this.isAtBottom) {
            const scroll = () => {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
                
                // Multiple smooth attempts like WhatsApp
                setTimeout(() => {
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }, 50);
                
                setTimeout(() => {
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                    this.isAtBottom = true;
                    if (this.scrollToBottomBtn) {
                        this.scrollToBottomBtn.style.display = 'none';
                    }
                }, 100);
            };

            scroll();
        }
    }

    login() {
        const usernameInput = document.getElementById('username-input');
        const username = usernameInput.value.trim();

        if (!username) {
            this.showLoginError('Please enter a username');
            return;
        }

        if (username.length > 20) {
            this.showLoginError('Username must be 20 characters or less');
            return;
        }

        this.showLoadingScreen();
        this.connectToSocket(username);
    }

    showLoadingScreen() {
        const loginScreen = document.getElementById('login-screen');
        loginScreen.innerHTML = `
            <div class="loading-container">
                <div class="loading-spinner"></div>
                <div class="loading-text">Connecting to WhatsApp-like Chat...</div>
            </div>
        `;
    }

    connectToSocket(username) {
        this.socket = io();

        this.socket.on('connect', () => {
            this.socket.emit('login', { username });
        });

        this.socket.on('login_success', (data) => {
            this.currentUser = data.username;
            this.showChatScreen(data.online_users, data.all_users);
        });

        this.socket.on('login_failed', (data) => {
            this.showLoginError(data.message);
        });

        this.socket.on('user_joined', (data) => {
            this.addUserToList(data.username, true);
        });

        this.socket.on('user_left', (data) => {
            this.removeUserFromList(data.username);
        });

        this.socket.on('new_message', (data) => {
            if (this.isMessageForCurrentConversation(data)) {
                this.displayMessage(data);
                // Only auto-scroll if user is at bottom (like WhatsApp)
                if (this.isAtBottom) {
                    this.scrollToBottom();
                }
            }
        });

        this.socket.on('conversation_history', (data) => {
            this.displayConversationHistory(data.messages);
            this.scrollToBottom(true);
        });

        this.socket.on('user_typing', (data) => {
            this.showTypingIndicator(data.sender, data.is_typing);
        });
    }

    showChatScreen(onlineUsers, allUsers) {
        document.getElementById('login-screen').classList.remove('active');
        document.getElementById('chat-screen').classList.add('active');
        
        document.getElementById('current-user').textContent = this.currentUser;
        this.populateUsersList(onlineUsers, allUsers);
        this.showWelcomeMessage();
        
        // Initialize WhatsApp-like scrolling
        setTimeout(() => {
            this.setupMessagesContainer();
            this.scrollToBottom(true);
        }, 200);
    }

    populateUsersList(onlineUsers, allUsers) {
        const usersList = document.getElementById('users-list');
        const mobileUsersList = document.getElementById('mobile-users-list');
        const receiverSelect = document.getElementById('receiver-select');
        const mobileReceiverSelect = document.getElementById('mobile-receiver-select');
        
        usersList.innerHTML = '';
        mobileUsersList.innerHTML = '';
        receiverSelect.innerHTML = '<option value="">Select a user to chat with</option>';
        mobileReceiverSelect.innerHTML = '<option value="">Select user</option>';
        
        // Add online users first (like WhatsApp)
        if (onlineUsers && onlineUsers.length > 0) {
            onlineUsers.forEach(user => {
                if (user !== this.currentUser) {
                    this.addUserToUI(user, usersList, mobileUsersList, receiverSelect, mobileReceiverSelect, true);
                }
            });
        }
        
        // Add all users (including offline)
        if (allUsers && allUsers.length > 0) {
            allUsers.forEach(user => {
                if (user !== this.currentUser && (!onlineUsers || !onlineUsers.includes(user))) {
                    this.addUserToUI(user, usersList, mobileUsersList, receiverSelect, mobileReceiverSelect, false);
                }
            });
        }
    }

    addUserToUI(username, usersList, mobileUsersList, receiverSelect, mobileReceiverSelect, isOnline) {
        // Create user item for desktop
        const li = document.createElement('li');
        li.className = 'user-item';
        li.innerHTML = `
            <div class="user-avatar">${username.charAt(0).toUpperCase()}</div>
            <div class="user-info">
                <div class="user-name">${username}</div>
                <div class="user-status-text">${isOnline ? 'Online' : 'Offline'}</div>
            </div>
            <div class="user-time"></div>
        `;
        li.addEventListener('click', () => {
            this.selectReceiver(username);
            this.closeMobileMenu();
        });
        usersList.appendChild(li);

        // Create user item for mobile
        const mobileLi = li.cloneNode(true);
        mobileLi.addEventListener('click', () => {
            this.selectReceiver(username);
            this.closeMobileMenu();
        });
        mobileUsersList.appendChild(mobileLi);
        
        // Add to receiver selects
        const option = document.createElement('option');
        option.value = username;
        option.textContent = `${username} ${isOnline ? '(online)' : '(offline)'}`;
        receiverSelect.appendChild(option);

        const mobileOption = option.cloneNode(true);
        mobileReceiverSelect.appendChild(mobileOption);
    }

    addUserToList(username, isOnline) {
        if (username === this.currentUser) return;
        
        const usersList = document.getElementById('users-list');
        const mobileUsersList = document.getElementById('mobile-users-list');
        const receiverSelect = document.getElementById('receiver-select');
        const mobileReceiverSelect = document.getElementById('mobile-receiver-select');
        
        // Update existing user or add new one
        let userExists = this.updateExistingUser(username, isOnline, usersList);
        this.updateExistingUser(username, isOnline, mobileUsersList);
        
        if (!userExists) {
            this.addUserToUI(username, usersList, mobileUsersList, receiverSelect, mobileReceiverSelect, isOnline);
        }
        
        // Update select options
        this.updateSelectOption(username, isOnline, receiverSelect);
        this.updateSelectOption(username, isOnline, mobileReceiverSelect);
    }

    updateExistingUser(username, isOnline, usersList) {
        const userItems = usersList.querySelectorAll('.user-item');
        let userExists = false;
        
        userItems.forEach(item => {
            const nameDiv = item.querySelector('.user-name');
            if (nameDiv && nameDiv.textContent === username) {
                userExists = true;
                const statusDiv = item.querySelector('.user-status-text');
                if (statusDiv) {
                    statusDiv.textContent = isOnline ? 'Online' : 'Offline';
                    statusDiv.className = `user-status-text ${isOnline ? 'online' : 'offline'}`;
                }
            }
        });
        
        return userExists;
    }

    updateSelectOption(username, isOnline, selectElement) {
        const options = Array.from(selectElement.options);
        const existingOption = options.find(opt => opt.value === username);
        if (existingOption) {
            existingOption.textContent = `${username} ${isOnline ? '(online)' : '(offline)'}`;
        }
    }

    removeUserFromList(username) {
        this.updateExistingUser(username, false, document.getElementById('users-list'));
        this.updateExistingUser(username, false, document.getElementById('mobile-users-list'));
        this.updateSelectOption(username, false, document.getElementById('receiver-select'));
        this.updateSelectOption(username, false, document.getElementById('mobile-receiver-select'));
        
        if (this.selectedReceiver === username) {
            this.selectedReceiver = null;
            document.getElementById('receiver-select').value = '';
            document.getElementById('mobile-receiver-select').value = '';
            this.showWelcomeMessage();
        }
    }

    selectReceiver(username) {
        this.selectedReceiver = username;
        
        // Update UI
        document.getElementById('receiver-select').value = username;
        document.getElementById('mobile-receiver-select').value = username;
        document.getElementById('chat-with-user').textContent = username;
        
        const messageInput = document.getElementById('message-input');
        const mobileMessageInput = document.getElementById('mobile-message-input');
        const sendBtn = document.getElementById('send-btn');
        const mobileSendBtn = document.getElementById('mobile-send-btn');
        
        if (username) {
            messageInput.disabled = false;
            mobileMessageInput.disabled = false;
            sendBtn.disabled = false;
            mobileSendBtn.disabled = false;
            messageInput.focus();
            
            this.loadConversationHistory(username);
            this.updateUsersListActiveState(username);
        } else {
            messageInput.disabled = true;
            mobileMessageInput.disabled = true;
            sendBtn.disabled = true;
            mobileSendBtn.disabled = true;
            this.showWelcomeMessage();
        }
    }

    updateUsersListActiveState(activeUsername) {
        const updateList = (usersList) => {
            const items = usersList.querySelectorAll('.user-item');
            items.forEach(item => {
                const nameDiv = item.querySelector('.user-name');
                if (nameDiv && nameDiv.textContent === activeUsername) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });
        };
        
        updateList(document.getElementById('users-list'));
        updateList(document.getElementById('mobile-users-list'));
    }

    loadConversationHistory(otherUser) {
        if (this.socket && otherUser) {
            this.isLoadingMessages = true;
            this.socket.emit('get_conversation', {
                user1: this.currentUser,
                user2: otherUser
            });
            setTimeout(() => {
                this.isLoadingMessages = false;
            }, 1000);
        }
    }

    displayConversationHistory(messages) {
        const messagesContainer = document.getElementById('messages-container');
        messagesContainer.innerHTML = '';
        
        if (messages.length === 0) {
            this.showWelcomeMessage('Start a new conversation with ' + this.selectedReceiver);
            return;
        }
        
        messages.forEach(message => this.displayMessage(message, true));
        
        setTimeout(() => {
            this.scrollToBottom(true);
        }, 100);
    }

    sendMessage() {
        let messageInput = document.getElementById('message-input');
        let message = messageInput.value.trim();
        
        // Also check mobile input
        if (!message) {
            messageInput = document.getElementById('mobile-message-input');
            message = messageInput.value.trim();
        }
        
        if (!message || !this.selectedReceiver) return;
        
        this.socket.emit('send_message', {
            sender: this.currentUser,
            receiver: this.selectedReceiver,
            message: message
        });
        
        this.stopTyping();
        document.getElementById('message-input').value = '';
        document.getElementById('mobile-message-input').value = '';
        document.getElementById('message-input').focus();
    }

    displayMessage(message, isHistory = false) {
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
            <div class="message-content">
                <div class="message-text">${this.escapeHtml(message.text)}</div>
                <div class="message-time">${time}</div>
            </div>
        `;
        
        messagesContainer.appendChild(messageElement);
        
        // Only auto-scroll for new messages or if user is at bottom
        if (!isHistory && (message.sender === this.currentUser || this.isAtBottom)) {
            this.scrollToBottom(true);
        }
    }

    handleTyping() {
        if (!this.selectedReceiver) return;
        
        this.socket.emit('typing', {
            sender: this.currentUser,
            receiver: this.selectedReceiver,
            is_typing: true
        });
        
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
        }
        
        this.typingTimeout = setTimeout(() => {
            this.stopTyping();
        }, 1000);
    }

    stopTyping() {
        if (!this.selectedReceiver) return;
        
        this.socket.emit('typing', {
            sender: this.currentUser,
            receiver: this.selectedReceiver,
            is_typing: false
        });
        
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
        }
    }

    showTypingIndicator(sender, isTyping) {
        const typingIndicator = document.getElementById('typing-indicator');
        const typingUser = document.getElementById('typing-user');
        
        if (isTyping && sender === this.selectedReceiver) {
            typingUser.textContent = sender;
            typingIndicator.style.display = 'flex';
        } else {
            typingIndicator.style.display = 'none';
        }
    }

    showWelcomeMessage(customMessage = null) {
        const messagesContainer = document.getElementById('messages-container');
        messagesContainer.innerHTML = '';
        
        const welcomeMessage = document.createElement('div');
        welcomeMessage.className = 'welcome-message';
        
        if (customMessage) {
            welcomeMessage.innerHTML = `
                <div class="welcome-icon">💬</div>
                <p>${customMessage}</p>
            `;
        } else {
            welcomeMessage.innerHTML = `
                <div class="welcome-icon">💬</div>
                <p>Welcome to WhatsApp-like Chat!</p>
                <p>Select a user to start a private conversation</p>
            `;
        }
        
        messagesContainer.appendChild(welcomeMessage);
        this.scrollToBottom(true);
    }

    isMessageForCurrentConversation(message) {
        if (!this.selectedReceiver) return false;
        return (message.sender === this.currentUser && message.receiver === this.selectedReceiver) ||
               (message.sender === this.selectedReceiver && message.receiver === this.currentUser);
    }

    showLoginError(message) {
        const loginScreen = document.getElementById('login-screen');
        loginScreen.innerHTML = `
            <div class="login-container">
                <h1>WhatsApp-like Chat</h1>
                <div class="login-form">
                    <input type="text" id="username-input" placeholder="Enter your username" maxlength="20">
                    <button id="login-btn">Join Chat</button>
                    <div id="login-error" class="error-message">${message}</div>
                </div>
            </div>
        `;
        
        document.getElementById('login-btn').addEventListener('click', () => this.login());
        document.getElementById('username-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.login();
        });
        
        document.getElementById('username-input').focus();
    }

    toggleMobileMenu() {
        const mobileMenu = document.getElementById('mobile-users-menu');
        mobileMenu.classList.toggle('active');
    }

    closeMobileMenu() {
        const mobileMenu = document.getElementById('mobile-users-menu');
        mobileMenu.classList.remove('active');
    }

    logout() {
        if (this.socket) {
            this.socket.disconnect();
        }
        
        this.currentUser = null;
        this.selectedReceiver = null;
        
        document.getElementById('chat-screen').classList.remove('active');
        document.getElementById('login-screen').classList.add('active');
        
        const loginScreen = document.getElementById('login-screen');
        loginScreen.innerHTML = `
            <div class="login-container">
                <h1>WhatsApp-like Chat</h1>
                <div class="login-form">
                    <input type="text" id="username-input" placeholder="Enter your username" maxlength="20">
                    <button id="login-btn">Join Chat</button>
                    <div id="login-error" class="error-message"></div>
                </div>
            </div>
        `;
        
        document.getElementById('login-btn').addEventListener('click', () => this.login());
        document.getElementById('username-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.login();
        });
        
        document.getElementById('username-input').focus();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ChatApp();
});