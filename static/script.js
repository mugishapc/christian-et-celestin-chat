class ChatApp {
    constructor() {
        this.socket = null;
        this.currentUser = null;
        this.selectedReceiver = null;
        this.typingTimer = null;
        this.currentConversation = null;
        
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
        const username = usernameInput.value.trim();

        if (!username) {
            this.showLoginError('Please enter a username');
            return;
        }

        if (username.length < 2) {
            this.showLoginError('Username must be at least 2 characters long');
            return;
        }

        this.connectToSocket(username);
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
            }
        });

        this.socket.on('conversation_history', (data) => {
            if (data.user1 === this.currentUser && data.user2 === this.selectedReceiver ||
                data.user2 === this.currentUser && data.user1 === this.selectedReceiver) {
                this.displayConversationHistory(data.messages);
            }
        });

        this.socket.on('user_typing', (data) => {
            this.showTypingIndicator(data.sender, data.is_typing);
        });
    }

    showLoginError(message) {
        const errorElement = document.getElementById('login-error');
        errorElement.textContent = message;
        setTimeout(() => {
            errorElement.textContent = '';
        }, 3000);
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
        document.getElementById('receiver-select').value = username;
        
        // Highlight selected user in sidebar
        const usersList = document.getElementById('users-list');
        const listItems = usersList.getElementsByTagName('li');
        for (let i = 0; i < listItems.length; i++) {
            listItems[i].classList.remove('active');
            if (listItems[i].textContent === username) {
                listItems[i].classList.add('active');
            }
        }
        
        // Enable/disable message input
        const messageInput = document.getElementById('message-input');
        const sendBtn = document.getElementById('send-btn');
        
        if (username) {
            messageInput.disabled = false;
            sendBtn.disabled = false;
            messageInput.focus();
            
            // Load conversation history for these two users only
            this.loadConversationHistory(username);
        } else {
            messageInput.disabled = true;
            sendBtn.disabled = true;
            this.showWelcomeMessage();
        }
        
        // Clear typing indicator
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
        
        // Clear input and stop typing indicator
        messageInput.value = '';
        this.stopTyping();
    }

    displayMessage(message) {
        const messagesContainer = document.getElementById('messages-container');
        
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
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
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
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
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
        this.currentConversation = null;
        
        document.getElementById('chat-screen').classList.remove('active');
        document.getElementById('login-screen').classList.add('active');
        document.getElementById('username-input').value = '';
        document.getElementById('username-input').focus();
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
    
    // Prevent zoom on mobile input focus
    document.addEventListener('touchstart', function() {}, {passive: true});
});