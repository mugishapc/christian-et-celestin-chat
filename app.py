import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit, join_room, leave_room
from datetime import datetime
import json
import os

app = Flask(__name__)
app.config['SECRET_KEY'] = 'd29c234ca310aa6990092d4b6cd4c4854585c51e1f73bf4de510adca03f5bc4e'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

# In-memory storage
users = {}
active_users = {}
# Store messages per conversation
conversations = {}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/users', methods=['GET'])
def get_users():
    return jsonify(list(users.keys()))

@socketio.on('connect')
def handle_connect():
    print(f"Client connected: {request.sid}")

@socketio.on('disconnect')
def handle_disconnect():
    user_to_remove = None
    for username, sid in active_users.items():
        if sid == request.sid:
            user_to_remove = username
            break
    
    if user_to_remove:
        del active_users[user_to_remove]
        emit('user_left', {'username': user_to_remove}, broadcast=True)
        print(f"User disconnected: {user_to_remove}")

@socketio.on('login')
def handle_login(data):
    username = data['username']
    
    if username in active_users:
        emit('login_failed', {'message': 'Username already taken'})
        return
    
    # Register user
    active_users[username] = request.sid
    users[username] = {
        'username': username,
        'joined_at': datetime.now().isoformat()
    }
    
    # Get only other users (exclude current user)
    other_users = [user for user in active_users.keys() if user != username]
    
    # Send user list to the new user (NO MESSAGES - for privacy)
    emit('login_success', {
        'username': username,
        'users': other_users
    })
    
    # Notify all users about the new user
    emit('user_joined', {'username': username}, broadcast=True)
    
    print(f"User logged in: {username}")

@socketio.on('send_message')
def handle_send_message(data):
    sender = data['sender']
    receiver = data['receiver']
    message_text = data['message']
    timestamp = datetime.now().isoformat()
    
    # Create conversation key (sorted to ensure consistency)
    conversation_key = tuple(sorted([sender, receiver]))
    
    # Initialize conversation if it doesn't exist
    if conversation_key not in conversations:
        conversations[conversation_key] = []
    
    message = {
        'id': len(conversations[conversation_key]) + 1,
        'sender': sender,
        'receiver': receiver,
        'text': message_text,
        'timestamp': timestamp
    }
    
    # Store message in conversation
    conversations[conversation_key].append(message)
    
    # Send only to the two participants
    if sender in active_users:
        emit('new_message', message, room=active_users[sender])
    
    if receiver in active_users:
        emit('new_message', message, room=active_users[receiver])
    
    print(f"Private message from {sender} to {receiver}: {message_text}")

@socketio.on('get_conversation')
def handle_get_conversation(data):
    user1 = data['user1']
    user2 = data['user2']
    
    # Create conversation key
    conversation_key = tuple(sorted([user1, user2]))
    
    # Get messages for this conversation only
    conversation_messages = conversations.get(conversation_key, [])
    
    emit('conversation_history', {
        'user1': user1,
        'user2': user2,
        'messages': conversation_messages
    })

@socketio.on('typing')
def handle_typing(data):
    sender = data['sender']
    receiver = data['receiver']
    is_typing = data['is_typing']
    
    # Only send typing indicator to the intended receiver
    if receiver in active_users:
        emit('user_typing', {
            'sender': sender,
            'is_typing': is_typing
        }, room=active_users[receiver])

if __name__ == '__main__':
    print("🚀 Christian Et Celestin Chat Server Starting...")
    print("🔒 PRIVATE MESSAGES: Conversations are only visible to participants")
    print("📱 MOBILE OPTIMIZED: Responsive design for all devices")
    print("🌐 Server running at: http://localhost:5000")
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)