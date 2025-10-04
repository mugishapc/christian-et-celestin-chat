import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit, join_room, leave_room
from datetime import datetime
import json
import os
import psycopg2
from psycopg2.extras import RealDictCursor
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['SECRET_KEY'] = 'd29c234ca310aa6990092d4b6cd4c4854585c51e1f73bf4de510adca03f5bc4e'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

# Database configuration
DATABASE_URL = "postgresql://neondb_owner:npg_e9jnoysJOvu7@ep-little-mountain-adzvgndi-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

def get_db_connection():
    """Create and return a database connection"""
    try:
        conn = psycopg2.connect(DATABASE_URL)
        return conn
    except Exception as e:
        logger.error(f"Database connection error: {e}")
        return None

def init_database():
    """Initialize database tables"""
    conn = get_db_connection()
    if conn:
        try:
            with conn.cursor() as cur:
                # Create users table
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS users (
                        id SERIAL PRIMARY KEY,
                        username VARCHAR(50) UNIQUE NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                
                # Create messages table
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS messages (
                        id SERIAL PRIMARY KEY,
                        sender VARCHAR(50) NOT NULL,
                        receiver VARCHAR(50) NOT NULL,
                        message_text TEXT NOT NULL,
                        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                
                # Create index for better performance
                cur.execute("""
                    CREATE INDEX IF NOT EXISTS idx_messages_participants 
                    ON messages (sender, receiver, timestamp)
                """)
                
                conn.commit()
                logger.info("Database tables initialized successfully")
        except Exception as e:
            logger.error(f"Error initializing database: {e}")
            conn.rollback()
        finally:
            conn.close()

# Initialize database on startup
init_database()

# In-memory storage for active users (still needed for real-time)
active_users = {}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/users', methods=['GET'])
def get_users():
    """Get all registered users from database"""
    conn = get_db_connection()
    if conn:
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("SELECT username, last_seen FROM users ORDER BY username")
                users = cur.fetchall()
                return jsonify([user['username'] for user in users])
        except Exception as e:
            logger.error(f"Error fetching users: {e}")
            return jsonify([])
        finally:
            conn.close()
    return jsonify([])

@socketio.on('connect')
def handle_connect():
    logger.info(f"Client connected: {request.sid}")

@socketio.on('disconnect')
def handle_disconnect():
    user_to_remove = None
    for username, sid in active_users.items():
        if sid == request.sid:
            user_to_remove = username
            break
    
    if user_to_remove:
        del active_users[user_to_remove]
        update_user_last_seen(user_to_remove)
        emit('user_left', {'username': user_to_remove}, broadcast=True)
        logger.info(f"User disconnected: {user_to_remove}")

def update_user_last_seen(username):
    """Update user's last seen timestamp"""
    conn = get_db_connection()
    if conn:
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE username = %s",
                    (username,)
                )
                conn.commit()
        except Exception as e:
            logger.error(f"Error updating last seen: {e}")
            conn.rollback()
        finally:
            conn.close()

@socketio.on('login')
def handle_login(data):
    username = data['username']
    
    if username in active_users:
        emit('login_failed', {'message': 'Username already taken'})
        return
    
    # Register user in database and active users
    if register_user(username):
        active_users[username] = request.sid
        
        # Get online users and all registered users
        online_users = [user for user in active_users.keys() if user != username]
        all_users = get_all_users_except(username)
        
        # Send user list to the new user
        emit('login_success', {
            'username': username,
            'online_users': online_users,
            'all_users': all_users
        })
        
        # Notify all users about the new user
        emit('user_joined', {'username': username}, broadcast=True)
        
        logger.info(f"User logged in: {username}")
    else:
        emit('login_failed', {'message': 'Registration failed'})

def register_user(username):
    """Register user in database"""
    conn = get_db_connection()
    if conn:
        try:
            with conn.cursor() as cur:
                # Try to insert new user, or update last_seen if exists
                cur.execute("""
                    INSERT INTO users (username) 
                    VALUES (%s) 
                    ON CONFLICT (username) 
                    DO UPDATE SET last_seen = CURRENT_TIMESTAMP
                    RETURNING id
                """, (username,))
                conn.commit()
                return True
        except Exception as e:
            logger.error(f"Error registering user: {e}")
            conn.rollback()
            return False
        finally:
            conn.close()
    return False

def get_all_users_except(exclude_username):
    """Get all registered users except the specified one"""
    conn = get_db_connection()
    if conn:
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    "SELECT username FROM users WHERE username != %s ORDER BY username",
                    (exclude_username,)
                )
                users = cur.fetchall()
                return [user['username'] for user in users]
        except Exception as e:
            logger.error(f"Error fetching all users: {e}")
            return []
        finally:
            conn.close()
    return []

@socketio.on('send_message')
def handle_send_message(data):
    sender = data['sender']
    receiver = data['receiver']
    message_text = data['message']
    timestamp = datetime.now().isoformat()
    
    # Save message to database
    message_id = save_message_to_db(sender, receiver, message_text)
    
    if message_id:
        message = {
            'id': message_id,
            'sender': sender,
            'receiver': receiver,
            'text': message_text,
            'timestamp': timestamp
        }
        
        # Send only to the two participants
        if sender in active_users:
            emit('new_message', message, room=active_users[sender])
        
        if receiver in active_users:
            emit('new_message', message, room=active_users[receiver])
        
        logger.info(f"Private message from {sender} to {receiver}: {message_text}")
    else:
        logger.error(f"Failed to save message from {sender} to {receiver}")

def save_message_to_db(sender, receiver, message_text):
    """Save message to database and return message ID"""
    conn = get_db_connection()
    if conn:
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO messages (sender, receiver, message_text) 
                    VALUES (%s, %s, %s) 
                    RETURNING id
                """, (sender, receiver, message_text))
                message_id = cur.fetchone()[0]
                conn.commit()
                return message_id
        except Exception as e:
            logger.error(f"Error saving message: {e}")
            conn.rollback()
            return None
        finally:
            conn.close()
    return None

@socketio.on('get_conversation')
def handle_get_conversation(data):
    user1 = data['user1']
    user2 = data['user2']
    
    # Get messages from database
    conversation_messages = get_conversation_from_db(user1, user2)
    
    emit('conversation_history', {
        'user1': user1,
        'user2': user2,
        'messages': conversation_messages
    })

def get_conversation_from_db(user1, user2):
    """Get conversation between two users from database"""
    conn = get_db_connection()
    if conn:
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT id, sender, receiver, message_text as text, timestamp
                    FROM messages 
                    WHERE (sender = %s AND receiver = %s) OR (sender = %s AND receiver = %s)
                    ORDER BY timestamp ASC
                """, (user1, user2, user2, user1))
                
                messages = cur.fetchall()
                # Convert to list of dictionaries
                result = []
                for msg in messages:
                    result.append({
                        'id': msg['id'],
                        'sender': msg['sender'],
                        'receiver': msg['receiver'],
                        'text': msg['text'],
                        'timestamp': msg['timestamp'].isoformat()
                    })
                return result
        except Exception as e:
            logger.error(f"Error fetching conversation: {e}")
            return []
        finally:
            conn.close()
    return []

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
    print("🚀 Starting Christian Et Celestin Chat Server...")
    print("📍 Access at: http://localhost:5000")
    print("🗄️  Database: PostgreSQL with Neon")
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)