import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit
from datetime import datetime
import os
import psycopg2
from psycopg2.extras import RealDictCursor
import logging
import uuid
from werkzeug.utils import secure_filename

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['SECRET_KEY'] = 'd29c234ca310aa6990092d4b6cd4c4854585c51e1f73bf4de510adca03f5bc4e'
app.config['UPLOAD_FOLDER'] = 'static/uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

DATABASE_URL = "postgresql://neondb_owner:npg_e9jnoysJOvu7@ep-little-mountain-adzvgndi-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
ADMIN_USERNAME = "Mpc"

ALLOWED_IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
ALLOWED_AUDIO_EXTENSIONS = {'mp3', 'wav', 'ogg', 'm4a'}

# Track received message IDs
received_message_ids = set()

def get_db_connection():
    try:
        conn = psycopg2.connect(DATABASE_URL)
        return conn
    except Exception as e:
        logger.error(f"Database connection error: {e}")
        return None

def init_database():
    conn = get_db_connection()
    if conn:
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS users (
                        id SERIAL PRIMARY KEY,
                        username VARCHAR(50) UNIQUE NOT NULL,
                        is_admin BOOLEAN DEFAULT FALSE,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        is_online BOOLEAN DEFAULT FALSE
                    )
                """)
                
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS messages (
                        id SERIAL PRIMARY KEY,
                        sender VARCHAR(50) NOT NULL,
                        receiver VARCHAR(50) NOT NULL,
                        message_text TEXT,
                        message_type VARCHAR(20) DEFAULT 'text',
                        file_path VARCHAR(500),
                        file_name VARCHAR(255),
                        file_size INTEGER,
                        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        offline_id VARCHAR(100) UNIQUE,
                        delivered_at TIMESTAMP,
                        read_at TIMESTAMP
                    )
                """)
                
                cur.execute("""
                    CREATE INDEX IF NOT EXISTS idx_messages_participants 
                    ON messages (sender, receiver, timestamp)
                """)
                
                try:
                    cur.execute("""
                        DO $$ 
                        BEGIN 
                            IF NOT EXISTS (
                                SELECT 1 FROM information_schema.table_constraints 
                                WHERE constraint_name = 'messages_offline_id_key'
                            ) THEN
                                ALTER TABLE messages ADD CONSTRAINT messages_offline_id_key UNIQUE (offline_id);
                            END IF;
                        END $$;
                    """)
                except Exception as e:
                    logger.warning(f"Could not add unique constraint: {e}")
                
                try:
                    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE")
                    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT FALSE")
                    cur.execute("ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type VARCHAR(20) DEFAULT 'text'")
                    cur.execute("ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_path VARCHAR(500)")
                    cur.execute("ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_name VARCHAR(255)")
                    cur.execute("ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_size INTEGER")
                    cur.execute("ALTER TABLE messages ADD COLUMN IF NOT EXISTS offline_id VARCHAR(100)")
                    cur.execute("ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP")
                    cur.execute("ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMP")
                except Exception as e:
                    logger.warning(f"Columns may already exist: {e}")
                
                cur.execute("""
                    INSERT INTO users (username, is_admin) 
                    VALUES (%s, TRUE)
                    ON CONFLICT (username) 
                    DO UPDATE SET is_admin = TRUE
                """, (ADMIN_USERNAME,))
                
                conn.commit()
                logger.info("Database tables initialized successfully")
        except Exception as e:
            logger.error(f"Error initializing database: {e}")
            conn.rollback()
        finally:
            conn.close()

init_database()

active_users = {}
user_sessions = {}

def allowed_file(filename, allowed_extensions):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in allowed_extensions

def save_uploaded_file(file, file_type):
    if file and file.filename:
        file_ext = file.filename.rsplit('.', 1)[1].lower()
        unique_filename = f"{uuid.uuid4().hex}.{file_ext}"
        filename = secure_filename(unique_filename)
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(file_path)
        return file_path, filename, os.path.getsize(file_path)
    return None, None, 0

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload_file', methods=['POST'])
def upload_file():
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No file provided'})
        
        file = request.files['file']
        file_type = request.form.get('file_type', 'image')
        
        if file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'})
        
        if file_type == 'image' and not allowed_file(file.filename, ALLOWED_IMAGE_EXTENSIONS):
            return jsonify({'success': False, 'error': 'Invalid image format'})
        
        if file_type == 'voice' and not allowed_file(file.filename, ALLOWED_AUDIO_EXTENSIONS):
            return jsonify({'success': False, 'error': 'Invalid audio format'})
        
        file_path, filename, file_size = save_uploaded_file(file, file_type)
        
        if file_path:
            return jsonify({
                'success': True,
                'file_path': file_path,
                'file_url': f'/{file_path}',
                'file_name': filename,
                'file_size': file_size
            })
        else:
            return jsonify({'success': False, 'error': 'Failed to save file'})
            
    except Exception as e:
        logger.error(f"File upload error: {e}")
        return jsonify({'success': False, 'error': str(e)})

