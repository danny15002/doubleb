const webpush = require('web-push');
const { pool } = require('../database/connection');

// Configure VAPID details
webpush.setVapidDetails(
  process.env.VAPID_EMAIL || 'mailto:your-email@example.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

class PushNotificationService {
  constructor() {
    this.isConfigured = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
    
    if (!this.isConfigured) {
      console.warn('VAPID keys not configured. Push notifications will not work.');
    }
    
    // iOS PWA fix: Notification batching to prevent service worker suspension
    this.notificationQueue = new Map(); // userId -> { messages: [], timeout: null }
    this.BATCH_DELAY = 500; // 500ms delay to batch notifications
  }

  // Store a push subscription for a user
  async storeSubscription(userId, subscription) {
    try {
      const subscriptionData = JSON.stringify(subscription);
      
      // Check if subscription already exists
      const existing = await pool.query(
        'SELECT id FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
        [userId, subscription.endpoint]
      );

      if (existing.rows.length > 0) {
        // Update existing subscription
        await pool.query(
          'UPDATE push_subscriptions SET subscription_data = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2 AND endpoint = $3',
          [subscriptionData, userId, subscription.endpoint]
        );
        console.log('Push subscription updated for user:', userId);
      } else {
        // Insert new subscription
        await pool.query(
          'INSERT INTO push_subscriptions (user_id, endpoint, subscription_data) VALUES ($1, $2, $3)',
          [userId, subscription.endpoint, subscriptionData]
        );
        console.log('Push subscription stored for user:', userId);
      }
      
      return true;
    } catch (error) {
      console.error('Error storing push subscription:', error);
      return false;
    }
  }

  // Remove a push subscription
  async removeSubscription(userId, endpoint) {
    try {
      await pool.query(
        'DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
        [userId, endpoint]
      );
      console.log('Push subscription removed for user:', userId);
      return true;
    } catch (error) {
      console.error('Error removing push subscription:', error);
      return false;
    }
  }

  // Get all subscriptions for a user
  async getUserSubscriptions(userId) {
    try {
      const result = await pool.query(
        'SELECT subscription_data FROM push_subscriptions WHERE user_id = $1',
        [userId]
      );
      
      return result.rows.map(row => JSON.parse(row.subscription_data));
    } catch (error) {
      console.error('Error getting user subscriptions:', error);
      return [];
    }
  }

  // Send push notification to a specific user
  async sendToUser(userId, payload) {
    if (!this.isConfigured) {
      console.warn('Push notifications not configured');
      return { success: false, error: 'Push notifications not configured' };
    }

    try {
      const subscriptions = await this.getUserSubscriptions(userId);
      
      if (subscriptions.length === 0) {
        console.log('No push subscriptions found for user:', userId);
        return { success: false, error: 'No subscriptions found' };
      }

      const results = [];
      
      // iOS PWA fix: Add small delay between notifications to prevent service worker suspension
      for (let i = 0; i < subscriptions.length; i++) {
        const subscription = subscriptions[i];
        
        try {
          // Add delay for iOS to prevent service worker suspension
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
          }
          
          const result = await webpush.sendNotification(subscription, JSON.stringify(payload));
          results.push({ success: true, subscription: subscription.endpoint });
          console.log('Push notification sent successfully to:', subscription.endpoint);
        } catch (error) {
          console.error('Error sending push notification:', error);
          
          // If subscription is invalid, remove it
          if (error.statusCode === 410 || error.statusCode === 404) {
            await this.removeSubscription(userId, subscription.endpoint);
            console.log('Removed invalid subscription:', subscription.endpoint);
          }
          
          results.push({ 
            success: false, 
            error: error.message, 
            subscription: subscription.endpoint 
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      return { 
        success: successCount > 0, 
        sent: successCount, 
        total: subscriptions.length,
        results 
      };
    } catch (error) {
      console.error('Error sending push notification to user:', error);
      return { success: false, error: error.message };
    }
  }

  // Send push notification to multiple users
  async sendToUsers(userIds, payload) {
    const results = [];
    
    for (const userId of userIds) {
      const result = await this.sendToUser(userId, payload);
      results.push({ userId, ...result });
    }
    
    return results;
  }

  // Send message notification with batching for iOS
  async sendMessageNotification(message, chatInfo, excludeUserId = null) {
    // Get all chat participants except the sender
    try {
      const participants = await pool.query(`
        SELECT DISTINCT user_id 
        FROM chat_participants 
        WHERE chat_id = $1 AND user_id != $2
      `, [message.chat_id, excludeUserId || message.user_id]);

      const userIds = participants.rows.map(row => row.user_id);
      
      if (userIds.length > 0) {
        // iOS PWA fix: Batch notifications to prevent service worker suspension
        return await this.batchMessageNotification(message, chatInfo, userIds);
      }
      
      return { success: false, error: 'No recipients found' };
    } catch (error) {
      console.error('Error sending message notification:', error);
      return { success: false, error: error.message };
    }
  }

  // iOS PWA fix: Batch message notifications to prevent service worker suspension
  async batchMessageNotification(message, chatInfo, userIds) {
    const results = [];
    
    for (const userId of userIds) {
      try {
        // Add message to user's notification queue
        if (!this.notificationQueue.has(userId)) {
          this.notificationQueue.set(userId, { messages: [], timeout: null });
        }
        
        const userQueue = this.notificationQueue.get(userId);
        userQueue.messages.push({ message, chatInfo });
        
        // Clear existing timeout
        if (userQueue.timeout) {
          clearTimeout(userQueue.timeout);
        }
        
        // Set new timeout to send batched notification
        userQueue.timeout = setTimeout(async () => {
          await this.sendBatchedNotification(userId);
        }, this.BATCH_DELAY);
        
        results.push({ userId, success: true, batched: true });
      } catch (error) {
        console.error(`Error batching notification for user ${userId}:`, error);
        results.push({ userId, success: false, error: error.message });
      }
    }
    
    return { success: true, results, batched: true };
  }

  // Send batched notification to a user
  async sendBatchedNotification(userId) {
    const userQueue = this.notificationQueue.get(userId);
    if (!userQueue || userQueue.messages.length === 0) {
      return;
    }
    
    const messages = userQueue.messages;
    const chatInfo = messages[0].chatInfo; // Use first message's chat info
    
    // Create batched payload
    let title, body;
    if (messages.length === 1) {
      const msg = messages[0].message;
      title = `${msg.sender_name || msg.username} in ${chatInfo.display_name || chatInfo.name}`;
      body = this.stripHtml(msg.content);
    } else {
      const senderName = messages[0].message.sender_name || messages[0].message.username;
      title = `${senderName} in ${chatInfo.display_name || chatInfo.name}`;
      body = `${messages.length} new messages`;
    }
    
    const payload = {
      title,
      body,
      icon: '/manifest.json',
      badge: '/manifest.json',
      data: {
        url: `/chat/${messages[0].message.chat_id}`,
        chatId: messages[0].message.chat_id,
        messageId: messages[0].message.id,
        type: 'message',
        batchCount: messages.length
      },
      actions: [
        {
          action: 'open',
          title: 'Open Chat',
          icon: '/manifest.json'
        },
        {
          action: 'close',
          title: 'Close',
          icon: '/manifest.json'
        }
      ],
      requireInteraction: true,
      silent: false,
      tag: `chat-${messages[0].message.chat_id}`
    };
    
    // Clear the queue
    userQueue.messages = [];
    userQueue.timeout = null;
    
    // Send the batched notification
    return await this.sendToUser(userId, payload);
  }

  // Send new chat notification
  async sendNewChatNotification(chatInfo, participantId) {
    const payload = {
      title: 'New Chat',
      body: `You've been added to ${chatInfo.name}`,
      icon: '/manifest.json',
      badge: '/manifest.json',
      data: {
        url: `/chat/${chatInfo.id}`,
        chatId: chatInfo.id,
        type: 'new_chat'
      },
      actions: [
        {
          action: 'open',
          title: 'Open Chat',
          icon: '/manifest.json'
        }
      ],
      requireInteraction: false,
      silent: false,
      tag: `new-chat-${chatInfo.id}`
    };

    return await this.sendToUser(participantId, payload);
  }

  // Utility function to strip HTML
  stripHtml(html) {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, '').trim();
  }
}

module.exports = new PushNotificationService();
