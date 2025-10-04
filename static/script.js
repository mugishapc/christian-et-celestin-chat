class ChatApp {
    constructor() {
        this.socket = null;
        this.currentUser = null;
        this.selectedReceiver = null;
        this.typingTimer = null;
        
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
            if (this.isMessageForCurrentConversation(data)) {
                this.displayMessage(data);
                this.scrollToBottom();
            }
        });

        this.socket.on('conversation_history', (data) => {
            if (data.user1 === this.currentUser && data.user2 === this.selectedReceiver ||
                data.user2 === this.currentUser && data.user1 === this.selectedReceiver) {
                this.displayConversationHistory(data.messages);
                this.scrollToBottom();
            }
        });

        this.socket.on('user_typing', (data) => {
            this.showTypingIndicator(data.sender, data.is_typing);
        });
    }

    hideLoadingScreen() {
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

    showLoginError(message) {
        setTimeout(() => {
            const errorElement = document.getElementById('login-error');
            if (errorElement) {
                errorElement.textContent = message;
            }
        }, 100);
    }

    showChatScreen(users) {
        document.getElementById('login-screen').classList.remove('active');
        document.getElementById('chat-screen').classList.add('active');
        
        document.getElementById('current-user').textContent = this.currentUser;
        
        this.populateUsersList(users);
        this.showWelcomeMessage();
    }

    populateUsersList(users) {
        const usersList = document.getElementById('users-list');
        const receiverSelect = document.getElementById('receiver-select');
        
        usersList.innerHTML = '';
        receiverSelect.innerHTML = '<option value="">Select a user to chat with</option>';
        
        users.forEach(user => {
            if (user !== this.currentUser) {
                const li = document.createElement('li');
                li.textContent = user;
                li.addEventListener('click', () => this.selectReceiver(user));
                usersList.appendChild(li);
                
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
        
        const li = document.createElement('li');
        li.textContent = username;
        li.addEventListener('click', () => this.selectReceiver(username));
        usersList.appendChild(li);
        
        const option = document.createElement('option');
        option.value = username;
        option.textContent = username;
        receiverSelect.appendChild(option);
    }

    removeUserFromList(username) {
        const usersList = document.getElementById('users-list');
        const receiverSelect = document.getElementById('receiver-select');
        
        const listItems = usersList.getElementsByTagName('li');
        for (let i = 0; i < listItems.length; i++) {
            if (listItems[i].textContent === username) {
                usersList.removeChild(listItems[i]);
                break;
            }
        }
        
        const options = receiverSelect.getElementsByTagName('option');
        for (let i = 0; i < options.length; i++) {
            if (options[i].value === username) {
                receiverSelect.removeChild(options[i]);
                break;
            }
        }
        
        if (this.selectedReceiver === username) {
            this.selectReceiver('');
        }
    }

    selectReceiver(username) {
        this.selectedReceiver = username;
        
        document.getElementById('receiver-select').value = username;
        
        const usersList = document.getElementById('users-list');
        const listItems = usersList.getElementsByTagName('li');
        for (let i = 0; i < listItems.length; i++) {
            listItems[i].classList.remove('active');
            if (listItems[i].textContent === username) {
                listItems[i].classList.add('active');
            }
        }
        
        const messageInput = document.getElementById('message-input');
        const sendBtn = document.getElementById('send-btn');
        
        if (username) {
            messageInput.disabled = false;
            sendBtn.disabled = false;
            messageInput.focus();
            
            this.loadConversationHistory(username);
        } else {
            messageInput.disabled = true;
            sendBtn.disabled = true;
            this.showWelcomeMessage();
        }
        
        this.showTypingIndicator('', false);
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
        
        messageInput.value = '';
        this.stopTyping();
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
    }

    scrollToBottom() {
        const messagesContainer = document.getElementById('messages-container');
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    showWelcomeMessage(customMessage = null) {
        const messagesContainer = document.getElementById('messages-container');
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
        this.scrollToBottom();
    }

    showSystemMessage(text) {
        const messagesContainer = document.getElementById('messages-container');
        
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
        
        this.socket.emit('typing', {
            sender: this.currentUser,
            receiver: this.selectedReceiver,
            is_typing: true
        });
        
        if (this.typingTimer) {
            clearTimeout(this.typingTimer);
        }
        
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
        
        if (isTyping && sender === this.selectedReceiver) {
            typingUser.textContent = sender;
            typingIndicator.style.display = 'block';
        } else {
            typingIndicator.style.display = 'none';
        }
    }

    logout() {
        if (this.socket) {
            this.socket.disconnect();
        }
        
        this.currentUser = null;
        this.selectedReceiver = null;
        
        document.getElementById('chat-screen').classList.remove('active');
        document.getElementById('login-screen').classList.add('active');
        
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