@app.route('/users', methods=['GET'])
def get_users():
    conn = get_db_connection()
    if conn:
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT username, COALESCE(is_online, FALSE) as is_online,
                           COALESCE(is_admin, FALSE) as is_admin 
                    FROM users 
                    ORDER BY COALESCE(is_online, FALSE) DESC, username
                """)
                users = cur.fetchall()
                return jsonify([{
                    'username': user['username'],
                    'is_online': user['is_online'],
                    'is_admin': user['is_admin']
                } for user in users])
        except Exception as e:
            logger.error(f"Error fetching users: {e}")
            return jsonify([])
        finally:
            conn.close()
    return jsonify([])

@app.route('/admin/delete_user', methods=['POST'])
def delete_user():
    data = request.get_json()
    admin_username = data.get('admin_username')
    target_username = data.get('target_username')
    
    if not is_user_admin(admin_username):
        return jsonify({'success': False, 'error': 'Unauthorized'})
    
    conn = get_db_connection()
    if conn:
        try:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM messages WHERE sender = %s OR receiver = %s", 
                           (target_username, target_username))
                cur.execute("DELETE FROM users WHERE username = %s", (target_username,))
                conn.commit()
                
                if target_username in active_users:
                    del active_users[target_username]
                
                emit('user_deleted', {'username': target_username}, broadcast=True, namespace='/')
                return jsonify({'success': True})
        except Exception as e:
            logger.error(f"Error deleting user: {e}")
            conn.rollback()
            return jsonify({'success': False, 'error': str(e)})
        finally:
            conn.close()
    return jsonify({'success': False, 'error': 'Database connection failed'})

def is_user_admin(username):
    conn = get_db_connection()
    if conn:
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT COALESCE(is_admin, FALSE) as is_admin FROM users WHERE username = %s", (username,))
                result = cur.fetchone()
                return result and result[0]
        except Exception as e:
            logger.error(f"Error checking admin status: {e}")
            return False
        finally:
            conn.close()
    return False

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
        if user_to_remove in user_sessions:
            user_sessions[user_to_remove].discard(request.sid)
            if not user_sessions[user_to_remove]:
                del user_sessions[user_to_remove]
                del active_users[user_to_remove]
                update_user_online_status(user_to_remove, False)
                emit('user_left', {'username': user_to_remove}, broadcast=True)
                logger.info(f"User disconnected: {user_to_remove}")

def update_user_online_status(username, is_online):
    conn = get_db_connection()
    if conn:
        try:
            with conn.cursor() as cur:
                cur.execute("UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE username = %s", (username,))
                try:
                    cur.execute("UPDATE users SET is_online = %s WHERE username = %s", (is_online, username))
                except Exception as e:
                    logger.warning(f"is_online column might not exist yet: {e}")
                conn.commit()
        except Exception as e:
            logger.error(f"Error updating online status: {e}")
            conn.rollback()
        finally:
            conn.close()

@socketio.on('login')
def handle_login(data):
    username = data['username']
    
    if username != ADMIN_USERNAME and username in active_users:
        emit('login_failed', {'message': 'Username already taken'})
        return
    
    if register_user(username):
        active_users[username] = request.sid
        
        if username not in user_sessions:
            user_sessions[username] = set()
        user_sessions[username].add(request.sid)
        
        update_user_online_status(username, True)
        
        online_users = [user for user in active_users.keys() if user != username]
        all_users = get_all_users_except(username)
        is_admin = is_user_admin(username)
        
        emit('login_success', {
            'username': username,
            'online_users': online_users,
            'all_users': all_users,
            'is_admin': is_admin
        })
        
        emit('user_joined', {'username': username}, broadcast=True)
        logger.info(f"User logged in: {username} (Admin: {is_admin})")
    else:
        emit('login_failed', {'message': 'Registration failed'})

def register_user(username):
    conn = get_db_connection()
    if conn:
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO users (username) 
                    VALUES (%s) 
                    ON CONFLICT (username) 
                    DO UPDATE SET last_seen = CURRENT_TIMESTAMP
                    RETURNING id
                """, (username,))
                
                if username == ADMIN_USERNAME:
                    try:
                        cur.execute("UPDATE users SET is_admin = TRUE WHERE username = %s", (username,))
                    except Exception as e:
                        logger.warning(f"Could not set admin status: {e}")
                
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
    conn = get_db_connection()
    if conn:
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT username, COALESCE(is_online, FALSE) as is_online,
                           COALESCE(is_admin, FALSE) as is_admin 
                    FROM users 
                    WHERE username != %s 
                    ORDER BY COALESCE(is_online, FALSE) DESC, username
                """, (exclude_username,))
                users = cur.fetchall()
                return [{
                    'username': user['username'],
                    'is_online': user['is_online'],
                    'is_admin': user['is_admin']
                } for user in users]
        except Exception as e:
            logger.error(f"Error fetching all users: {e}")
            return []
        finally:
            conn.close()
    return []

@socketio.on('send_message')
def handle_send_message(data):
    offline_id = data.get('offline_id')
    
    # WhatsApp-style deduplication
    if offline_id and offline_id in received_message_ids:
        logger.info(f"Ignoring duplicate message with offline_id: {offline_id}")
        if data.get('sender') in active_users and offline_id:
            emit('message_sent', {
                'offline_id': offline_id,
                'message_id': None,
                'timestamp': datetime.now().isoformat()
            }, room=active_users[data.get('sender')])
        return
    
    if offline_id:
        received_message_ids.add(offline_id)
        if len(received_message_ids) > 10000:
            received_message_ids.clear()
    
    sender = data['sender']
    receiver = data['receiver']
    message_text = data.get('message', '')
    message_type = data.get('message_type', 'text')
    file_url = data.get('file_url', '')
    file_name = data.get('file_name', '')
    file_size = data.get('file_size', 0)
    timestamp = datetime.now().isoformat()
    
    if sender != ADMIN_USERNAME and sender not in active_users:
        return
    
    message_id = save_message_to_db(sender, receiver, message_text, message_type, file_url, file_name, file_size, offline_id)
    
    if message_id:
        message = {
            'id': message_id,
            'sender': sender,
            'receiver': receiver,
            'message': message_text,
            'message_type': message_type,
            'file_url': file_url,
            'file_name': file_name,
            'file_size': file_size,
            'timestamp': timestamp,
            'offline_id': offline_id
        }
        
        if sender in active_users and offline_id:
            emit('message_sent', {
                'offline_id': offline_id,
                'message_id': message_id,
                'timestamp': timestamp
            }, room=active_users[sender])
        
        if receiver in active_users:
            emit('new_message', message, room=active_users[receiver])
            
            if sender in active_users and offline_id:
                emit('message_delivered', {
                    'offline_id': offline_id,
                    'message_id': message_id,
                    'timestamp': timestamp
                }, room=active_users[sender])
                update_message_delivery_status(message_id, 'delivered')
        
        logger.info(f"Message from {sender} to {receiver} (ID: {offline_id})")
    else:
        logger.error(f"Failed to save message from {sender} to {receiver}")

def save_message_to_db(sender, receiver, message_text, message_type='text', file_path='', file_name='', file_size=0, offline_id=''):
    conn = get_db_connection()
    if conn:
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO messages (sender, receiver, message_text, message_type, file_path, file_name, file_size, offline_id) 
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s) 
                    RETURNING id
                """, (sender, receiver, message_text, message_type, file_path, file_name, file_size, offline_id))
                message_id = cur.fetchone()[0]
                conn.commit()
                return message_id
        except psycopg2.IntegrityError as e:
            logger.warning(f"Duplicate offline_id detected: {offline_id}")
            conn.rollback()
            try:
                with conn.cursor() as cur:
                    cur.execute("SELECT id FROM messages WHERE offline_id = %s", (offline_id,))
                    result = cur.fetchone()
                    if result:
                        return result[0]
            except Exception as e2:
                logger.error(f"Error fetching existing message: {e2}")
            return None
        except Exception as e:
            logger.error(f"Error saving message: {e}")
            conn.rollback()
            return None
        finally:
            conn.close()
    return None

