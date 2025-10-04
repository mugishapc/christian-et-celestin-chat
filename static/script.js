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
        this.forceScrollFix();
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

        // Add scroll event listener for manual scrolling detection
        this.initializeScrollHandling();
    }

    forceScrollFix() {
        // ULTRA POWERFUL SCROLLING FIXES
        setTimeout(() => {
            this.applyNuclearScrollFixes();
        }, 100);
        
        // Prevent any browser interference
        document.addEventListener('touchmove', (e) => {
            e.stopPropagation();
        }, { passive: false });
        
        // Prevent elastic scroll on body
        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.width = '100%';
        document.body.style.height = '100%';
    }

    applyNuclearScrollFixes() {
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) return;

        // NUCLEAR APPROACH TO FORCE SCROLLING
        messagesContainer.style.overflowY = 'scroll';
        messagesContainer.style.webkitOverflowScrolling = 'touch';
        messagesContainer.style.height = '100%';
        messagesContainer.style.maxHeight = 'none';
        messagesContainer.style.minHeight = '100px';
        
        // Force hardware acceleration
        messagesContainer.style.transform = 'translateZ(0)';
        messagesContainer.style.webkitTransform = 'translateZ(0)';
        
        // Create and manage scroll-to-bottom button
        this.createScrollToBottomButton();
        
        console.log('🚀 NUCLEAR SCROLLING ACTIVATED');
    }

    createScrollToBottomButton() {
        const scrollBtn = document.createElement('button');
        scrollBtn.className = 'scroll-to-bottom';
        scrollBtn.innerHTML = '↓';
        scrollBtn.title = 'Scroll to bottom';
        scrollBtn.addEventListener('click', () => {
            this.scrollToBottom(true);
            scrollBtn.style.display = 'none';
        });
        
        document.querySelector('.chat-area').appendChild(scrollBtn);
        this.scrollToBottomBtn = scrollBtn;
    }

    initializeScrollHandling() {
        // This will be called once the messages container is available
        setTimeout(() => {
            const messagesContainer = document.getElementById('messages-container');
            if (messagesContainer) {
                messagesContainer.addEventListener('scroll', () => this.handleScroll());
                
                // ENABLE TOUCH SCROLLING - NUCLEAR APPROACH
                messagesContainer.style.webkitOverflowScrolling = 'touch';
                messagesContainer.style.overflowY = 'scroll';
                messagesContainer.style.overflowX = 'hidden';
                
                // Force scrollbar visibility
                this.ensureScrollbarVisibility();
                
                // Add touch events for mobile
                this.addTouchScrollEvents(messagesContainer);
            }
        }, 500);
    }

    addTouchScrollEvents(container) {
        let startY = 0;
        let scrollTop = 0;
        
        container.addEventListener('touchstart', (e) => {
            startY = e.touches[0].pageY;
            scrollTop = container.scrollTop;
        }, { passive: true });

        container.addEventListener('touchmove', (e) => {
            if (!container.scrollHeight > container.clientHeight) return;
            
            const touchY = e.touches[0].pageY;
            const diff = startY - touchY;
            container.scrollTop = scrollTop + diff;
            
            e.preventDefault();
        }, { passive: false });
    }

    handleScroll() {
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) return;

        this.isScrolling = true;
        
        // Calculate if user is at bottom
        const threshold = 100; // pixels from bottom
        const currentPosition = messagesContainer.scrollTop + messagesContainer.clientHeight;
        const maxPosition = messagesContainer.scrollHeight;
        
        this.isAtBottom = (maxPosition - currentPosition) <= threshold;
        
        // Show/hide scroll to bottom button
        if (this.scrollToBottomBtn) {
            this.scrollToBottomBtn.style.display = this.isAtBottom ? 'none' : 'flex';
        }
        
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
                // Add content to ensure scrollability
                messagesContainer.style.minHeight = 'calc(100% + 2px)';
            }
        };

        // Check repeatedly
        checkScrollbar();
        const interval = setInterval(checkScrollbar, 1000);
        setTimeout(() => clearInterval(interval), 10000);
    }

    scrollToBottom(force = false) {
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) return;

        // ULTRA RELIABLE SCROLLING
        const scroll = () => {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            
            // Multiple attempts for reliability
            setTimeout(() => {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }, 50);
            
            setTimeout(() => {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }, 100);
            
            setTimeout(() => {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
                this.isAtBottom = true;
                if (this.scrollToBottomBtn) {
                    this.scrollToBottomBtn.style.display = 'none';
                }
            }, 150);
        };

        if (force || !this.isScrolling || this.isAtBottom) {
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
        
        // NUCLEAR SCROLLING INITIALIZATION
        setTimeout(() => {
            this.applyNuclearScrollFixes();
            this.initializeScrollHandling();
            this.ensureScrollbarVisibility();
            this.scrollToBottom(true);
        }, 100);
    }

    populateUsersList(onlineUsers, allUsers) {
        const usersList = document.getElementById('users-list');
        const receiverSelect = document.getElementById('receiver-select');
        
        usersList.innerHTML = '';
        receiverSelect.innerHTML = '<option value="">Select a user to chat with</option>';
        
        // Add online users first
        if (onlineUsers && onlineUsers.length > 0) {
            const onlineHeader = document.createElement('li');
            onlineHeader.innerHTML = '<strong>🟢 Online Users</strong>';
            onlineHeader.style.background = 'none';
            onlineHeader.style.borderLeft = 'none';
            onlineHeader.style.cursor = 'default';
            onlineHeader.style.padding = '0.5rem';
            onlineHeader.style.color = '#667eea';
            usersList.appendChild(onlineHeader);
            
            onlineUsers.forEach(user => {
                if (user !== this.currentUser) {
                    this.addUserToUI(user, usersList, receiverSelect, true);
                }
            });
        }
        
        // Add all users (including offline)
        if (allUsers && allUsers.length > 0) {
            const allHeader = document.createElement('li');
            allHeader.innerHTML = '<strong>👥 All Users</strong>';
            allHeader.style.background = 'none';
            allHeader.style.borderLeft = 'none';
            allHeader.style.cursor = 'default';
            allHeader.style.padding = '0.5rem';
            allHeader.style.color = '#667eea';
            allHeader.style.marginTop = '1rem';
            usersList.appendChild(allHeader);
            
            allUsers.forEach(user => {
                if (user !== this.currentUser && (!onlineUsers || !onlineUsers.includes(user))) {
                    this.addUserToUI(user, usersList, receiverSelect, false);
                }
            });
        }
    }

    addUserToUI(username, usersList, receiverSelect, isOnline) {
        // Add to users list
        const li = document.createElement('li');
        li.textContent = `${username} ${isOnline ? '🟢' : '⚫'}`;
        li.addEventListener('click', () => this.selectReceiver(username));
        if (!isOnline) {
            li.style.opacity = '0.7';
        }
        usersList.appendChild(li);
        
        // Add to receiver select
        const option = document.createElement('option');
        option.value = username;
        option.textContent = `${username} ${isOnline ? '(online)' : '(offline)'}`;
        receiverSelect.appendChild(option);
    }

    addUserToList(username, isOnline) {
        if (username === this.currentUser) return;
        
        const usersList = document.getElementById('users-list');
        const receiverSelect = document.getElementById('receiver-select');
        
        // Check if user already exists in the list
        const existingUser = Array.from(usersList.children).find(li => 
            li.textContent.includes(username)
        );
        
        if (!existingUser) {
            this.addUserToUI(username, usersList, receiverSelect, isOnline);
        } else {
            // Update online status
            existingUser.textContent = `${username} ${isOnline ? '🟢' : '⚫'}`;
            if (!isOnline) {
                existingUser.style.opacity = '0.7';
            } else {
                existingUser.style.opacity = '1';
            }
            
            // Update select option
            const options = Array.from(receiverSelect.options);
            const existingOption = options.find(opt => opt.value === username);
            if (existingOption) {
                existingOption.textContent = `${username} ${isOnline ? '(online)' : '(offline)'}`;
            }
        }
    }

    removeUserFromList(username) {
        const usersList = document.getElementById('users-list');
        const receiverSelect = document.getElementById('receiver-select');
        
        // Remove from users list
        const userItems = Array.from(usersList.children);
        const userItem = userItems.find(li => li.textContent.includes(username));
        if (userItem) {
            userItem.remove();
        }
        
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
    }

    selectReceiver(username) {
        this.selectedReceiver = username;
        
        // Update UI
        document.getElementById('receiver-select').value = username;
        
        const messageInput = document.getElementById('message-input');
        const sendBtn = document.getElementById('send-btn');
        
        if (username) {
            messageInput.disabled = false;
            sendBtn.disabled = false;
            messageInput.focus();
            
            this.loadConversationHistory(username);
            
            // Update active state in users list
            this.updateUsersListActiveState(username);
        } else {
            messageInput.disabled = true;
            sendBtn.disabled = true;
            this.showWelcomeMessage();
        }
    }

    updateUsersListActiveState(activeUsername) {
        const usersList = document.getElementById('users-list');
        const items = usersList.querySelectorAll('li');
        
        items.forEach(item => {
            if (item.textContent.includes(activeUsername)) {
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
        
        // ULTRA RELIABLE SCROLLING AFTER HISTORY LOAD
        setTimeout(() => {
            this.scrollToBottom(true);
            this.ensureScrollbarVisibility();
        }, 200);
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
        
        // Stop typing indicator
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
        
        // Scroll to bottom when new message is added
        const shouldScroll = message.sender === this.currentUser || 
                           (message.sender === this.selectedReceiver && message.receiver === this.currentUser);
        
        if (shouldScroll) {
            this.scrollToBottom(true);
        }
        
        // Ensure scrollbar remains visible
        this.ensureScrollbarVisibility();
    }

    handleTyping() {
        if (!this.selectedReceiver) return;
        
        // Emit typing start
        this.socket.emit('typing', {
            sender: this.currentUser,
            receiver: this.selectedReceiver,
            is_typing: true
        });
        
        // Clear existing timeout
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
        }
        
        // Set timeout to stop typing indicator
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
        // Reset to login screen and show error
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
        
        // Re-attach event listeners
        document.getElementById('login-btn').addEventListener('click', () => this.login());
        document.getElementById('username-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.login();
        });
        
        // Focus on input
        document.getElementById('username-input').focus();
    }

    logout() {
        if (this.socket) {
            this.socket.disconnect();
        }
        
        this.currentUser = null;
        this.selectedReceiver = null;
        
        document.getElementById('chat-screen').classList.remove('active');
        document.getElementById('login-screen').classList.add('active');
        
        // Reset login form
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
        
        // Re-attach event listeners
        document.getElementById('login-btn').addEventListener('click', () => this.login());
        document.getElementById('username-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.login();
        });
        
        // Focus on input
        document.getElementById('username-input').focus();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// NUCLEAR INITIALIZATION - FORCE SCROLLING TO WORK
document.addEventListener('DOMContentLoaded', () => {
    // Prevent any browser interference
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = '100%';
    
    const app = new ChatApp();
    
    // Additional nuclear scroll fixes
    setTimeout(() => {
        const messagesContainer = document.getElementById('messages-container');
        if (messagesContainer) {
            messagesContainer.style.overflowY = 'scroll';
            messagesContainer.style.webkitOverflowScrolling = 'touch';
        }
    }, 1000);
});

// Prevent elastic scroll on entire page
document.addEventListener('touchmove', function(e) {
    e.preventDefault();
}, { passive: false });

console.log('🚀 ULTRA POWERFUL SCROLLING INITIALIZED - READY FOR WHATSAPP-LEVEL PERFORMANCE!');