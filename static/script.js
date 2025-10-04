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
    }

    initializeScrollSystem() {
        // Initialize scroll handling after DOM is ready
        setTimeout(() => {
            const messagesContainer = document.getElementById('messages-container');
            if (messagesContainer) {
                messagesContainer.addEventListener('scroll', () => this.handleScroll());
                
                // Force scrollable container
                messagesContainer.style.overflowY = 'auto';
                messagesContainer.style.webkitOverflowScrolling = 'touch';
                
                this.createScrollToBottomButton();
            }
        }, 100);
    }

    createScrollToBottomButton() {
        if (this.scrollToBottomBtn) return;
        
        const scrollBtn = document.createElement('button');
        scrollBtn.className = 'scroll-to-bottom';
        scrollBtn.innerHTML = '↓';
        scrollBtn.title = 'Scroll to bottom';
        scrollBtn.style.display = 'none';
        scrollBtn.addEventListener('click', () => {
            this.scrollToBottom(true);
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
        
        if (this.scrollToBottomBtn) {
            this.scrollToBottomBtn.style.display = this.isAtBottom ? 'none' : 'flex';
        }
    }

    scrollToBottom(force = false) {
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) return;

        if (force || this.isAtBottom) {
            setTimeout(() => {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }, 50);
            
            setTimeout(() => {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }, 100);
            
            if (this.scrollToBottomBtn) {
                this.scrollToBottomBtn.style.display = 'none';
            }
            this.isAtBottom = true;
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
            this.initializeScrollSystem();
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
    }

    addUserToUI(username, usersList, receiverSelect, isOnline) {
        // Add to users list
        const li = document.createElement('li');
        li.innerHTML = `<span class="user-status">${isOnline ? '🟢' : '⚫'}</span>
                       <span class="username">${username}</span>`;
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
            li.querySelector('.username').textContent === username
        );
        
        if (!existingUser) {
            this.addUserToUI(username, usersList, receiverSelect, isOnline);
        } else {
            // Update online status
            const statusSpan = existingUser.querySelector('.user-status');
            statusSpan.textContent = isOnline ? '🟢' : '⚫';
            
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
        const userItem = userItems.find(li => 
            li.querySelector('.username').textContent === username
        );
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
            const username = item.querySelector('.username').textContent;
            if (username === activeUsername) {
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
        if (message.sender === this.currentUser || message.receiver === this.currentUser) {
            this.scrollToBottom(true);
        }
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

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ChatApp();
});