def update_message_delivery_status(message_id, status):
    conn = get_db_connection()
    if conn:
        try:
            with conn.cursor() as cur:
                if status == 'delivered':
                    cur.execute("UPDATE messages SET delivered_at = CURRENT_TIMESTAMP WHERE id = %s", (message_id,))
                elif status == 'read':
                    cur.execute("UPDATE messages SET read_at = CURRENT_TIMESTAMP WHERE id = %s", (message_id,))
                conn.commit()
        except Exception as e:
            logger.error(f"Error updating delivery status: {e}")
            conn.rollback()
        finally:
            conn.close()

@socketio.on('message_read')
def handle_message_read(data):
    message_id = data.get('message_id')
    offline_id = data.get('offline_id')
    reader = data.get('reader')
    
    if message_id:
        update_message_delivery_status(message_id, 'read')
    
    if offline_id:
        conn = get_db_connection()
        if conn:
            try:
                with conn.cursor() as cur:
                    cur.execute("SELECT sender FROM messages WHERE offline_id = %s", (offline_id,))
                    result = cur.fetchone()
                    if result:
                        sender = result[0]
                        if sender in active_users:
                            emit('message_read', {
                                'offline_id': offline_id,
                                'message_id': message_id,
                                'timestamp': datetime.now().isoformat()
                            }, room=active_users[sender])
            except Exception as e:
                logger.error(f"Error updating read status: {e}")
            finally:
                conn.close()

