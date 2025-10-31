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
        this.messagesLimit = 500;
        this.isLoadingMessages = false;
        this.hasMoreMessages = true;
        this.allMessages = [];
        this.isLoadingHistory = false;
        
        // Voice recording variables
        this.isRecording = false;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.recordingTimeout = null;
        this.maxRecordingTime = 60000; // 60 seconds max
        this.recordingTimer = null;
        
        // Mobile state
        this.isMobile = window.innerWidth <= 768;
        this.mobileChatActive = false;
        
        this.initializeEventListeners();
        this.initializeScrollSystem();
        this.setupMobileDetection();
        
        // Force input visibility on init
        setTimeout(() => this.ensureInputVisibility(), 1000);
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

    initializeEventListeners() {
        // Login events
        const loginBtn = document.getElementById('login-btn');
        const usernameInput = document.getElementById('username-input');
        
        if (loginBtn) {
            loginBtn.addEventListener('click', () => this.login());
        }
        if (usernameInput) {
            usernameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.login();
            });
        }

        // Chat events
        const logoutBtn = document.getElementById('logout-btn');
        const sendBtn = document.getElementById('send-btn');
        const messageInput = document.getElementById('message-input');
        const receiverSelect = document.getElementById('receiver-select');
        
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.logout());
        }
        if (sendBtn) {
            sendBtn.addEventListener('click', () => this.sendMessage());
        }
        if (messageInput) {
            messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
            messageInput.addEventListener('input', () => this.handleTyping());
            
            // Auto-resize textarea (vertical only)
            messageInput.addEventListener('input', this.autoResizeTextarea.bind(this));
            
            // Ensure visibility when input is focused
            messageInput.addEventListener('focus', () => this.ensureInputVisibility());
        }
        if (receiverSelect) {
            receiverSelect.addEventListener('change', (e) => {
                this.selectReceiver(e.target.value);
            });
        }

        // User list clicks
        document.addEventListener('click', (e) => {
            // User list items
            if (e.target.closest('#users-list li')) {
                const li = e.target.closest('#users-list li');
                const username = li.querySelector('.username').textContent;
                this.selectReceiver(username);
            }
            
            // Admin buttons
            if (e.target.classList.contains('delete-user-btn')) {
                const username = e.target.dataset.username;
                this.deleteUser(username);
            }
            if (e.target.classList.contains('admin-chat-btn')) {
                const username = e.target.dataset.username;
                this.startAdminChat(username);
            }
            
            // Mobile back button
            if (e.target.classList.contains('back-to-users') || e.target.closest('.back-to-users')) {
                this.showUsersListOnMobile();
            }
            
            // Voice message buttons
            if (e.target.classList.contains('voice-record-btn') || e.target.closest('.voice-record-btn')) {
                this.toggleVoiceRecording();
            }
            if (e.target.classList.contains('cancel-voice-btn') || e.target.closest('.cancel-voice-btn')) {
                this.cancelVoiceRecording();
            }
            if (e.target.classList.contains('send-voice-btn') || e.target.closest('.send-voice-btn')) {
                this.sendVoiceMessage();
            }
            
            // Image upload
            if (e.target.classList.contains('image-upload-btn') || e.target.closest('.image-upload-btn')) {
                document.getElementById('image-input').click();
            }
            
            // Play voice messages
            if (e.target.classList.contains('play-voice-btn') || e.target.closest('.play-voice-btn')) {
                const voiceMessage = e.target.closest('.voice-message');
                if (voiceMessage) {
                    const audioUrl = voiceMessage.dataset.audioUrl;
                    this.playVoiceMessage(audioUrl);
                }
            }
        });

        // Image upload handler
        const imageInput = document.getElementById('image-input');
        if (imageInput) {
            imageInput.addEventListener('change', (e) => {
                this.handleImageUpload(e.target.files[0]);
            });
        }
        
        // Prevent drag and drop on the whole page
        document.addEventListener('dragover', (e) => e.preventDefault());
        document.addEventListener('drop', (e) => e.preventDefault());
        
        // Ensure input visibility when window gains focus
        window.addEventListener('focus', () => this.ensureInputVisibility());
    }

    autoResizeTextarea() {
        const textarea = document.getElementById('message-input');
        if (textarea) {
            textarea.style.height = 'auto';
            const newHeight = Math.min(textarea.scrollHeight, 100); // Max height 100px for vertical
            textarea.style.height = newHeight + 'px';
            
            // Minimal adjustment for container height
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
                
                setTimeout(() => {
                    this.scrollToBottom(true);
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

        if (force || this.isAtBottom) {
            setTimeout(() => {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
                this.isAtBottom = true;
                if (this.scrollToBottomBtn) {
                    this.scrollToBottomBtn.style.display = 'none';
                }
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
        
        // Add media buttons functionality
        this.addMediaButtons();
        
        // Add back button for mobile
        if (this.isMobile) {
            this.addMobileBackButton();
        }
        
        // MOBILE FIX: Ensure proper layout calculation
        setTimeout(() => {
            this.initializeScrollSystem();
            this.fixMobileViewport();
            this.ensureInputVisibility(); // Force input visibility
        }, 100);
    }

    // Add this new method to fix mobile viewport issues
    fixMobileViewport() {
        if (!this.isMobile) return;
        
        const messagesContainer = document.getElementById('messages-container');
        const inputContainer = document.querySelector('.message-input-container');
        
        if (messagesContainer && inputContainer) {
            // Calculate available height for messages
            const headerHeight = document.querySelector('.chat-header').offsetHeight;
            const inputHeight = inputContainer.offsetHeight;
            const viewportHeight = window.innerHeight;
            
            const messagesHeight = viewportHeight - headerHeight - inputHeight;
            messagesContainer.style.height = `${messagesHeight}px`;
            messagesContainer.style.maxHeight = `${messagesHeight}px`;
            
            // Force scroll to bottom
            setTimeout(() => {
                this.scrollToBottom(true);
            }, 200);
        }
    }

    // ENSURE INPUT IS VISIBLE - CRITICAL FIX
    ensureInputVisibility() {
        const messageInput = document.getElementById('message-input');
        const sendBtn = document.getElementById('send-btn');
        const inputContainer = document.querySelector('.message-input-container');
        const inputGroup = document.querySelector('.input-group');
        
        // Force visibility of all input elements
        if (inputContainer) {
            inputContainer.style.display = 'flex';
            inputContainer.style.visibility = 'visible';
            inputContainer.style.opacity = '1';
            inputContainer.style.position = 'fixed';
            inputContainer.style.bottom = '0';
            inputContainer.style.left = '0';
            inputContainer.style.right = '0';
            inputContainer.style.zIndex = '9999';
        }
        
        if (inputGroup) {
            inputGroup.style.display = 'flex';
            inputGroup.style.visibility = 'visible';
            inputGroup.style.opacity = '1';
        }
        
        if (messageInput) {
            messageInput.style.display = 'block';
            messageInput.style.visibility = 'visible';
            messageInput.style.opacity = '1';
            messageInput.style.position = 'relative';
            messageInput.style.zIndex = '1000';
        }
        
        if (sendBtn) {
            sendBtn.style.display = 'block';
            sendBtn.style.visibility = 'visible';
            sendBtn.style.opacity = '1';
            sendBtn.style.position = 'relative';
            sendBtn.style.zIndex = '1001';
        }
        
        // Force a reflow to ensure rendering
        setTimeout(() => {
            if (inputContainer) {
                inputContainer.style.transform = 'translateZ(0)';
            }
        }, 50);
        
        // Scroll to bottom to ensure input is visible
        setTimeout(() => {
            this.scrollToBottom(true);
        }, 300);
    }

    addMediaButtons() {
        // Buttons are now in HTML, just ensure event listeners are set up
        const imageInput = document.getElementById('image-input');
        const imageUploadBtn = document.querySelector('.image-upload-btn');
        const voiceRecordBtn = document.querySelector('.voice-record-btn');
        
        if (imageUploadBtn && !imageUploadBtn.hasEventListener) {
            imageUploadBtn.addEventListener('click', () => {
                document.getElementById('image-input').click();
            });
            imageUploadBtn.hasEventListener = true;
        }
        
        if (voiceRecordBtn && !voiceRecordBtn.hasEventListener) {
            voiceRecordBtn.addEventListener('click', () => {
                this.toggleVoiceRecording();
            });
            voiceRecordBtn.hasEventListener = true;
        }
        
        if (imageInput && !imageInput.hasEventListener) {
            imageInput.addEventListener('change', (e) => {
                this.handleImageUpload(e.target.files[0]);
            });
            imageInput.hasEventListener = true;
        }
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
            // ENABLE INPUT AND BUTTON
            messageInput.disabled = false;
            sendBtn.disabled = false;
            messageInput.placeholder = "Type a message...";
            
            this.ensureInputVisibility();
            
            this.loadConversationHistory(username);
            this.updateUsersListActiveState(username);
            
            // On mobile, switch to chat view
            if (this.isMobile) {
                this.showChatOnMobile();
            } else {
                // On desktop, focus input
                messageInput.focus();
            }
        }
    }

    showChatOnMobile() {
        const usersSidebar = document.querySelector('.users-sidebar');
        const chatArea = document.querySelector('.chat-area');
        const backButton = document.querySelector('.back-to-users');
        
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
        
        // Ensure input visibility
        setTimeout(() => {
            this.ensureInputVisibility();
            this.fixMobileViewport();
            
            // Focus on input
            const messageInput = document.getElementById('message-input');
            if (messageInput) {
                setTimeout(() => {
                    messageInput.focus();
                }, 500);
            }
        }, 100);
    }

    showUsersListOnMobile() {
        const usersSidebar = document.querySelector('.users-sidebar');
        const chatArea = document.querySelector('.chat-area');
        const backButton = document.querySelector('.back-to-users');
        const messageInput = document.getElementById('message-input');
        
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
            messageInput.style.height = 'auto';
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
            message: message,
            message_type: 'text'
        });
        
        this.stopTyping();
        messageInput.value = '';
        messageInput.style.height = 'auto'; // Reset height
        
        // Reset input container height on mobile
        if (this.isMobile) {
            const inputContainer = document.querySelector('.message-input-container');
            if (inputContainer) {
                inputContainer.style.minHeight = '70px';
            }
        }
        
        // Keep focus on input after sending
        setTimeout(() => {
            messageInput.focus();
            this.ensureInputVisibility(); // Re-ensure visibility
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
        
        let messageContent = '';
        
        if (message.message_type === 'image') {
            messageContent = `
                <div class="message-content">
                    <div class="image-message">
                        <img src="${message.file_url}" alt="Shared image" onclick="this.classList.toggle('expanded')">
                        ${message.text ? `<div class="image-caption">${this.escapeHtml(message.text)}</div>` : ''}
                    </div>
                    <div class="message-time">${time}</div>
                </div>
            `;
        } else if (message.message_type === 'voice') {
            const duration = this.formatVoiceDuration(message.file_size);
            messageContent = `
                <div class="message-content">
                    <div class="voice-message" data-audio-url="${message.file_url}">
                        <button class="play-voice-btn">
                            ▶️
                        </button>
                        <div class="voice-waveform">
                            <div class="voice-wave"></div>
                            <div class="voice-duration">${duration}</div>
                        </div>
                    </div>
                    <div class="message-time">${time}</div>
                </div>
            `;
        } else {
            messageContent = `
                <div class="message-content">
                    <div class="message-text">${this.escapeHtml(message.text)}</div>
                    <div class="message-time">${time}</div>
                </div>
            `;
        }
        
        messageElement.innerHTML = messageContent;
        return messageElement;
    }

    formatVoiceDuration(fileSize) {
        // Simple duration calculation based on file size (approximate)
        const durationInSeconds = Math.max(1, Math.round(fileSize / 16000));
        const minutes = Math.floor(durationInSeconds / 60);
        const seconds = durationInSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    playVoiceMessage(audioUrl) {
        const audio = new Audio(audioUrl);
        audio.play().catch(e => {
            console.error('Error playing voice message:', e);
            this.showNotification('Error playing voice message', 'error');
        });
    }

    // Voice Recording Functions
    async toggleVoiceRecording() {
        if (this.isRecording) {
            this.stopVoiceRecording();
        } else {
            await this.startVoiceRecording();
        }
    }

    async startVoiceRecording() {
        if (!this.selectedReceiver) {
            this.showNotification('Select a user to send voice message', 'error');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 44100
                } 
            });
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            });
            this.audioChunks = [];
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.onstop = () => {
                this.showVoiceRecordingControls();
            };
            
            this.mediaRecorder.start(100); // Collect data every 100ms
            this.isRecording = true;
            this.showRecordingInterface();
            
            // Auto stop after max recording time
            this.recordingTimeout = setTimeout(() => {
                this.stopVoiceRecording();
            }, this.maxRecordingTime);
            
        } catch (error) {
            console.error('Error starting recording:', error);
            this.showNotification('Error accessing microphone. Please check permissions.', 'error');
        }
    }

    stopVoiceRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
            this.isRecording = false;
            clearTimeout(this.recordingTimeout);
        }
    }

    cancelVoiceRecording() {
        this.stopVoiceRecording();
        this.hideRecordingInterface();
        this.audioChunks = [];
        this.showNotification('Recording cancelled');
    }

    async sendVoiceMessage() {
        if (this.audioChunks.length === 0) {
            this.showNotification('No recording to send', 'error');
            return;
        }

        try {
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
            
            // Check file size (max 10MB)
            if (audioBlob.size > 10 * 1024 * 1024) {
                this.showNotification('Voice message too large', 'error');
                return;
            }

            const formData = new FormData();
            formData.append('file', audioBlob, 'voice-message.webm');
            formData.append('file_type', 'voice');

            this.showNotification('Sending voice message...', 'info');

            const response = await fetch('/upload_file', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                this.socket.emit('send_message', {
                    sender: this.currentUser,
                    receiver: this.selectedReceiver,
                    message: 'Voice message',
                    message_type: 'voice',
                    file_url: result.file_url,
                    file_name: result.file_name,
                    file_size: result.file_size
                });
                this.showNotification('Voice message sent');
            } else {
                this.showNotification('Error sending voice message: ' + result.error, 'error');
            }

        } catch (error) {
            console.error('Error sending voice message:', error);
            this.showNotification('Error sending voice message', 'error');
        }

        this.hideRecordingInterface();
        this.audioChunks = [];
    }

    showRecordingInterface() {
        this.hideRecordingInterface();
        
        const inputContainer = document.querySelector('.message-input-container');
        const recordingInterface = document.createElement('div');
        recordingInterface.className = 'voice-recording-interface';
        recordingInterface.innerHTML = `
            <div class="recording-indicator">
                <div class="recording-pulse"></div>
                <span>Recording... </span>
                <span class="recording-timer">0:00</span>
            </div>
            <div class="recording-controls">
                <button class="cancel-voice-btn">Cancel</button>
                <button class="send-voice-btn">Send</button>
            </div>
        `;
        
        inputContainer.appendChild(recordingInterface);
        
        // Hide normal input
        document.querySelector('.input-group').style.display = 'none';
        
        // Start timer
        this.startRecordingTimer();
    }

    showVoiceRecordingControls() {
        const recordingInterface = document.querySelector('.voice-recording-interface');
        if (recordingInterface) {
            recordingInterface.innerHTML = `
                <div class="recording-preview">
                    <span>Voice message recorded</span>
                </div>
                <div class="recording-controls">
                    <button class="cancel-voice-btn">Cancel</button>
                    <button class="send-voice-btn">Send</button>
                </div>
            `;
        }
    }

    hideRecordingInterface() {
        const recordingInterface = document.querySelector('.voice-recording-interface');
        if (recordingInterface) {
            recordingInterface.remove();
        }
        document.querySelector('.input-group').style.display = 'flex';
        
        // Clear recording timer
        if (this.recordingTimer) {
            clearInterval(this.recordingTimer);
            this.recordingTimer = null;
        }
        
        // Re-ensure input visibility
        this.ensureInputVisibility();
    }

    startRecordingTimer() {
        let seconds = 0;
        this.recordingTimer = setInterval(() => {
            seconds++;
            const timerElement = document.querySelector('.recording-timer');
            if (timerElement) {
                const minutes = Math.floor(seconds / 60);
                const remainingSeconds = seconds % 60;
                timerElement.textContent = `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
            }
        }, 1000);
    }

    // Image Upload Functions
    async handleImageUpload(file) {
        if (!file || !this.selectedReceiver) return;

        if (!file.type.startsWith('image/')) {
            this.showNotification('Please select an image file', 'error');
            return;
        }

        if (file.size > 10 * 1024 * 1024) { // 10MB limit
            this.showNotification('Image size too large (max 10MB)', 'error');
            return;
        }

        try {
            this.showNotification('Uploading image...', 'info');

            const formData = new FormData();
            formData.append('file', file);
            formData.append('file_type', 'image');

            const response = await fetch('/upload_file', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                // Ask for caption
                const caption = prompt('Add a caption (optional):') || '';
                
                this.socket.emit('send_message', {
                    sender: this.currentUser,
                    receiver: this.selectedReceiver,
                    message: caption,
                    message_type: 'image',
                    file_url: result.file_url,
                    file_name: result.file_name,
                    file_size: result.file_size
                });
                
                this.showNotification('Image sent');
            } else {
                this.showNotification('Error uploading image: ' + result.error, 'error');
            }

        } catch (error) {
            console.error('Error uploading image:', error);
            this.showNotification('Error uploading image', 'error');
        }

        // Clear file input
        document.getElementById('image-input').value = '';
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
        // Remove existing notifications
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
            if (notification.parentNode) {
                notification.remove();
            }
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
        
        // Stop any ongoing recording
        if (this.isRecording) {
            this.cancelVoiceRecording();
        }
        
        this.currentUser = null;
        this.selectedReceiver = null;
        this.isAdmin = false;
        this.mobileChatActive = false;
        
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
let chatApp;
document.addEventListener('DOMContentLoaded', () => {
    chatApp = new ChatApp();
    window.chatApp = chatApp; // Make it globally available for onclick handlers
});