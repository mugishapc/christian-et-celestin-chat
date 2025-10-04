class ChatApp {
    constructor() {
        this.socket = null;
        this.currentUser = null;
        this.selectedReceiver = null;
        this.isScrolling = false;
        this.scrollTimeout = null;
        this.typingTimeout = null;
        this.isAtBottom = true;
        this.isLoadingMessages = false;
        this.hasMoreMessages = true;
        this.messageOffset = 0;
        this.MESSAGES_PER_LOAD = 20;
        this.allMessages = [];
        this.loadedMessageIds = new Set();
        
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
        setTimeout(() => {
            this.setupMessagesContainer();
        }, 100);
        
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
    }

    setupMessagesContainer() {
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) return;

        messagesContainer.style.overflowY = 'auto';
        messagesContainer.style.webkitOverflowScrolling = 'touch';
        messagesContainer.style.height = '100%';
        
        // Add scroll event listener for loading old messages
        messagesContainer.addEventListener('scroll', () => this.handleWhatsAppScroll());
        
        this.createScrollToBottomButton();
        this.ensurePerfectScrollbar();
    }

    createScrollToBottomButton() {
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

        // Calculate if user is at bottom
        const threshold = 50;
        const currentPosition = messagesContainer.scrollTop + messagesContainer.clientHeight;
        const maxPosition = messagesContainer.scrollHeight;
        
        this.isAtBottom = (maxPosition - currentPosition) <= threshold;
        
        // Show/hide scroll to bottom button
        if (this.scrollToBottomBtn) {
            this.scrollToBottomBtn.style.display = this.isAtBottom ? 'none' : 'flex';
        }

        // Load more messages when scrolling to top (SCROLL UP TO SEE OLD MESSAGES)
        if (messagesContainer.scrollTop < 200 && this.hasMoreMessages && !this.isLoadingMessages) {
            this.loadOlderMessages();
        }
    }

    loadOlderMessages() {
        if (!this.selectedReceiver || this.isLoadingMessages || !this.hasMoreMessages) return;

        this.isLoadingMessages = true;
        this.showLoadingOldMessages();

        // Simulate loading delay for better UX
        setTimeout(() => {
            this.socket.emit('load_older_messages', {
                user1: this.currentUser,
                user2: this.selectedReceiver,
                offset: this.messageOffset,
                limit: this.MESSAGES_PER_LOAD
            });
        }, 300);
    }

    showLoadingOldMessages() {
        const messagesContainer = document.getElementById('messages-container');
        const loadingIndicator = document.createElement('div');
        loadingIndicator.className = 'loading-old-messages';
        loadingIndicator.innerHTML = `
            <div class="loading-spinner-small"></div>
            <span>Loading older messages...</span>
        `;
        
        // Insert at the top of messages container
        if (messagesContainer.firstChild) {
            messagesContainer.insertBefore(loadingIndicator, messagesContainer.firstChild);
        } else {
            messagesContainer.appendChild(loadingIndicator);
        }
    }

    hideLoadingOldMessages() {
        const loadingIndicator = document.querySelector('.loading-old-messages');
        if (loadingIndicator) {
            loadingIndicator.remove();
        }
    }

    ensurePerfectScrollbar() {
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) return;

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

        if (force || this.isAtBottom) {
            const scroll = () => {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
                
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
                if (this.isAtBottom) {
                    this.scrollToBottom();
                }
            }
        });

        this.socket.on('conversation_history', (data) => {
            this.displayConversationHistory(data.messages);
            this.scrollToBottom(true);
        });

        this.socket.on('older_messages_loaded', (data) => {
            this.displayOlderMessages(data.messages, data.has_more);
        });

        this.socket.on('user_typing', (data) => {
            this.showTypingIndicator(data.sender, data.is_typing);
        });
    }

    showChatScreen(onlineUsers, allUsers) {
        document.getElementById('login-screen').classList.remove('active');
        document.getElementById('chat-screen').classList.add('active');
        
        document.getElementById('current-user').textContent = this.currentUser;
        document.getElementById('mobile-current-user').textContent = this.currentUser;
        this.populateUsersList(onlineUsers, allUsers);
        this.showWelcomeMessage();
        
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
        
        if (onlineUsers && onlineUsers.length > 0) {
            onlineUsers.forEach(user => {
                if (user !== this.currentUser) {
                    this.addUserToUI(user, usersList, mobileUsersList, receiverSelect, mobileReceiverSelect, true);
                }
            });
        }
        
        if (allUsers && allUsers.length > 0) {
            allUsers.forEach(user => {
                if (user !== this.currentUser && (!onlineUsers || !onlineUsers.includes(user))) {
                    this.addUserToUI(user, usersList, mobileUsersList, receiverSelect, mobileReceiverSelect, false);
                }
            });
        }
    }

    addUserToUI(username, usersList, mobileUsersList, receiverSelect, mobileReceiverSelect, isOnline) {
        const li = document.createElement('li');
        li.className = 'user-item';
        li.innerHTML = `
            <div class="user-avatar">${username.charAt(0).toUpperCase()}</div>
            <div class="user-info-container">
                <div class="user-name">${username}</div>
                <div class="user-status-text ${isOnline ? 'online' : ''}">${isOnline ? 'Online' : 'Offline'}</div>
            </div>
            <div class="user-time"></div>
        `;
        li.addEventListener('click', () => {
            this.selectReceiver(username);
            this.closeMobileMenu();
        });
        usersList.appendChild(li);

        const mobileLi = li.cloneNode(true);
        mobileLi.addEventListener('click', () => {
            this.selectReceiver(username);
            this.closeMobileMenu();
        });
        mobileUsersList.appendChild(mobileLi);
        
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
        
        let userExists = this.updateExistingUser(username, isOnline, usersList);
        this.updateExistingUser(username, isOnline, mobileUsersList);
        
        if (!userExists) {
            this.addUserToUI(username, usersList, mobileUsersList, receiverSelect, mobileReceiverSelect, isOnline);
        }
        
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
                    statusDiv.className = `user-status-text ${isOnline ? 'online' : ''}`;
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
        // Reset message history when selecting new receiver
        this.messageOffset = 0;
        this.hasMoreMessages = true;
        this.allMessages = [];
        this.loadedMessageIds.clear();
        
        this.selectedReceiver = username;
        
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
                user2: otherUser,
                limit: this.MESSAGES_PER_LOAD
            });
        }
    }

    displayConversationHistory(messages) {
        const messagesContainer = document.getElementById('messages-container');
        messagesContainer.innerHTML = '';
        
        if (messages.length === 0) {
            this.showWelcomeMessage('Start a new conversation with ' + this.selectedReceiver);
            this.hasMoreMessages = false;
            return;
        }
        
        // Store all messages and mark as loaded
        this.allMessages = messages;
        messages.forEach(msg => this.loadedMessageIds.add(msg.id));
        
        // Check if we have more messages to load
        this.hasMoreMessages = messages.length === this.MESSAGES_PER_LOAD;
        this.messageOffset = messages.length;
        
        messages.forEach(message => this.displayMessage(message, true));
        
        setTimeout(() => {
            this.scrollToBottom(true);
            this.isLoadingMessages = false;
        }, 100);
    }

    displayOlderMessages(messages, hasMore) {
        this.hideLoadingOldMessages();
        
        if (messages.length === 0) {
            this.hasMoreMessages = false;
            this.isLoadingMessages = false;
            return;
        }
        
        const messagesContainer = document.getElementById('messages-container');
        const currentScrollHeight = messagesContainer.scrollHeight;
        const currentScrollTop = messagesContainer.scrollTop;
        
        // Filter out already loaded messages and add new ones
        const newMessages = messages.filter(msg => !this.loadedMessageIds.has(msg.id));
        
        if (newMessages.length > 0) {
            // Add to the beginning of all messages
            this.allMessages = [...newMessages, ...this.allMessages];
            newMessages.forEach(msg => this.loadedMessageIds.add(msg.id));
            
            // Display messages at the top
            newMessages.reverse().forEach(message => {
                this.displayMessage(message, true, true);
            });
            
            // Maintain scroll position
            setTimeout(() => {
                const newScrollHeight = messagesContainer.scrollHeight;
                messagesContainer.scrollTop = currentScrollTop + (newScrollHeight - currentScrollHeight);
            }, 50);
        }
        
        this.hasMoreMessages = hasMore;
        this.messageOffset += messages.length;
        this.isLoadingMessages = false;
        
        // Show message if no more messages
        if (!this.hasMoreMessages) {
            this.showNoMoreMessages();
        }
    }

    showNoMoreMessages() {
        const messagesContainer = document.getElementById('messages-container');
        const noMoreMessages = document.createElement('div');
        noMoreMessages.className = 'no-more-messages';
        noMoreMessages.innerHTML = `
            <div class="no-more-icon">📜</div>
            <span>No more messages</span>
        `;
        
        if (messagesContainer.firstChild) {
            messagesContainer.insertBefore(noMoreMessages, messagesContainer.firstChild);
        } else {
            messagesContainer.appendChild(noMoreMessages);
        }
        
        // Remove after 3 seconds
        setTimeout(() => {
            if (noMoreMessages.parentNode) {
                noMoreMessages.remove();
            }
        }, 3000);
    }

    sendMessage() {
        let messageInput = document.getElementById('message-input');
        let message = messageInput.value.trim();
        
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

    displayMessage(message, isHistory = false, prepend = false) {
        const messagesContainer = document.getElementById('messages-container');
        
        const welcomeMessage = messagesContainer.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.style.display = 'none';
        }
        
        const messageElement = document.createElement('div');
        messageElement.className = `message ${message.sender === this.currentUser ? 'sent' : 'received'}`;
        messageElement.setAttribute('data-message-id', message.id);
        
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
        
        if (prepend) {
            messagesContainer.insertBefore(messageElement, messagesContainer.firstChild);
        } else {
            messagesContainer.appendChild(messageElement);
        }
        
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
        this.messageOffset = 0;
        this.hasMoreMessages = true;
        this.allMessages = [];
        this.loadedMessageIds.clear();
        
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