@socketio.on('get_conversation')
def handle_get_conversation(data):
    user1 = data['user1']
    user2 = data['user2']
    limit = data.get('limit', 50)
    offset = data.get('offset', 0)
    
    conversation_messages = get_conversation_from_db(user1, user2, limit, offset)
    
    emit('conversation_history', {
        'user1': user1,
        'user2': user2,
        'messages': conversation_messages,
        'offset': offset,
        'has_more': len(conversation_messages) == limit
    })

@socketio.on('get_more_messages')
def handle_get_more_messages(data):
    user1 = data['user1']
    user2 = data['user2']
    offset = data['offset']
    limit = data.get('limit', 50)
    
    messages = get_conversation_from_db(user1, user2, limit, offset)
    
    emit('more_messages', {
        'user1': user1,
        'user2': user2,
        'messages': messages,
        'offset': offset,
        'has_more': len(messages) == limit
    })

def get_conversation_from_db(user1, user2, limit=50, offset=0):
    conn = get_db_connection()
    if conn:
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT id, sender, receiver, message_text, message_type, 
                           file_path, file_name, file_size, timestamp, offline_id
                    FROM messages 
                    WHERE (sender = %s AND receiver = %s) OR (sender = %s AND receiver = %s)
                    ORDER BY timestamp DESC
                    LIMIT %s OFFSET %s
                """, (user1, user2, user2, user1, limit, offset))
                
                messages = cur.fetchall()
                result = []
                for msg in messages:
                    result.append({
                        'id': msg['id'],
                        'sender': msg['sender'],
                        'receiver': msg['receiver'],
                        'message': msg['message_text'],
                        'message_type': msg['message_type'],
                        'file_url': msg['file_path'],
                        'file_name': msg['file_name'],
                        'file_size': msg['file_size'],
                        'timestamp': msg['timestamp'].isoformat(),
                        'offline_id': msg['offline_id']
                    })
                return result[::-1]
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
    
    if receiver in active_users:
        emit('user_typing', {
            'sender': sender,
            'is_typing': is_typing
        }, room=active_users[receiver])

@socketio.on('admin_send_message')
def handle_admin_send_message(data):
    admin_username = data['admin_username']
    sender = data['sender']
    receiver = data['receiver']
    message_text = data['message']
    message_type = data.get('message_type', 'text')
    
    if not is_user_admin(admin_username):
        return
    
    message_id = save_message_to_db(sender, receiver, message_text, message_type)
    
    if message_id:
        message = {
            'id': message_id,
            'sender': sender,
            'receiver': receiver,
            'message': message_text,
            'message_type': message_type,
            'timestamp': datetime.now().isoformat()
        }
        
        if receiver in active_users:
            emit('new_message', message, room=active_users[receiver])
        
        if admin_username in active_users:
            emit('new_message', message, room=active_users[admin_username])

@app.route('/admin/fix_database', methods=['POST'])
def fix_database():
    try:
        init_database()
        return jsonify({'success': True, 'message': 'Database schema updated successfully'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

if __name__ == '__main__':
    print("🚀 Starting WhatsApp-Style Chat Server...")
    print("📍 Access at: http://localhost:5000")
    print("🗄️  Database: PostgreSQL with Neon")
    print("🔧 Features: WhatsApp-style messaging, offline queue, delivery status")
    print("✅ TICK SYSTEM: One gray = server received, Two gray = delivered, Two blue = read")
    print("🔄 DEDUPLICATION: Server ignores duplicate messages")
    print("👑 Admin Username: Mpc")
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)