class ChatApp {
    constructor() {
        this.socket = null;
        this.currentUser = null;
        this.selectedReceiver = null;
        this.typingTimer = null;
        this.currentConversation = null;
        this.isAtBottom = true;
        this.scrollThreshold = 100;
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // Login
        document.getElementById('login-btn').addEventListener('click', () => this.login());
        document.getElementById('username-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.login();
        });

        // Logout
        document.getElementById('logout-btn').addEventListener('click', () => this.logout());

        // Message sending
        document.getElementById('send-btn').addEventListener('click', () => this.sendMessage());
        document.getElementById('message-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });

        // Typing indicators
        document.getElementById('message-input').addEventListener('input', () => this.handleTyping());
        
        // Receiver selection
        document.getElementById('receiver-select').addEventListener('change', (e) => {
            this.selectReceiver(e.target.value);
        });
    }

    initializeScrollHandler() {
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) return;

        // Create scroll to bottom button
        this.createScrollToBottomButton();
        
        // Track scroll position
        messagesContainer.addEventListener('scroll', () => {
            this.handleScroll();
        });
    }

    createScrollToBottomButton() {
        // Remove existing button if any
        const existingBtn = document.querySelector('.scroll-to-bottom');
        if (existingBtn) {
            existingBtn.remove();
        }

        const button = document.createElement('button');
        button.className = 'scroll-to-bottom';
        button.innerHTML = '↓';
        button.title = 'Scroll to bottom';
        button.addEventListener('click', () => {
            this.scrollToBottom(true);
        });
        
        const chatArea = document.querySelector('.chat-area');
        if (chatArea) {
            chatArea.appendChild(button);
            this.scrollToBottomBtn = button;
        }
    }

    handleScroll() {
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) return;

        const scrollTop = messagesContainer.scrollTop;
        const scrollHeight = messagesContainer.scrollHeight;
        const clientHeight = messagesContainer.clientHeight;
        
        // Check if user is at the bottom
        this.isAtBottom = (scrollHeight - scrollTop - clientHeight) <= this.scrollThreshold;
        
        // Show/hide scroll to bottom button
        if (this.scrollToBottomBtn) {
            if (this.isAtBottom) {
                this.scrollToBottomBtn.classList.remove('show');
            } else {
                this.scrollToBottomBtn.classList.add('show');
            }
        }
    }

    scrollToBottom(instant = false) {
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) return;

        if (instant) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        } else {
            messagesContainer.scrollTo({
                top: messagesContainer.scrollHeight,
                behavior: 'smooth'
            });
        }
        this.isAtBottom = true;
        
        // Hide scroll to bottom button
        if (this.scrollToBottomBtn) {
            this.scrollToBottomBtn.classList.remove('show');
        }
    }

    login() {
        const usernameInput = document.getElementById('username-input');
        const loginBtn = document.getElementById('login-btn');
        const username = usernameInput.value.trim();

        if (!username) {
            this.showLoginError('Please enter a username');
            return;
        }

        if (username.length < 2) {
            this.showLoginError('Username must be at least 2 characters long');
            return;
        }

        // Disable login button and show loading state
        loginBtn.disabled = true;
        loginBtn.textContent = 'Joining...';
        this.showLoadingScreen();

        // Connect after a small delay to show loading animation
        setTimeout(() => {
            this.connectToSocket(username);
        }, 1000);
    }

    showLoadingScreen() {
        const loginScreen = document.getElementById('login-screen');
        const loadingHTML = `
            <div class="loading-container">
                <div class="loading-spinner"></div>
                <div class="loading-text">Launching Christian Et Celestin Chat...</div>
            </div>
        `;
        
        loginScreen.innerHTML = loadingHTML;
    }

    connectToSocket(username) {
        this.socket = io();

        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.socket.emit('login', { username });
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
        });

        this.socket.on('login_success', (data) => {
            this.currentUser = data.username;
            this.showChatScreen(data.users);
        });

        this.socket.on('login_failed', (data) => {
            this.showLoginError(data.message);
            this.hideLoadingScreen();
        });

        this.socket.on('user_joined', (data) => {
            this.addUserToList(data.username);
            this.showSystemMessage(`${data.username} joined the chat`);
        });

        this.socket.on('user_left', (data) => {
            this.removeUserFromList(data.username);
            this.showSystemMessage(`${data.username} left the chat`);
        });

        this.socket.on('new_message', (data) => {
            // Only display if message is for current conversation
            if (this.isMessageForCurrentConversation(data)) {
                this.displayMessage(data);
                
                // Auto-scroll to bottom if user is near bottom
                if (this.isAtBottom) {
                    setTimeout(() => this.scrollToBottom(), 100);
                }
            }
        });

        this.socket.on('conversation_history', (data) => {
            if (data.user1 === this.currentUser && data.user2 === this.selectedReceiver ||
                data.user2 === this.currentUser && data.user1 === this.selectedReceiver) {
                this.displayConversationHistory(data.messages);
                
                // Scroll to bottom after loading history
                setTimeout(() => this.scrollToBottom(true), 200);
            }
        });

        this.socket.on('user_typing', (data) => {
            this.showTypingIndicator(data.sender, data.is_typing);
        });
    }

    hideLoadingScreen() {
        // Reset login screen
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
        
        // Re-initialize event listeners for the new elements
        document.getElementById('login-btn').addEventListener('click', () => this.login());
        document.getElementById('username-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.login();
        });
        
        // Focus on input
        document.getElementById('username-input').focus();
    }

    showLoginError(message) {
        // This will be called after we reset the login screen
        setTimeout(() => {
            const errorElement = document.getElementById('login-error');
            if (errorElement) {
                errorElement.textContent = message;
                setTimeout(() => {
                    errorElement.textContent = '';
                }, 3000);
            }
        }, 100);
    }

    showChatScreen(users) {
        document.getElementById('login-screen').classList.remove('active');
        document.getElementById('chat-screen').classList.add('active');
        
        document.getElementById('current-user').textContent = this.currentUser;
        
        this.populateUsersList(users);
        this.showWelcomeMessage();
        
        // Initialize scroll handler for the new messages container
        setTimeout(() => {
            this.initializeScrollHandler();
            this.scrollToBottom(true);
        }, 100);
    }

    populateUsersList(users) {
        const usersList = document.getElementById('users-list');
        const receiverSelect = document.getElementById('receiver-select');
        
        if (!usersList || !receiverSelect) return;
        
        usersList.innerHTML = '';
        receiverSelect.innerHTML = '<option value="">Select a user to chat with</option>';
        
        users.forEach(user => {
            if (user !== this.currentUser) {
                // Add to sidebar
                const li = document.createElement('li');
                li.textContent = user;
                li.addEventListener('click', () => this.selectReceiver(user));
                usersList.appendChild(li);
                
                // Add to dropdown
                const option = document.createElement('option');
                option.value = user;
                option.textContent = user;
                receiverSelect.appendChild(option);
            }
        });
    }

    addUserToList(username) {
        if (username === this.currentUser) return;
        
        const usersList = document.getElementById('users-list');
        const receiverSelect = document.getElementById('receiver-select');
        
        if (!usersList || !receiverSelect) return;
        
        // Add to sidebar
        const li = document.createElement('li');
        li.textContent = username;
        li.addEventListener('click', () => this.selectReceiver(username));
        usersList.appendChild(li);
        
        // Add to dropdown
        const option = document.createElement('option');
        option.value = username;
        option.textContent = username;
        receiverSelect.appendChild(option);
    }

    removeUserFromList(username) {
        const usersList = document.getElementById('users-list');
        const receiverSelect = document.getElementById('receiver-select');
        
        if (!usersList || !receiverSelect) return;
        
        // Remove from sidebar
        const listItems = usersList.getElementsByTagName('li');
        for (let i = 0; i < listItems.length; i++) {
            if (listItems[i].textContent === username) {
                usersList.removeChild(listItems[i]);
                break;
            }
        }
        
        // Remove from dropdown
        const options = receiverSelect.getElementsByTagName('option');
        for (let i = 0; i < options.length; i++) {
            if (options[i].value === username) {
                receiverSelect.removeChild(options[i]);
                break;
            }
        }
        
        // If the removed user was selected, clear selection
        if (this.selectedReceiver === username) {
            this.selectReceiver('');
        }
    }

    selectReceiver(username) {
        this.selectedReceiver = username;
        this.currentConversation = username ? [this.currentUser, username].sort().join('_') : null;
        
        // Update UI
        const receiverSelect = document.getElementById('receiver-select');
        if (receiverSelect) {
            receiverSelect.value = username;
        }
        
        // Highlight selected user in sidebar
        const usersList = document.getElementById('users-list');
        if (usersList) {
            const listItems = usersList.getElementsByTagName('li');
            for (let i = 0; i < listItems.length; i++) {
                listItems[i].classList.remove('active');
                if (listItems[i].textContent === username) {
                    listItems[i].classList.add('active');
                }
            }
        }
        
        // Enable/disable message input
        const messageInput = document.getElementById('message-input');
        const sendBtn = document.getElementById('send-btn');
        
        if (username && messageInput && sendBtn) {
            messageInput.disabled = false;
            sendBtn.disabled = false;
            messageInput.focus();
            
            // Load conversation history for these two users only
            this.loadConversationHistory(username);
        } else if (messageInput && sendBtn) {
            messageInput.disabled = true;
            sendBtn.disabled = true;
            this.showWelcomeMessage();
        }
        
        // Clear typing indicator
        this.showTypingIndicator('', false);
        
        // Scroll to bottom when selecting a user
        setTimeout(() => this.scrollToBottom(true), 200);
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
        if (!messagesContainer) return;
        
        messagesContainer.innerHTML = '';
        
        if (messages.length === 0) {
            this.showWelcomeMessage('Start a new conversation with ' + this.selectedReceiver);
            return;
        }
        
        messages.forEach(message => this.displayMessage(message));
    }

    isMessageForCurrentConversation(message) {
        if (!this.selectedReceiver) return false;
        
        return (message.sender === this.currentUser && message.receiver === this.selectedReceiver) ||
               (message.sender === this.selectedReceiver && message.receiver === this.currentUser);
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
        
        // Clear input and stop typing indicator
        messageInput.value = '';
        this.stopTyping();
        
        // Focus back on input
        messageInput.focus();
    }

    displayMessage(message) {
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) return;
        
        // Hide welcome message if it's visible
        const welcomeMessage = messagesContainer.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.style.display = 'none';
        }
        
        const messageElement = document.createElement('div');
        messageElement.className = `message ${message.sender === this.currentUser ? 'sent' : 'received'}`;
        
        const time = new Date(message.timestamp).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false 
        });
        
        messageElement.innerHTML = `
            <div class="message-header">${message.sender}</div>
            <div class="message-text">${this.escapeHtml(message.text)}</div>
            <div class="message-time">${time}</div>
        `;
        
        messagesContainer.appendChild(messageElement);
    }

    showWelcomeMessage(customMessage = null) {
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) return;
        
        messagesContainer.innerHTML = '';
        
        const welcomeMessage = document.createElement('div');
        welcomeMessage.className = 'welcome-message';
        
        if (customMessage) {
            welcomeMessage.innerHTML = `
                <p>${customMessage}</p>
                <p>Your conversation is private and secure 🔒</p>
            `;
        } else {
            welcomeMessage.innerHTML = `
                <p>Welcome to Christian Et Celestin Chat!</p>
                <p>Select a user to start a private conversation 🔒</p>
            `;
        }
        
        messagesContainer.appendChild(welcomeMessage);
    }

    showSystemMessage(text) {
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) return;
        
        const systemMessage = document.createElement('div');
        systemMessage.className = 'message system-message';
        systemMessage.style.cssText = `
            text-align: center;
            color: #6c757d;
            font-style: italic;
            background: transparent;
            border: none;
            max-width: 100%;
            margin: 1rem 0;
            font-size: 0.9rem;
        `;
        systemMessage.textContent = text;
        
        messagesContainer.appendChild(systemMessage);
        this.scrollToBottom();
    }

    handleTyping() {
        if (!this.selectedReceiver) return;
        
        // Start typing indicator
        this.socket.emit('typing', {
            sender: this.currentUser,
            receiver: this.selectedReceiver,
            is_typing: true
        });
        
        // Clear previous timer
        if (this.typingTimer) {
            clearTimeout(this.typingTimer);
        }
        
        // Set timer to stop typing indicator
        this.typingTimer = setTimeout(() => {
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
        
        if (this.typingTimer) {
            clearTimeout(this.typingTimer);
            this.typingTimer = null;
        }
    }

    showTypingIndicator(sender, isTyping) {
        const typingIndicator = document.getElementById('typing-indicator');
        const typingUser = document.getElementById('typing-user');
        
        if (typingIndicator && typingUser) {
            if (isTyping && sender === this.selectedReceiver) {
                typingUser.textContent = sender;
                typingIndicator.style.display = 'block';
                
                // Auto-scroll to bottom when someone is typing
                if (this.isAtBottom) {
                    this.scrollToBottom();
                }
            } else {
                typingIndicator.style.display = 'none';
            }
        }
    }

    logout() {
        if (this.socket) {
            this.socket.disconnect();
        }
        
        this.currentUser = null;
        this.selectedReceiver = null;
        this.currentConversation = null;
        
        document.getElementById('chat-screen').classList.remove('active');
        document.getElementById('login-screen').classList.add('active');
        
        // Reset login screen
        this.hideLoadingScreen();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize the chat app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new ChatApp();
});