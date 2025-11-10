// script.js - TEXT MESSAGES ONLY
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
        this.keyboardVisible = false;
        
        // WhatsApp-style offline system
        this.offlineQueue = new Map();
        this.isOnline = navigator.onLine;
        this.retryInterval = 3000;
        this.retryTimer = null;
        this.messageStatus = new Map();
        this.pendingMessages = new Map();
        this.acknowledgedMessages = new Set();
        
        this.initializeEventListeners();
        this.initializeScrollSystem();
        this.setupMobileDetection();
        this.setupOfflineDetection();
        this.setupKeyboardDetection();
        
        setTimeout(() => this.ensureInputVisibility(), 1000);
    }

    setupKeyboardDetection() {
        if (!this.isMobile) return;
        
        const originalHeight = window.innerHeight;
        
        window.addEventListener('resize', () => {
            const newHeight = window.innerHeight;
            const keyboardVisible = newHeight < originalHeight * 0.8;
            
            if (keyboardVisible && !this.keyboardVisible) {
                this.keyboardVisible = true;
                this.adjustLayoutForKeyboard(true);
            } else if (!keyboardVisible && this.keyboardVisible) {
                this.keyboardVisible = false;
                this.adjustLayoutForKeyboard(false);
            }
        });
        
        const messageInput = document.getElementById('message-input');
        if (messageInput) {
            messageInput.addEventListener('focus', () => {
                setTimeout(() => {
                    this.keyboardVisible = true;
                    this.adjustLayoutForKeyboard(true);
                }, 300);
            });
            
            messageInput.addEventListener('blur', () => {
                setTimeout(() => {
                    this.keyboardVisible = false;
                    this.adjustLayoutForKeyboard(false);
                }, 300);
            });
        }
    }

    adjustLayoutForKeyboard(keyboardVisible) {
        if (!this.isMobile || !this.mobileChatActive) return;
        
        const messagesContainer = document.getElementById('messages-container');
        const inputContainer = document.querySelector('.message-input-container');
        
        if (keyboardVisible) {
            if (messagesContainer && inputContainer) {
                const viewportHeight = window.innerHeight;
                const inputHeight = inputContainer.offsetHeight;
                const headerHeight = document.querySelector('.chat-header').offsetHeight;
                
                const messagesHeight = viewportHeight - headerHeight - inputHeight;
                messagesContainer.style.height = `${messagesHeight}px`;
                messagesContainer.style.maxHeight = `${messagesHeight}px`;
                
                setTimeout(() => this.scrollToBottom(true), 100);
            }
        } else {
            if (messagesContainer) {
                messagesContainer.style.height = '';
                messagesContainer.style.maxHeight = '';
            }
            this.ensureInputVisibility();
        }
    }

    setupOfflineDetection() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.showNotification('Connection restored', 'success');
            this.processOfflineQueue();
            this.updateOnlineStatusIndicator();
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.showNotification('You are offline. Messages will be queued.', 'error');
            this.updateOnlineStatusIndicator();
        });
        
        this.isOnline = navigator.onLine;
        this.updateOnlineStatusIndicator();
    }

    generateMessageId() {
        return `msg_${this.currentUser}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    sendMessage() {
        const messageInput = document.getElementById('message-input');
        const messageText = messageInput.value.trim();
        
        if (!messageText || !this.selectedReceiver) {
            this.showNotification('Please select a user to chat with', 'error');
            return;
        }

        const messageId = this.generateMessageId();
        const timestamp = new Date().toISOString();
        
        const messageData = {
            id: messageId,
            sender: this.currentUser,
            receiver: this.selectedReceiver,
            message: messageText,
            message_type: 'text',
            timestamp: timestamp,
            status: 'sent'
        };

        this.displayMessage(messageData);
        this.updateMessageStatusDisplay(messageId, 'sent');
        this.queueMessageForSending(messageData);
        
        this.stopTyping();
        messageInput.value = '';
        messageInput.style.height = 'auto';
        
        if (this.isMobile) {
            const inputContainer = document.querySelector('.message-input-container');
            if (inputContainer) {
                inputContainer.style.minHeight = '70px';
            }
        }
        
        setTimeout(() => {
            this.ensureInputVisibility();
        }, 100);
    }

    queueMessageForSending(messageData) {
        const messageId = messageData.id;
        
        this.offlineQueue.set(messageId, {
            ...messageData,
            attempts: 0,
            maxAttempts: 5,
            lastAttempt: Date.now()
        });
        
        this.messageStatus.set(messageId, {
            status: 'sent',
            updatedAt: new Date().toISOString()
        });
        
        this.saveOfflineQueue();
        
        if (this.isOnline && !this.retryTimer) {
            this.startRetryMechanism();
        }
        
        if (this.isOnline) {
            this.sendMessageToServer(messageData);
        }
    }

    sendMessageToServer(messageData) {
        const messageId = messageData.id;
        
        if (this.acknowledgedMessages.has(messageId)) {
            return;
        }
        
        if (this.pendingMessages.has(messageId)) {
            return;
        }

        if (!this.socket) {
            return;
        }

        const timeout = setTimeout(() => {
            this.handleMessageTimeout(messageId);
        }, 10000);

        this.pendingMessages.set(messageId, { 
            timeout: timeout,
            message: messageData
        });

        this.socket.emit('send_message', {
            ...messageData,
            offline_id: messageId
        });
    }

    handleMessageSentAck(ackData) {
        const { offline_id, message_id } = ackData;
        
        if (!offline_id) return;
        
        this.acknowledgedMessages.add(offline_id);
        
        if (this.pendingMessages.has(offline_id)) {
            const pending = this.pendingMessages.get(offline_id);
            clearTimeout(pending.timeout);
            this.pendingMessages.delete(offline_id);
        }
        
        this.offlineQueue.delete(offline_id);
        this.saveOfflineQueue();
    }

    handleMessageDelivered(deliveryData) {
        const { offline_id } = deliveryData;
        
        if (offline_id && this.messageStatus.has(offline_id)) {
            this.updateMessageStatusDisplay(offline_id, 'delivered');
        }
    }

    handleMessageRead(readData) {
        const { offline_id } = readData;
        
        if (offline_id && this.messageStatus.has(offline_id)) {
            this.updateMessageStatusDisplay(offline_id, 'read');
        }
    }

    handleMessageTimeout(messageId) {
        const message = this.offlineQueue.get(messageId);
        if (!message || this.acknowledgedMessages.has(messageId)) {
            return;
        }
        
        message.attempts++;
        message.lastAttempt = Date.now();
        
        if (message.attempts >= message.maxAttempts) {
            this.updateMessageStatusDisplay(messageId, 'failed');
            this.offlineQueue.delete(messageId);
            this.pendingMessages.delete(messageId);
        } else if (this.isOnline) {
            const backoffDelay = Math.min(1000 * Math.pow(2, message.attempts), 30000);
            
            setTimeout(() => {
                if (!this.acknowledgedMessages.has(messageId) && this.offlineQueue.has(messageId)) {
                    this.sendMessageToServer(message);
                }
            }, backoffDelay);
        }
        
        this.saveOfflineQueue();
    }

    processOfflineQueue() {
        if (!this.isOnline || !this.socket) return;

        let processedCount = 0;
        
        this.offlineQueue.forEach((message, messageId) => {
            if (!this.acknowledgedMessages.has(messageId) && !this.pendingMessages.has(messageId)) {
                this.sendMessageToServer(message);
                processedCount++;
            }
        });
    }

    startRetryMechanism() {
        if (this.retryTimer) {
            clearInterval(this.retryTimer);
        }
        
        this.retryTimer = setInterval(() => {
            if (this.isOnline && this.offlineQueue.size > 0) {
                this.processOfflineQueue();
            }
            
            if (this.offlineQueue.size === 0) {
                clearInterval(this.retryTimer);
                this.retryTimer = null;
            }
        }, this.retryInterval);
    }

    saveOfflineQueue() {
        try {
            const queueData = {
                queue: Array.from(this.offlineQueue.entries()),
                messageStatus: Array.from(this.messageStatus.entries()),
                acknowledgedMessages: Array.from(this.acknowledgedMessages)
            };
            localStorage.setItem('chatApp_offlineQueue_' + this.currentUser, JSON.stringify(queueData));
        } catch (e) {
            console.error('Error saving offline queue:', e);
        }
    }

    loadOfflineQueue() {
        try {
            const saved = localStorage.getItem('chatApp_offlineQueue_' + this.currentUser);
            if (saved) {
                const data = JSON.parse(saved);
                
                this.offlineQueue = new Map(data.queue || []);
                this.messageStatus = new Map(data.messageStatus || []);
                this.acknowledgedMessages = new Set(data.acknowledgedMessages || []);
                
                this.updateAllMessageStatuses();
            }
        } catch (e) {
            console.error('Error loading offline queue:', e);
            this.offlineQueue = new Map();
            this.messageStatus = new Map();
            this.acknowledgedMessages = new Set();
        }
    }

    updateMessageStatusDisplay(messageId, status) {
        this.messageStatus.set(messageId, {
            status: status,
            updatedAt: new Date().toISOString()
        });
        
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
            this.updateMessageElementStatus(messageElement, status);
        }
        
        this.saveOfflineQueue();
    }

    updateAllMessageStatuses() {
        this.messageStatus.forEach((statusInfo, messageId) => {
            const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
            if (messageElement) {
                this.updateMessageElementStatus(messageElement, statusInfo.status);
            }
        });
    }

    updateMessageElementStatus(element, status) {
        let statusElement = element.querySelector('.message-status');
        if (!statusElement) {
            statusElement = document.createElement('div');
            statusElement.className = 'message-status';
            element.querySelector('.message-content').appendChild(statusElement);
        }
        
        let statusHtml = '';
        let statusClass = '';
        
        switch(status) {
            case 'sent': 
                statusHtml = '✓'; 
                statusClass = 'status-sent'; 
                break;
            case 'delivered': 
                statusHtml = '✓✓'; 
                statusClass = 'status-delivered'; 
                break;
            case 'read': 
                statusHtml = '✓✓'; 
                statusClass = 'status-read'; 
                break;
            case 'failed': 
                statusHtml = '✗'; 
                statusClass = 'status-failed'; 
                break;
            default: 
                statusHtml = '✓'; 
                statusClass = 'status-sent';
        }
        
        statusElement.innerHTML = statusHtml;
        statusElement.className = `message-status ${statusClass}`;
    }

    displayMessage(message) {
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) return;
        
        const welcomeMessage = messagesContainer.querySelector('.welcome-message');
        if (welcomeMessage) welcomeMessage.style.display = 'none';
        
        const existingMessage = messagesContainer.querySelector(`[data-message-id="${message.id}"]`);
        if (existingMessage) {
            const currentStatus = this.messageStatus.get(message.id)?.status || 'sent';
            this.updateMessageElementStatus(existingMessage, currentStatus);
            return;
        }
        
        const messageElement = this.createMessageElement(message);
        messagesContainer.appendChild(messageElement);
        
        const initialStatus = this.messageStatus.get(message.id)?.status || 'sent';
        this.updateMessageElementStatus(messageElement, initialStatus);
        
        if (this.isAtBottom) {
            setTimeout(() => this.scrollToBottom(true), 100);
        }
        
        if (message.sender !== this.currentUser && this.selectedReceiver === message.sender) {
            this.sendDeliveryConfirmation(message);
            this.markMessagesAsRead();
        }
    }

    sendDeliveryConfirmation(message) {
        if (!this.socket || !message.offline_id) return;
        
        this.socket.emit('message_delivered', {
            offline_id: message.offline_id,
            receiver: this.currentUser,
            sender: message.sender
        });
    }

    markMessagesAsRead() {
        if (!this.socket || !this.selectedReceiver) return;
        
        this.socket.emit('message_read', {
            reader: this.currentUser,
            sender: this.selectedReceiver
        });
        
        const messages = document.querySelectorAll('.message.received');
        messages.forEach(message => {
            const messageId = message.dataset.messageId;
            if (messageId && this.messageStatus.has(messageId)) {
                this.updateMessageStatusDisplay(messageId, 'read');
            }
        });
    }

    handleIncomingMessage(message) {
        if (message.sender === this.currentUser && message.offline_id) {
            this.handleMessageSentAck({
                offline_id: message.offline_id,
                message_id: message.id
            });
        } else {
            this.displayMessage(message);
        }
    }

    connectToSocket(username) {
        this.socket = io();

        this.socket.on('connect', () => {
            this.socket.emit('login', { username });
            this.isOnline = true;
            this.updateOnlineStatusIndicator();
            setTimeout(() => this.processOfflineQueue(), 1000);
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
                this.handleIncomingMessage(data);
                if (this.isAtBottom) this.scrollToBottom(true);
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

        this.socket.on('message_sent', (data) => {
            this.handleMessageSentAck(data);
        });

        this.socket.on('message_delivered', (data) => {
            this.handleMessageDelivered(data);
        });

        this.socket.on('message_read', (data) => {
            this.handleMessageRead(data);
        });

        this.socket.on('disconnect', () => {
            this.isOnline = false;
            this.updateOnlineStatusIndicator();
        });

        this.socket.on('reconnect', () => {
            this.isOnline = true;
            this.updateOnlineStatusIndicator();
            setTimeout(() => this.processOfflineQueue(), 1000);
        });
    }

    initializeEventListeners() {
        const loginBtn = document.getElementById('login-btn');
        const usernameInput = document.getElementById('username-input');
        
        if (loginBtn) loginBtn.addEventListener('click', () => this.login());
        if (usernameInput) usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.login();
        });

        const logoutBtn = document.getElementById('logout-btn');
        const sendBtn = document.getElementById('send-btn');
        const messageInput = document.getElementById('message-input');
        const receiverSelect = document.getElementById('receiver-select');
        
        if (logoutBtn) logoutBtn.addEventListener('click', () => this.logout());
        if (sendBtn) sendBtn.addEventListener('click', () => this.sendMessage());
        if (messageInput) {
            messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
            messageInput.addEventListener('input', () => this.handleTyping());
            messageInput.addEventListener('input', this.autoResizeTextarea.bind(this));
            
            // CRITICAL FIX: Ensure input area stays visible on focus
            messageInput.addEventListener('focus', () => {
                this.ensureInputVisibility();
                setTimeout(() => {
                    this.ensureInputVisibility();
                    this.scrollToBottom(true);
                }, 300);
            });
            
            messageInput.addEventListener('blur', () => {
                setTimeout(() => {
                    this.ensureInputVisibility();
                }, 300);
            });
        }
        if (receiverSelect) {
            receiverSelect.addEventListener('change', (e) => {
                if (e.target.value) {
                    this.selectReceiver(e.target.value);
                }
            });
        }

        this.setupUserListClickHandlers();
        
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-user-btn')) {
                const username = e.target.dataset.username;
                this.deleteUser(username);
                e.stopPropagation();
                return;
            }
            
            if (e.target.classList.contains('admin-chat-btn')) {
                const username = e.target.dataset.username;
                this.startAdminChat(username);
                e.stopPropagation();
                return;
            }
            
            if (e.target.classList.contains('back-to-users')) {
                this.showUsersListOnMobile();
                return;
            }

            if (e.target.classList.contains('scroll-to-bottom')) {
                this.scrollToBottom(true);
                return;
            }
        });
        
        document.addEventListener('dragover', (e) => e.preventDefault());
        document.addEventListener('drop', (e) => e.preventDefault());
    }

    setupUserListClickHandlers() {
        const usersList = document.getElementById('users-list');
        if (usersList) {
            usersList.removeEventListener('click', this.userListClickHandler);
            this.userListClickHandler = this.handleUserClick.bind(this);
            usersList.addEventListener('click', this.userListClickHandler);
        }
    }

    handleUserClick(e) {
        if (e.target.classList.contains('delete-user-btn') || 
            e.target.classList.contains('admin-chat-btn')) {
            return;
        }
        
        const userItem = e.target.closest('li');
        if (userItem) {
            const usernameElement = userItem.querySelector('.username');
            if (usernameElement) {
                const username = usernameElement.textContent;
                this.selectReceiver(username);
            }
        }
    }

    autoResizeTextarea() {
        const textarea = document.getElementById('message-input');
        if (textarea) {
            textarea.style.height = 'auto';
            const newHeight = Math.min(textarea.scrollHeight, 100);
            textarea.style.height = newHeight + 'px';
            
            const inputContainer = document.querySelector('.message-input-container');
            if (inputContainer && this.isMobile) {
                inputContainer.style.minHeight = Math.max(70, newHeight + 30) + 'px';
            }
        }
    }

    initializeScrollSystem() {
        setTimeout(() => {
            const messagesContainer = document.getElementById('messages-container');
            if (messagesContainer) {
                messagesContainer.style.overflowY = 'auto';
                messagesContainer.style.webkitOverflowScrolling = 'touch';
                
                messagesContainer.addEventListener('scroll', () => this.handleInfiniteScroll());
                this.createScrollToBottomButton();
                
                setTimeout(() => this.scrollToBottom(true), 300);
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
        if (existingBtn) existingBtn.remove();
        
        const scrollBtn = document.createElement('button');
        scrollBtn.className = 'scroll-to-bottom';
        scrollBtn.innerHTML = '↓';
        scrollBtn.title = 'Scroll to bottom';
        scrollBtn.style.display = 'none';
        
        document.querySelector('.chat-area').appendChild(scrollBtn);
        this.scrollToBottomBtn = scrollBtn;
    }

    scrollToBottom(force = false) {
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) return;

        if (force || this.isAtBottom) {
            setTimeout(() => {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
                this.isAtBottom = true;
                if (this.scrollToBottomBtn) this.scrollToBottomBtn.style.display = 'none';
            }, 100);
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
                <div class="loading-text">Launching WhatsApp Clone...</div>
            </div>
        `;
    }

    showChatScreen(onlineUsers, allUsers) {
        document.getElementById('login-screen').classList.remove('active');
        document.getElementById('chat-screen').classList.add('active');
        
        document.getElementById('current-user').textContent = this.currentUser + (this.isAdmin ? ' (Admin)' : '');
        this.populateUsersList(onlineUsers, allUsers);
        this.showWelcomeMessage();
        
        this.loadOfflineQueue();
        
        if (this.isMobile) this.addMobileBackButton();
        
        this.updateOnlineStatusIndicator();
        
        setTimeout(() => {
            this.initializeScrollSystem();
            this.fixMobileViewport();
            this.ensureInputVisibility();
        }, 100);
    }

    updateOnlineStatusIndicator() {
        let statusIndicator = document.getElementById('online-status-indicator');
        if (!statusIndicator) {
            statusIndicator = document.createElement('div');
            statusIndicator.id = 'online-status-indicator';
            statusIndicator.className = 'online-status';
            document.querySelector('.chat-header').appendChild(statusIndicator);
        }
        
        if (this.isOnline) {
            statusIndicator.className = 'online-status online';
            statusIndicator.innerHTML = '🟢 Online';
        } else {
            statusIndicator.className = 'online-status offline';
            statusIndicator.innerHTML = '🔴 Offline';
        }
    }

    setupMobileDetection() {
        this.isMobile = window.innerWidth <= 768;
        window.addEventListener('resize', () => {
            this.isMobile = window.innerWidth <= 768;
            if (this.isMobile && this.currentUser) {
                this.fixMobileViewport();
                this.ensureInputVisibility();
            }
        });
    }

    fixMobileViewport() {
        if (!this.isMobile) return;
        
        const messagesContainer = document.getElementById('messages-container');
        const inputContainer = document.querySelector('.message-input-container');
        
        if (messagesContainer && inputContainer) {
            const headerHeight = document.querySelector('.chat-header').offsetHeight;
            const inputHeight = inputContainer.offsetHeight;
            const viewportHeight = window.innerHeight;
            
            const messagesHeight = viewportHeight - headerHeight - inputHeight;
            messagesContainer.style.height = `${messagesHeight}px`;
            messagesContainer.style.maxHeight = `${messagesHeight}px`;
            
            setTimeout(() => this.scrollToBottom(true), 200);
        }
    }

    ensureInputVisibility() {
        const messageInput = document.getElementById('message-input');
        const sendBtn = document.getElementById('send-btn');
        const inputContainer = document.querySelector('.message-input-container');
        const inputGroup = document.querySelector('.input-group');
        
        if (inputContainer) {
            // CRITICAL FIX: Force input container to always be visible and properly positioned
            inputContainer.style.display = 'flex';
            inputContainer.style.visibility = 'visible';
            inputContainer.style.opacity = '1';
            inputContainer.style.position = this.isMobile ? 'fixed' : 'sticky';
            inputContainer.style.bottom = '0';
            inputContainer.style.left = '0';
            inputContainer.style.right = '0';
            inputContainer.style.zIndex = '9999';
            inputContainer.style.background = '#f0f0f0';
            inputContainer.style.borderTop = '1px solid #e9ecef';
            inputContainer.style.padding = '1rem 1.5rem';
            inputContainer.style.transform = 'translateZ(0)';
            inputContainer.style.webkitTransform = 'translateZ(0)';
            inputContainer.style.boxSizing = 'border-box';
            inputContainer.style.width = '100%';
            
            // Ensure it's always above other elements
            inputContainer.style.willChange = 'transform';
        }
        
        if (inputGroup) {
            inputGroup.style.display = 'flex';
            inputGroup.style.visibility = 'visible';
            inputGroup.style.opacity = '1';
            inputGroup.style.width = '100%';
        }
        
        if (messageInput) {
            messageInput.style.display = 'block';
            messageInput.style.visibility = 'visible';
            messageInput.style.opacity = '1';
            messageInput.style.position = 'relative';
            messageInput.style.zIndex = '1000';
            messageInput.style.width = '100%';
        }
        
        if (sendBtn) {
            sendBtn.style.display = 'flex';
            sendBtn.style.visibility = 'visible';
            sendBtn.style.opacity = '1';
            sendBtn.style.position = 'relative';
            sendBtn.style.zIndex = '1001';
        }
        
        setTimeout(() => {
            if (inputContainer) inputContainer.style.transform = 'translateZ(0)';
        }, 50);
        
        setTimeout(() => this.scrollToBottom(true), 300);
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
        
        if (onlineUsers && onlineUsers.length > 0) {
            onlineUsers.forEach(user => {
                if (user !== this.currentUser) {
                    this.addUserToUI(user, usersList, receiverSelect, true);
                }
            });
        }
        
        if (allUsers && allUsers.length > 0) {
            allUsers.forEach(userData => {
                const user = userData.username;
                const isOnline = userData.is_online;
                if (user !== this.currentUser && (!onlineUsers || !onlineUsers.includes(user))) {
                    this.addUserToUI(user, usersList, receiverSelect, isOnline, userData.is_admin);
                }
            });
        }
        
        setTimeout(() => this.setupUserListClickHandlers(), 100);
    }

    addUserToUI(username, usersList, receiverSelect, isOnline, isAdmin = false) {
        if (usersList) {
            const li = document.createElement('li');
            li.className = 'user-item';
            li.innerHTML = `
                <div class="user-info">
                    <span class="user-status">${isOnline ? '🟢' : '⚫'}</span>
                    <span class="username">${username}</span>
                    ${isAdmin ? '<span class="admin-badge">👑</span>' : ''}
                </div>
                ${this.isAdmin && username !== this.currentUser ? `
                    <div class="admin-actions">
                        <button class="admin-chat-btn" data-username="${username}" title="Chat as this user">💬</button>
                        <button class="delete-user-btn" data-username="${username}" title="Delete user">🗑️</button>
                    </div>
                ` : ''}
            `;
            
            if (!isOnline) li.style.opacity = '0.7';
            usersList.appendChild(li);
        }
        
        if (receiverSelect) {
            const option = document.createElement('option');
            option.value = username;
            option.textContent = `${username} ${isOnline ? '🟢' : '⚫'} ${isAdmin ? '👑' : ''}`;
            receiverSelect.appendChild(option);
        }
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
            existingUser.style.opacity = isOnline ? '1' : '0.7';
        }
        
        setTimeout(() => this.setupUserListClickHandlers(), 100);
    }

    removeUserFromList(username) {
        const usersList = document.getElementById('users-list');
        const receiverSelect = document.getElementById('receiver-select');
        
        const userItems = Array.from(usersList.children);
        const userItem = userItems.find(li => li.querySelector('.username').textContent === username);
        if (userItem) userItem.remove();
        
        const options = Array.from(receiverSelect.options);
        const userOption = options.find(opt => opt.value === username);
        if (userOption) userOption.remove();
        
        if (this.selectedReceiver === username) {
            this.selectedReceiver = null;
            document.getElementById('receiver-select').value = '';
            document.getElementById('chat-with-user').textContent = 'Select a user to start chatting';
            this.showWelcomeMessage();
            if (this.isMobile) this.showUsersListOnMobile();
        }
    }

    selectReceiver(username) {
        if (!username || username === this.currentUser) {
            this.showNotification('Cannot chat with yourself', 'error');
            return;
        }
        
        this.selectedReceiver = username;
        
        this.currentOffset = 0;
        this.hasMoreMessages = true;
        this.allMessages = [];
        this.isLoadingMessages = false;
        
        const receiverSelect = document.getElementById('receiver-select');
        if (receiverSelect) receiverSelect.value = username;
        
        const chatWithUser = document.getElementById('chat-with-user');
        if (chatWithUser) chatWithUser.textContent = `Chat with ${username}`;
        
        const messageInput = document.getElementById('message-input');
        const sendBtn = document.getElementById('send-btn');
        
        if (messageInput) {
            messageInput.disabled = false;
            messageInput.placeholder = "Type a message...";
            // CRITICAL FIX: Focus the input and ensure it's visible
            setTimeout(() => {
                messageInput.focus();
                this.ensureInputVisibility();
            }, 100);
        }
        
        if (sendBtn) sendBtn.disabled = false;
        
        this.updateUsersListActiveState(username);
        this.loadConversationHistory(username);
        this.markMessagesAsRead();
        
        if (this.isMobile) {
            this.showChatOnMobile();
        }
        
        setTimeout(() => {
            this.ensureInputVisibility();
            this.scrollToBottom(true);
        }, 200);
    }

    showChatOnMobile() {
        const usersSidebar = document.querySelector('.users-sidebar');
        const chatArea = document.querySelector('.chat-area');
        const backButton = document.querySelector('.back-to-users');
        
        if (usersSidebar && chatArea && backButton) {
            usersSidebar.style.display = 'none';
            chatArea.style.display = 'flex';
            backButton.style.display = 'block';
        }
        
        this.mobileChatActive = true;
        
        setTimeout(() => {
            this.ensureInputVisibility();
            this.fixMobileViewport();
        }, 100);
    }

    showUsersListOnMobile() {
        const usersSidebar = document.querySelector('.users-sidebar');
        const chatArea = document.querySelector('.chat-area');
        const backButton = document.querySelector('.back-to-users');
        const messageInput = document.getElementById('message-input');
        
        if (usersSidebar && chatArea && backButton) {
            usersSidebar.style.display = 'block';
            chatArea.style.display = 'none';
            backButton.style.display = 'none';
        }
        
        this.mobileChatActive = false;
        this.selectedReceiver = null;
        
        if (messageInput) {
            messageInput.placeholder = "Select a user to start chatting";
            messageInput.disabled = true;
            messageInput.value = '';
            messageInput.blur();
        }
        
        const chatWithUser = document.getElementById('chat-with-user');
        if (chatWithUser) chatWithUser.textContent = 'Select a user to start chatting';
        
        this.showWelcomeMessage();
    }

    updateUsersListActiveState(activeUsername) {
        const usersList = document.getElementById('users-list');
        if (!usersList) return;
        
        const items = usersList.querySelectorAll('li');
        items.forEach(item => {
            const usernameElement = item.querySelector('.username');
            if (usernameElement) {
                const username = usernameElement.textContent;
                if (username === activeUsername) {
                    item.classList.add('active');
                    item.style.backgroundColor = '#e3f2fd';
                } else {
                    item.classList.remove('active');
                    item.style.backgroundColor = '';
                }
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
        
        setTimeout(() => this.scrollToBottom(true), 200);
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

        messages.forEach(message => this.prependMessage(message));

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
        if (welcomeMessage) welcomeMessage.style.display = 'none';
        
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
        if (loadingIndicator) loadingIndicator.remove();
    }

    handleTyping() {
        if (!this.selectedReceiver) return;
        
        this.socket.emit('typing', {
            sender: this.currentUser,
            receiver: this.selectedReceiver,
            is_typing: true
        });
        
        if (this.typingTimeout) clearTimeout(this.typingTimeout);
        
        this.typingTimeout = setTimeout(() => this.stopTyping(), 1000);
    }

    stopTyping() {
        if (!this.selectedReceiver) return;
        
        this.socket.emit('typing', {
            sender: this.currentUser,
            receiver: this.selectedReceiver,
            is_typing: false
        });
        
        if (this.typingTimeout) clearTimeout(this.typingTimeout);
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
                <p>Welcome to WhatsApp Clone!</p>
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

    deleteUser(username) {
        if (!this.isAdmin || !confirm(`Are you sure you want to delete user ${username}?`)) return;
        
        fetch('/admin/delete_user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admin_username: this.currentUser, target_username: username })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                this.showNotification(`User ${username} deleted successfully`);
            } else {
                this.showNotification(`Error: ${data.error}`, 'error');
            }
        })
        .catch(error => this.showNotification('Error deleting user', 'error'));
    }

    startAdminChat(username) {
        if (!this.isAdmin) return;
        
        this.selectedReceiver = username;
        document.getElementById('receiver-select').value = username;
        document.getElementById('chat-with-user').textContent = `Chat with ${username}`;
        
        const messageInput = document.getElementById('message-input');
        const sendBtn = document.getElementById('send-btn');
        
        messageInput.disabled = false;
        sendBtn.disabled = false;
        messageInput.placeholder = "Type a message...";
        
        this.loadConversationHistory(username);
        this.updateUsersListActiveState(username);
        
        this.showNotification(`Now chatting as admin with ${username}`);
        
        if (this.isMobile) this.showChatOnMobile();
    }

    showNotification(message, type = 'success') {
        document.querySelectorAll('.notification').forEach(n => n.remove());
        
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'error' ? '#e74c3c' : type === 'info' ? '#3498db' : '#2ecc71'};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            max-width: 300px;
            word-wrap: break-word;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) notification.remove();
        }, 3000);
    }

    showLoginError(message) {
        const loginScreen = document.getElementById('login-screen');
        loginScreen.innerHTML = `
            <div class="login-container">
                <h1>WhatsApp Clone</h1>
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
        if (this.socket) this.socket.disconnect();
        
        if (this.retryTimer) {
            clearInterval(this.retryTimer);
            this.retryTimer = null;
        }
        
        this.pendingMessages.forEach(pending => clearTimeout(pending.timeout));
        this.pendingMessages.clear();
        
        this.currentUser = null;
        this.selectedReceiver = null;
        this.isAdmin = false;
        this.mobileChatActive = false;
        this.offlineQueue.clear();
        this.messageStatus.clear();
        this.acknowledgedMessages.clear();
        
        document.getElementById('chat-screen').classList.remove('active');
        document.getElementById('login-screen').classList.add('active');
        
        const loginScreen = document.getElementById('login-screen');
        loginScreen.innerHTML = `
            <div class="login-container">
                <h1>WhatsApp Clone</h1>
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

    createMessageElement(message) {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${message.sender === this.currentUser ? 'sent' : 'received'}`;
        messageElement.dataset.messageId = message.id;
        
        const time = new Date(message.timestamp).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit'
        });
        
        const messageContent = `
            <div class="message-content">
                <div class="message-text">${this.escapeHtml(message.message)}</div>
                <div class="message-time">${time}</div>
                ${message.sender === this.currentUser ? '<div class="message-status"></div>' : ''}
            </div>
        `;
        
        messageElement.innerHTML = messageContent;
        return messageElement;
    }
}

let chatApp;
document.addEventListener('DOMContentLoaded', () => {
    chatApp = new ChatApp();
    window.chatApp = chatApp;
});