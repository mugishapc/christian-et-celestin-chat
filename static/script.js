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

            // Scroll to bottom button
            if (e.target.classList.contains('scroll-to-bottom') || e.target.closest('.scroll-to-bottom')) {
                this.scrollToBottom(true);
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
                // PERFECT SCROLL SETUP
                messagesContainer.style.overflowY = 'auto';
                messagesContainer.style.webkitOverflowScrolling = 'touch';
                
                messagesContainer.addEventListener('scroll', () => this.handleInfiniteScroll());
                this.createScrollToBottomButton();
                
                // Initial scroll to bottom
                setTimeout(() => {
                    this.scrollToBottom(true);
                }, 300);
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
        
        document.querySelector('.chat-area').appendChild(scrollBtn);
        this.scrollToBottomBtn = scrollBtn;
    }

    scrollToBottom(force = false) {
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) return;

        if (force || this.isAtBottom) {
            // PERFECT SCROLL TO BOTTOM
            setTimeout(() => {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
                this.isAtBottom = true;
                if (this.scrollToBottomBtn) {
                    this.scrollToBottomBtn.style.display = 'none';
                }
            }, 100);
        }
    }

    // ... rest of your existing methods remain the same ...

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
        
        // PERFECT SCROLL INITIALIZATION
        setTimeout(() => {
            this.initializeScrollSystem();
            this.fixMobileViewport();
            this.ensureInputVisibility();
        }, 100);
    }

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
            inputContainer.style.position = this.isMobile ? 'fixed' : 'sticky';
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
            sendBtn.style.display = 'flex';
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

    // ... rest of your existing methods ...

    displayMessage(message) {
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) return;
        
        const welcomeMessage = messagesContainer.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.style.display = 'none';
        }
        
        const messageElement = this.createMessageElement(message);
        messagesContainer.appendChild(messageElement);
        
        // Auto scroll to bottom if user is at bottom
        if (this.isAtBottom) {
            setTimeout(() => {
                this.scrollToBottom(true);
            }, 100);
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

    // ... rest of your existing methods ...
}

// Initialize the app
let chatApp;
document.addEventListener('DOMContentLoaded', () => {
    chatApp = new ChatApp();
    window.chatApp = chatApp;
});