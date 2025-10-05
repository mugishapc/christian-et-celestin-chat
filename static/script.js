class ChatApp {
    constructor() {
        this.socket = null;
        this.currentUser = null;
        this.selectedReceiver = null;
        this.isScrolling = false;
        this.scrollTimeout = null;
        this.typingTimeout = null;
        this.isAtBottom = true;
        this.isAdmin = false;
        
        // Infinite scroll variables
        this.currentOffset = 0;
        this.messagesLimit = 50;
        this.isLoadingMessages = false;
        this.hasMoreMessages = true;
        this.allMessages = [];
        this.isLoadingHistory = false;
        
        // Mobile state
        this.isMobile = window.innerWidth <= 768;
        this.mobileChatActive = false;
        this.isKeyboardOpen = false;
        
        this.initializeEventListeners();
        this.initializeScrollSystem();
        this.setupMobileDetection();
    }

    setupMobileDetection() {
        this.isMobile = window.innerWidth <= 768;
        window.addEventListener('resize', () => {
            this.isMobile = window.innerWidth <= 768;
            this.adjustMobileLayout();
        });
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

        // Admin functionality
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-user-btn')) {
                const username = e.target.dataset.username;
                this.deleteUser(username);
            }
            if (e.target.classList.contains('admin-chat-btn')) {
                const username = e.target.dataset.username;
                this.startAdminChat(username);
            }
        });

        // Mobile back button
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('back-to-users') || 
                e.target.closest('.back-to-users')) {
                this.showUsersListOnMobile();
            }
        });

        // Click on user list items
        document.addEventListener('click', (e) => {
            if (e.target.closest('#users-list li')) {
                const username = e.target.closest('#users-list li').querySelector('.username').textContent;
                this.selectReceiver(username);
            }
        });
    }

    adjustMobileLayout() {
        if (this.isMobile && this.mobileChatActive) {
            setTimeout(() => {
                this.scrollToBottom(true);
            }, 100);
        }
    }

    initializeScrollSystem() {
        setTimeout(() => {
            const messagesContainer = document.getElementById('messages-container');
            if (messagesContainer) {
                console.log('🚀 Initializing scroll system...');
                
                messagesContainer.style.overflowY = 'auto';
                messagesContainer.style.webkitOverflowScrolling = 'touch';
                messagesContainer.style.height = '100%';
                
                messagesContainer.addEventListener('scroll', () => this.handleInfiniteScroll());
                
                this.createScrollToBottomButton();
                
                setTimeout(() => {
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }, 100);
            }
        }, 500);
    }

    handleInfiniteScroll() {
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer || this.isLoadingMessages || !this.hasMoreMessages) return;

        const scrollTop = messagesContainer.scrollTop;
        const scrollThreshold = 100;

        if (scrollTop <= scrollThreshold && !this.isLoadingHistory) {
            this.loadMoreMessages();
        }

        const currentPosition = messagesContainer.scrollTop + messagesContainer.clientHeight;
        const maxPosition = messagesContainer.scrollHeight;
        const bottomThreshold = 100;
        
        this.isAtBottom = (maxPosition - currentPosition) <= bottomThreshold;
        
        if (this.scrollToBottomBtn) {
            this.scrollToBottomBtn.style.display = this.isAtBottom ? 'none' : 'flex';
        }
    }

    loadMoreMessages() {
        if (!this.selectedReceiver || this.isLoadingMessages || !this.hasMoreMessages) return;

        this.isLoadingMessages = true;
        this.showLoadingIndicator();

        const newOffset = this.currentOffset + this.messagesLimit;
        
        this.socket.emit('get_more_messages', {
            user1: this.currentUser,
            user2: this.selectedReceiver,
            offset: newOffset,
            limit: this.messagesLimit
        });
    }

    createScrollToBottomButton() {
        const existingBtn = document.querySelector('.scroll-to-bottom');
        if (existingBtn) {
            existingBtn.remove();
        }
        
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

    scrollToBottom(force = false) {
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) return;

        const scrollToBottom = () => {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            
            setTimeout(() => {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
                this.isAtBottom = true;
                if (this.scrollToBottomBtn) {
                    this.scrollToBottomBtn.style.display = 'none';
                }
            }, 100);
        };

        if (force || this.isAtBottom) {
            scrollToBottom();
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
                <div class="loading-text">Launching MugiChat...</div>
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
            this.isAdmin = data.is_admin;
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

        this.socket.on('user_deleted', (data) => {
            this.removeUserFromList(data.username);
        });

        this.socket.on('new_message', (data) => {
            if (this.isMessageForCurrentConversation(data)) {
                this.displayMessage(data);
                if (this.isAtBottom) {
                    this.scrollToBottom(true);
                }
            }
        });

        this.socket.on('conversation_history', (data) => {
            this.displayConversationHistory(data.messages, data.has_more);
        });

        this.socket.on('more_messages', (data) => {
            this.displayOlderMessages(data.messages, data.has_more);
        });

        this.socket.on('user_typing', (data) => {
            this.showTypingIndicator(data.sender, data.is_typing);
        });
    }

    showChatScreen(onlineUsers, allUsers) {
        document.getElementById('login-screen').classList.remove('active');
        document.getElementById('chat-screen').classList.add('active');
        
        document.getElementById('current-user').textContent = this.currentUser + (this.isAdmin ? ' (Admin)' : '');
        this.populateUsersList(onlineUsers, allUsers);
        this.showWelcomeMessage();
        
        // Add back button for mobile
        if (this.isMobile) {
            this.addMobileBackButton();
        }
        
        setTimeout(() => {
            this.initializeScrollSystem();
            this.scrollToBottom(true);
        }, 1000);
    }

    addMobileBackButton() {
        const chatHeader = document.querySelector('.chat-header');
        const existingBackBtn = chatHeader.querySelector('.back-to-users');
        if (!existingBackBtn) {
            const backBtn = document.createElement('button');
            backBtn.className = 'back-to-users';
            backBtn.innerHTML = '←';
            backBtn.title = 'Back to users';
            backBtn.style.display = 'none';
            chatHeader.insertBefore(backBtn, chatHeader.firstChild);
        }
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
            allUsers.forEach(userData => {
                const user = userData.username;
                const isOnline = userData.is_online;
                if (user !== this.currentUser && (!onlineUsers || !onlineUsers.includes(user))) {
                    this.addUserToUI(user, usersList, receiverSelect, isOnline, userData.is_admin);
                }
            });
        }
    }

    addUserToUI(username, usersList, receiverSelect, isOnline, isAdmin = false) {
        // Add to users list
        const li = document.createElement('li');
        li.innerHTML = `
            <span class="user-status">${isOnline ? '🟢' : '⚫'}</span>
            <span class="username">${username}</span>
            ${isAdmin ? '<span class="admin-badge">👑</span>' : ''}
            ${this.isAdmin && username !== this.currentUser ? `
                <div class="admin-actions">
                    <button class="admin-chat-btn" data-username="${username}" title="Chat as this user">💬</button>
                    <button class="delete-user-btn" data-username="${username}" title="Delete user">🗑️</button>
                </div>
            ` : ''}
        `;
        
        if (!isOnline) {
            li.style.opacity = '0.7';
        }
        usersList.appendChild(li);
        
        // Add to receiver select
        const option = document.createElement('option');
        option.value = username;
        option.textContent = `${username} ${isOnline ? '🟢' : '⚫'} ${isAdmin ? '👑' : ''}`;
        receiverSelect.appendChild(option);
    }

    addUserToList(username, isOnline) {
        if (username === this.currentUser) return;
        
        const usersList = document.getElementById('users-list');
        const receiverSelect = document.getElementById('receiver-select');
        
        const existingUser = Array.from(usersList.children).find(li => 
            li.querySelector('.username').textContent === username
        );
        
        if (!existingUser) {
            this.addUserToUI(username, usersList, receiverSelect, isOnline);
        } else {
            const statusSpan = existingUser.querySelector('.user-status');
            statusSpan.textContent = isOnline ? '🟢' : '⚫';
            
            if (!isOnline) {
                existingUser.style.opacity = '0.7';
            } else {
                existingUser.style.opacity = '1';
            }
            
            const options = Array.from(receiverSelect.options);
            const existingOption = options.find(opt => opt.value === username);
            if (existingOption) {
                existingOption.textContent = `${username} ${isOnline ? '🟢' : '⚫'}`;
            }
        }
    }

    removeUserFromList(username) {
        const usersList = document.getElementById('users-list');
        const receiverSelect = document.getElementById('receiver-select');
        
        const userItems = Array.from(usersList.children);
        const userItem = userItems.find(li => 
            li.querySelector('.username').textContent === username
        );
        if (userItem) {
            userItem.remove();
        }
        
        const options = Array.from(receiverSelect.options);
        const userOption = options.find(opt => opt.value === username);
        if (userOption) {
            userOption.remove();
        }
        
        if (this.selectedReceiver === username) {
            this.selectedReceiver = null;
            document.getElementById('receiver-select').value = '';
            this.showWelcomeMessage();
            if (this.isMobile) {
                this.showUsersListOnMobile();
            }
        }
    }

    selectReceiver(username) {
        console.log('🎯 Selecting receiver:', username);
        this.selectedReceiver = username;
        
        // Reset infinite scroll
        this.currentOffset = 0;
        this.hasMoreMessages = true;
        this.allMessages = [];
        this.isLoadingMessages = false;
        
        document.getElementById('receiver-select').value = username;
        
        const messageInput = document.getElementById('message-input');
        const sendBtn = document.getElementById('send-btn');
        
        if (username) {
            messageInput.disabled = false;
            sendBtn.disabled = false;
            messageInput.placeholder = "Type a message...";
            
            // CRITICAL: Force input to be visible
            this.forceInputVisibility();
            
            this.loadConversationHistory(username);
            this.updateUsersListActiveState(username);
            
            // On mobile, switch to chat view
            if (this.isMobile) {
                this.showChatOnMobile();
            } else {
                // On desktop, focus input
                messageInput.focus();
            }
        } else {
            messageInput.disabled = true;
            sendBtn.disabled = true;
            messageInput.placeholder = "Select a user to start chatting";
            this.showWelcomeMessage();
            
            // On mobile, switch back to users list
            if (this.isMobile) {
                this.showUsersListOnMobile();
            }
        }
    }

    // CRITICAL METHOD: Force input to be visible
    forceInputVisibility() {
        const messageInput = document.getElementById('message-input');
        const sendBtn = document.getElementById('send-btn');
        const inputContainer = document.querySelector('.message-input-container');
        
        console.log('🔧 Forcing input visibility...');
        
        // Force input container to be visible
        if (inputContainer) {
            inputContainer.style.display = 'flex';
            inputContainer.style.visibility = 'visible';
            inputContainer.style.opacity = '1';
        }
        
        // Force message input to be visible
        if (messageInput) {
            messageInput.style.display = 'block';
            messageInput.style.visibility = 'visible';
            messageInput.style.opacity = '1';
        }
        
        // Force send button to be visible
        if (sendBtn) {
            sendBtn.style.display = 'block';
            sendBtn.style.visibility = 'visible';
            sendBtn.style.opacity = '1';
        }
        
        // Scroll to bottom to ensure input is visible
        setTimeout(() => {
            this.scrollToBottom(true);
        }, 300);
    }

    showChatOnMobile() {
        const usersSidebar = document.querySelector('.users-sidebar');
        const chatArea = document.querySelector('.chat-area');
        const backButton = document.querySelector('.back-to-users');
        
        console.log('📱 Switching to mobile chat view...');
        
        if (usersSidebar && chatArea && backButton) {
            // Hide users sidebar
            usersSidebar.classList.add('mobile-hidden');
            
            // Show chat area
            chatArea.classList.add('mobile-active');
            
            // Show back button
            backButton.style.display = 'block';
        }
        
        this.mobileChatActive = true;
        document.body.classList.add('mobile-chat-active');
        
        // Force input visibility
        setTimeout(() => {
            this.forceInputVisibility();
            const messageInput = document.getElementById('message-input');
            if (messageInput) {
                messageInput.focus();
            }
        }, 200);
    }

    showUsersListOnMobile() {
        const usersSidebar = document.querySelector('.users-sidebar');
        const chatArea = document.querySelector('.chat-area');
        const backButton = document.querySelector('.back-to-users');
        const messageInput = document.getElementById('message-input');
        
        console.log('📱 Switching back to users list...');
        
        if (usersSidebar && chatArea && backButton) {
            // Show users sidebar
            usersSidebar.classList.remove('mobile-hidden');
            
            // Hide chat area
            chatArea.classList.remove('mobile-active');
            
            // Hide back button
            backButton.style.display = 'none';
        }
        
        this.mobileChatActive = false;
        document.body.classList.remove('mobile-chat-active');
        this.selectedReceiver = null;
        
        if (messageInput) {
            messageInput.placeholder = "Select a user to start chatting";
            messageInput.disabled = true;
        }
        
        this.showWelcomeMessage();
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
            this.isLoadingHistory = true;
            this.socket.emit('get_conversation', {
                user1: this.currentUser,
                user2: otherUser,
                limit: this.messagesLimit,
                offset: 0
            });
        }
    }

    displayConversationHistory(messages, hasMore) {
        this.isLoadingHistory = false;
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) return;
        
        messagesContainer.innerHTML = '';
        
        if (messages.length === 0) {
            this.showWelcomeMessage('Start a new conversation with ' + this.selectedReceiver);
            return;
        }
        
        this.allMessages = messages;
        messages.forEach(message => this.displayMessage(message));
        
        this.currentOffset = messages.length;
        this.hasMoreMessages = hasMore;
        
        setTimeout(() => {
            this.scrollToBottom(true);
        }, 200);
    }

    displayOlderMessages(messages, hasMore) {
        this.isLoadingMessages = false;
        this.hideLoadingIndicator();
        
        if (messages.length === 0) {
            this.hasMoreMessages = false;
            return;
        }

        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) return;

        const oldScrollHeight = messagesContainer.scrollHeight;
        const oldScrollTop = messagesContainer.scrollTop;

        messages.forEach(message => {
            this.prependMessage(message);
        });

        this.allMessages = [...messages, ...this.allMessages];

        const newScrollHeight = messagesContainer.scrollHeight;
        messagesContainer.scrollTop = oldScrollTop + (newScrollHeight - oldScrollHeight);

        this.currentOffset += messages.length;
        this.hasMoreMessages = hasMore;
    }

    prependMessage(message) {
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) return;

        const messageElement = this.createMessageElement(message);
        
        const welcomeMessage = messagesContainer.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.style.display = 'none';
        }
        
        if (messagesContainer.firstChild) {
            messagesContainer.insertBefore(messageElement, messagesContainer.firstChild);
        } else {
            messagesContainer.appendChild(messageElement);
        }
    }

    showLoadingIndicator() {
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) return;

        this.hideLoadingIndicator();

        const loadingIndicator = document.createElement('div');
        loadingIndicator.id = 'loading-indicator';
        loadingIndicator.className = 'loading-indicator';
        loadingIndicator.innerHTML = '<div class="loading-spinner-small"></div> Loading older messages...';
        
        messagesContainer.insertBefore(loadingIndicator, messagesContainer.firstChild);
    }

    hideLoadingIndicator() {
        const loadingIndicator = document.getElementById('loading-indicator');
        if (loadingIndicator) {
            loadingIndicator.remove();
        }
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
        
        // Keep focus on input after sending
        setTimeout(() => {
            messageInput.focus();
        }, 100);
    }

    displayMessage(message) {
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) return;
        
        const welcomeMessage = messagesContainer.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.style.display = 'none';
        }
        
        const messageElement = this.createMessageElement(message);
        messagesContainer.appendChild(messageElement);
    }

    createMessageElement(message) {
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
        
        return messageElement;
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
        if (!messagesContainer) return;
        
        messagesContainer.innerHTML = '';
        
        const welcomeMessage = document.createElement('div');
        welcomeMessage.className = 'welcome-message';
        
        if (customMessage) {
            welcomeMessage.innerHTML = `<p>${customMessage}</p>`;
        } else {
            welcomeMessage.innerHTML = `
                <div class="welcome-icon">💬</div>
                <p>Welcome to MugiChat!</p>
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

    // Admin functions
    deleteUser(username) {
        if (!this.isAdmin || !confirm(`Are you sure you want to delete user ${username}?`)) {
            return;
        }
        
        fetch('/admin/delete_user', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                admin_username: this.currentUser,
                target_username: username
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                this.showNotification(`User ${username} deleted successfully`);
            } else {
                this.showNotification(`Error: ${data.error}`, 'error');
            }
        })
        .catch(error => {
            this.showNotification('Error deleting user', 'error');
        });
    }

    startAdminChat(username) {
        if (!this.isAdmin) return;
        
        this.selectedReceiver = username;
        document.getElementById('receiver-select').value = username;
        
        const messageInput = document.getElementById('message-input');
        const sendBtn = document.getElementById('send-btn');
        
        messageInput.disabled = false;
        sendBtn.disabled = false;
        messageInput.placeholder = "Type a message...";
        messageInput.focus();
        
        this.loadConversationHistory(username);
        this.updateUsersListActiveState(username);
        
        this.showNotification(`Now chatting as admin with ${username}`);
        
        // On mobile, switch to chat view
        if (this.isMobile) {
            this.showChatOnMobile();
        }
    }

    showNotification(message, type = 'success') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'error' ? '#e74c3c' : '#2ecc71'};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            z-index: 1000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    showLoginError(message) {
        const loginScreen = document.getElementById('login-screen');
        loginScreen.innerHTML = `
            <div class="login-container">
                <h1>MugiChat</h1>
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

    logout() {
        if (this.socket) {
            this.socket.disconnect();
        }
        
        this.currentUser = null;
        this.selectedReceiver = null;
        this.isAdmin = false;
        this.mobileChatActive = false;
        this.isKeyboardOpen = false;
        
        document.getElementById('chat-screen').classList.remove('active');
        document.getElementById('login-screen').classList.add('active');
        
        const loginScreen = document.getElementById('login-screen');
        loginScreen.innerHTML = `
            <div class="login-container">
                <h1>MugiChat</h1>
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

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Starting MugiChat App...');
    const app = new ChatApp();
});