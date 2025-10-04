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
        
        this.initializeEventListeners();
        this.initializeScrollSystem();
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

        document.getElementById('message-input').addEventListener('input', () => this.handleTyping());
        
        document.getElementById('receiver-select').addEventListener('change', (e) => {
            this.selectReceiver(e.target.value);
        });

        // Mobile menu toggle
        document.getElementById('mobile-menu-btn').addEventListener('click', () => this.toggleMobileMenu());
    }

    initializeScrollSystem() {
        // Initialize scroll handling after DOM is ready
        setTimeout(() => {
            this.setupMessagesContainer();
        }, 100);
        
        // Prevent body scroll on mobile
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
    }

    setupMessagesContainer() {
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) return;

        // FORCE SCROLLABLE CONTAINER
        messagesContainer.style.overflowY = 'auto';
        messagesContainer.style.webkitOverflowScrolling = 'touch';
        messagesContainer.style.height = '100%';
        
        // Add scroll event listener
        messagesContainer.addEventListener('scroll', () => this.handleScroll());
        
        // Create scroll to bottom button
        this.createScrollToBottomButton();
        
        // Ensure scrollbar is always visible
        this.ensureScrollbarVisibility();
    }

    createScrollToBottomButton() {
        // Remove existing button if any
        const existingBtn = document.querySelector('.scroll-to-bottom');
        if (existingBtn) existingBtn.remove();

        const scrollBtn = document.createElement('button');
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

    handleScroll() {
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) return;

        const threshold = 100;
        const currentPosition = messagesContainer.scrollTop + messagesContainer.clientHeight;
        const maxPosition = messagesContainer.scrollHeight;
        
        this.isAtBottom = (maxPosition - currentPosition) <= threshold;
        
        // Show/hide scroll to bottom button
        if (this.scrollToBottomBtn) {
            this.scrollToBottomBtn.style.display = this.isAtBottom ? 'none' : 'flex';
        }
    }

    ensureScrollbarVisibility() {
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) return;

        // Force scrollbar by ensuring content
        const forceScrollbar = () => {
            messagesContainer.style.minHeight = 'calc(100% + 1px)';
        };

        forceScrollbar();
        setTimeout(forceScrollbar, 500);
    }

    scrollToBottom(force = false) {
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) return;

        if (force || this.isAtBottom) {
            // Multiple attempts for reliability
            const scrollAttempts = [
                () => messagesContainer.scrollTop = messagesContainer.scrollHeight,
                () => messagesContainer.scrollTop = messagesContainer.scrollHeight,
                () => {
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                    this.isAtBottom = true;
                    if (this.scrollToBottomBtn) {
                        this.scrollToBottomBtn.style.display = 'none';
                    }
                }
            ];

            scrollAttempts.forEach((attempt, index) => {
                setTimeout(attempt, index * 50);
            });
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
                <div class="loading-text">Launching Christian Et Celestin Chat...</div>
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
                this.scrollToBottom();
            }
        });

        this.socket.on('conversation_history', (data) => {
            this.displayConversationHistory(data.messages);
            this.scrollToBottom();
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
        
        // Initialize scrolling system
        setTimeout(() => {
            this.setupMessagesContainer();
            this.scrollToBottom(true);
        }, 200);
    }

    populateUsersList(onlineUsers, allUsers) {
        const usersList = document.getElementById('users-list');
        const receiverSelect = document.getElementById('receiver-select');
        
        usersList.innerHTML = '';
        receiverSelect.innerHTML = '<option value="">Select a user to chat with</option>';
        
        // Add online users first
        if (onlineUsers && onlineUsers.length > 0) {
            onlineUsers.forEach(user => {
                if (user !== this.currentUser) {
                    this.addUserToUI(user, usersList, receiverSelect, true);
                }
            });
        }
        
        // Add all users (including offline)
        if (allUsers && allUsers.length > 0) {
            allUsers.forEach(user => {
                if (user !== this.currentUser && (!onlineUsers || !onlineUsers.includes(user))) {
                    this.addUserToUI(user, usersList, receiverSelect, false);
                }
            });
        }

        // Update mobile users display
        this.updateMobileUsersDisplay();
    }

    addUserToUI(username, usersList, receiverSelect, isOnline) {
        // Add to users list
        const li = document.createElement('li');
        li.className = 'user-item';
        li.innerHTML = `
            <span class="user-status ${isOnline ? 'online' : 'offline'}"></span>
            <span class="username">${username}</span>
            <span class="user-badge">${isOnline ? 'Online' : 'Offline'}</span>
        `;
        li.addEventListener('click', () => {
            this.selectReceiver(username);
            this.closeMobileMenu();
        });
        usersList.appendChild(li);
        
        // Add to receiver select
        const option = document.createElement('option');
        option.value = username;
        option.textContent = `${username} ${isOnline ? '(online)' : '(offline)'}`;
        receiverSelect.appendChild(option);
    }

    updateMobileUsersDisplay() {
        const mobileUsersList = document.getElementById('mobile-users-list');
        if (!mobileUsersList) return;

        const usersList = document.getElementById('users-list');
        mobileUsersList.innerHTML = usersList.innerHTML;
    }

    addUserToList(username, isOnline) {
        if (username === this.currentUser) return;
        
        const usersList = document.getElementById('users-list');
        const receiverSelect = document.getElementById('receiver-select');
        
        // Check if user already exists
        const existingItems = usersList.querySelectorAll('.user-item');
        let userExists = false;
        
        existingItems.forEach(item => {
            const usernameSpan = item.querySelector('.username');
            if (usernameSpan && usernameSpan.textContent === username) {
                userExists = true;
                // Update status
                const status = item.querySelector('.user-status');
                const badge = item.querySelector('.user-badge');
                if (status && badge) {
                    status.className = `user-status ${isOnline ? 'online' : 'offline'}`;
                    badge.textContent = isOnline ? 'Online' : 'Offline';
                }
            }
        });
        
        if (!userExists) {
            this.addUserToUI(username, usersList, receiverSelect, isOnline);
        }
        
        // Update select option
        const options = Array.from(receiverSelect.options);
        const existingOption = options.find(opt => opt.value === username);
        if (existingOption) {
            existingOption.textContent = `${username} ${isOnline ? '(online)' : '(offline)'}`;
        }
        
        this.updateMobileUsersDisplay();
    }

    removeUserFromList(username) {
        const usersList = document.getElementById('users-list');
        const receiverSelect = document.getElementById('receiver-select');
        
        // Remove from users list
        const userItems = usersList.querySelectorAll('.user-item');
        userItems.forEach(item => {
            const usernameSpan = item.querySelector('.username');
            if (usernameSpan && usernameSpan.textContent === username) {
                item.remove();
            }
        });
        
        // Update to offline in select
        const options = Array.from(receiverSelect.options);
        const userOption = options.find(opt => opt.value === username);
        if (userOption) {
            userOption.textContent = `${username} (offline)`;
        }
        
        // If the removed user was the selected receiver, clear selection
        if (this.selectedReceiver === username) {
            this.selectedReceiver = null;
            document.getElementById('receiver-select').value = '';
            this.showWelcomeMessage();
        }
        
        this.updateMobileUsersDisplay();
    }

    selectReceiver(username) {
        this.selectedReceiver = username;
        
        // Update UI
        document.getElementById('receiver-select').value = username;
        document.getElementById('mobile-receiver-select').value = username;
        
        const messageInput = document.getElementById('message-input');
        const sendBtn = document.getElementById('send-btn');
        
        if (username) {
            messageInput.disabled = false;
            sendBtn.disabled = false;
            messageInput.focus();
            
            // Update chat header for mobile
            document.getElementById('chat-with-user').textContent = username;
            
            this.loadConversationHistory(username);
            this.updateUsersListActiveState(username);
        } else {
            messageInput.disabled = true;
            sendBtn.disabled = true;
            this.showWelcomeMessage();
        }
    }

    updateUsersListActiveState(activeUsername) {
        const usersList = document.getElementById('users-list');
        const items = usersList.querySelectorAll('.user-item');
        
        items.forEach(item => {
            const usernameSpan = item.querySelector('.username');
            if (usernameSpan && usernameSpan.textContent === activeUsername) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    loadConversationHistory(otherUser) {
        if (this.socket && otherUser) {
            this.socket.emit('get_conversation', {
                user1: this.currentUser,
                user2: otherUser
            });
        }
    }

    displayConversationHistory(messages) {
        const messagesContainer = document.getElementById('messages-container');
        messagesContainer.innerHTML = '';
        
        if (messages.length === 0) {
            this.showWelcomeMessage('Start a new conversation with ' + this.selectedReceiver);
            return;
        }
        
        messages.forEach(message => this.displayMessage(message));
        
        setTimeout(() => {
            this.scrollToBottom(true);
        }, 100);
    }

    sendMessage() {
        const messageInput = document.getElementById('message-input');
        const message = messageInput.value.trim();
        
        if (!message || !this.selectedReceiver) return;
        
        this.socket.emit('send_message', {
            sender: this.currentUser,
            receiver: this.selectedReceiver,
            message: message
        });
        
        this.stopTyping();
        messageInput.value = '';
        messageInput.focus();
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
        
        if (message.sender === this.currentUser || 
            (message.sender === this.selectedReceiver && message.receiver === this.currentUser)) {
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
            typingIndicator.style.display = 'block';
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
            welcomeMessage.innerHTML = `<p>${customMessage}</p>`;
        } else {
            welcomeMessage.innerHTML = `
                <p>Welcome to Christian Et Celestin Chat!</p>
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
                <h1>Christian Et Celestin Chat</h1>
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
                <h1>Christian Et Celestin Chat</h1>
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
    new ChatApp();
});